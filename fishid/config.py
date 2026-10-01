from pathlib import Path
import os

PACKAGE_DIR = Path(__file__).resolve().parent
DATA_DIR = PACKAGE_DIR / "data"
REGS_DIR = DATA_DIR / "regs"
GEO_DIR = DATA_DIR / "geo"
USER_DIR = Path(os.environ.get("FISHID_USER_DIR", PACKAGE_DIR / "user"))
FRONTEND_DIR = PACKAGE_DIR.parent / "frontend"
MODELS_DIR = Path(os.environ.get("FISHID_MODELS_DIR", PACKAGE_DIR.parent / "models"))

REGS_YEAR = 2026

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
# Images are downscaled so the long side is at most this many pixels before
# segmentation. Measurements are mapped back to full resolution.
WORK_LONG_SIDE = 1600

# Species confidence needed before a single species' rules govern the verdict.
SPECIES_CONFIDENCE = 0.55
# A lookalike this likely is treated as a real possibility.
LOOKALIKE_PROB = 0.10

ASPECT_TOLERANCE = 0.08
EDGE_SIGMA_PX = 1.5

STALE_AFTER_DAYS = 30
