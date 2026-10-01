"""Text-prompted segmentation with SAM 3 (transformers).

The facebook/sam3 weights are gated on Hugging Face: request access on the
model page, then run `hf auth login` once.
"""
from __future__ import annotations

import os

import numpy as np

from fishid.models import Mask
from fishid.segment.clean import clean_mask

MODEL_ID = os.environ.get("FISHID_SAM3_MODEL", "facebook/sam3")


class Sam3Segmenter:
    name = "SAM 3"

    def __init__(self, threshold: float = 0.4):
        import torch
        from transformers import Sam3Model, Sam3Processor

        self.torch = torch
        self.processor = Sam3Processor.from_pretrained(MODEL_ID)
        self.model = Sam3Model.from_pretrained(MODEL_ID).eval()
        self.threshold = threshold

    def segment(self, image: np.ndarray, prompts: list[str]) -> list[Mask]:
        from PIL import Image

        pil = Image.fromarray(image)
        out: list[Mask] = []
        for prompt in dict.fromkeys(prompts):
            inputs = self.processor(images=pil, text=prompt, return_tensors="pt")
            with self.torch.inference_mode():
                outputs = self.model(**inputs)
            res = self.processor.post_process_instance_segmentation(
                outputs, threshold=self.threshold, mask_threshold=0.5,
                target_sizes=inputs.get("original_sizes").tolist())[0]
            for m, s in zip(res["masks"], res["scores"]):
                cleaned = clean_mask(m.cpu().numpy().astype(bool))
                if cleaned.any():
                    out.append(Mask(cleaned, prompt, float(s)))
        return out
