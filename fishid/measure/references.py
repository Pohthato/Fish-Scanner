"""Work out image scale (pixels per inch) from objects of known size."""
from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache

import cv2
import numpy as np
import yaml

from fishid.config import ASPECT_TOLERANCE, DATA_DIR, EDGE_SIGMA_PX
from fishid.models import Mask, Point, Scale

SOURCE_PRIORITY = {"reference": 0, "gear": 1, "manual": 2, "depth": 3}


@dataclass
class RefSpec:
    id: str
    label: str
    prompts: tuple[str, ...]
    shape: str
    long_in: float
    short_in: float
    size_tolerance: float

    @property
    def aspect(self) -> float:
        return self.long_in / self.short_in


@dataclass
class Rejection:
    source: str
    reason: str


@lru_cache(maxsize=1)
def load_references() -> dict[str, RefSpec]:
    with open(DATA_DIR / "references.yaml", encoding="utf-8") as f:
        raw = yaml.safe_load(f)["references"]
    return {k: RefSpec(id=k, prompts=tuple(v.pop("prompts")), **v) for k, v in raw.items()}


def reference_for_prompt(prompt: str) -> RefSpec | None:
    for ref in load_references().values():
        if prompt in ref.prompts:
            return ref
    return None


def _largest_contour(mask: Mask) -> np.ndarray:
    contours, _ = cv2.findContours(mask.data.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        raise ValueError("empty mask")
    return max(contours, key=cv2.contourArea)


def _quad(contour: np.ndarray) -> np.ndarray | None:
    """Four corners of a roughly rectangular contour, or None."""
    peri = cv2.arcLength(contour, True)
    for eps in (0.01, 0.02, 0.03, 0.04):
        approx = cv2.approxPolyDP(contour, eps * peri, True)
        if len(approx) == 4 and cv2.isContourConvex(approx):
            return approx.reshape(4, 2).astype(np.float64)
    return None


def _rect_homography(quad: np.ndarray, ref: RefSpec) -> np.ndarray:
    """Homography from image pixels to the reference's plane, in inches."""
    # Start the corner order on a long side so it lines up with long_in.
    sides = [np.linalg.norm(quad[(i + 1) % 4] - quad[i]) for i in range(4)]
    if sides[0] + sides[2] < sides[1] + sides[3]:
        quad = np.roll(quad, -1, axis=0)
    dst = np.array([[0, 0], [ref.long_in, 0], [ref.long_in, ref.short_in], [0, ref.short_in]], np.float64)
    H, _ = cv2.findHomography(quad, dst)
    return H


def _rel_sigma(long_px: float, ref: RefSpec, shape_err: float) -> float:
    edge = math.sqrt(2) * EDGE_SIGMA_PX / long_px
    return math.sqrt(edge ** 2 + ref.size_tolerance ** 2 + (shape_err / 2) ** 2)


def scale_from_reference(mask: Mask, ref_id: str) -> Scale | Rejection:
    ref = load_references()[ref_id]
    if mask.touches_border:
        return Rejection("reference", f"{ref.label} is cut off by the edge of the photo")
    contour = _largest_contour(mask)
    if cv2.contourArea(contour) < 400:
        return Rejection("reference", f"{ref.label} is too small in the photo to measure")
    outline = [tuple(map(float, p)) for p in contour.reshape(-1, 2)[::4]]

    if ref.shape == "circle":
        if len(contour) < 5:
            return Rejection("reference", f"{ref.label} outline too small")
        (_, _), axes, _ = cv2.fitEllipse(contour)
        major = max(axes)
        return Scale(major / ref.long_in, _rel_sigma(major, ref, 0.0), "reference", ref.label, outline)

    (_, _), (w, h), _ = cv2.minAreaRect(contour)
    long_px, short_px = max(w, h), min(w, h)
    if short_px < 1:
        return Rejection("reference", f"{ref.label} outline is degenerate")

    if ref.shape == "rect":
        quad = _quad(contour)
        if quad is None:
            return Rejection("reference", f"{ref.label} corners not found (folded or covered?)")
        H = _rect_homography(quad, ref)
        warp_aspect = (np.linalg.norm(quad[1] - quad[0]) + np.linalg.norm(quad[3] - quad[2])) / max(
            1e-6, np.linalg.norm(quad[2] - quad[1]) + np.linalg.norm(quad[0] - quad[3]))
        warp_aspect = max(warp_aspect, 1 / warp_aspect)
        tilt = _tilt_factor(quad)
        # Aspect gate only applies when the object is roughly face-on; strong
        # perspective changes the apparent aspect legitimately.
        aspect_err = abs(warp_aspect - ref.aspect) / ref.aspect
        if tilt < 1.15 and aspect_err > ASPECT_TOLERANCE:
            return Rejection("reference", f"{ref.label} aspect ratio {warp_aspect:.2f} does not match "
                                          f"{ref.aspect:.2f} (folded, bent, or not a {ref.label.lower()}?)")
        area_px = cv2.contourArea(quad.astype(np.float32))
        px_per_in = math.sqrt(area_px / (ref.long_in * ref.short_in))
        sigma = _rel_sigma(long_px, ref, aspect_err if tilt < 1.15 else 0.02)
        return Scale(px_per_in, sigma, "reference", ref.label, outline, homography=H)

    # cylinder: side view of a can, height is the long side
    aspect = long_px / short_px
    aspect_err = abs(aspect - ref.aspect) / ref.aspect
    if aspect_err > ASPECT_TOLERANCE * 1.5:
        return Rejection("reference", f"{ref.label} shape doesn't match a standing/lying can")
    return Scale(long_px / ref.long_in, _rel_sigma(long_px, ref, aspect_err), "reference", ref.label, outline)


def _tilt_factor(quad: np.ndarray) -> float:
    """>1 when opposite sides differ in length, i.e. the object is seen at an angle."""
    s = [np.linalg.norm(quad[(i + 1) % 4] - quad[i]) for i in range(4)]
    return max(max(s[0], s[2]) / max(1e-6, min(s[0], s[2])), max(s[1], s[3]) / max(1e-6, min(s[1], s[3])))


def scale_from_gear(mask: Mask, length_in: float, name: str) -> Scale | Rejection:
    """Scale from a saved piece of gear (e.g. a rod handle) found in the photo."""
    if mask.touches_border:
        return Rejection("gear", f"{name} is cut off by the edge of the photo")
    contour = _largest_contour(mask)
    (_, _), (w, h), _ = cv2.minAreaRect(contour)
    long_px = max(w, h)
    if long_px < 30:
        return Rejection("gear", f"{name} is too small in the photo")
    sigma = math.sqrt((math.sqrt(2) * EDGE_SIGMA_PX / long_px) ** 2 + 0.02 ** 2)
    outline = [tuple(map(float, p)) for p in contour.reshape(-1, 2)[::4]]
    return Scale(long_px / length_in, sigma, "gear", name, outline)


def scale_from_points(p1: Point, p2: Point, length_in: float, label: str = "manual") -> Scale | Rejection:
    """Scale from two points the user clicked on an object of known length."""
    dist = math.dist(p1, p2)
    if dist < 10 or length_in <= 0:
        return Rejection("manual", "manual scale points are too close together")
    sigma = math.sqrt((math.sqrt(2) * 3.0 / dist) ** 2 + 0.02 ** 2)
    return Scale(dist / length_in, sigma, "manual", label, [p1, p2])


def pick_scale(candidates: list[Scale | Rejection]) -> tuple[Scale | None, list[str]]:
    """Choose the most trustworthy scale; also return why others were dropped."""
    reasons = [c.reason for c in candidates if isinstance(c, Rejection)]
    good = [c for c in candidates if isinstance(c, Scale)]
    if not good:
        return None, reasons
    good.sort(key=lambda s: (SOURCE_PRIORITY[s.source], s.rel_sigma))
    return good[0], reasons
