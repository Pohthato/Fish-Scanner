"""Text-prompted instance segmentation with YOLOE (ultralytics)."""
from __future__ import annotations

import os

import cv2
import numpy as np

from fishid.config import MODELS_DIR
from fishid.models import Mask
from fishid.segment.clean import clean_mask

WEIGHTS = os.environ.get("FISHID_YOLOE_WEIGHTS", "yoloe-11l-seg.pt")


class YoloeSegmenter:
    name = "YOLOE"

    def __init__(self, conf: float = 0.1):
        from ultralytics import YOLOE

        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        cwd = os.getcwd()
        # ultralytics downloads weights (and its text encoder) into the working
        # directory; keep them in models/ instead.
        os.chdir(MODELS_DIR)
        try:
            self.model = YOLOE(WEIGHTS)
            self._classes: tuple[str, ...] = ()
            self._set_classes(("fish",))
        finally:
            os.chdir(cwd)
        self.conf = conf

    def _set_classes(self, prompts: tuple[str, ...]) -> None:
        if prompts != self._classes:
            cwd = os.getcwd()
            os.chdir(MODELS_DIR)
            try:
                self.model.set_classes(list(prompts))
            finally:
                os.chdir(cwd)
            self._classes = prompts

    def segment(self, image: np.ndarray, prompts: list[str]) -> list[Mask]:
        self._set_classes(tuple(dict.fromkeys(prompts)))
        bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
        result = self.model.predict(bgr, conf=self.conf, retina_masks=True, verbose=False)[0]
        if result.masks is None:
            return []
        masks = result.masks.data.cpu().numpy() > 0.5
        classes = result.boxes.cls.cpu().numpy().astype(int)
        scores = result.boxes.conf.cpu().numpy()
        out = []
        for m, c, s in zip(masks, classes, scores):
            if m.shape != image.shape[:2]:
                m = cv2.resize(m.astype(np.uint8), (image.shape[1], image.shape[0]),
                               interpolation=cv2.INTER_NEAREST).astype(bool)
            m = clean_mask(m)
            if m.any():
                out.append(Mask(m, self._classes[c], float(s)))
        return out
