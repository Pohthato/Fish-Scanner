import re

from fishid.species.catalog import load_catalog, species_for_water


def test_catalog_size_and_unique_ids():
    cat = load_catalog()
    assert len(cat) >= 120


def test_lookalikes_exist():
    cat = load_catalog()
    for sp in cat.values():
        for other in sp.lookalikes:
            assert other in cat, f"{sp.id} lists unknown lookalike {other}"


def test_fields_are_valid():
    for sp in load_catalog().values():
        assert sp.measure in ("TL", "FL"), sp.id
        assert sp.water in ("salt", "fresh", "both"), sp.id
        assert re.fullmatch(r"[A-Z][a-z]+ [a-z]+( [a-z]+)?", sp.scientific), sp.id
        assert sp.common, sp.id


def test_protected_species_are_flagged():
    cat = load_catalog()
    for sid in ("yelloweye_rockfish", "cowcod", "coho_salmon", "giant_sea_bass", "garibaldi", "white_shark"):
        assert cat[sid].protected


def test_water_filter():
    fresh = {s.id for s in species_for_water("fresh")}
    assert "largemouth_bass" in fresh and "striped_bass" in fresh
    assert "lingcod" not in fresh
