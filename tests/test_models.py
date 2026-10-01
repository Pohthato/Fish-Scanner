import numpy as np

from fishid.models import Mask


def test_bbox_of_rectangle():
    d = np.zeros((50, 80), bool)
    d[10:20, 30:60] = True
    assert Mask(d, "x").bbox == (30, 10, 60, 20)


def test_touches_border():
    d = np.zeros((50, 80), bool)
    d[10:20, 1:10] = True
    assert not Mask(d, "x").touches_border
    d[10:20, 0] = True
    assert Mask(d, "x").touches_border
