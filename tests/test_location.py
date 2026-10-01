import pytest

from fishid.regs.location import get_locator, ocean_area_for


@pytest.fixture(scope="module")
def loc():
    return get_locator()


def test_no_location_falls_back_to_statewide(loc):
    p = loc.locate(None, None)
    assert p.in_california and not p.known
    assert p.warnings


def test_nevada_is_outside_california(loc):
    p = loc.locate(39.53, -119.81)  # Reno
    assert not p.in_california
    assert "outside California" in p.warnings[0]


def test_mexico_and_oregon_are_outside(loc):
    assert not loc.locate(31.86, -116.62).in_california  # Ensenada
    assert not loc.locate(43.0, -124.6).in_california


@pytest.mark.parametrize("lat, lon, area", [
    (41.75, -124.25, "northern"),
    (39.45, -123.85, "mendocino"),
    (37.80, -122.55, "san_francisco"),
    (36.62, -121.90, "central"),
    (33.75, -118.45, "southern"),
])
def test_ocean_areas(loc, lat, lon, area):
    p = loc.locate(lat, lon)
    assert p.water == "salt"
    assert p.ocean_area == area


def test_area_boundaries():
    assert ocean_area_for(34.46) == "central"
    assert ocean_area_for(34.44) == "southern"
    assert ocean_area_for(40.17) == "northern"


def test_san_francisco_bay_is_ocean_district(loc):
    p = loc.locate(37.80, -122.36)
    assert p.water == "salt" and p.ocean_area == "san_francisco"


def test_point_in_no_take_reserve(loc):
    # Point Lobos SMR, Monterey County
    p = loc.locate(36.518, -121.955)
    assert p.mpa is not None
    assert p.mpa["no_take"]


def test_inland_lake_and_district(loc):
    p = loc.locate(37.59, -118.74)  # Crowley Lake
    assert p.water == "fresh"
    assert p.water_body == "crowley_lake"
    assert p.district == "sierra"
    p = loc.locate(38.30, -121.40)  # farm pond area, Sacramento County
    assert p.district == "valley" and p.water_body is None


def test_water_search_and_by_id(loc):
    hits = loc.search("castaic")
    assert hits and hits[0]["id"] == "castaic_lake"
    p = loc.by_water("salton_sea")
    assert p.district == "colorado_river" and p.water_kind == "lake"
