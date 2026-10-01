import io
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from fishid.gear import GearStore
from fishid.pipeline import Analyzer, ModelSlot
from fishid.segment.fake import FakeSegmenter
from fishid.species.base import FakeClassifier


def jpeg() -> bytes:
    buf = io.BytesIO()
    Image.fromarray(np.full((1000, 1600, 3), 90, np.uint8)).save(buf, "JPEG")
    return buf.getvalue()


@pytest.fixture
def client(tmp_path, make_fish, make_rect):
    masks = [make_fish(480, center=(900, 550)), make_rect(6.14 * 20, 2.61 * 20, center=(300, 200))]
    analyzer = Analyzer({
        "segmenter": ModelSlot.ready("segmenter", FakeSegmenter(masks)),
        "classifier": ModelSlot.ready("classifier", FakeClassifier([("lingcod", 0.9)])),
        "depth": ModelSlot("depth", None),
    })
    from fishid.server import create_app
    return TestClient(create_app(analyzer, GearStore(tmp_path / "gear.json")))


FORM = {"lat": "36.62", "lon": "-121.98", "date": "2026-06-15", "mode": "boat"}


def test_analyze_json(client):
    r = client.post("/api/analyze", files={"image": ("f.jpg", jpeg(), "image/jpeg")}, data=FORM)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["fish"][0]["verdict"] == "KEEP"
    assert body["fish"][0]["length"]["value"] == pytest.approx(24, rel=0.04)


def test_upload_too_large(client):
    big = b"\xff\xd8" + b"0" * (25 * 1024 * 1024 + 10)
    r = client.post("/api/analyze", files={"image": ("big.jpg", big, "image/jpeg")})
    assert r.status_code == 400
    assert "25 MB" in r.json()["error"]


def test_not_an_image(client):
    r = client.post("/api/analyze", files={"image": ("notes.txt", b"hello", "text/plain")})
    assert r.status_code == 400


def test_bad_inputs(client):
    files = {"image": ("f.jpg", jpeg(), "image/jpeg")}
    assert client.post("/api/analyze", files=files, data={"lat": "36"}).status_code == 400
    assert client.post("/api/analyze", files=files, data={"mode": "plane"}).status_code == 400
    assert client.post("/api/analyze", files=files, data={"water_id": "atlantis"}).status_code == 400
    assert client.post("/api/analyze", files=files, data={"manual_scale": "{"}).status_code == 400


def test_stream_reports_steps_then_result(client):
    with client.stream("POST", "/api/analyze/stream", files={"image": ("f.jpg", jpeg(), "image/jpeg")},
                       data=FORM) as r:
        text = "".join(r.iter_text())
    events = [line[7:] for line in text.splitlines() if line.startswith("event: ")]
    assert events == ["step", "step", "step", "step", "result"]
    last = [line for line in text.splitlines() if line.startswith("data: ")][-1]
    assert json.loads(last[6:])["fish"][0]["verdict"] == "KEEP"


def test_gear_crud(client):
    r = client.post("/api/gear", json={"name": "rod handle", "length_in": 11.5})
    assert r.status_code == 201
    gid = r.json()["id"]
    assert client.get("/api/gear").json()[0]["name"] == "rod handle"
    assert client.put(f"/api/gear/{gid}", json={"name": "cork grip", "length_in": 12}).json()["name"] == "cork grip"
    assert client.post("/api/gear", json={"name": "", "length_in": 3}).status_code == 422
    assert client.delete(f"/api/gear/{gid}").status_code == 204
    assert client.delete(f"/api/gear/{gid}").status_code == 404


def test_lookups_and_health(client):
    assert client.get("/api/waters", params={"q": "crowley"}).json()[0]["id"] == "crowley_lake"
    assert len(client.get("/api/species").json()) > 100
    h = client.get("/api/health").json()
    assert h["regs_verified"] == "2026-09-30"
    assert h["counts"]["species"] > 100
    assert h["models"]["segmenter"]["status"] == "ready"
    loc = client.get("/api/locate", params={"lat": 36.518, "lon": -121.955}).json()
    assert loc["mpa"]["no_take"]
