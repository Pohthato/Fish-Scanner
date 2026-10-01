"""Load and validate the regulation YAML files."""
from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import date, timedelta
from functools import lru_cache
from typing import Literal

import yaml

from fishid.config import REGS_DIR, REGS_YEAR
from fishid.models import Place
from fishid.species.catalog import Species, load_catalog

WHERE_KEYS = {"water", "ocean_area", "district", "county", "water_body", "water_kind",
              "lat_min", "lat_max", "lon_min", "lon_max"}

Match = Literal["yes", "no", "maybe"]


class RuleError(ValueError):
    pass


@dataclass(frozen=True)
class Window:
    start: str
    end: str
    note: str = ""
    modes: tuple[str, ...] = ()
    size: dict | None = None
    bag: dict | None = None

    def contains(self, day: date) -> bool:
        a, b = resolve_day(self.start, day.year), resolve_day(self.end, day.year)
        if a <= b:
            return a <= day <= b
        return day >= a or day <= b  # wraps over New Year


@dataclass
class Rule:
    id: str
    species: tuple[str, ...]
    where: dict
    source: dict
    effective: tuple[date, date]
    file: str
    size: dict | None = None
    bag: dict | None = None
    season: tuple[Window, ...] = ()
    periods: tuple[Window, ...] = ()
    prohibited: bool = False
    check: str | None = None
    notes: tuple[str, ...] = ()

    # ------------------------------------------------------------------ matching
    def species_match(self, sp: Species) -> int:
        """0 = no match, 1 = 'any', 2 = by group, 3 = by species id."""
        best = 0
        for s in self.species:
            if s == sp.id:
                return 3
            if s.startswith("group:") and s[6:] in sp.groups:
                best = max(best, 2)
            elif s == "any":
                best = max(best, 1)
        return best

    @property
    def level(self) -> int:
        """How location-specific the rule is (higher wins)."""
        w = self.where
        if "water_body" in w:
            return 4
        if "county" in w:
            return 3
        if {"district", "ocean_area", "lat_min", "lat_max", "lon_min", "lon_max"} & w.keys():
            return 2
        return 1

    def place_match(self, place: Place) -> Match:
        w = self.where
        result: Match = "yes"

        def unknown():
            nonlocal result
            result = "maybe"

        if "water" in w:
            if place.water == "unknown":
                unknown()
            elif place.water != w["water"]:
                return "no"
        for key, attr in (("ocean_area", "ocean_area"), ("district", "district"), ("county", "county"),
                          ("water_kind", "water_kind")):
            if key in w:
                value = getattr(place, attr)
                if value is None:
                    unknown()
                elif value not in w[key]:
                    return "no"
        if "water_body" in w:
            # Special-water rules only apply when we know they fished there.
            if place.water_body not in w["water_body"]:
                return "no"
        for key, attr, cmp in (("lat_min", "lat", lambda v, b: v >= b), ("lat_max", "lat", lambda v, b: v < b),
                               ("lon_min", "lon", lambda v, b: v >= b), ("lon_max", "lon", lambda v, b: v < b)):
            if key in w:
                value = getattr(place, attr)
                if value is None:
                    unknown()
                elif not cmp(value, w[key]):
                    return "no"
        return result

    def in_effect(self, day: date) -> bool:
        return self.effective[0] <= day <= self.effective[1]

    def citation(self) -> dict:
        return {"rule": self.id, "ccr": self.source["ccr"], "url": self.source["url"],
                "verified": self.source["verified"].isoformat()}


# ---------------------------------------------------------------------- dates
def _last_weekday(year: int, month: int, weekday: int) -> date:
    last = date(year, month, calendar.monthrange(year, month)[1])
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def resolve_day(token: str, year: int) -> date:
    if token == "last-sat-apr":
        return _last_weekday(year, 4, calendar.SATURDAY)
    if token == "fri-before-last-sat-apr":
        return _last_weekday(year, 4, calendar.SATURDAY) - timedelta(days=1)
    if token == "sat-before-memorial-day":
        return _last_weekday(year, 5, calendar.MONDAY) - timedelta(days=2)
    if token == "fri-before-sat-before-memorial-day":
        return _last_weekday(year, 5, calendar.MONDAY) - timedelta(days=3)
    if token == "last-day-feb":
        return date(year, 2, calendar.monthrange(year, 2)[1])
    try:
        month, day = (int(x) for x in token.split("-"))
        return date(year, month, day)
    except ValueError as e:
        raise RuleError(f"bad date {token!r}") from e


def _as_date(v) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v))


# --------------------------------------------------------------------- loading
def _window(raw: dict, rule_id: str) -> Window:
    try:
        w = Window(start=str(raw["from"]), end=str(raw["to"]), note=raw.get("note", ""),
                   modes=tuple(raw.get("modes", ())), size=raw.get("size"), bag=raw.get("bag"))
    except KeyError as e:
        raise RuleError(f"{rule_id}: window missing {e}") from e
    resolve_day(w.start, REGS_YEAR)
    resolve_day(w.end, REGS_YEAR)
    return w


def _parse_file(path) -> list[Rule]:
    with open(path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    meta = doc["meta"]
    rules = []
    for raw in doc["rules"]:
        rid = raw.get("id") or "?"
        unknown = set(raw.get("where", {})) - WHERE_KEYS
        if unknown:
            raise RuleError(f"{rid}: unknown where keys {unknown}")
        src = dict(raw.get("source") or {})
        if "ccr" not in src:
            raise RuleError(f"{rid}: missing source.ccr")
        src.setdefault("url", meta["url"])
        src["verified"] = _as_date(src.get("verified", meta["verified"]))
        eff = raw.get("effective", meta["effective"])
        size = raw.get("size")
        if size and (size.get("min") is not None or size.get("max") is not None) and size.get("type") not in ("TL", "FL"):
            raise RuleError(f"{rid}: size needs type TL or FL")
        rules.append(Rule(
            id=rid,
            species=tuple(raw["species"]),
            where=dict(raw.get("where") or {}),
            source=src,
            effective=(_as_date(eff["from"]), _as_date(eff["to"])),
            file=path.name,
            size=size,
            bag=raw.get("bag"),
            season=tuple(_window(w, rid) for w in raw.get("season", ())),
            periods=tuple(_window(w, rid) for w in raw.get("periods", ())),
            prohibited=bool(raw.get("prohibited", False)),
            check=raw.get("check"),
            notes=tuple(raw.get("notes", ())),
        ))
    return rules


@dataclass
class RuleSet:
    year: int
    rules: list[Rule]
    files: dict[str, dict] = field(default_factory=dict)  # file name -> meta

    @property
    def verified(self) -> date:
        return min(_as_date(m["verified"]) for m in self.files.values())


@lru_cache(maxsize=4)
def load_rules(year: int = REGS_YEAR) -> RuleSet:
    folder = REGS_DIR / str(year)
    if not folder.is_dir():
        raise RuleError(f"no regulations for {year}")
    rules, files = [], {}
    for path in sorted(folder.glob("*.yaml")):
        with open(path, encoding="utf-8") as f:
            files[path.name] = yaml.safe_load(f)["meta"]
        rules.extend(_parse_file(path))
    ids = [r.id for r in rules]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise RuleError(f"duplicate rule ids: {dupes}")
    validate_species(rules, load_catalog())
    return RuleSet(year, rules, files)


def validate_species(rules: list[Rule], catalog: dict[str, Species]) -> None:
    groups = {g for sp in catalog.values() for g in sp.groups}
    for r in rules:
        for s in r.species:
            if s == "any":
                continue
            if s.startswith("group:"):
                if s[6:] not in groups:
                    raise RuleError(f"{r.id}: unknown group {s}")
            elif s not in catalog:
                raise RuleError(f"{r.id}: unknown species {s}")
