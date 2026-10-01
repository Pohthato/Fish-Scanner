"""California fine-tuned head on top of BioCLIP 2 image embeddings.

training/finetune.ipynb writes models/species_head.pt:
    {"ids": [species_id, ...], "weight": Tensor[C, D], "bias": Tensor[C],
     "temperature": float}
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

from fishid.species.base import UNKNOWN
from fishid.species.bioclip import BioClipClassifier
from fishid.species.catalog import Species


class FinetunedClassifier:
    name = "BioCLIP 2 + California head"

    def __init__(self, base: BioClipClassifier, head_path: Path):
        import torch

        self.torch = torch
        self.base = base
        head = torch.load(head_path, map_location="cpu")
        self.ids: list[str] = head["ids"]
        self.weight = head["weight"].float()
        self.bias = head["bias"].float()
        self.temperature = float(head.get("temperature", 1.0))

    def classify(self, crop: Image.Image, allowed: list[Species]) -> list[tuple[str, float]]:
        torch = self.torch
        emb = self.base.embed(crop).float()
        logits = (self.weight @ emb + self.bias) / self.temperature
        allowed_ids = {s.id for s in allowed}
        mask = torch.tensor([sid in allowed_ids for sid in self.ids])
        logits[~mask] = float("-inf")
        probs = torch.softmax(logits, dim=0)
        ranked = sorted(((sid, float(p)) for sid, p in zip(self.ids, probs) if p > 0), key=lambda t: -t[1])
        # The head has no reject class; borrow the zero-shot "not a fish" score.
        zero_shot = dict(self.base.classify(crop, allowed))
        return ranked[:5] + [(UNKNOWN, zero_shot.get(UNKNOWN, 0.0))]
