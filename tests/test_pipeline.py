import io
from datetime import date

import numpy as np
import pytest
from PIL import Image

from fishid.models import Mask, Scale
from fishid.pipeline import Analyzer, ModelSlot
from fishid.segment.fake import FakeSegmenter
from fishid.species.base import FakeClassifier

PPI = 20.0
H, W = 1000, 1600


def photo_bytes(exif_gps=None) -> bytes:
    img = Image.fromarray(np.full((H, W, 3), 90, np.uint8))
    buf = io.BytesIO()
    if exif_gps:
        exif = Image.Exif()
        lat, lon = exif_gps
        gps = {1: "N" if lat >= 0 else "S", 2: (abs(lat), 0.0, 0.0), 3: "W" if lon < 0 else "E",
               4: (abs(lon), 0.0, 0.0)}
        exif[0x8825] = gps
        img.save(buf, "JPEG", exif=exif)
    else:
        img.save(buf, "JPEG")
    return buf.getvalue()


class SlowDepth:
    name = "fake depth"

    def scale_at(self, image, mask, focal_px=None):
        return Scale(PPI, 0.08, "depth", "fake")


@pytest.fixture
def scene(make_fish, make_rect):
    fish = make_fish(int(24 * PPI), center=(900, 550))  # 24 in lingcod
    bill = make_rect(6.14 * PPI, 2.61 * PPI, center=(300, 200))
    return fish, bill


def analyzer(masks, answer=(("lingcod", 0.92), ("cabezon", 0.03)), fail=False, depth=None):
    return Analyzer({
        "segmenter": ModelSlot.ready("segmenter", FakeSegmenter(masks)),
        "classifier": ModelSlot.ready("classifier", FakeClassifier(list(answer), fail=fail)),
        "depth": ModelSlot.ready("depth", depth) if depth else ModelSlot("depth", None),
    })


def test_one_fish_with_dollar_bill(scene):
    a = analyzer(list(scene))
    steps = []
    r = a.analyze(photo_bytes(), lat=36.62, lon=-121.98, on=date(2026, 6, 15), mode="boat", progress=steps.append)
    assert r["ok"], r["message"]
    assert steps == ["detect", "identify", "measure", "regs"]
    assert r["scale"]["source"] == "reference"
    f = r["fish"][0]
    assert f["length"]["value"] == pytest.approx(24.0, rel=0.04)
    assert f["verdict"] == "KEEP"
    assert any("28.27" in c["ccr"] for c in f["citations"])
    assert r["annotated_png"] and r["image"]["jpeg"]
    assert r["place"]["ocean_area"] == "central"


def test_two_fish_are_numbered(make_fish, make_rect):
    masks = [make_fish(300, center=(400, 600)), make_fish(400, center=(1100, 400)),
             make_rect(6.14 * PPI, 2.61 * PPI, center=(300, 150))]
    r = analyzer(masks).analyze(photo_bytes(), lat=36.62, lon=-121.98, on=date(2026, 6, 15), mode="boat")
    assert [f["number"] for f in r["fish"]] == [1, 2]
    assert r["fish"][0]["bbox"][0] < r["fish"][1]["bbox"][0]
    assert any("bag" in n for n in r["notes"])


def test_no_fish(make_rect):
    r = analyzer([make_rect(100, 40)]).analyze(photo_bytes())
    assert not r["ok"] and r["error"] == "no_fish"


def test_exif_gps_used_when_no_pin(scene):
    r = analyzer(list(scene)).analyze(photo_bytes(exif_gps=(33.5, -118.4)), on=date(2026, 6, 15), mode="boat")
    assert r["place"]["source"] == "exif"
    assert r["place"]["ocean_area"] == "southern"


def test_classifier_failure_still_allows_manual_species(scene):
    a = analyzer(list(scene), fail=True)
    r = a.analyze(photo_bytes(), lat=36.62, lon=-121.98, on=date(2026, 6, 15))
    assert r["ok"] and r["fish"][0]["verdict"] is None
    r = a.analyze(photo_bytes(), lat=36.62, lon=-121.98, on=date(2026, 6, 15), mode="boat", species_id="lingcod")
    assert r["fish"][0]["verdict"] == "KEEP"
    assert r["fish"][0]["species_source"] == "manual"


def test_depth_fallback_when_no_reference(scene):
    fish, _ = scene
    r = analyzer([fish], depth=SlowDepth()).analyze(photo_bytes(), lat=36.62, lon=-121.98,
                                                    on=date(2026, 6, 15), mode="boat")
    assert r["scale"]["source"] == "depth"
    assert any("rough guess" in n for n in r["scale_notes"])
    # Depth-based lengths are too rough to clear a size limit.
    assert r["fish"][0]["verdict"] == "TOO_CLOSE_TO_CALL"


def test_bad_reference_is_reported(make_fish, make_rect):
    masks = [make_fish(480, center=(900, 550)), make_rect(6.14 * PPI, 3.4 * PPI, center=(300, 200))]
    r = analyzer(masks).analyze(photo_bytes(), lat=36.62, lon=-121.98, on=date(2026, 6, 15))
    assert any("aspect ratio" in n for n in r["scale_notes"])


def test_manual_scale(make_fish):
    fish = make_fish(int(24 * PPI), center=(900, 550))
    manual = {"x1": 0.1, "y1": 0.1, "x2": 0.1 + 12 * PPI / W, "y2": 0.1, "length_in": 12}
    r = analyzer([fish]).analyze(photo_bytes(), lat=36.62, lon=-121.98, on=date(2026, 6, 15), mode="boat",
                                 manual_scale=manual)
    assert r["scale"]["source"] == "manual"
    assert r["fish"][0]["length"]["value"] == pytest.approx(24.0, rel=0.05)
