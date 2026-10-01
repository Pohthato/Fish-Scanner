"""Image loading, EXIF, and the annotated overlay."""
from __future__ import annotations

import base64
import io
from dataclasses import dataclass
from datetime import date, datetime

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from fishid.config import MAX_UPLOAD_BYTES, WORK_LONG_SIDE
from fishid.models import Length, Mask, Scale

Image.MAX_IMAGE_PIXELS = 80_000_000


class BadImage(ValueError):
    pass


@dataclass
class Photo:
    rgb: np.ndarray  # working copy, long side <= WORK_LONG_SIDE
    lat: float | None = None
    lon: float | None = None
    taken: date | None = None
    focal_px: float | None = None  # in working-copy pixels

    @property
    def size(self) -> tuple[int, int]:
        return self.rgb.shape[1], self.rgb.shape[0]


def _ratio(v) -> float:
    try:
        return float(v[0]) / float(v[1]) if isinstance(v, tuple) else float(v)
    except (TypeError, ZeroDivisionError, ValueError):
        return float("nan")


def _gps(exif) -> tuple[float | None, float | None]:
    try:
        gps = exif.get_ifd(0x8825)
    except Exception:
        return None, None
    if not gps or 2 not in gps or 4 not in gps:
        return None, None

    def dms(v):
        d, m, s = (_ratio(x) for x in v)
        return d + m / 60 + s / 3600

    try:
        lat, lon = dms(gps[2]), dms(gps[4])
    except Exception:
        return None, None
    if gps.get(1) in ("S", b"S"):
        lat = -lat
    if gps.get(3) in ("W", b"W"):
        lon = -lon
    if not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
        return None, None
    return round(lat, 6), round(lon, 6)


def load_photo(data: bytes) -> Photo:
    if len(data) > MAX_UPLOAD_BYTES:
        raise BadImage(f"Photo is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError) as e:
        raise BadImage("That file isn't a photo we can read (JPEG, PNG, HEIC-as-JPEG, WebP).") from e
    exif = img.getexif()
    lat, lon = _gps(exif)
    taken = None
    try:
        raw = exif.get_ifd(0x8769).get(36867) or exif.get(306)
        if raw:
            taken = datetime.strptime(str(raw)[:19], "%Y:%m:%d %H:%M:%S").date()
    except Exception:
        taken = None
    focal35 = None
    try:
        focal35 = exif.get_ifd(0x8769).get(41989)  # FocalLengthIn35mmFilm
    except Exception:
        pass

    img = ImageOps.exif_transpose(img).convert("RGB")
    w, h = img.size
    k = min(1.0, WORK_LONG_SIDE / max(w, h))
    if k < 1:
        img = img.resize((round(w * k), round(h * k)), Image.LANCZOS)
    rgb = np.asarray(img)
    focal_px = None
    if focal35:
        # 35 mm equivalent: the long side of the frame is 36 mm.
        focal_px = float(focal35) / 36.0 * max(rgb.shape[:2])
    return Photo(rgb, lat, lon, taken, focal_px)


def jpeg_b64(rgb: np.ndarray, quality: int = 85) -> str:
    buf = io.BytesIO()
    Image.fromarray(rgb).save(buf, "JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode()


def outline_of(mask: Mask, step: int = 3) -> list[tuple[float, float]]:
    contours, _ = cv2.findContours(mask.data.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []
    c = max(contours, key=cv2.contourArea)
    c = cv2.approxPolyDP(c, 1.0, True).reshape(-1, 2)
    return [(float(x), float(y)) for x, y in c[::max(1, step // 3)]]


TEAL = (31, 122, 140)
SAND = (233, 216, 166)
CORAL = (238, 108, 77)


def annotate(rgb: np.ndarray, fish: list[tuple[int, Mask, Length | None]], scale: Scale | None) -> str:
    """PNG (base64) with outlines, midline, snout/tail and the reference."""
    out = rgb.copy()
    lw = max(2, round(max(out.shape[:2]) / 500))
    if scale is not None and scale.outline:
        pts = np.round(np.array(scale.outline)).astype(np.int32)
        cv2.polylines(out, [pts], scale.source != "manual", SAND, lw, cv2.LINE_AA)
    for number, mask, length in fish:
        contours, _ = cv2.findContours(mask.data.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(out, contours, -1, TEAL, lw, cv2.LINE_AA)
        x0, y0, _, _ = mask.bbox
        if length is not None:
            mid = np.round(np.array(length.midline)).astype(np.int32)
            cv2.polylines(out, [mid], False, CORAL, lw, cv2.LINE_AA)
            for p in (length.snout, length.tail):
                cv2.circle(out, tuple(int(round(v)) for v in p), lw * 3, (255, 255, 255), -1, cv2.LINE_AA)
                cv2.circle(out, tuple(int(round(v)) for v in p), lw * 3, CORAL, lw, cv2.LINE_AA)
            label = f"#{number}  {length.display()} {length.kind}"
        else:
            label = f"#{number}"
        cv2.putText(out, label, (x0, max(20, y0 - 8)), cv2.FONT_HERSHEY_SIMPLEX, lw * 0.35, (255, 255, 255),
                    lw + 2, cv2.LINE_AA)
        cv2.putText(out, label, (x0, max(20, y0 - 8)), cv2.FONT_HERSHEY_SIMPLEX, lw * 0.35, (11, 31, 42),
                    lw, cv2.LINE_AA)
    buf = io.BytesIO()
    Image.fromarray(out).save(buf, "PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()
