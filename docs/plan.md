# California Fish ID — Implementation Plan

**Goal:** Build the Python app described in `docs/design.md`: photo in → species, measured length range, and CDFW keep/release verdict with citations, served by FastAPI to a static Dimension-based frontend.

**Architecture:** A pure-Python core (`fishid.measure`, `fishid.regs`, `fishid.species.catalog`) with no ML imports, wrapped by model adapters behind small protocols (`Segmenter`, `Classifier`, `DepthEstimator`). `fishid.pipeline` wires them together and `fishid.server` exposes it over HTTP (JSON and Server-Sent Events). Tests drive the core with synthetic masks and the pipeline/API with fake models.

**Tech stack:** Python 3.12, FastAPI + uvicorn, numpy / OpenCV / scikit-image / shapely, PyYAML, pydantic v2, PyTorch (CPU), open_clip (BioCLIP 2), ultralytics (YOLOE), transformers (SAM 3, Depth Pro), pytest. Frontend: HTML/CSS/vanilla JS + GSAP from a CDN, no build step.

**Spec:** `docs/design.md`

## Global constraints

- Runs locally on CPU (Intel Core Ultra 7 155U, 32 GB RAM, no NVIDIA GPU); no cloud services or API keys at runtime.
- California recreational fishing only; English only.
- No Gemini/LLM calls, no catch log, no user accounts, no invertebrates.
- Uploads over 25 MB or not an image → HTTP 400 with a message.
- Every verdict carries "Not legal advice — verify at wildlife.ca.gov." and the cited CCR sections + verification date of every rule used.
- `KEEP` only when: species confident, fish not truncated, whole length range inside legal bounds, season open, no MPA prohibition.
- Stale regs banner when any rule file's `verified` date is > 30 days old or from a previous year.
- Frontend: HTML5 UP Dimension (CC BY 3.0, keep "Design: HTML5 UP" credit), no jQuery, GSAP for animation, respects `prefers-reduced-motion`, palette navy #0B1F2A, teal #1F7A8C, sand #E9D8A6, coral #EE6C4D.
- Background photos: real photographs from Unsplash/Pexels only, each ≤ 300 KB, listed in `frontend/assets/CREDITS.md`.

## Review focus

1. **Lookalike with different rules** (e.g., top-1 is a legal rockfish, top-2 is prohibited yelloweye/cowcod) → strictest rule set governs; never `KEEP`.
2. **Length range straddles a limit** (e.g., 11.8–12.4 in vs a 12 in minimum) → `TOO_CLOSE_TO_CALL`, not `KEEP`.
3. **Fish touches image edge** → length reported as "≥ X in" and never `KEEP`.
4. **Reference object present but distorted/occluded** (aspect ratio off by >8%) → rejected with a reason, next scale source used.
5. **No location / location outside California** → statewide/ocean defaults plus a warning; never crash on missing GPS or a pin in Nevada.

Each of these has a test in the owning task below.

---

## File structure

```
fishid/
  __init__.py, __main__.py     CLI: serve | regs check | analyze <image>
  config.py                    paths, thresholds, limits
  models.py                    dataclasses (Mask, Scale, Length, Place …) + pydantic API schemas
  imaging.py                   load/EXIF (GPS, focal length), resize, overlay drawing
  pipeline.py                  analyze() orchestration with progress callback
  server.py                    FastAPI app
  gear.py                      saved-gear JSON store
  segment/{base,clean,yoloe,sam3,fake}.py
  species/{base,catalog,bioclip,finetuned}.py
  measure/{references,length,depth}.py
  regs/{loader,location,engine,check}.py
  data/species.yaml, references.yaml, regs/2026/*.yaml, geo/*.geojson
frontend/  index.html, assets/css/*.css, assets/js/*.js, assets/img/*, assets/CREDITS.md
training/  fetch_inat.py, prepare.py, finetune.ipynb, evaluate.py
tests/     test_*.py + conftest.py (synthetic masks, fake models)
```

## Task 1 — Project skeleton and shared types

**Files:** `pyproject.toml`, `requirements.txt`, `fishid/__init__.py`, `fishid/config.py`, `fishid/models.py`, `tests/conftest.py`

**Produces:**
- `Mask(data: np.ndarray[bool], label: str, score: float)` with `.area`, `.bbox -> (x0,y0,x1,y1)`, `.touches_border -> bool`
- `Scale(px_per_in: float, rel_sigma: float, source: Literal["reference","gear","manual","depth"], detail: str)`
- `Length(value_in, low_in, high_in, kind: "TL"|"FL", truncated: bool, snout, tail, midline: list[tuple[float,float]])`
- `Place(in_california: bool, ocean_area: str|None, district: str|None, water_body: str|None, mpa: dict|None, label: str, warnings: list[str])`
- `Verdict` (str enum): `KEEP, RELEASE_UNDERSIZED, RELEASE_OVERSIZED, TOO_CLOSE_TO_CALL, PROHIBITED, SEASON_CLOSED, MPA_NO_TAKE, UNCERTAIN_SPECIES`

**Tests:** `Mask.touches_border` true for a mask on column 0, false when one pixel inside; `bbox` of a known rectangle.

## Task 2 — Species catalog

**Files:** `fishid/data/species.yaml`, `fishid/species/catalog.py`, `tests/test_catalog.py`

**Produces:** `Species` dataclass (`id, common, scientific, family, water: salt|fresh|both, measure: TL|FL, lookalikes, hazards, protected, regions, group`), `load_catalog() -> dict[str, Species]`.

**Tests:** ≥ 120 entries; ids unique; every `lookalikes` id exists; every `measure` in {TL, FL}; scientific names are binomials.

## Task 3 — Scale from reference objects

**Files:** `fishid/data/references.yaml`, `fishid/measure/references.py`, `tests/test_references.py`

**Produces:** `scale_from_reference(mask: Mask, ref_id: str) -> Scale | Rejection`, `scale_from_gear(mask, length_in, name)`, `scale_from_points(p1, p2, length_in)`, `pick_scale(candidates) -> (Scale|None, list[str] reasons)`.
Method: min-area rect of the mask's largest contour; for rectangular references, fit a quadrilateral (`approxPolyDP`), compute the homography to the true rectangle, and report px/in from the rectified long side; aspect-ratio gate ±8 %.

**Tests:** synthetic dollar bill at 0° and 30° rotation → px/in within 2 %; synthetic card under perspective tilt (homography warp) → within 3 %; **bill with aspect 2.0 is rejected with reason "aspect ratio"** (review focus 4); `pick_scale` prefers reference > gear > manual.

## Task 4 — Length from a fish mask

**Files:** `fishid/measure/length.py`, `tests/test_length.py`

**Produces:** `measure_length(mask: Mask, scale: Scale, kind: "TL"|"FL") -> Length`.
Method: clean mask → skeletonize → longest geodesic path → extend ends along tangent to the boundary → orient (tail = end with narrowest width in last 30 %) → TL = arc length + extension to farthest caudal point; FL = to deepest convexity defect of the tail. σ from ±1.5 px endpoints, the scale's `rel_sigma`; range = ±2σ.

**Tests:** synthetic straight fish (ellipse body + forked tail) of 600 px at 20 px/in → TL 30 in ± 3 %; same fish rotated 37° → same; curved (arc) fish → arc length within 4 %; FL < TL for forked tail and ≈ TL for a truncate tail; **mask touching the border → `truncated=True`** (review focus 3); `high > low` and range widens as `rel_sigma` grows.

## Task 5 — Regulation data, loader, location

**Files:** `fishid/regs/loader.py`, `fishid/regs/location.py`, `fishid/data/regs/2026/{ocean,freshwater}.yaml`, `fishid/data/geo/{ocean_areas,mpas,ca_boundary,waters}.geojson`, `tests/test_regs_data.py`, `tests/test_location.py`

**Produces:** `Rule` dataclass mirroring the YAML schema in the spec; `load_rules(year) -> list[Rule]` (validates); `Locator.locate(lat, lon) -> Place`, `Locator.by_water(id) -> Place`, `Locator.search(q) -> list[dict]`.

**Tests:** every rule's species/groups exist in the catalog; every rule has `source.ccr`, `source.url`, `source.verified`, and `effective`; GeoJSON loads and polygons are valid; pin off Monterey → Central groundfish area; **pin in Nevada → `in_california=False` with warning; `None` location → statewide defaults with warning** (review focus 5); pin inside a no-take SMR → `mpa.take == "none"`.

## Task 6 — Regulation engine

**Files:** `fishid/regs/engine.py`, `tests/test_engine.py`

**Produces:** `evaluate(candidates: list[(species_id, prob)], length: Length|None, place: Place, on: date, confident: bool) -> Decision(verdict, governing_species, rules: list[Rule], reasons: list[str], citations, stale: bool)`.
Precedence: MPA no-take > in-season closure > water-body > district/area > statewide. Lookalikes with different rules → evaluate each, strictest wins.

**Tests (table-driven):** lingcod 21.5 in in Southern area → `RELEASE_UNDERSIZED`; lingcod 24 in in open season → `KEEP`; coho salmon → `PROHIBITED`; groundfish in a closed month → `SEASON_CLOSED`; MPA SMR pin → `MPA_NO_TAKE`; **range 21.8–22.4 vs 22 in min → `TOO_CLOSE_TO_CALL`** (review focus 2); **low-confidence vermilion with yelloweye as candidate → not `KEEP`** (review focus 1); truncated fish → never `KEEP`; white sturgeon slot.

## Task 7 — Model adapters

**Files:** `fishid/segment/{base,clean,yoloe,sam3,fake}.py`, `fishid/species/{base,bioclip,finetuned}.py`, `fishid/measure/depth.py`, `tests/test_clean.py`

**Produces:** `Segmenter.segment(image: np.ndarray RGB, prompts: list[str]) -> list[Mask]`; `Classifier.classify(crop: PIL.Image, allowed: list[str]) -> list[(species_id, prob)]`; `DepthEstimator.scale_at(image, mask, focal_px|None) -> Scale`; `make_segmenter()` picks SAM 3 if its weights are accessible, else YOLOE.

**Tests:** `clean_mask` keeps the largest component, fills holes. Real-model smoke tests marked `slow`.

## Task 8 — Imaging, pipeline, overlay

**Files:** `fishid/imaging.py`, `fishid/pipeline.py`, `tests/test_pipeline.py`

**Produces:** `analyze(image_bytes, *, lat, lon, water_id, on, gear_ids, manual_scale, progress) -> AnalysisResult` where `progress(step: str)` is called with `detect`, `identify`, `measure`, `regs`.

**Tests (fakes):** one fish + dollar bill → length and verdict filled, scale source "reference"; two fish → two numbered results; no fish → `error="no_fish"`; EXIF GPS is used when lat/lon not given; classifier crash → result still has regulations for a manually chosen species.

## Task 9 — API server and CLI

**Files:** `fishid/server.py`, `fishid/gear.py`, `fishid/__main__.py`, `fishid/regs/check.py`, `tests/test_api.py`

**Produces:** endpoints from spec §7 (`/api/analyze`, `/api/analyze/stream`, `/api/gear`, `/api/waters`, `/api/health`, `/api/species`), static frontend at `/`. CLI: `python -m fishid serve`, `python -m fishid analyze photo.jpg`, `python -m fishid regs check`.

**Tests:** 26 MB upload → 400; text file → 400; analyze with fakes → 200 JSON with `fish[0].verdict`; stream yields `step` events then `result`; gear CRUD round-trip; health reports regs verified date.

## Task 10 — Frontend

**Files:** `frontend/index.html`, `frontend/assets/css/main.css`, `frontend/assets/js/{app,anim,scan,gear}.js`, `frontend/assets/img/bg-*.webp`, `frontend/assets/img/logo.svg`, `frontend/assets/CREDITS.md`

Dimension layout (header + nav opening glass "article" panels) rebuilt with vanilla JS; GSAP timelines for logo stroke, letter reveal, chips, counters, panel open/close, result staggering, annotated-photo draw-on; background crossfade slideshow with Ken Burns; reduced-motion fallbacks.

**Check:** load in a browser via `python -m fishid serve`, run a scan, verify each panel and reduced-motion mode.

## Task 11 — Training and evaluation scripts, README

**Files:** `training/fetch_inat.py`, `training/prepare.py`, `training/finetune.ipynb`, `training/evaluate.py`, `README.md`

`evaluate.py` reads a CSV (`path, species_id, true_length_in, reference, lat, lon`) and prints top-1/top-3, length error by scale source, and a verdict confusion table with false-KEEP count.

**Check:** `python training/evaluate.py --help`; README run instructions work from a clean clone.
