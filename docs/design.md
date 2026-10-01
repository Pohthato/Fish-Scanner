# California Fish ID — Design Spec

**Date:** 2026-09-30
**Status:** Approved
**Replaces:** the existing TypeScript/Gemini app in this folder (its `local_yolo_server.py` was a stub that returned hard-coded results).

## 1. Goal

A Python application that takes a photo of a fish caught in California (fresh or saltwater), identifies the species, measures its length as precisely as the photo allows, and reports the applicable CDFW regulations — size limits, bag/possession limits, seasons, area/MPA restrictions — with a keep/release verdict.

### Success criteria
- Species top-1 accuracy ≥ 85% / top-3 ≥ 95% on a held-out set of angler-held California photos (after fine-tuning; zero-shot baseline is recorded, not gated).
- Length error ≤ 3% when a dollar bill or card is in frame; ≤ 5% with saved gear or manual scale; fallback reports a range (±10–20%).
- **Zero false KEEP verdicts** on the evaluation set. This is the primary safety metric.
- Every verdict cites the CDFW sections and data verification date it relied on.

### User-stated requirements vs. assumptions
| Stated by user | Assumed (correct me) |
|---|---|
| Python app; image in → species, precise length, regulations | Local-first on a laptop (Intel Core Ultra 7 155U, no NVIDIA GPU, 32 GB RAM); deployable later as a Hugging Face Docker Space |
| California only, fresh + saltwater | Recreational (sport) fishing only, not commercial |
| Known-object scale: dollar bill, rod handle, etc.; else background context | Personal / non-commercial use initially (affects dataset licensing) |
| Freshwater: statewide + location-specific special regs | Ocean gets the same location treatment (groundfish areas, depth, MPAs) |
| Professional free template with animations, fishing-related background | English only |

### Out of scope (YAGNI)
Catch log, standalone regulations browser, user accounts, Gemini/LLM calls, native mobile app, LiDAR, commercial regulations, invertebrates (lobster, crab, abalone).

## 2. Architecture

```
browser (Dimension-based static site) ──HTTP──► FastAPI (fishid/server.py)
                                              │
                                              ▼
                                    pipeline.analyze(image, location?, date, gear)
        ┌──────────────────────┬──────────────┼──────────────────┬───────────────────┐
        ▼                      ▼              ▼                  ▼                   ▼
  segment (SAM 3)       species (BioCLIP 2)  measure.references  measure.length   regs.engine
  fish + reference      top-5 over CA list   px/in ± σ           mask → TL/FL     + regs.location
  masks                 (+ fine-tuned later)  measure.depth fallback  range         verdict + citations
```

### Project layout
```
fishid/
  server.py              FastAPI: serves frontend build + JSON API
  pipeline.py            orchestrates steps → AnalysisResult
  models.py              shared dataclasses / pydantic schemas
  segment/
    base.py              Segmenter protocol: segment(image, prompts) -> list[Mask]
    sam3.py              default implementation (text-prompted)
  species/
    base.py              Classifier protocol: classify(crop) -> list[(species_id, prob)]
    bioclip.py           zero-shot BioCLIP 2
    finetuned.py         California fine-tuned head (drop-in)
  measure/
    references.py        known objects + saved gear → Scale(px_per_in, sigma, source)
    depth.py             Depth Pro fallback → Scale
    length.py            mask → Length(low, high, kind=TL|FL, snout, tail, midline)
  regs/
    engine.py            evaluate(species, length_range, place, date) -> Verdict
    location.py          (lat, lon) | water_body_id -> Place
    loader.py            YAML/GeoJSON loading + schema validation
  data/
    species.yaml
    references.yaml      known object dimensions + aspect ratios
    regs/2026/*.yaml
    geo/*.geojson
  user/gear.json         user's saved gear (gitignored)
frontend/                HTML5 UP Dimension (CC BY 3.0), modernized; static files
training/
  fetch_inat.py          GBIF/iNaturalist download for CA fish
  prepare.py             SAM 3 crop, dedupe, observer-split
  finetune.ipynb         Kaggle notebook (linear probe, then partial fine-tune)
  evaluate.py
tests/
```

Each unit has one job and a typed interface; models sit behind protocols so tests use fakes and YOLOE (or a fine-tuned YOLO-seg) can replace SAM 3 without touching callers.

## 3. Detection & segmentation
- **SAM 3**, text-prompted: `"fish"` for catches; reference prompts `"dollar bill"`, `"credit card"`, `"coin"`, `"soda can"`, and each saved gear name.
- Masks are cleaned (largest component per instance, hole fill, morphological smoothing).
- Multiple fish → each analyzed and numbered; counts toward bag-limit display.
- Fish touching the image border → flagged `truncated`.
- CPU inference expected 10–30 s/photo; OpenVINO export evaluated as an optimization, not a requirement.

## 4. Length measurement

1. **Midline:** skeletonize the fish mask, take the longest skeleton path, extend both ends along their local tangent to the mask boundary. Arc length of the midline = straightened body length (curved fish handled).
2. **Orientation:** tail end = end with the narrowest width minimum (caudal peduncle) within the last 30% of the midline.
3. **Endpoints:**
   - **TL:** snout to the farthest caudal-fin point along the midline direction (models CDFW's tail-lobes-compressed TL).
   - **FL:** snout to the deepest concavity of the caudal fin boundary (convexity-defect search).
   - Per-species `measure: TL|FL` comes from `species.yaml`.
4. **Scale (priority order):**

| Source | Method | Target error |
|---|---|---|
| Dollar bill 6.14×2.61 in, ID-1 card 3.370×2.125 in, quarter 0.955 in, 12 oz can 4.83 in tall | SAM 3 mask → min-area rect/ellipse; aspect-ratio gate (bill 2.35, card 1.586 ±8%); rectangular refs use 4-corner homography to correct tilt before measuring the fish | ±2–3% |
| Saved gear (e.g., rod handle 11.5 in) | text-prompted detection by gear name; else user clicks two endpoints | ±3–5% |
| Manual | user clicks two points on any object and enters its length | ±3–5% |
| Fallback | Depth Pro metric depth + focal length (EXIF if present) → in/px at fish depth | ±10–20% |

5. **Uncertainty:** σ combines edge localization (±1.5 px per endpoint on both fish and reference), reference size tolerance, and an out-of-plane term when reference and fish depths differ (from Depth Pro relative depth). Output `Length(low, high)` at ~95% (±2σ).
6. **Overlay:** annotated image draws mask outline, midline, snout/tail points, reference outline, and scale-source label.

## 5. Species identification
- **`species.yaml`** (~150 entries): id, common names, scientific name, family, `measure`, lookalikes, hazards (venomous spines, teeth), protected flag, regions (ocean areas / freshwater districts) used as a prior.
- **Phase 1 — zero-shot:** BioCLIP 2 over taxonomic text prompts restricted to the California list plus an `unknown` class. Confidence threshold calibrated on a labeled validation set.
- **Phase 2 — fine-tune:**
  - Data: iNaturalist research-grade California fish observations via a GBIF download (DOI recorded). License filter CC0 / CC-BY / CC-BY-NC (drop NC if ever commercial). Rare species topped up with FishNet and out-of-state iNat observations of the same species.
  - Prep: SAM 3 crop (same as inference), perceptual-hash dedupe, train/val/test split **by observer**.
  - Training on Kaggle GPU: linear probe on BioCLIP 2 embeddings first; partial fine-tune only if accuracy targets aren't met.
  - Ship gate: fine-tuned model replaces zero-shot only if it beats it on top-1, per-species recall, and lookalike-pair confusion on the held-out angler-held set.

## 6. Regulations

### Rule schema (`data/regs/2026/*.yaml`)
```yaml
- id: string
  species: [species_id, ...]          # or group id
  where: {statewide | district | ocean_area | water_body | mpa | depth_limit}
  effective: {from: date, to: date}
  season: [{from: MM-DD, to: MM-DD, status: open|closed}]
  size: {min?: in, max?: in, slot?: [lo, hi], type: TL|FL}
  bag: {daily?: int, possession?: int, aggregate?: group_id}
  notes: [string]                     # gear, depth, report card
  source: {ccr: string, url: string, verified: date}
```
Values are entered by hand from CDFW publications; every rule cites its source.

### Precedence
In-season closure > water-body special regulation > district/area > statewide. MPA restrictions override all.

### Location
EXIF GPS → map pin → water-body search. Point-in-polygon via shapely over `geo/*.geojson` (ocean groundfish management areas, MPAs, freshwater districts, special-regulation waters). No location → statewide/ocean defaults plus a list of area differences.

### Verdicts
`KEEP` · `RELEASE_UNDERSIZED` · `RELEASE_OVERSIZED` (incl. slot) · `TOO_CLOSE_TO_CALL` (length range straddles a limit) · `PROHIBITED` · `SEASON_CLOSED` · `MPA_NO_TAKE` · `UNCERTAIN_SPECIES`.
If species confidence is below threshold **or** a plausible lookalike has different rules, all candidate rule sets are shown and the **strictest** governs the verdict. `KEEP` requires: confident species, non-truncated fish, full length range inside legal bounds, open season, no MPA prohibition.

### Freshness
Each rule file carries `verified`. Banner if >30 days old or the year has rolled over. `python -m fishid regs check` fetches CDFW in-season pages (groundfish, salmon, sturgeon) and reports pages changed since last verification; it never edits rules. Every result shows "Not legal advice — verify at wildlife.ca.gov."

## 7. Frontend
- **Base template:** [Dimension](https://html5up.net/dimension) by HTML5 UP — CC BY 3.0 (credit "Design: HTML5 UP" kept in the footer). Plain HTML/CSS/JS, no build step; vendored into `frontend/` and served by FastAPI as static files. jQuery (if present in the downloaded version) is removed in favor of vanilla JS.
- **Animation library:** [GSAP](https://gsap.com) (free for commercial use under the GSAP standard license, includes ScrollTrigger/SplitText). Everything respects `prefers-reduced-motion` (animations collapse to simple fades; background slideshow stops on one still).
- **Modernization of the base:** larger display typography (e.g., "Inter Tight" / "Fraunces" pairing), 20–24 px rounded corners, frosted-glass panels (`backdrop-filter: blur`) with subtle inner highlight, deep-ocean palette (navy #0B1F2A, sea teal #1F7A8C, sand #E9D8A6, sunset coral #EE6C4D) plus verdict colors (keep green, too-close amber, release/prohibited red).

### Background (realistic fishing photography only)
- Crossfading slideshow of 4–5 realistic California fishing photos with slow Ken Burns zoom/pan (≈12 s each): angler casting from the Big Sur / Pacific coast at sunset, fly fishing an Eastern Sierra river at dawn, sportfishing boat off San Diego at first light, angler holding a catch on a pier or jetty, kayak angler in kelp.
- Sourced from Unsplash/Pexels (free commercial use, no attribution required); each photo's source URL and license recorded in `frontend/assets/CREDITS.md`. No forests, illustrations, or AI-generated images.
- Dark gradient scrim for text contrast; subtle drifting light-ray / water-shimmer overlay (pure CSS, non-interactive); gentle parallax on scroll only.

### Elements & animation
- **Header:** logo mark (hook + fish SVG) that draws itself on load (stroke animation); title with staggered letter reveal; tagline "Identify · Measure · Know the regs".
- **Info chips** under the title: today's date, "Regulations verified <date>", "~150 California species", fresh/salt toggle hint — fade-up in sequence.
- **Stats strip:** animated counters (species covered, rules loaded, water bodies mapped) triggered on load.
- **Nav buttons** (Scan · How it works · My Gear · About) with magnetic hover and underline sweep; each opens a Dimension-style animated glass panel.
- **Scan panel:** drag-and-drop zone with animated dashed border and pulsing hook icon; photo preview slides in; location (EXIF auto-detected badge, map pin, water-body search), date, and gear chips.
- **Analyzing state:** sonar-sweep animation over the uploaded photo plus a 4-step progress rail (Detecting fish → Identifying species → Measuring → Checking regulations), each step checking off as the API responds (server streams progress via Server-Sent Events).
- **Result panel** (staggered entrance):
  - Verdict card with icon morph and color wash (KEEP / TOO CLOSE / RELEASE / PROHIBITED / CLOSED / MPA).
  - Annotated photo where the outline, midline, and snout/tail points **draw on** in sequence; reference object highlighted.
  - **Length gauge:** horizontal ruler bar animating to the measured range band, with the min/max/slot limit markers; overlap with a limit shown as an amber hatch.
  - Species card: top-3 with confidence bars that fill, scientific name, lookalike callout, hazard badge with gentle pulse.
  - Regulations table rows slide in; CCR citations as links; stale-data banner if applicable.
  - "Scan another" resets with a reverse transition.
- **How it works panel:** three animated steps (photo → measure → regs) with tips for adding a dollar bill / card for precise measurement.
- **My Gear panel:** saved gear list with add/edit/delete; items animate in/out.
- **Toasts** for errors (no fish found, bad reference, upload too large).

### API wiring
The page calls the JSON API below with `fetch`; `/api/analyze/stream` sends step-progress events; the final event carries the AnalysisResult.

### API
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/analyze/stream` | same inputs; Server-Sent Events: step progress then final AnalysisResult |
| POST | `/api/analyze` | multipart image + optional lat/lon, water_body_id, date, gear_ids, manual_scale → AnalysisResult JSON (+ annotated image as base64 PNG) |
| GET/POST/PUT/DELETE | `/api/gear` | saved gear |
| GET | `/api/waters?q=` | water-body search |
| GET | `/api/health` | model load status, regs verified date |

## 8. Error handling
| Situation | Behavior |
|---|---|
| No fish found | "No fish detected" + photo tips |
| Multiple fish | each analyzed, numbered |
| Fish truncated by frame | length reported as "≥ X in"; never `KEEP` |
| Reference fails validation | discarded; next scale source; reason shown |
| Model load / OOM failure | clear error; manual species pick still yields regulations |
| Location outside CA or beyond state waters | warning that state regs may not apply |
| No GPS | prompt for pin/water body; statewide fallback with differences |
| Stale regs | banner + "verify" caveat on verdict |
| Upload > 25 MB or non-image | 400 with message |

## 9. Testing
- **Unit (pytest):** synthetic masks with known lengths (straight, curved, rotated; TL vs FL tail shapes); synthetic bill/card with known tilt (homography); σ propagation.
- **Regulations:** table-driven cases written from CDFW text (e.g., lingcod 21.5" in Southern area → undersized; coho → prohibited; MPA pin → no take; closed season; lookalike → strictest).
- **Data integrity:** every rule's species exists; every rule has source + effective dates; GeoJSON valid; no overlapping contradictory rules at the same precedence.
- **API:** FastAPI TestClient with fake models.
- **Evaluation harness:** ≥30 real labeled photos (species, true length, reference type, location) → species top-1/top-3, length error by scale source, verdict confusion with **false-KEEP** highlighted.
- Model-dependent tests use fakes; one end-to-end real-model test marked `slow`.

## 10. Risks
- **Regulation data entry** is the largest manual effort and the main correctness risk; mitigated by citations, table tests, and freshness checks.
- **CPU latency** of SAM 3 + Depth Pro; mitigated by OpenVINO or YOLOE swap behind the same interface.
- **Animation/background weight** on low-end phones; mitigated by reduced-motion handling, compressed WebP/AVIF photos (≤300 KB each), and lazy loading slides after the first.
- **Dataset licensing** (CC-BY-NC) restricts commercial use until NC images are removed and the model retrained.
- **Model licenses** (SAM 3, Depth Pro, BioCLIP 2) to be confirmed before any hosted/commercial deployment.
