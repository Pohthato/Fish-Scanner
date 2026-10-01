from __future__ import annotations

import logging
from typing import Protocol

from PIL import Image

from fishid.config import MODELS_DIR
from fishid.species.catalog import Species

log = logging.getLogger(__name__)

UNKNOWN = "unknown"


class Classifier(Protocol):
    name: str

    def classify(self, crop: Image.Image, allowed: list[Species]) -> list[tuple[str, float]]:
        """Probabilities over the allowed species (plus 'unknown'), best first."""
        ...


def make_classifier() -> Classifier:
    """The fine-tuned head when one has been trained, else zero-shot BioCLIP 2."""
    from fishid.species.bioclip import BioClipClassifier

    base = BioClipClassifier()
    head = MODELS_DIR / "species_head.pt"
    if head.exists():
        from fishid.species.finetuned import FinetunedClassifier
        try:
            return FinetunedClassifier(base, head)
        except Exception as e:
            log.warning("could not load %s (%s); using zero-shot", head, e)
    return base


class FakeClassifier:
    name = "fake"

    def __init__(self, answer: list[tuple[str, float]] | None = None, fail: bool = False):
        self.answer = answer or []
        self.fail = fail

    def classify(self, crop: Image.Image, allowed: list[Species]) -> list[tuple[str, float]]:
        if self.fail:
            raise RuntimeError("classifier unavailable")
        return list(self.answer)
