"""End-to-end with the real models. Slow (downloads weights on first run):

    pytest -m slow
"""
from datetime import date
from pathlib import Path

import pytest

pytestmark = pytest.mark.slow

PHOTO = Path(__file__).parent / "data" / "largemouth_bass.jpg"


def test_real_pipeline_on_a_bass():
    from fishid.pipeline import Analyzer

    result = Analyzer().analyze(PHOTO.read_bytes(), water_id="clear_lake", on=date(2026, 6, 15))
    assert result["ok"], result["message"]
    fish = result["fish"][0]
    ids = [s["id"] for s in fish["species"]]
    assert {"largemouth_bass", "spotted_bass", "smallmouth_bass"} & set(ids)
    assert fish["verdict"] is not None
    # Nothing of known size in this photo: no length, and so no KEEP.
    assert fish["length"] is None
    assert fish["verdict"] != "KEEP"
    assert any("can't be measured" in n for n in result["scale_notes"])
