"""Mask cleanup shared by every segmenter."""
import cv2
import numpy as np
from scipy import ndimage


def clean_mask(mask: np.ndarray, smooth_px: int = 3) -> np.ndarray:
    """Keep the largest connected blob, fill holes, smooth ragged edges."""
    m = mask.astype(bool)
    if not m.any():
        return m
    labels, n = ndimage.label(m)
    if n > 1:
        sizes = ndimage.sum(m, labels, range(1, n + 1))
        m = labels == (int(np.argmax(sizes)) + 1)
    m = ndimage.binary_fill_holes(m)
    if smooth_px > 0:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * smooth_px + 1, 2 * smooth_px + 1))
        u8 = m.astype(np.uint8)
        u8 = cv2.morphologyEx(u8, cv2.MORPH_CLOSE, k)
        u8 = cv2.morphologyEx(u8, cv2.MORPH_OPEN, k)
        # Opening can split thin tails off; keep the main body only.
        labels, n = ndimage.label(u8)
        if n > 1:
            sizes = ndimage.sum(u8, labels, range(1, n + 1))
            u8 = (labels == (int(np.argmax(sizes)) + 1)).astype(np.uint8)
        m = u8.astype(bool)
    return m
