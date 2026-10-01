from __future__ import annotations

import logging
import os
from typing import Protocol

import numpy as np

from fishid.models import Mask

log = logging.getLogger(__name__)


class Segmenter(Protocol):
    name: str

    def segment(self, image: np.ndarray, prompts: list[str]) -> list[Mask]:
        """image: H x W x 3 RGB uint8. Returns one Mask per object found, with
        label set to the prompt that found it."""
        ...


def make_segmenter() -> Segmenter:
    """SAM 3 when its weights are available, otherwise YOLOE.

    FISHID_SEGMENTER=sam3|yoloe forces one.
    """
    choice = os.environ.get("FISHID_SEGMENTER", "auto").lower()
    if choice in ("auto", "sam3"):
        try:
            from fishid.segment.sam3 import Sam3Segmenter
            return Sam3Segmenter()
        except Exception as e:  # gated weights, no network, old transformers…
            if choice == "sam3":
                raise
            log.info("SAM 3 unavailable (%s); using YOLOE", e)
    from fishid.segment.yoloe import YoloeSegmenter
    return YoloeSegmenter()
