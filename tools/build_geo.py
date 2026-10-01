"""Rebuild fishid/data/geo/*.geojson from public sources.

    python tools/build_geo.py

Sources
  MPAs:     CDFW "California Marine Protected Areas [ds582]" (CC BY 4.0)
            https://data-cdfw.opendata.arcgis.com/datasets/CDFW::california-marine-protected-areas-ds582
  Counties: California county boundaries (shoreline-clipped), via
            https://github.com/codeforgermany/click_that_hood (public domain US Census data)
"""
import json
import sys
from pathlib import Path

import httpx
import shapely
from shapely.geometry import mapping, shape
from shapely.validation import make_valid

MPA_URL = ("https://data-cdfw.opendata.arcgis.com/api/download/v1/items/"
           "117a99c8745a48c6a48bac70005b1b11/geojson?layers=0")
COUNTY_URL = ("https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/"
              "public/data/california-counties.geojson")

OUT = Path(__file__).resolve().parents[1] / "fishid" / "data" / "geo"


def fetch(url: str) -> dict:
    r = httpx.get(url, follow_redirects=True, timeout=120, headers={"User-Agent": "fishid-build"})
    r.raise_for_status()
    return r.json()


def simplify(fc: dict, keep: dict, tolerance: float) -> dict:
    feats = []
    for f in fc["features"]:
        geom = make_valid(shape(f["geometry"])).simplify(tolerance, preserve_topology=True)
        geom = make_valid(shapely.set_precision(geom, 1e-5))
        if geom.is_empty:
            continue
        props = {new: f["properties"].get(old) for new, old in keep.items()}
        feats.append({"type": "Feature", "properties": props,
                      "geometry": json.loads(json.dumps(mapping(geom), default=float))})
    return {"type": "FeatureCollection", "features": feats}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    mpas = simplify(fetch(MPA_URL), {"name": "FULLNAME", "short": "SHORTNAME", "type": "Type", "ccr": "CCR"}, 0.0002)
    counties = simplify(fetch(COUNTY_URL), {"name": "name"}, 0.001)
    for name, fc in (("mpas", mpas), ("counties", counties)):
        path = OUT / f"{name}.geojson"
        path.write_text(json.dumps(fc, separators=(",", ":")), encoding="utf-8")
        print(f"{path.name}: {len(fc['features'])} features, {path.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
