from datetime import date

import pytest

from fishid.models import Length, Place, Verdict
from fishid.regs.engine import evaluate
from fishid.regs.location import get_locator

TODAY = date(2026, 9, 30)
JUNE = date(2026, 6, 15)


def length(value, spread=0.3, kind="TL", truncated=False):
    return Length(value, value - spread, float("inf") if truncated else value + spread, kind, truncated,
                  (0, 0), (1, 0), [])


def ocean(area, lat=None, lon=-120.0):
    lats = {"northern": 41.0, "mendocino": 39.5, "san_francisco": 37.8, "central": 36.0, "southern": 33.5}
    return Place(lat=lat or lats[area], lon=lon, ocean_area=area, water="salt", label=area)


def fresh(kind=None, district="valley", water_body=None, county=None):
    return Place(lat=38.0, lon=-121.0, district=district, water="fresh", water_kind=kind,
                 water_body=water_body, county=county)


def run(species, L, place, on=JUNE, mode="boat", p=0.95, others=()):
    return evaluate([(species, p), *others], L, place, on, mode=mode, today=TODAY)


@pytest.mark.parametrize("case", [
    # species,              length,       place,                 date,  mode,   expected
    ("lingcod",             length(21.5), ocean("southern"),     JUNE,  "boat", Verdict.RELEASE_UNDERSIZED),
    ("lingcod",             length(24.0), ocean("southern"),     JUNE,  "boat", Verdict.KEEP),
    ("lingcod",             length(24.0), ocean("central"),      date(2026, 2, 10), "boat", Verdict.SEASON_CLOSED),
    ("lingcod",             length(24.0), ocean("central"),      date(2026, 2, 10), "shore", Verdict.KEEP),
    ("coho_salmon",         length(25.0), ocean("central"),      JUNE,  "boat", Verdict.PROHIBITED),
    ("chinook_salmon",      length(26.0), ocean("central"),      JUNE,  "boat", Verdict.KEEP),
    ("chinook_salmon",      length(26.0), ocean("central"),      date(2026, 10, 5), "boat", Verdict.SEASON_CLOSED),
    ("chinook_salmon",      length(18.0), ocean("central"),      JUNE,  "boat", Verdict.RELEASE_UNDERSIZED),
    ("yelloweye_rockfish",  length(15.0), ocean("northern"),     JUNE,  "boat", Verdict.PROHIBITED),
    ("gopher_rockfish",     length(9.0),  ocean("southern"),     date(2026, 11, 3), "boat", Verdict.SEASON_CLOSED),
    ("gopher_rockfish",     length(9.0),  ocean("southern"),     date(2026, 11, 3), "shore", Verdict.KEEP),
    ("california_halibut",  length(23.0), ocean("southern"),     JUNE,  "boat", Verdict.KEEP),
    ("california_sheephead", length(13.0), ocean("southern"),    date(2026, 2, 1), "boat", Verdict.SEASON_CLOSED),
    ("giant_sea_bass",      length(40.0), ocean("southern"),     JUNE,  "boat", Verdict.PROHIBITED),
    ("white_sturgeon",      length(50.0, kind="FL"), fresh(kind="delta"), JUNE, None, Verdict.PROHIBITED),
    ("largemouth_bass",     length(11.0), fresh(kind="lake"),   JUNE,  None,   Verdict.RELEASE_UNDERSIZED),
    ("largemouth_bass",     length(11.0), fresh(kind="stream"), JUNE,  None,   Verdict.KEEP),
    ("largemouth_bass",     length(12.5), fresh(kind="lake", district="colorado_river"), JUNE, None, Verdict.RELEASE_UNDERSIZED),
    ("rainbow_trout",       length(12.0), fresh(kind="stream"), date(2026, 1, 15), None, Verdict.SEASON_CLOSED),
    ("rainbow_trout",       length(12.0), fresh(kind="lake"),   date(2026, 1, 15), None, Verdict.KEEP),
    ("rainbow_trout",       length(16.0), fresh(kind="lake", district="sierra", water_body="crowley_lake"),
     date(2026, 9, 1), None, Verdict.RELEASE_UNDERSIZED),
    ("rainbow_trout",       length(16.0), fresh(kind="lake", district="sierra", water_body="crowley_lake"),
     date(2026, 6, 1), None, Verdict.KEEP),
    ("steelhead",           length(24.0), fresh(kind="stream"), JUNE,  None,   Verdict.CHECK_REGS),
    ("brook_trout",         length(11.0), fresh(kind="lake", district="sierra"), JUNE, None, Verdict.RELEASE_OVERSIZED),
])
def test_table(case):
    species, L, place, on, mode, expected = case
    assert run(species, L, place, on, mode).verdict == expected


def test_lingcod_range_straddling_limit_is_too_close():
    d = run("lingcod", length(22.1, spread=0.4), ocean("central"))
    assert d.verdict == Verdict.TOO_CLOSE_TO_CALL
    assert "Too close" in d.reasons[0]


def test_unknown_water_kind_uses_strictest():
    # 11 in largemouth with no lake/stream info: lake rule (12 in min) governs.
    d = run("largemouth_bass", length(11.0), fresh(kind=None), mode=None)
    assert d.verdict == Verdict.RELEASE_UNDERSIZED


def test_lookalike_with_stricter_rules_governs():
    # Confident-ish vermilion, but yelloweye is a real possibility.
    d = run("vermilion_rockfish", length(16.0), ocean("central"), p=0.70, others=[("yelloweye_rockfish", 0.22)])
    assert d.verdict == Verdict.PROHIBITED
    assert "yelloweye" in d.reasons[0].lower()


def test_low_confidence_is_never_keep():
    d = run("kelp_bass", length(16.0), ocean("southern"), p=0.40, others=[("barred_sand_bass", 0.35)])
    assert d.verdict == Verdict.UNCERTAIN_SPECIES


def test_truncated_fish_is_never_keep():
    d = run("lingcod", length(30.0, truncated=True), ocean("central"))
    assert d.verdict == Verdict.TOO_CLOSE_TO_CALL
    d = run("blue_rockfish", length(10.0, truncated=True), ocean("central"))  # no size limit at all
    assert d.verdict == Verdict.TOO_CLOSE_TO_CALL


def test_mpa_no_take():
    place = get_locator().locate(36.518, -121.955)  # Point Lobos SMR
    d = run("blue_rockfish", length(10.0), place)
    assert d.verdict == Verdict.MPA_NO_TAKE


def test_outside_california_is_not_keep():
    place = get_locator().locate(39.53, -119.81)
    d = run("largemouth_bass", length(15.0), place, mode=None)
    assert d.verdict != Verdict.KEEP


def test_no_location_still_answers_with_strictest():
    d = run("lingcod", length(23.0), Place(), mode=None)
    assert d.verdict == Verdict.KEEP  # 22 in min statewide, season open in June
    d = run("striped_bass", length(16.0), Place(), mode=None)
    assert d.verdict == Verdict.RELEASE_UNDERSIZED  # 18 in min governs when area unknown


def test_unknown_mode_assumes_boat_and_says_so():
    d = run("lingcod", length(24.0), ocean("central"), on=date(2026, 2, 10), mode=None)
    assert d.verdict == Verdict.SEASON_CLOSED
    assert "shore" in d.reasons[0]


def test_citations_and_staleness():
    d = run("lingcod", length(24.0), ocean("central"))
    ccrs = [c["ccr"] for c in d.citations]
    assert any("28.27" in c for c in ccrs)
    assert not d.stale
    stale = evaluate([("lingcod", 0.95)], length(24.0), ocean("central"), JUNE, mode="boat", today=date(2027, 1, 2))
    assert stale.stale and "2027" in stale.stale_message
