"""HTTP API + static frontend.

    python -m fishid serve          # http://127.0.0.1:8000
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from fishid import DISCLAIMER, __version__
from fishid.config import FRONTEND_DIR, MAX_UPLOAD_BYTES, REGS_YEAR
from fishid.gear import Gear, GearIn, GearStore
from fishid.imaging import BadImage
from fishid.pipeline import Analyzer
from fishid.regs.engine import MODES
from fishid.regs.loader import load_rules
from fishid.regs.location import get_locator
from fishid.species.catalog import load_catalog

log = logging.getLogger(__name__)


def create_app(analyzer: Analyzer | None = None, gear_store: GearStore | None = None,
               warm: bool = False) -> FastAPI:
    analyzer = analyzer or Analyzer()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if warm:
            # Load models in the background so the page is usable right away.
            threading.Thread(target=analyzer.warm_up, daemon=True).start()
        yield

    app = FastAPI(title="California Fish ID", version=__version__, lifespan=lifespan)
    app.state.analyzer = analyzer
    app.state.gear = gear_store or GearStore()

    # ------------------------------------------------------------------ helpers
    async def read_upload(image: UploadFile) -> bytes:
        data = await image.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(400, f"Photo is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
        if not data:
            raise HTTPException(400, "Empty upload.")
        return data

    def parse_args(lat, lon, water_id, on, mode, gear_ids, manual_scale, species_id) -> dict:
        if (lat is None) != (lon is None):
            raise HTTPException(400, "Send both lat and lon, or neither.")
        if mode is not None and mode not in MODES:
            raise HTTPException(400, f"mode must be one of {', '.join(MODES)}.")
        try:
            day = date.fromisoformat(on) if on else None
        except ValueError:
            raise HTTPException(400, "date must be YYYY-MM-DD.")
        manual = None
        if manual_scale:
            try:
                manual = json.loads(manual_scale)
                for k in ("x1", "y1", "x2", "y2", "length_in"):
                    float(manual[k])
            except (ValueError, KeyError, TypeError):
                raise HTTPException(400, "manual_scale must be JSON with x1, y1, x2, y2 (0–1) and length_in.")
        if water_id and water_id not in get_locator().waters:
            raise HTTPException(400, f"Unknown water body {water_id}.")
        if species_id and species_id not in load_catalog():
            raise HTTPException(400, f"Unknown species {species_id}.")
        ids = [g for g in (gear_ids or "").split(",") if g]
        return dict(lat=lat, lon=lon, water_id=water_id or None, on=day, mode=mode,
                    gear=app.state.gear.get_many(ids), manual_scale=manual, species_id=species_id or None)

    async def analyze_form(image: UploadFile = File(...), lat: float | None = Form(None),
                           lon: float | None = Form(None), water_id: str | None = Form(None),
                           date: str | None = Form(None), mode: str | None = Form(None),
                           gear_ids: str | None = Form(None), manual_scale: str | None = Form(None),
                           species_id: str | None = Form(None)) -> tuple[bytes, dict]:
        data = await read_upload(image)
        return data, parse_args(lat, lon, water_id, date, mode, gear_ids, manual_scale, species_id)

    # ------------------------------------------------------------------ analyze
    @app.post("/api/analyze")
    async def analyze(form: tuple[bytes, dict] = Depends(analyze_form)):
        data, kwargs = form
        try:
            return await asyncio.to_thread(app.state.analyzer.analyze, data, **kwargs)
        except BadImage as e:
            raise HTTPException(400, str(e))

    @app.post("/api/analyze/stream")
    async def analyze_stream(form: tuple[bytes, dict] = Depends(analyze_form)):
        data, kwargs = form
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def progress(step: str) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, ("step", {"step": step}))

        def work() -> None:
            try:
                result = app.state.analyzer.analyze(data, progress=progress, **kwargs)
                loop.call_soon_threadsafe(queue.put_nowait, ("result", result))
            except BadImage as e:
                loop.call_soon_threadsafe(queue.put_nowait, ("error", {"message": str(e)}))
            except Exception as e:
                log.exception("analysis failed")
                loop.call_soon_threadsafe(queue.put_nowait, ("error", {"message": f"Analysis failed: {e}"}))

        threading.Thread(target=work, daemon=True).start()

        async def events():
            while True:
                kind, payload = await queue.get()
                yield f"event: {kind}\ndata: {json.dumps(payload)}\n\n"
                if kind in ("result", "error"):
                    break

        return StreamingResponse(events(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    # ------------------------------------------------------------------ gear
    @app.get("/api/gear")
    def list_gear() -> list[Gear]:
        return app.state.gear.list()

    @app.post("/api/gear", status_code=201)
    def add_gear(item: GearIn) -> Gear:
        return app.state.gear.add(item)

    @app.put("/api/gear/{gear_id}")
    def update_gear(gear_id: str, item: GearIn) -> Gear:
        try:
            return app.state.gear.update(gear_id, item)
        except KeyError:
            raise HTTPException(404, "No such gear.")

    @app.delete("/api/gear/{gear_id}", status_code=204)
    def delete_gear(gear_id: str):
        try:
            app.state.gear.delete(gear_id)
        except KeyError:
            raise HTTPException(404, "No such gear.")

    # ------------------------------------------------------------------ lookups
    @app.get("/api/waters")
    def waters(q: str = Query("", max_length=60)):
        return get_locator().search(q)

    @app.get("/api/locate")
    def locate(lat: float, lon: float):
        p = get_locator().locate(lat, lon)
        return {"label": p.label, "water": p.water, "in_california": p.in_california,
                "water_body": p.water_body, "warnings": p.warnings,
                "mpa": {k: p.mpa.get(k) for k in ("name", "type", "no_take")} if p.mpa else None}

    @app.get("/api/species")
    def species():
        return sorted((s.to_dict() for s in load_catalog().values()), key=lambda s: s["name"])

    @app.get("/api/health")
    def health():
        rules = load_rules(REGS_YEAR)
        return {
            "version": __version__,
            "models": app.state.analyzer.health(),
            "regs_year": rules.year,
            "regs_verified": rules.verified.isoformat(),
            "counts": {"species": len(load_catalog()), "rules": len(rules.rules),
                       "waters": len(get_locator().waters), "mpas": len(get_locator().mpa_props)},
            "disclaimer": DISCLAIMER,
        }

    # ------------------------------------------------------------------ frontend
    if FRONTEND_DIR.is_dir():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

        @app.get("/", include_in_schema=False)
        def index():
            return FileResponse(FRONTEND_DIR / "index.html")

    @app.exception_handler(HTTPException)
    async def http_error(_, exc: HTTPException):
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code)

    return app
