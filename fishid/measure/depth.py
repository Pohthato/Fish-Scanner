"""Fallback scale from monocular metric depth.

With no reference object in the photo, pixels-per-inch at the fish is
focal_length_px / distance. Expect roughly ±10–20 %.

FISHID_DEPTH picks the model:
  dav2      Depth Anything V2 metric (small, indoor-range) — a few seconds on CPU (default)
  depthpro  Apple Depth Pro — sharper and predicts focal length, but takes
            many minutes per photo on a laptop CPU; use with a GPU
  off       no depth fallback
"""
from __future__ import annotations

import math
import os

import numpy as np

from fishid.models import Mask, Scale

INCHES_PER_METER = 39.3701
# Typical phone main camera: ~26 mm equivalent, about 69° across the long side.
DEFAULT_FOV_DEG = 69.0


def _fallback_focal(image: np.ndarray) -> float:
    long_side = max(image.shape[:2])
    return (long_side / 2) / math.tan(math.radians(DEFAULT_FOV_DEG / 2))


def _scale(focal: float, meters: float, rel_sigma: float, detail: str) -> Scale:
    if not np.isfinite(meters) or meters <= 0:
        raise ValueError("depth estimate failed")
    return Scale(focal / (meters * INCHES_PER_METER), rel_sigma, "depth", detail)


class DepthAnythingEstimator:
    name = "Depth Anything V2 (metric)"
    MODEL_ID = os.environ.get("FISHID_DAV2_MODEL", "depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf")
    REL_SIGMA = 0.10

    def __init__(self):
        import torch
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation

        self.torch = torch
        self.processor = AutoImageProcessor.from_pretrained(self.MODEL_ID)
        self.model = AutoModelForDepthEstimation.from_pretrained(self.MODEL_ID).eval()

    def scale_at(self, image: np.ndarray, fish: Mask, focal_px: float | None = None) -> Scale:
        from PIL import Image

        h, w = image.shape[:2]
        inputs = self.processor(images=Image.fromarray(image), return_tensors="pt")
        with self.torch.inference_mode():
            out = self.model(**inputs)
        post = self.processor.post_process_depth_estimation(out, target_sizes=[(h, w)])[0]
        depth = post["predicted_depth"].cpu().numpy()
        meters = float(np.median(depth[fish.data]))
        focal = focal_px or _fallback_focal(image)
        src = "EXIF" if focal_px else "assumed phone"
        return _scale(focal, meters, self.REL_SIGMA, f"estimated {meters:.2f} m from camera ({src} focal length)")


class DepthProEstimator:
    name = "Depth Pro"
    MODEL_ID = os.environ.get("FISHID_DEPTHPRO_MODEL", "apple/DepthPro-hf")
    REL_SIGMA = 0.08

    def __init__(self):
        import torch
        from transformers import DepthProForDepthEstimation, DepthProImageProcessorFast

        self.torch = torch
        self.processor = DepthProImageProcessorFast.from_pretrained(self.MODEL_ID)
        self.model = DepthProForDepthEstimation.from_pretrained(self.MODEL_ID).eval()

    def scale_at(self, image: np.ndarray, fish: Mask, focal_px: float | None = None) -> Scale:
        from PIL import Image

        h, w = image.shape[:2]
        inputs = self.processor(images=Image.fromarray(image), return_tensors="pt")
        with self.torch.inference_mode():
            outputs = self.model(**inputs)
        post = self.processor.post_process_depth_estimation(outputs, target_sizes=[(h, w)])[0]
        depth = post["predicted_depth"].cpu().numpy()
        model_focal = float(post["focal_length"]) if post.get("focal_length") is not None else None
        focal = focal_px or model_focal or _fallback_focal(image)
        meters = float(np.median(depth[fish.data]))
        src = "EXIF" if focal_px else "model"
        return _scale(focal, meters, self.REL_SIGMA, f"estimated {meters:.2f} m from camera ({src} focal length)")


def make_depth_estimator():
    choice = os.environ.get("FISHID_DEPTH", "dav2").lower()
    if choice == "off":
        raise RuntimeError("depth fallback turned off (FISHID_DEPTH=off)")
    if choice == "depthpro":
        return DepthProEstimator()
    return DepthAnythingEstimator()
