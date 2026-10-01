# California Fish ID

Take a photo of a fish you caught in California and get:

- **the species**, with the top alternatives and any lookalikes that have different rules
- **its length**, measured from the photo, as a range, with the scale source stated
- **the CDFW regulations** that apply where and when you caught it, ending in a clear verdict
  (keep, too close to call, check the rules, or release and why), with the CCR section cited for every rule

It runs entirely on your own computer: a Python backend (FastAPI) and a static web page. No accounts,
no cloud APIs, and no API keys. Models download once from Hugging Face on first use.

> Not legal advice. Regulations change in season and the app can be wrong about a species or a length.
> Verify at [wildlife.ca.gov](https://wildlife.ca.gov/Regulations). You're responsible for the fish you keep.

## Quick start

Requires Python 3.11+ (3.12 recommended). A GPU is optional.

```bash
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m fishid serve
```

Open http://127.0.0.1:8000, choose **Scan**, and drop in a photo.

The first run downloads about 2 GB of model weights into `models/` and the Hugging Face cache, and
builds a text-embedding cache for the species list (a minute or two on CPU). Later starts are fast.

### Command line

```bash
python -m fishid analyze catch.jpg --lat 36.62 --lon -121.98 --date 2026-06-15 --mode boat
python -m fishid analyze bass.jpg --water castaic_lake
python -m fishid analyze photo.jpg --species lingcod --json     # skip species ID
python -m fishid regs check                                    # did CDFW change an in-season page?
```

## Getting a precise length

| What's in the photo | Typical error |
|---|---|
| A dollar bill or credit/ID card lying flat next to the fish | about 2–3% |
| Saved gear (e.g. your rod handle, set under *My Gear*) or two clicks on a known length | about 3–5% |
| Nothing of known size | no length — one photo can't tell a small fish up close from a big fish farther away. Click two points on any object you know the length of instead. |

Shoot from straight above, with the whole fish in frame and lying flat. If the fish runs off the edge of
the photo, the app reports "≥ X in" and will never say keep.

## How it works

```
photo ─► segment (SAM 3 or YOLOE) ─► fish outlines + reference objects
      ─► species (BioCLIP 2, limited to California fish, weighted by area)
      ─► length (skeleton midline, snout → tail, TL or FL per species) × scale
      ─► regulations engine (location → area/district/water/MPA; date; mode) ─► verdict + citations
```

- **Detection** (`fishid/segment/`): SAM 3 when its weights are available, otherwise YOLOE
  (`yoloe-11l-seg`, downloaded automatically). Both are text-prompted ("fish", "dollar bill", "credit card", …).
- **Species** (`fishid/species/`): zero-shot BioCLIP 2 using taxonomic prompts. A California-specific head
  trained with `training/` is picked up automatically from `models/species_head.pt`.
- **Length** (`fishid/measure/`): the longest path through the mask's skeleton, extended to the snout. The tail
  end is found from the caudal peduncle, and total length goes to the farthest fin point while fork length
  goes to the fork. Flat rectangular references get perspective correction. The uncertainty combines edge
  error, reference tolerance and model error.
- **Regulations** (`fishid/regs/`, `fishid/data/regs/2026/`): rules entered by hand from the 2026 CDFW Ocean
  and Freshwater booklets, each with its CCR section and a verified date. Closures and prohibitions from every
  matching rule apply; size and bag limits come from the most specific rule. When something is unknown
  (lake or stream? boat or shore? which species?), every possibility is checked and the strictest result wins.
- **Location** (`fishid/regs/location.py`): photo GPS, a map pin, or a water-body search. It resolves the
  groundfish management area, freshwater district, named water, and the 155 CDFW marine protected areas.

### Configuration (environment variables)

| Variable | Default | |
|---|---|---|
| `FISHID_SEGMENTER` | `auto` | `sam3`, `yoloe`, or `auto` (SAM 3 if available) |
| `FISHID_YOLOE_WEIGHTS` | `yoloe-11l-seg.pt` | any ultralytics YOLOE segmentation weights |
| `FISHID_DEPTH` | `off` | experimental length guess with no reference: `dav2` (Depth Anything V2) or `depthpro` (Apple Depth Pro, GPU only). Off by default because in testing both overestimated close-up fish 2–4x. |
| `FISHID_MODELS_DIR` | `./models` | where weights and caches go |
| `FISHID_USER_DIR` | `fishid/user` | saved gear and regs-check state |

**SAM 3** is gated on Hugging Face. To use it, request access at https://huggingface.co/facebook/sam3, run
`hf auth login`, and restart. The app switches to it automatically.

## API

| Method | Path | |
|---|---|---|
| POST | `/api/analyze` | multipart `image` + optional `lat`, `lon`, `water_id`, `date`, `mode` (boat/shore/dive), `gear_ids`, `manual_scale` (JSON), `species_id` |
| POST | `/api/analyze/stream` | same inputs; Server-Sent Events: `step` × 4, then `result` |
| GET/POST/PUT/DELETE | `/api/gear` | saved reference gear |
| GET | `/api/waters?q=` | water-body search |
| GET | `/api/locate?lat=&lon=` | what the app thinks a pin is (area, district, MPA) |
| GET | `/api/species` | species list for manual selection |
| GET | `/api/health` | model status, regulation verification date, counts |

## Keeping the regulations current

1. Run `python -m fishid regs check` regularly. It reports which CDFW in-season pages (groundfish, salmon,
   halibut, sturgeon) have changed since you last looked. It never edits rules itself.
2. Edit the YAML in `fishid/data/regs/<year>/`. The format is documented at the top of `ocean.yaml`.
3. Update `verified` in the file's `meta`, then run `pytest`. The data tests check that every rule cites a
   section, names known species, and doesn't contradict another rule.

For a new season, copy the folder to the new year and work through the booklet. The app shows a
"regulations may be out of date" banner once the data is more than 30 days old or the year has rolled over.

## Training a better species model

```bash
python training/fetch_inat.py --search --per-species 300   # or --download with a GBIF account (gets a DOI)
python training/prepare.py                                  # crop with the app's segmenter, dedupe, split by observer
# run training/finetune.ipynb (Kaggle GPU works well) -> species_head.pt -> models/
python training/evaluate.py my_labeled_photos.csv            # top-1/top-3, length error, false-KEEP count
```

`evaluate.py` exits non-zero if any photo gets a false KEEP.

## Development

```bash
pip install -r requirements.txt
pytest                       # fast tests use fake models
pytest -m slow               # also load the real models
python tools/build_geo.py    # refresh MPA and county boundaries from CDFW / Census sources
```

Project layout:

```
fishid/            Python package (server, pipeline, models, measurement, regulations, data)
frontend/          static web page (HTML/CSS/JS, GSAP), served by the backend
training/          dataset download, preparation, fine-tuning notebook, evaluation
tests/             pytest suite
tools/             data build scripts
docs/              design and implementation plan
```

## Credits and licenses

- Page layout adapted from [Dimension](https://html5up.net/dimension) by HTML5 UP (CC BY 3.0);
  background photos from Unsplash. See `frontend/assets/CREDITS.md`.
- Marine Protected Areas: CDFW, CC BY 4.0. Regulations: California Code of Regulations, Title 14.
- Models: BioCLIP 2 (Imageomics), YOLOE (Ultralytics, AGPL-3.0), SAM 3 (Meta, SAM license), Depth Anything V2,
  Depth Pro (Apple). Check each model's license before any hosted or commercial use.
