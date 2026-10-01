import json
from datetime import date

import pytest
from shapely.geometry import shape

from fishid.config import GEO_DIR
from fishid.regs.loader import load_rules, resolve_day
from fishid.species.catalog import load_catalog


@pytest.fixture(scope="module")
def ruleset():
    return load_rules(2026)


def test_rules_load_and_reference_known_species(ruleset):
    assert len(ruleset.rules) > 60  # loading validates species/groups


def test_every_rule_is_cited_and_dated(ruleset):
    for r in ruleset.rules:
        assert r.source["ccr"].startswith(("T14 CCR", "FGC")), r.id
        assert r.source["url"].startswith("https://"), r.id
        assert isinstance(r.source["verified"], date), r.id
        assert r.effective[0] <= r.effective[1], r.id


def test_every_catchable_species_has_a_rule(ruleset):
    """No species should fall through to 'no rule on file' in its own water."""
    from fishid.models import Place
    for sp in load_catalog().values():
        waters = ["salt", "fresh"] if sp.water == "both" else [sp.water]
        for w in waters:
            place = Place(water=w)
            hits = [r for r in ruleset.rules if r.species_match(sp) and r.place_match(place) != "no"]
            assert hits, f"{sp.id} has no rule in {w} water"


def test_protected_species_have_prohibiting_rule(ruleset):
    for sp in load_catalog().values():
        if sp.protected:
            assert any(r.prohibited and r.species_match(sp) >= 2 for r in ruleset.rules), sp.id


def test_no_contradictory_rules_at_same_precedence(ruleset):
    """Two rules for the same species, same place filter and same specificity
    must not both set a size limit."""
    seen = {}
    for r in ruleset.rules:
        if r.size is None:
            continue
        key = (tuple(sorted(r.species)), json.dumps(r.where, sort_keys=True))
        assert key not in seen, f"{r.id} and {seen[key]} both set size for {key}"
        seen[key] = r.id


def test_geojson_is_valid():
    for name in ("mpas", "counties"):
        fc = json.loads((GEO_DIR / f"{name}.geojson").read_text(encoding="utf-8"))
        assert fc["features"]
        for f in fc["features"]:
            assert shape(f["geometry"]).is_valid, f["properties"]


def test_date_tokens():
    assert resolve_day("last-sat-apr", 2026) == date(2026, 4, 25)
    assert resolve_day("fri-before-last-sat-apr", 2026) == date(2026, 4, 24)
    assert resolve_day("sat-before-memorial-day", 2026) == date(2026, 5, 23)
    assert resolve_day("last-day-feb", 2028) == date(2028, 2, 29)
