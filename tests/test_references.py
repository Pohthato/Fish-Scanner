import math

import cv2
import numpy as np
import pytest

from fishid.measure.references import (Rejection, pick_scale, scale_from_gear,
                                       scale_from_points, scale_from_reference)
from fishid.models import Scale

PPI = 40.0  # synthetic pixels per inch


@pytest.mark.parametrize("angle", [0, 30, 75])
def test_dollar_bill_scale(make_rect, angle):
    m = make_rect(6.14 * PPI, 2.61 * PPI, angle=angle)
    s = scale_from_reference(m, "dollar_bill")
    assert isinstance(s, Scale)
    assert s.px_per_in == pytest.approx(PPI, rel=0.02)
    assert s.homography is not None
    assert s.rel_sigma < 0.02


def test_card_under_perspective_rectifies(make_rect):
    # Tilt the card away from the camera: the far edge shrinks.
    src = np.float32([[0, 0], [1600, 0], [1600, 1000], [0, 1000]])
    dst = np.float32([[60, 40], [1540, 0], [1600, 1000], [0, 1000]])
    P = cv2.getPerspectiveTransform(src, dst)
    m = make_rect(3.37 * PPI * 2, 2.125 * PPI * 2, center=(800, 500), perspective=P)
    s = scale_from_reference(m, "card")
    assert isinstance(s, Scale)
    # The homography maps the card back to its true size.
    corners = np.array([[[800 - 3.37 * PPI, 500 - 2.125 * PPI], [800 + 3.37 * PPI, 500 - 2.125 * PPI]]])
    warped = cv2.perspectiveTransform(corners.astype(np.float64), P.astype(np.float64))
    ends = cv2.perspectiveTransform(warped, s.homography)[0]
    assert np.linalg.norm(ends[1] - ends[0]) == pytest.approx(3.37, rel=0.03)


def test_wrong_aspect_is_rejected(make_rect):
    m = make_rect(6.14 * PPI, 3.07 * PPI)  # aspect 2.0, a folded bill
    r = scale_from_reference(m, "dollar_bill")
    assert isinstance(r, Rejection)
    assert "aspect ratio" in r.reason


def test_reference_cut_off_is_rejected(make_rect):
    m = make_rect(6.14 * PPI, 2.61 * PPI, center=(100, 300))
    assert isinstance(scale_from_reference(m, "dollar_bill"), Rejection)


def test_quarter_uses_ellipse_major_axis():
    d = np.zeros((600, 800), np.uint8)
    # A coin tilted 40 degrees: minor axis shrinks, major axis stays the diameter.
    cv2.ellipse(d, (400, 300), (int(0.955 * PPI * 3 / 2), int(0.955 * PPI * 3 / 2 * math.cos(math.radians(40)))),
                20, 0, 360, 1, -1)
    from fishid.models import Mask
    s = scale_from_reference(Mask(d.astype(bool), "coin"), "quarter")
    assert isinstance(s, Scale)
    assert s.px_per_in == pytest.approx(PPI * 3, rel=0.03)


def test_gear_and_manual():
    from fishid.models import Mask
    d = np.zeros((600, 1600), bool)
    d[300:310, 200:200 + int(11.5 * PPI)] = True
    g = scale_from_gear(Mask(d, "rod handle"), 11.5, "rod handle")
    assert g.px_per_in == pytest.approx(PPI, rel=0.02)
    m = scale_from_points((0, 0), (300, 400), 12.5)
    assert m.px_per_in == pytest.approx(40.0)
    assert isinstance(scale_from_points((0, 0), (1, 1), 5), Rejection)


def test_pick_scale_priority():
    ref = Scale(40, 0.01, "reference")
    gear = Scale(41, 0.005, "gear")
    manual = Scale(39, 0.02, "manual")
    chosen, reasons = pick_scale([manual, Rejection("reference", "bad bill"), gear, ref])
    assert chosen is ref
    assert reasons == ["bad bill"]
    assert pick_scale([Rejection("gear", "x")]) == (None, ["x"])
