"""Shared types used across the pipeline."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal

import numpy as np

Point = tuple[float, float]


class Verdict(str, Enum):
    KEEP = "KEEP"
    RELEASE_UNDERSIZED = "RELEASE_UNDERSIZED"
    RELEASE_OVERSIZED = "RELEASE_OVERSIZED"
    TOO_CLOSE_TO_CALL = "TOO_CLOSE_TO_CALL"
    PROHIBITED = "PROHIBITED"
    SEASON_CLOSED = "SEASON_CLOSED"
    MPA_NO_TAKE = "MPA_NO_TAKE"
    UNCERTAIN_SPECIES = "UNCERTAIN_SPECIES"
    # The photo can't settle it (hatchery fin clip, water-specific salmon
    # seasons, take-restricted MPA, outside California): never a KEEP.
    CHECK_REGS = "CHECK_REGS"


# Higher = stricter. Used when several candidate species must be combined.
STRICTNESS = {
    Verdict.KEEP: 0,
    Verdict.TOO_CLOSE_TO_CALL: 1,
    Verdict.CHECK_REGS: 2,
    Verdict.UNCERTAIN_SPECIES: 2,
    Verdict.RELEASE_UNDERSIZED: 3,
    Verdict.RELEASE_OVERSIZED: 3,
    Verdict.SEASON_CLOSED: 4,
    Verdict.PROHIBITED: 5,
    Verdict.MPA_NO_TAKE: 6,
}


@dataclass
class Mask:
    data: np.ndarray  # bool, H x W
    label: str
    score: float = 1.0

    @property
    def area(self) -> int:
        return int(self.data.sum())

    @property
    def bbox(self) -> tuple[int, int, int, int]:
        ys, xs = np.nonzero(self.data)
        return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1

    @property
    def touches_border(self) -> bool:
        d = self.data
        return bool(d[0, :].any() or d[-1, :].any() or d[:, 0].any() or d[:, -1].any())


@dataclass
class Scale:
    px_per_in: float
    rel_sigma: float  # 1-sigma relative uncertainty of px_per_in
    source: Literal["reference", "gear", "manual", "depth"]
    detail: str = ""
    outline: list[Point] = field(default_factory=list)  # for the overlay
    # Image px -> inches on the reference's plane (flat rectangular references only).
    homography: np.ndarray | None = None


@dataclass
class Length:
    value_in: float
    low_in: float
    high_in: float
    kind: Literal["TL", "FL"]
    truncated: bool
    snout: Point
    tail: Point
    midline: list[Point]
    # True when the scale came from depth estimation rather than an object of
    # known size: good enough to show, not good enough to clear a size limit.
    rough: bool = False

    def display(self) -> str:
        if self.truncated:
            return f"≥ {self.low_in:.1f} in"
        return f"{self.low_in:.1f}–{self.high_in:.1f} in"


@dataclass
class Place:
    in_california: bool = True
    lat: float | None = None
    lon: float | None = None
    county: str | None = None
    ocean_area: str | None = None
    district: str | None = None
    water_body: str | None = None
    water_kind: Literal["lake", "stream", "delta"] | None = None
    mpa: dict | None = None
    label: str = "Statewide (no location)"
    water: Literal["salt", "fresh", "unknown"] = "unknown"
    warnings: list[str] = field(default_factory=list)

    @property
    def known(self) -> bool:
        return self.lat is not None or self.water_body is not None
