import numpy as np
import pytest

from fishid.measure.length import measure_length
from fishid.models import Mask, Scale
from fishid.segment.clean import clean_mask

PPI = 20.0
FISH_PX = 600  # 30 inches total length


def scale(rel=0.005):
    return Scale(PPI, rel, "reference", "test")


@pytest.mark.parametrize("angle", [0, 37, 90, 200])
def test_straight_fish_total_length(make_fish, angle):
    L = measure_length(make_fish(FISH_PX, angle=angle), scale(), "TL")
    assert L.value_in == pytest.approx(30.0, rel=0.03)
    assert L.low_in < 30.0 * 1.03 and L.high_in > 30.0 * 0.97
    assert not L.truncated


def test_snout_and_tail_are_on_the_right_ends(make_fish):
    m = make_fish(FISH_PX, angle=0, center=(800, 500))
    L = measure_length(m, scale(), "TL")
    # Fish outline puts the snout at the low-x end.
    assert L.snout[0] < 800 < L.tail[0]
    m = make_fish(FISH_PX, angle=180, center=(800, 500))
    L = measure_length(m, scale(), "TL")
    assert L.snout[0] > 800 > L.tail[0]


def test_curved_fish_uses_arc_length(make_fish):
    m = make_fish(FISH_PX, curve_radius=500)
    L = measure_length(m, scale(), "TL")
    assert L.value_in == pytest.approx(30.0, rel=0.04)


def test_fork_length_shorter_than_total_for_forked_tail(make_fish):
    m = make_fish(FISH_PX, forked=True)
    tl = measure_length(m, scale(), "TL")
    fl = measure_length(m, scale(), "FL")
    assert fl.value_in == pytest.approx(27.0, rel=0.04)
    assert fl.value_in < tl.value_in - 1.5


def test_fork_length_equals_total_for_square_tail(make_fish):
    m = make_fish(FISH_PX, forked=False)
    tl = measure_length(m, scale(), "TL")
    fl = measure_length(m, scale(), "FL")
    assert fl.value_in == pytest.approx(tl.value_in, rel=0.02)


def test_fish_touching_edge_is_truncated(make_fish):
    m = make_fish(FISH_PX, center=(250, 500))  # snout runs off the left edge
    L = measure_length(m, scale(), "TL")
    assert L.truncated
    assert L.high_in == float("inf")
    assert L.display().startswith("≥")


def test_range_widens_with_scale_uncertainty(make_fish):
    m = make_fish(FISH_PX)
    tight = measure_length(m, scale(0.005), "TL")
    loose = measure_length(m, scale(0.08), "TL")
    assert (loose.high_in - loose.low_in) > 3 * (tight.high_in - tight.low_in)
    assert tight.low_in < tight.value_in < tight.high_in


def test_homography_scale_matches_plain_scale(make_fish):
    m = make_fish(FISH_PX)
    H = np.diag([1 / PPI, 1 / PPI, 1.0])
    s = Scale(PPI, 0.005, "reference", "test", homography=H)
    assert measure_length(m, s, "TL").value_in == pytest.approx(measure_length(m, scale(), "TL").value_in, rel=0.001)


def test_clean_mask_keeps_largest_blob_and_fills_holes():
    d = np.zeros((100, 100), bool)
    d[10:60, 10:60] = True
    d[30:35, 30:35] = False  # hole
    d[80:85, 80:85] = True  # speck
    out = clean_mask(d, smooth_px=0)
    assert out[32, 32] and not out[82, 82]
