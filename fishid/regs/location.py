"""Where was the fish caught? GPS / water body -> management area, district, MPA."""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache

import yaml
from shapely.geometry import Point, shape
from shapely.ops import transform
from shapely.strtree import STRtree

from fishid.config import DATA_DIR, GEO_DIR
from fishid.models import Place

# Ocean groundfish management areas (T14 CCR §27.25–27.45), north to south.
OCEAN_AREAS = [
    ("northern", "Northern", 40 + 10 / 60, 42.0),
    ("mendocino", "Mendocino", 38 + 57.5 / 60, 40 + 10 / 60),
    ("san_francisco", "San Francisco", 37 + 11 / 60, 38 + 57.5 / 60),
    ("central", "Central", 34 + 27 / 60, 37 + 11 / 60),
    ("southern", "Southern", 32.53, 34 + 27 / 60),
]
CA_SOUTH, CA_NORTH = 32.53, 42.0

DISTRICT_NAMES = {
    "north_coast": "North Coast District",
    "north_central": "North Central District",
    "south_central": "South Central District",
    "southern_fw": "Southern District",
    "sierra": "Sierra District",
    "valley": "Valley District",
    "colorado_river": "Colorado River District",
}

# T14 CCR §6.31–6.37. Counties that sit wholly in one district.
COUNTY_DISTRICT = {
    **dict.fromkeys(["Trinity", "Humboldt", "Del Norte"], "north_coast"),
    **dict.fromkeys(["Marin", "Napa", "Sonoma", "Lake", "Mendocino"], "north_central"),
    **dict.fromkeys(["Monterey", "San Benito", "San Francisco", "San Luis Obispo", "San Mateo",
                     "Santa Clara", "Santa Cruz"], "south_central"),
    **dict.fromkeys(["Los Angeles", "Orange", "San Diego", "Santa Barbara", "Ventura"], "southern_fw"),
    **dict.fromkeys(["Modoc", "Lassen", "Shasta", "Sierra", "Plumas", "Alpine", "Inyo", "Mono",
                     "Tehama"], "sierra"),
    **dict.fromkeys(["Butte", "Colusa", "Glenn", "Kern", "Kings", "Merced", "Sacramento", "San Joaquin",
                     "Solano", "Stanislaus", "Sutter", "Yolo", "Yuba"], "valley"),
    "Imperial": "colorado_river",
}


def _split_county(county: str, lat: float, lon: float) -> str | None:
    """Approximate district for counties the regulations split along roads or
    national-forest lines. Good to a few miles near the boundary."""
    # Highway 49 (Sierra east of it, Valley west of it), approximate longitude by county.
    hwy49 = {"Nevada": -121.02, "Placer": -121.07, "El Dorado": -120.80, "Amador": -120.77,
             "Calaveras": -120.66, "Tuolumne": -120.38, "Mariposa": -119.97}
    if county in hwy49:
        return "sierra" if lon > hwy49[county] else "valley"
    # West boundary of Sierra / Sequoia national forests.
    forest = {"Fresno": -119.40, "Madera": -119.62, "Tulare": -118.98}
    if county in forest:
        return "sierra" if lon > forest[county] else "valley"
    if county == "Siskiyou":  # Mt. Eddy – I-5 – Hwy 97 line
        return "north_coast" if lon < -122.40 else "sierra"
    if county == "Alameda":  # east of I-680 and north of I-580 -> Valley
        return "valley" if lon > -121.92 and lat > 37.70 else "south_central"
    if county == "Contra Costa":
        return "valley" if lon > -122.00 else "south_central"
    if county == "Riverside":  # east of Hwy 86 / Cottonwood Springs Rd -> Colorado River
        return "colorado_river" if lon > -116.10 and lat < 33.95 else "southern_fw"
    if county == "San Bernardino":  # east of Amboy / I-40 / Hwy 95 -> Colorado River
        return "colorado_river" if lon > -115.20 or (lon > -115.90 and lat < 34.70) else "southern_fw"
    return None


def _to_km(geom):
    k = math.cos(math.radians(37.0))
    return transform(lambda x, y, z=None: (x * 111.32 * k, y * 110.57), geom)


@dataclass
class Water:
    id: str
    name: str
    county: str
    kind: str
    lat: float
    lon: float
    radius_km: float
    district: str | None = None


class Locator:
    def __init__(self):
        with open(GEO_DIR / "counties.geojson", encoding="utf-8") as f:
            counties = json.load(f)["features"]
        self.county_names = [c["properties"]["name"] for c in counties]
        self.county_geoms = [_to_km(shape(c["geometry"])) for c in counties]
        self.county_tree = STRtree(self.county_geoms)

        with open(GEO_DIR / "mpas.geojson", encoding="utf-8") as f:
            mpas = json.load(f)["features"]
        self.mpa_props = [m["properties"] for m in mpas]
        self.mpa_geoms = [_to_km(shape(m["geometry"])) for m in mpas]
        self.mpa_tree = STRtree(self.mpa_geoms)

        with open(DATA_DIR / "waters.yaml", encoding="utf-8") as f:
            self.waters = {w["id"]: Water(**w) for w in yaml.safe_load(f)["waters"]}

        coastal = {"Del Norte", "Humboldt", "Mendocino", "Sonoma", "Marin", "San Francisco", "San Mateo",
                   "Santa Cruz", "Monterey", "San Luis Obispo", "Santa Barbara", "Ventura", "Los Angeles",
                   "Orange", "San Diego", "Alameda", "Contra Costa", "Solano", "Napa", "Santa Clara"}
        self.coastal = coastal

    # ------------------------------------------------------------------ lookups
    def _county_at(self, p) -> str | None:
        for i in self.county_tree.query(p, predicate="within"):
            return self.county_names[int(i)]
        return None

    def _mpa_at(self, p) -> dict | None:
        for i in self.mpa_tree.query(p, predicate="within"):
            props = self.mpa_props[int(i)]
            return {**props, "no_take": props["type"] in ("SMR", "SMCA (No-Take)")}
        return None

    def _district(self, county: str, lat: float, lon: float) -> tuple[str, bool]:
        if county in COUNTY_DISTRICT:
            return COUNTY_DISTRICT[county], False
        return _split_county(county, lat, lon) or "valley", True

    def _nearby_water(self, lat: float, lon: float) -> Water | None:
        best, best_d = None, None
        for w in self.waters.values():
            d = _km(lat, lon, w.lat, w.lon)
            if d <= w.radius_km and (best_d is None or d < best_d):
                best, best_d = w, d
        return best

    # ------------------------------------------------------------------ public
    def locate(self, lat: float | None, lon: float | None) -> Place:
        if lat is None or lon is None:
            return Place(warnings=["No location: showing statewide rules. Add a map pin or pick a water "
                                   "body — many waters and ocean areas have different limits."])
        p = _to_km(Point(lon, lat))
        place = Place(lat=lat, lon=lon)
        mpa = self._mpa_at(p)
        county = self._county_at(p)

        if county:
            place.county = county
            place.water = "fresh"
            district, approx = self._district(county, lat, lon)
            water = self._nearby_water(lat, lon)
            if water:
                self._apply_water(place, water)
            else:
                place.district = district
                place.label = f"{county} County — {DISTRICT_NAMES[district]}"
                if approx:
                    place.warnings.append(f"{county} County is split between districts; the district shown is "
                                          "approximate near the boundary.")
                place.warnings.append("Pick the lake or stream you fished: lakes and streams have different "
                                      "trout and bass rules.")
        elif CA_SOUTH <= lat <= CA_NORTH:
            # Off the land: it is California ocean only if the closest land is a
            # coastal county (a pin in Nevada is closest to an inland county).
            idx = int(self.county_tree.nearest(p))
            shore_km = self.county_geoms[idx].distance(p)
            if self.county_names[idx] not in self.coastal or shore_km > 370:
                return self._outside(lat, lon)
            place.water = "salt"
            place.ocean_area = ocean_area_for(lat)
            area_name = dict((a[0], a[1]) for a in OCEAN_AREAS)[place.ocean_area]
            place.label = f"Ocean — {area_name} Groundfish Management Area"
            if shore_km > 5.6:
                place.warnings.append(f"About {shore_km:.0f} km offshore (beyond 3 nautical miles). State "
                                      "rules still apply to fish landed in California; federal rules may also apply.")
        else:
            return self._outside(lat, lon)

        if mpa:
            place.mpa = mpa
            place.label += f" — inside {mpa['name']}"
        return place

    def _outside(self, lat: float, lon: float) -> Place:
        return Place(in_california=False, lat=lat, lon=lon, label="Outside California",
                     warnings=["This location is outside California waters. California regulations may not "
                               "apply — check the rules where you fished."])

    def by_water(self, water_id: str) -> Place:
        water = self.waters.get(water_id)
        if water is None:
            raise KeyError(water_id)
        place = Place(lat=water.lat, lon=water.lon, county=water.county, water="fresh")
        self._apply_water(place, water)
        return place

    def _apply_water(self, place: Place, water: Water) -> None:
        district, _ = self._district(water.county, water.lat, water.lon)
        place.district = water.district or district
        place.water_body = water.id
        place.water_kind = water.kind  # type: ignore[assignment]
        place.county = water.county
        place.label = f"{water.name} — {DISTRICT_NAMES[place.district]}"

    def search(self, q: str, limit: int = 10) -> list[dict]:
        q = q.strip().lower()
        hits = [w for w in self.waters.values() if q in w.name.lower() or q in w.county.lower()] if q else []
        hits.sort(key=lambda w: (not w.name.lower().startswith(q), w.name))
        return [{"id": w.id, "name": w.name, "county": w.county, "kind": w.kind} for w in hits[:limit]]


def ocean_area_for(lat: float) -> str:
    for key, _, south, north in OCEAN_AREAS:
        if south <= lat < north or (key == "northern" and lat >= north):
            return key
    return "southern"


def _km(lat1, lon1, lat2, lon2) -> float:
    k = math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot((lon1 - lon2) * 111.32 * k, (lat1 - lat2) * 110.57)


@lru_cache(maxsize=1)
def get_locator() -> Locator:
    return Locator()
