"""The list of California species the app knows about."""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Literal

import yaml

from fishid.config import DATA_DIR


@dataclass(frozen=True)
class Species:
    id: str
    common: tuple[str, ...]
    scientific: str
    family: str
    water: Literal["salt", "fresh", "both"]
    measure: Literal["TL", "FL"] = "TL"
    groups: tuple[str, ...] = ()
    lookalikes: tuple[str, ...] = ()
    hazards: tuple[str, ...] = ()
    protected: bool = False
    regions: tuple[str, ...] = field(default=("all",))

    @property
    def name(self) -> str:
        return self.common[0]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "common": list(self.common),
            "scientific": self.scientific,
            "family": self.family,
            "water": self.water,
            "measure": self.measure,
            "lookalikes": list(self.lookalikes),
            "hazards": list(self.hazards),
            "protected": self.protected,
        }


def _parse(entry: dict) -> Species:
    tuples = {k: tuple(entry.get(k) or ()) for k in ("common", "groups", "lookalikes", "hazards", "regions")}
    return Species(
        id=entry["id"],
        scientific=entry["scientific"],
        family=entry["family"],
        water=entry["water"],
        measure=entry.get("measure", "TL"),
        protected=bool(entry.get("protected", False)),
        **tuples,
    )


@lru_cache(maxsize=1)
def load_catalog() -> dict[str, Species]:
    with open(DATA_DIR / "species.yaml", encoding="utf-8") as f:
        raw = yaml.safe_load(f)["species"]
    catalog: dict[str, Species] = {}
    for entry in raw:
        sp = _parse(entry)
        if sp.id in catalog:
            raise ValueError(f"duplicate species id: {sp.id}")
        catalog[sp.id] = sp
    return catalog


def species_for_water(water: str | None) -> list[Species]:
    """Species that could plausibly be caught in salt or fresh water."""
    everything = list(load_catalog().values())
    if water not in ("salt", "fresh"):
        return everything
    return [s for s in everything if s.water in (water, "both")]
