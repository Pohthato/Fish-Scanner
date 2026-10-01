import math

import cv2
import numpy as np
import pytest

from fishid.models import Mask


def fish_outline(length, forked=True):
    """Side-view fish outline in local coords: snout at (0, 0), facing -x.

    The tail tips sit at x == length (total length); the fork notch sits at
    0.9 * length when forked, so fork length is 0.9 * length.
    """
    L = float(length)
    a, b, ped = 0.39 * L, 0.11 * L, 0.025 * L

    def half_width(x):
        t = (x - a) / a
        return max(b * math.sqrt(max(0.0, 1 - t * t)), ped if x > 0.05 * L else 0.0)

    xs = np.linspace(0, 0.82 * L, 120)
    top = [(x, -half_width(x)) for x in xs]
    notch_x = 0.9 * L if forked else L
    tail = [(L, -0.13 * L), (notch_x, 0.0), (L, 0.13 * L)]
    bottom = [(x, half_width(x)) for x in xs[::-1]]
    return np.array(top + tail + bottom)


def place(points, angle_deg=0.0, center=(800, 500), curve_radius=None):
    pts = points.astype(float).copy()
    if curve_radius:
        R = curve_radius
        x, y = pts[:, 0] - pts[:, 0].max() / 2, pts[:, 1]
        theta = x / R
        pts = np.stack([(R - y) * np.sin(theta), R - (R - y) * np.cos(theta)], axis=1)
    else:
        pts[:, 0] -= pts[:, 0].max() / 2
    t = math.radians(angle_deg)
    rot = np.array([[math.cos(t), -math.sin(t)], [math.sin(t), math.cos(t)]])
    return pts @ rot.T + np.array(center)


def rasterize(points, shape=(1000, 1600)):
    canvas = np.zeros(shape, np.uint8)
    cv2.fillPoly(canvas, [np.round(points).astype(np.int32)], 1)
    return canvas.astype(bool)


@pytest.fixture
def make_fish():
    def _make(length_px=600, angle=0.0, forked=True, curve_radius=None,
              center=(800, 500), shape=(1000, 1600)):
        pts = place(fish_outline(length_px, forked), angle, center, curve_radius)
        return Mask(rasterize(pts, shape), "fish", 0.9)
    return _make


@pytest.fixture
def make_rect():
    def _make(w_px, h_px, angle=0.0, center=(400, 300), shape=(1000, 1600),
              label="dollar bill", perspective=None):
        corners = np.array([[-w_px / 2, -h_px / 2], [w_px / 2, -h_px / 2],
                            [w_px / 2, h_px / 2], [-w_px / 2, h_px / 2]])
        t = math.radians(angle)
        rot = np.array([[math.cos(t), -math.sin(t)], [math.sin(t), math.cos(t)]])
        pts = corners @ rot.T + np.array(center)
        if perspective is not None:
            pts = cv2.perspectiveTransform(pts[None].astype(np.float32),
                                           perspective.astype(np.float32))[0]
        return Mask(rasterize(pts, shape), label, 0.9)
    return _make
