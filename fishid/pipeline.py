"""photo -> fish found -> species -> length -> regulations."""
from __future__ import annotations

import logging
import threading
import time
from datetime import date
from typing import Callable

import numpy as np
from PIL import Image

from fishid import DISCLAIMER
from fishid.config import LOOKALIKE_PROB
from fishid.imaging import Photo, annotate, jpeg_b64, load_photo, outline_of
from fishid.measure.length import MeasureError, measure_length
from fishid.measure.references import (Rejection, load_references, pick_scale, reference_for_prompt,
                                       scale_from_gear, scale_from_points, scale_from_reference)
from fishid.models import Length, Mask, Place, Scale
from fishid.regs.engine import evaluate, rules_for_date
from fishid.regs.location import get_locator
from fishid.species.base import UNKNOWN
from fishid.species.catalog import load_catalog, species_for_water

log = logging.getLogger(__name__)

STEPS = ("detect", "identify", "measure", "regs")
MAX_FISH = 6
MIN_FISH_SCORE = 0.2
MIN_REFERENCE_SCORE = 0.3
MIN_FISH_AREA = 0.003  # fraction of the image
REGION_MISMATCH_WEIGHT = 0.35

Progress = Callable[[str], None]


class ModelSlot:
    """Loads a model the first time it's needed and remembers failures."""

    def __init__(self, name: str, factory: Callable[[], object] | None):
        self.name = name
        self.factory = factory
        self.model = None
        self.error: str | None = None
        self._lock = threading.Lock()

    @classmethod
    def ready(cls, name: str, model) -> "ModelSlot":
        slot = cls(name, None)
        slot.model = model
        return slot

    def get(self):
        with self._lock:
            if self.model is None and self.error is None and self.factory is not None:
                try:
                    self.model = self.factory()
                except Exception as e:  # missing weights, OOM, no network
                    log.exception("loading %s failed", self.name)
                    self.error = f"{type(e).__name__}: {e}"
            if self.model is None:
                raise RuntimeError(self.error or f"{self.name} not configured")
            return self.model

    @property
    def status(self) -> str:
        if self.model is not None:
            return "ready"
        if self.error:
            return "error"
        return "not loaded" if self.factory else "disabled"

    def describe(self) -> dict:
        return {"status": self.status, "name": getattr(self.model, "name", None), "error": self.error}


def default_slots() -> dict[str, ModelSlot]:
    from fishid.measure.depth import make_depth_estimator
    from fishid.segment.base import make_segmenter
    from fishid.species.base import make_classifier
    return {
        "segmenter": ModelSlot("segmenter", make_segmenter),
        "classifier": ModelSlot("classifier", make_classifier),
        "depth": ModelSlot("depth", make_depth_estimator),
    }


def _iou(a: Mask, b: Mask) -> float:
    inter = np.logical_and(a.data, b.data).sum()
    return float(inter) / max(1, np.logical_or(a.data, b.data).sum())


def _covered(a: Mask, b: Mask) -> float:
    """Fraction of a that lies inside b."""
    return float(np.logical_and(a.data, b.data).sum()) / max(1, a.area)


def _dedupe(masks: list[Mask], iou: float = 0.5) -> list[Mask]:
    kept: list[Mask] = []
    for m in sorted(masks, key=lambda m: -m.score):
        if all(_iou(m, k) < iou for k in kept):
            kept.append(m)
    return kept


def _crop(rgb: np.ndarray, mask: Mask, pad: float = 0.12) -> Image.Image:
    x0, y0, x1, y1 = mask.bbox
    px, py = int((x1 - x0) * pad), int((y1 - y0) * pad)
    h, w = rgb.shape[:2]
    return Image.fromarray(rgb[max(0, y0 - py):min(h, y1 + py), max(0, x0 - px):min(w, x1 + px)])


def _apply_prior(ranked: list[tuple[str, float]], place: Place) -> tuple[list[tuple[str, float]], float]:
    """Down-weight species not known from this area; split off 'unknown'."""
    catalog = load_catalog()
    p_unknown = dict(ranked).get(UNKNOWN, 0.0)
    region = place.ocean_area or place.district
    weighted = []
    for sid, p in ranked:
        if sid == UNKNOWN:
            continue
        regions = catalog[sid].regions
        ok = region is None or "all" in regions or region in regions
        weighted.append((sid, p * (1.0 if ok else REGION_MISMATCH_WEIGHT)))
    total = sum(p for _, p in weighted) or 1.0
    # Probability mass on "not a fish we know" lowers confidence in every species.
    keep = 1.0 - p_unknown
    out = sorted(((sid, p / total * keep) for sid, p in weighted), key=lambda t: -t[1])
    return out, p_unknown


def _length_json(L: Length | None) -> dict | None:
    if L is None:
        return None
    return {"value": L.value_in, "low": L.low_in, "high": None if L.high_in == float("inf") else L.high_in,
            "kind": L.kind, "display": L.display(), "truncated": L.truncated, "rough": L.rough,
            "snout": L.snout, "tail": L.tail, "midline": L.midline}


def _place_json(place: Place, source: str) -> dict:
    mpa = None
    if place.mpa:
        mpa = {k: place.mpa.get(k) for k in ("name", "type", "ccr", "no_take")}
    return {"label": place.label, "source": source, "in_california": place.in_california,
            "lat": place.lat, "lon": place.lon, "water": place.water, "county": place.county,
            "ocean_area": place.ocean_area, "district": place.district, "water_body": place.water_body,
            "water_kind": place.water_kind, "mpa": mpa, "warnings": place.warnings}


class Analyzer:
    def __init__(self, slots: dict[str, ModelSlot] | None = None):
        self.slots = slots or default_slots()

    def health(self) -> dict:
        return {k: s.describe() for k, s in self.slots.items()}

    def warm_up(self) -> None:
        for slot in self.slots.values():
            try:
                slot.get()
            except RuntimeError:
                pass

    # ------------------------------------------------------------------ main entry
    def analyze(self, data: bytes, *, lat: float | None = None, lon: float | None = None,
                water_id: str | None = None, on: date | None = None, mode: str | None = None,
                gear: list[dict] | None = None, manual_scale: dict | None = None,
                species_id: str | None = None, ignore_refs: bool = False,
                progress: Progress | None = None) -> dict:
        t0 = time.perf_counter()
        timings: dict[str, float] = {}
        step = progress or (lambda s: None)
        photo = load_photo(data)
        h, w = photo.rgb.shape[:2]
        on = on or photo.taken or date.today()
        place, place_source = self._place(photo, lat, lon, water_id)
        gear = gear or []
        catalog = load_catalog()
        if species_id and species_id not in catalog:
            raise ValueError(f"unknown species {species_id}")

        result: dict = {
            "ok": True, "error": None, "message": None,
            "image": {"width": w, "height": h, "jpeg": jpeg_b64(photo.rgb)},
            "annotated_png": None,
            "place": _place_json(place, place_source),
            "date": on.isoformat(), "mode": mode,
            "scale": None, "scale_notes": [], "fish": [], "notes": [],
            "disclaimer": DISCLAIMER, "models": {},
        }

        # 1. detect ---------------------------------------------------------
        step("detect")
        ref_prompts = [p for r in load_references().values() for p in r.prompts]
        gear_prompts = [g["name"] for g in gear]
        fish_masks: list[Mask] = []
        other_masks: list[Mask] = []
        try:
            segmenter = self.slots["segmenter"].get()
            result["models"]["segmenter"] = segmenter.name
            masks = segmenter.segment(photo.rgb, ["fish"] + ref_prompts + gear_prompts)
            min_area = MIN_FISH_AREA * h * w
            fish_masks = [m for m in masks if m.label == "fish" and m.score >= MIN_FISH_SCORE and m.area >= min_area]
            fish_masks = sorted(_dedupe(fish_masks), key=lambda m: m.bbox[0])[:MAX_FISH]
            # A "reference" lying on top of a fish is usually part of the fish.
            other_masks = [m for m in masks if m.label != "fish" and m.score >= MIN_REFERENCE_SCORE
                           and all(_covered(m, f) < 0.5 for f in fish_masks)]
            if ignore_refs:  # the user said the detected reference is wrong
                other_masks = [m for m in other_masks if reference_for_prompt(m.label) is None]
        except RuntimeError as e:
            result["notes"].append(f"Fish detection is unavailable ({e}).")
            if not species_id:
                return self._fail(result, "model_unavailable",
                                  "The detection model couldn't load. Pick the species by hand to see its rules.")
        timings["detect"] = time.perf_counter() - t0

        if not fish_masks and not species_id:
            return self._fail(result, "no_fish", "No fish detected. Tips: lay the fish flat on its side, fill most of "
                                                 "the frame, keep the whole fish in view, and avoid busy backgrounds.")

        # 2. identify -------------------------------------------------------
        step("identify")
        allowed = species_for_water(place.water if place.water != "unknown" else None)
        identified: list[tuple[list[tuple[str, float]], float, str]] = []
        classifier = None
        if not species_id:
            try:
                classifier = self.slots["classifier"].get()
                result["models"]["classifier"] = classifier.name
            except RuntimeError as e:
                result["notes"].append(f"Species ID is unavailable ({e}). Pick the species by hand.")
        for m in fish_masks or [None]:
            if species_id:
                identified.append(([(species_id, 1.0)], 0.0, "manual"))
            elif classifier is None or m is None:
                identified.append(([], 0.0, "none"))
            else:
                try:
                    ranked, p_unknown = _apply_prior(classifier.classify(_crop(photo.rgb, m), allowed), place)
                    identified.append((ranked, p_unknown, "model"))
                except Exception as e:
                    log.exception("classification failed")
                    result["notes"].append(f"Species ID failed ({e}).")
                    identified.append(([], 0.0, "none"))
        timings["identify"] = time.perf_counter() - t0

        # 3. measure --------------------------------------------------------
        step("measure")
        scale, scale_notes = self._scale(photo, other_masks, gear, manual_scale, fish_masks)
        result["scale_notes"] = scale_notes
        if scale is not None:
            result["scale"] = {"source": scale.source, "detail": scale.detail, "px_per_in": round(scale.px_per_in, 3),
                               "rel_sigma": round(scale.rel_sigma, 4), "outline": scale.outline}
        lengths: list[dict[str, Length | None]] = []
        for m in fish_masks:
            per_kind: dict[str, Length | None] = {}
            if scale is not None:
                for kind in ("TL", "FL"):
                    try:
                        per_kind[kind] = measure_length(m, scale, kind)
                    except MeasureError as e:
                        result["notes"].append(f"Couldn't measure a fish: {e}")
                        per_kind[kind] = None
            lengths.append(per_kind)
        timings["measure"] = time.perf_counter() - t0

        # 4. regulations ----------------------------------------------------
        step("regs")
        ruleset = rules_for_date(on)
        drawn = []
        for i, (ranked, p_unknown, source) in enumerate(identified):
            mask = fish_masks[i] if i < len(fish_masks) else None
            per_kind = lengths[i] if i < len(lengths) else {}
            entry: dict = {"number": i + 1, "species_source": source, "unknown_prob": round(p_unknown, 3),
                           "outline": outline_of(mask) if mask is not None else [],
                           "bbox": list(mask.bbox) if mask is not None else None,
                           "truncated": bool(mask is not None and mask.touches_border)}
            entry["species"] = [{**catalog[sid].to_dict(), "prob": round(p, 3)} for sid, p in ranked[:3]]
            if not ranked:
                entry.update(verdict=None, reasons=["Pick the species to see its regulations."],
                             length=_length_json(per_kind.get("TL")), regulations=[], citations=[])
                result["fish"].append(entry)
                if mask is not None:
                    drawn.append((i + 1, mask, per_kind.get("TL")))
                continue
            top = catalog[ranked[0][0]]
            length = per_kind.get(top.measure)
            sp_lengths = {sid: per_kind.get(catalog[sid].measure) for sid, p in ranked
                          if p >= LOOKALIKE_PROB or sid == top.id}
            decision = evaluate(ranked, length, place, on, mode=mode, ruleset=ruleset, lengths=sp_lengths)
            entry.update(
                verdict=decision.verdict.value,
                reasons=decision.reasons,
                governing_species=decision.governing.species.id,
                length=_length_json(length),
                regulations=[r.to_dict() for r in decision.rulings],
                citations=decision.citations,
            )
            result["stale"], result["stale_message"] = decision.stale, decision.stale_message
            result["fish"].append(entry)
            if mask is not None:
                drawn.append((i + 1, mask, length))

        if fish_masks:
            result["annotated_png"] = annotate(photo.rgb, drawn, scale)
        result.setdefault("stale", False)
        result.setdefault("stale_message", None)
        result["regs_verified"] = ruleset.verified.isoformat()
        if len(result["fish"]) > 1:
            result["notes"].append(f"{len(result['fish'])} fish found — each one counts toward your daily bag limit.")
        timings["total"] = time.perf_counter() - t0
        result["timings"] = {k: round(v, 2) for k, v in timings.items()}
        return result

    # ------------------------------------------------------------------ helpers
    def _fail(self, result: dict, code: str, message: str) -> dict:
        result.update(ok=False, error=code, message=message)
        return result

    def _place(self, photo: Photo, lat, lon, water_id) -> tuple[Place, str]:
        loc = get_locator()
        if water_id:
            return loc.by_water(water_id), "water"
        if lat is not None and lon is not None:
            return loc.locate(lat, lon), "pin"
        if photo.lat is not None:
            return loc.locate(photo.lat, photo.lon), "exif"
        return loc.locate(None, None), "none"

    def _scale(self, photo: Photo, masks: list[Mask], gear: list[dict], manual: dict | None,
               fish: list[Mask]) -> tuple[Scale | None, list[str]]:
        h, w = photo.rgb.shape[:2]
        candidates: list[Scale | Rejection] = []
        gear_by_name = {g["name"]: g for g in gear}
        for m in masks:
            ref = reference_for_prompt(m.label)
            if ref is not None:
                candidates.append(scale_from_reference(m, ref.id))
            elif m.label in gear_by_name:
                candidates.append(scale_from_gear(m, float(gear_by_name[m.label]["length_in"]), m.label))
        if manual:
            p1 = (float(manual["x1"]) * w, float(manual["y1"]) * h)
            p2 = (float(manual["x2"]) * w, float(manual["y2"]) * h)
            candidates.append(scale_from_points(p1, p2, float(manual["length_in"]), manual.get("label", "manual")))
        scale, notes = pick_scale(candidates)
        if scale is None and fish:
            try:
                depth = self.slots["depth"].get()
            except RuntimeError:
                depth = None
            if depth is None:
                notes.append("Nothing of known size in the photo, so the length can't be measured. Click both ends "
                             "of something you know the length of (rod handle, can, your hand span) and enter it, "
                             "or retake the photo with a dollar bill or card beside the fish.")
            else:
                try:
                    scale = depth.scale_at(photo.rgb, fish[0], photo.focal_px)
                    notes.append("No reference object found — the length is a rough guess from the photo alone and "
                                 "can be far off. Put a dollar bill or card next to the fish for a real measurement.")
                except Exception as e:
                    notes.append(f"No reference object found and depth estimate failed ({e}).")
        return scale, notes
