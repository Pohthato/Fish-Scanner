"""Zero-shot species ID with BioCLIP 2 (imageomics/bioclip-2)."""
from __future__ import annotations

import hashlib

from PIL import Image

from fishid.config import MODELS_DIR
from fishid.species.base import UNKNOWN
from fishid.species.catalog import Species, load_catalog
from fishid.species.taxonomy import taxonomic_name

MODEL = "hf-hub:imageomics/bioclip-2"

# BioCLIP's documented prompt styles: taxonomic + common name, scientific
# name, and common name.
TEMPLATES = (
    "a photo of {taxon} with common name {common}.",
    "a photo of {sci}.",
    "a photo of {common}.",
)
# Things that show up in angler photos and aren't any fish we know.
NOT_A_FISH = (
    "a photo of a person.",
    "a photo of a fishing rod and reel.",
    "a photo of a crab.",
    "a photo of a lobster.",
    "a photo of a squid.",
    "a photo of a bird.",
    "a photo of a boat deck.",
    "a photo of an empty dock.",
)


class BioClipClassifier:
    name = "BioCLIP 2 (zero-shot)"

    def __init__(self):
        import open_clip
        import torch

        self.torch = torch
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(MODEL)
        self.model.eval()
        self.tokenizer = open_clip.get_tokenizer(MODEL)
        self.logit_scale = float(self.model.logit_scale.detach().exp())
        self._text = self._text_embeddings(list(load_catalog().values()))

    # ------------------------------------------------------------------ text side
    def _encode_text(self, prompts: list[str]):
        torch = self.torch
        with torch.inference_mode():
            feats = []
            for i in range(0, len(prompts), 64):
                tok = self.tokenizer(prompts[i:i + 64])
                f = self.model.encode_text(tok)
                feats.append(f / f.norm(dim=-1, keepdim=True))
        return torch.cat(feats)

    def _text_embeddings(self, species: list[Species]):
        torch = self.torch
        key = hashlib.sha1(("|".join(s.id + s.scientific + s.name for s in species) + "|".join(TEMPLATES)
                            + "|".join(NOT_A_FISH)).encode()).hexdigest()[:12]
        cache = MODELS_DIR / f"bioclip2_text_{key}.pt"
        if cache.exists():
            return torch.load(cache)
        prompts = [t.format(taxon=taxonomic_name(s.family, s.scientific), sci=s.scientific, common=s.name.lower())
                   for s in species for t in TEMPLATES]
        emb = self._encode_text(prompts).reshape(len(species), len(TEMPLATES), -1).mean(dim=1)
        emb = emb / emb.norm(dim=-1, keepdim=True)
        neg = self._encode_text(list(NOT_A_FISH))
        data = {"ids": [s.id for s in species], "species": emb, "negative": neg}
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        torch.save(data, cache)
        return data

    # ------------------------------------------------------------------ image side
    def embed(self, crop: Image.Image):
        torch = self.torch
        with torch.inference_mode():
            x = self.preprocess(crop.convert("RGB")).unsqueeze(0)
            f = self.model.encode_image(x)
        return (f / f.norm(dim=-1, keepdim=True))[0]

    def classify(self, crop: Image.Image, allowed: list[Species]) -> list[tuple[str, float]]:
        torch = self.torch
        img = self.embed(crop)
        ids = self._text["ids"]
        allowed_ids = {s.id for s in allowed}
        idx = [i for i, sid in enumerate(ids) if sid in allowed_ids]
        sims = torch.cat([self._text["species"][idx] @ img, self._text["negative"] @ img])
        probs = torch.softmax(sims * self.logit_scale, dim=0)
        p_unknown = float(probs[len(idx):].sum())
        ranked = sorted(((ids[i], float(probs[k])) for k, i in enumerate(idx)), key=lambda t: -t[1])
        return ranked[:5] + [(UNKNOWN, p_unknown)]
