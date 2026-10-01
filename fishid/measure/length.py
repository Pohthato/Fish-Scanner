"""Fish length from a segmentation mask.

The midline is the longest path through the mask's skeleton, smoothed. The
tail end is the one with the narrowest point (the caudal peduncle) near it.
From the peduncle we look along the body axis: the farthest fin point gives
total length (lobes squeezed together, as CDFW measures), and where that axis
leaves the fin gives fork length (the fork notch).
"""
from __future__ import annotations

import math

import cv2
import numpy as np
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from skimage.morphology import skeletonize

from fishid.config import EDGE_SIGMA_PX
from fishid.models import Length, Mask, Scale
from fishid.segment.clean import clean_mask

# Midline modelling error (curvature, fin edge fuzz), relative.
MODEL_SIGMA = 0.008


class MeasureError(ValueError):
    pass


def _skeleton_path(skel: np.ndarray) -> np.ndarray:
    """Longest geodesic path through the skeleton as (N, 2) array of (x, y)."""
    ys, xs = np.nonzero(skel)
    if len(xs) < 10:
        raise MeasureError("fish outline too small to measure")
    index = -np.ones(skel.shape, np.int64)
    index[ys, xs] = np.arange(len(xs))
    rows, cols, weights = [], [], []
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        ny, nx = ys + dy, xs + dx
        ok = (ny < skel.shape[0]) & (nx >= 0) & (nx < skel.shape[1])
        ok[ok] &= skel[ny[ok], nx[ok]]
        rows.append(index[ys[ok], xs[ok]])
        cols.append(index[ny[ok], nx[ok]])
        weights.append(np.full(ok.sum(), math.hypot(dy, dx)))
    r, c, w = np.concatenate(rows), np.concatenate(cols), np.concatenate(weights)
    graph = coo_matrix((np.r_[w, w], (np.r_[r, c], np.r_[c, r])), shape=(len(xs), len(xs))).tocsr()

    # Two sweeps find the two ends of the longest path (tree diameter).
    d0 = dijkstra(graph, indices=0)
    a = int(np.nanargmax(np.where(np.isinf(d0), -1, d0)))
    da, pred = dijkstra(graph, indices=a, return_predecessors=True)
    b = int(np.nanargmax(np.where(np.isinf(da), -1, da)))
    path = [b]
    while path[-1] != a:
        path.append(int(pred[path[-1]]))
    return np.stack([xs[path], ys[path]], axis=1).astype(np.float64)


def _fork_indices(skel: np.ndarray, raw: np.ndarray, total: float, s: np.ndarray) -> list[int]:
    """Indices along the path where the skeleton branches off."""
    skel = skel.astype(np.uint8)
    neighbours = cv2.filter2D(skel, -1, np.ones((3, 3), np.float32), borderType=cv2.BORDER_CONSTANT) - skel
    xs, ys = raw[:, 0].astype(int), raw[:, 1].astype(int)
    deg = neighbours[ys, xs]
    # Ignore tiny spurs within 2 % of the ends; they are edge noise.
    return [j for j in np.nonzero(deg >= 3)[0] if 0.02 * total < s[j] < 0.98 * total]


def _smooth(path: np.ndarray, sigma: float) -> np.ndarray:
    return np.stack([ndimage.gaussian_filter1d(path[:, i], sigma, mode="nearest") for i in (0, 1)], axis=1)


def _arc(points: np.ndarray) -> np.ndarray:
    return np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]


def _ray_exit(mask: np.ndarray, start: np.ndarray, direction: np.ndarray, limit: float) -> float:
    """Distance from start along direction until the ray leaves the mask."""
    h, w = mask.shape
    step = 0.5
    t = 0.0
    while t < limit:
        x, y = start + direction * (t + step)
        xi, yi = int(round(x)), int(round(y))
        if not (0 <= xi < w and 0 <= yi < h) or not mask[yi, xi]:
            return t
        t += step
    return t


def measure_length(mask: Mask, scale: Scale, kind: str = "TL") -> Length:
    m = clean_mask(mask.data, smooth_px=2)
    dist = ndimage.distance_transform_edt(m)
    skel = skeletonize(m)
    raw = _skeleton_path(skel)
    path = _smooth(raw, sigma=max(2.0, len(raw) * 0.01))
    s = _arc(path)
    total = s[-1]
    width = dist[np.clip(raw[:, 1].astype(int), 0, m.shape[0] - 1), np.clip(raw[:, 0].astype(int), 0, m.shape[1] - 1)]

    # The skeleton forks inside the tail fin (one branch per lobe/corner), so
    # the far end of the path sits in a fin lobe. Cut the path at the last
    # fork near each end; the peduncle is the narrowest spot just before it.
    forks = _fork_indices(skel, raw, total, s)

    def narrowest(from_end: bool):
        if from_end:
            cut = max([j for j in forks if s[j] > 0.6 * total], default=len(s) - 1)
            sel = (s >= s[cut] - 0.3 * total) & (s <= s[cut] - 0.01 * total)
        else:
            cut = min([j for j in forks if s[j] < 0.4 * total], default=0)
            sel = (s <= s[cut] + 0.3 * total) & (s >= s[cut] + 0.01 * total)
        idx = np.nonzero(sel)[0]
        if len(idx) == 0:
            idx = np.arange(len(s))
        j = idx[np.argmin(width[idx])]
        return width[j], j

    w_end, j_end = narrowest(True)
    w_start, j_start = narrowest(False)
    if w_start < w_end:
        path, raw, width = path[::-1], raw[::-1], width[::-1]
        s = _arc(path)
        j_ped = len(path) - 1 - j_start
    else:
        j_ped = j_end

    # Snout: back off the skeleton end a little and follow the body axis out
    # to the edge of the mask.
    span = max(5, int(len(path) * 0.06))
    j_snout = min(span, j_ped // 3)
    snout_dir = path[j_snout] - path[min(j_snout + span, j_ped)]
    snout_dir /= max(1e-9, np.linalg.norm(snout_dir))
    snout_ext = _ray_exit(m, path[j_snout], snout_dir, limit=total)
    snout = path[j_snout] + snout_dir * snout_ext

    # Tail: body axis at the peduncle, a line fit through the last quarter of
    # the body midline before it.
    back = max(span, int(j_ped * 0.25))
    ped = path[j_ped]
    seg = path[max(0, j_ped - back): j_ped + 1]
    centered = seg - seg.mean(axis=0)
    tail_dir = np.linalg.svd(centered, full_matrices=False)[2][0]
    if np.dot(tail_dir, seg[-1] - seg[0]) < 0:
        tail_dir = -tail_dir
    ys, xs = np.nonzero(m)
    rel = np.stack([xs, ys], axis=1) - ped
    along = rel @ tail_dir
    across = np.abs(rel @ np.array([-tail_dir[1], tail_dir[0]]))
    fin = (along > 0) & (across < 0.6 * (s[j_ped] + snout_ext))
    tl_ext = float(along[fin].max()) if fin.any() else 0.0
    fl_ext = _ray_exit(m, ped, tail_dir, limit=tl_ext + 2)
    fl_ext = min(fl_ext, tl_ext)

    ext = tl_ext if kind == "TL" else fl_ext
    tail = ped + tail_dir * ext
    midline = np.vstack([snout, path[j_snout:j_ped + 1], tail])

    if scale.homography is not None:
        flat = cv2.perspectiveTransform(midline[None].astype(np.float64), scale.homography)[0]
        value = float(_arc(flat)[-1])
        px_len = float(_arc(midline)[-1])
        in_per_px = value / px_len
    else:
        px_len = float(_arc(midline)[-1])
        in_per_px = 1.0 / scale.px_per_in
        value = px_len * in_per_px

    edge_in = math.sqrt(2) * EDGE_SIGMA_PX * in_per_px
    sigma = math.sqrt(edge_in ** 2 + (value * scale.rel_sigma) ** 2 + (value * MODEL_SIGMA) ** 2)
    truncated = mask.touches_border
    low, high = value - 2 * sigma, value + 2 * sigma
    if truncated:
        # The real fish is at least as long as what we can see.
        low, high = value - 2 * sigma, float("inf")

    return Length(
        value_in=round(value, 2),
        low_in=round(max(0.0, low), 2),
        high_in=round(high, 2) if math.isfinite(high) else high,
        kind=kind,  # type: ignore[arg-type]
        truncated=truncated,
        snout=(float(snout[0]), float(snout[1])),
        tail=(float(tail[0]), float(tail[1])),
        midline=_thin(midline, 60),
    )


def _thin(points: np.ndarray, n: int) -> list[tuple[float, float]]:
    """At most ~n points for drawing, always keeping both ends."""
    step = max(1, len(points) // n)
    keep = list(points[::step])
    if not np.array_equal(keep[-1], points[-1]):
        keep.append(points[-1])
    return [(float(x), float(y)) for x, y in keep]
