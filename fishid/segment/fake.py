"""A stand-in segmenter for tests and for running without model weights."""
from __future__ import annotations

import numpy as np

from fishid.models import Mask


class FakeSegmenter:
    name = "fake"

    def __init__(self, masks: list[Mask] | None = None):
        self.masks = masks or []
        self.calls: list[list[str]] = []

    def segment(self, image: np.ndarray, prompts: list[str]) -> list[Mask]:
        self.calls.append(list(prompts))
        return [m for m in self.masks if m.label in prompts]
