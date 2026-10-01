"""Crop, de-duplicate and split the downloaded photos.

    python training/prepare.py

Each photo is run through the same fish segmenter the app uses and cropped
to the largest fish, so training sees what inference sees. Near-duplicate
crops (same perceptual hash) are dropped. Splits are made by observer, so
one person's photos never land in both train and test.

Writes training/data/crops/... and training/data/splits.csv.
"""
from __future__ import annotations

import csv
import hashlib
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fishid.segment.base import make_segmenter  # noqa: E402

DATA = Path(__file__).resolve().parent / "data"
SPLITS = (("train", 0.70), ("val", 0.15), ("test", 0.15))


def dhash(img: Image.Image, size: int = 8) -> int:
    g = np.asarray(img.convert("L").resize((size + 1, size), Image.LANCZOS), dtype=np.int16)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    return int("".join("1" if b else "0" for b in bits), 2)


def split_for(observer: str) -> str:
    x = int(hashlib.sha1(observer.strip().lower().encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    edge = 0.0
    for name, frac in SPLITS:
        edge += frac
        if x < edge:
            return name
    return SPLITS[-1][0]


def main() -> int:
    manifest = DATA / "manifest.csv"
    if not manifest.exists():
        sys.exit("Run training/fetch_inat.py first.")
    rows = list(csv.DictReader(open(manifest, encoding="utf-8")))
    seg = make_segmenter()
    seen: dict[str, set[int]] = {}
    out_rows = []
    for i, row in enumerate(rows):
        try:
            img = Image.open(DATA / row["path"]).convert("RGB")
        except OSError:
            continue
        masks = [m for m in seg.segment(np.asarray(img), ["fish"]) if m.score >= 0.2]
        if masks:
            m = max(masks, key=lambda m: m.area)
            x0, y0, x1, y1 = m.bbox
            pad_x, pad_y = int((x1 - x0) * 0.12), int((y1 - y0) * 0.12)
            img = img.crop((max(0, x0 - pad_x), max(0, y0 - pad_y), min(img.width, x1 + pad_x), min(img.height, y1 + pad_y)))
        h = dhash(img)
        bucket = seen.setdefault(row["species_id"], set())
        if any(bin(h ^ o).count("1") <= 4 for o in bucket):
            continue
        bucket.add(h)
        crop_path = DATA / "crops" / row["species_id"] / Path(row["path"]).name
        crop_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(crop_path, quality=92)
        out_rows.append({"path": str(crop_path.relative_to(DATA)), "species_id": row["species_id"],
                         "observer": row["observer"], "license": row["license"],
                         "split": split_for(row["observer"] or row["gbif_id"]), "found_fish": int(bool(masks))})
        if i % 200 == 0:
            print(f"{i}/{len(rows)}")
    with open(DATA / "splits.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
        w.writeheader()
        w.writerows(out_rows)
    counts = {s: sum(r["split"] == s for r in out_rows) for s, _ in SPLITS}
    print(f"{len(out_rows)} crops kept {counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
