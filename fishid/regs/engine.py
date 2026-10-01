"""Turn species + length + place + date into a keep/release verdict.

Rules stack: every matching rule's closures and prohibitions apply, while
size and bag limits come from the most specific rule that sets them
(water body > county > district/area > statewide; species > group > any).
When something about the place is unknown (lake or stream? which ocean
area?) each possibility is evaluated and the strictest result wins. When the
species is uncertain, each plausible species is evaluated the same way.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field, replace
from datetime import date

from fishid import DISCLAIMER
from fishid.config import LOOKALIKE_PROB, REGS_YEAR, SPECIES_CONFIDENCE, STALE_AFTER_DAYS
from fishid.models import STRICTNESS, Length, Place, Verdict
from fishid.regs.loader import Rule, RuleError, RuleSet, load_rules
from fishid.species.catalog import Species, load_catalog

MODES = ("boat", "shore", "dive")


@dataclass
class Ruling:
    """The outcome for one species under one reading of the rules."""
    species: Species
    verdict: Verdict
    reasons: list[str]
    rules: list[Rule]
    size: dict | None = None
    bag: dict | None = None
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "species": self.species.id,
            "name": self.species.name,
            "verdict": self.verdict.value,
            "reasons": self.reasons,
            "size": self.size,
            "bag": self.bag,
            "notes": self.notes,
            "citations": [r.citation() for r in self.rules],
        }


@dataclass
class Decision:
    verdict: Verdict
    governing: Ruling
    rulings: list[Ruling]
    reasons: list[str]
    stale: bool
    stale_message: str | None
    disclaimer: str = DISCLAIMER

    @property
    def citations(self) -> list[dict]:
        seen, out = set(), []
        for ruling in self.rulings:
            for r in ruling.rules:
                if r.id not in seen:
                    seen.add(r.id)
                    out.append(r.citation())
        return out


def _strictest(rulings: list[Ruling]) -> Ruling:
    return max(rulings, key=lambda r: STRICTNESS[r.verdict])


def _plausible_places(place: Place, sp: Species) -> list[Place]:
    if place.water != "unknown":
        return [place]
    waters = ["salt", "fresh"] if sp.water == "both" else [sp.water]
    return [replace(place, water=w) for w in waters]


def _scenarios(rules: list[Rule], sp: Species, place: Place, on: date) -> list[list[Rule]]:
    definite, maybe = [], []
    for r in rules:
        if not r.in_effect(on) or not r.species_match(sp):
            continue
        m = r.place_match(place)
        if m == "yes":
            definite.append(r)
        elif m == "maybe":
            maybe.append(r)
    # Each rule we can't rule in or out is tried on its own, plus the case
    # where none of them apply; the caller keeps the strictest outcome.
    return [definite] + [definite + [m] for m in maybe]


def _precedence(r: Rule, sp: Species) -> tuple[int, int]:
    return r.level, r.species_match(sp)


def _rule_for(rules: list[Rule], sp: Species, on: date, attr: str) -> dict | None:
    """Most specific value of size/bag, including date-limited periods."""
    best, best_key = None, None
    for r in rules:
        value = getattr(r, attr)
        for p in r.periods:
            if p.contains(on) and getattr(p, attr) is not None:
                value = getattr(p, attr)
        if value is None:
            continue
        key = _precedence(r, sp)
        if best_key is None or key >= best_key:
            best, best_key = value, key
    return best


def _size_verdict(size: dict | None, length: Length | None, sp: Species) -> tuple[Verdict, list[str]]:
    if not size or (size.get("min") is None and size.get("max") is None):
        return Verdict.KEEP, []
    kind = size.get("type", "TL")
    lo_lim, hi_lim = size.get("min"), size.get("max")
    limit_txt = " – ".join(filter(None, [f"min {lo_lim} in" if lo_lim else "", f"max {hi_lim} in" if hi_lim else ""]))
    if length is None:
        return Verdict.TOO_CLOSE_TO_CALL, [f"Size limit applies ({limit_txt} {kind}) but the fish couldn't be measured."]
    note = []
    if length.kind != kind:
        note = [f"Measured {length.kind} but the limit is {kind}; treat the size check with caution."]
    low, high = length.low_in, length.high_in
    if lo_lim is not None and high < lo_lim:
        return Verdict.RELEASE_UNDERSIZED, [f"Undersized: {length.display()} {length.kind}, minimum is {lo_lim} in {kind}."] + note
    if hi_lim is not None and low > hi_lim:
        return Verdict.RELEASE_OVERSIZED, [f"Oversized: {length.display()} {length.kind}, maximum is {hi_lim} in {kind}."] + note
    straddles = (lo_lim is not None and low < lo_lim) or (hi_lim is not None and (high > hi_lim or math.isinf(high)))
    if straddles:
        return Verdict.TOO_CLOSE_TO_CALL, [f"Too close to call: {length.display()} overlaps the {limit_txt} {kind} limit. "
                                           "Measure on a ruler before keeping."] + note
    if length.truncated:
        return Verdict.TOO_CLOSE_TO_CALL, ["The fish runs off the edge of the photo, so its full length is unknown."]
    return Verdict.KEEP, [f"Legal size: {length.display()} {length.kind} ({limit_txt} {kind})."] + note


def judge_species(sp: Species, length: Length | None, place: Place, on: date, mode: str | None,
                  ruleset: RuleSet) -> Ruling:
    """Strictest outcome for one species over every plausible reading of the place."""
    outcomes = []
    for pl in _plausible_places(place, sp):
        for rules in _scenarios(ruleset.rules, sp, pl, on):
            outcomes.append(_judge(sp, length, pl, on, mode, rules))
    return _strictest(outcomes)


def _judge(sp: Species, length: Length | None, place: Place, on: date, mode: str | None,
           rules: list[Rule]) -> Ruling:
    notes = list(dict.fromkeys(n for r in rules for n in r.notes))
    for r in rules:
        for p in r.periods:
            if p.contains(on) and p.note:
                notes.append(p.note)
    size = _rule_for(rules, sp, on, "size")
    bag = _rule_for(rules, sp, on, "bag")

    def ruling(v: Verdict, reasons: list[str]) -> Ruling:
        return Ruling(sp, v, reasons, rules, size, bag, notes)

    if not any(r.species_match(sp) >= 1 for r in rules):
        return ruling(Verdict.CHECK_REGS, [f"No {sp.name.lower()} rule on file for this location."])

    if place.mpa and place.mpa.get("no_take"):
        return ruling(Verdict.MPA_NO_TAKE, [f"Inside {place.mpa['name']}: no take of any kind."])

    banned = [r for r in rules if r.prohibited]
    if banned:
        why = banned[0].notes[0] if banned[0].notes else "Take is prohibited."
        return ruling(Verdict.PROHIBITED, [f"{sp.name}: {why}"])

    for r in rules:
        for w in r.season:
            if not w.contains(on):
                continue
            if w.modes and mode is not None and mode not in w.modes:
                continue
            msg = w.note or f"{sp.name} season is closed on {on:%b %d}."
            if w.modes and mode is None:
                msg += f" (Applies to {', '.join(w.modes)} anglers — tell the app if you fished from shore or diving.)"
            return ruling(Verdict.SEASON_CLOSED, [msg])

    checks = [r.check for r in rules if r.check]
    if checks:
        return ruling(Verdict.CHECK_REGS, checks)

    v, reasons = _size_verdict(size, length, sp)
    return ruling(v, reasons)


def rules_for_date(on: date) -> RuleSet:
    """Rules for the catch year, or the newest year we have."""
    try:
        return load_rules(on.year)
    except RuleError:
        return load_rules(REGS_YEAR)


def _stale(ruleset: RuleSet, today: date) -> tuple[bool, str | None]:
    if today.year > ruleset.year:
        return True, f"These are {ruleset.year} regulations; it's now {today.year}. Check for updated rules."
    age = (today - ruleset.verified).days
    if age > STALE_AFTER_DAYS:
        return True, f"Regulations last verified {ruleset.verified:%b %d, %Y} ({age} days ago). In-season changes may apply."
    return False, None


def evaluate(candidates: list[tuple[str, float]], length: Length | None, place: Place, on: date,
             mode: str | None = None, today: date | None = None, ruleset: RuleSet | None = None,
             lengths: dict[str, Length | None] | None = None) -> Decision:
    """candidates: (species_id, probability) best first. lengths optionally gives
    a per-species length when TL/FL differ between candidates."""
    if not candidates:
        raise ValueError("need at least one species candidate")
    if mode is not None and mode not in MODES:
        raise ValueError(f"mode must be one of {MODES}")
    ruleset = ruleset or rules_for_date(on)
    catalog = load_catalog()
    top_id, top_p = candidates[0]
    confident = top_p >= SPECIES_CONFIDENCE

    considered = [top_id] + [sid for sid, p in candidates[1:] if p >= LOOKALIKE_PROB]
    rulings = []
    for sid in dict.fromkeys(considered):
        sp_length = lengths.get(sid, length) if lengths else length
        rulings.append(judge_species(catalog[sid], sp_length, place, on, mode, ruleset))

    top = rulings[0]
    worst = _strictest(rulings)
    reasons = list(top.reasons)
    verdict = top.verdict
    governing = top

    if STRICTNESS[worst.verdict] > STRICTNESS[top.verdict]:
        verdict, governing = worst.verdict, worst
        reasons = [f"Could also be {worst.species.name} — its rules are stricter, so they govern."] + worst.reasons
    if not confident and STRICTNESS[verdict] < STRICTNESS[Verdict.UNCERTAIN_SPECIES]:
        verdict = Verdict.UNCERTAIN_SPECIES
        names = ", ".join(r.species.name for r in rulings[:3])
        reasons = [f"Species not certain ({top_p:.0%} {top.species.name}); possibilities: {names}. "
                   "Confirm the species before keeping."] + reasons

    if verdict == Verdict.KEEP:
        if not place.in_california:
            verdict = Verdict.CHECK_REGS
            reasons.append("Location is outside California — California rules may not apply.")
        elif place.mpa and not place.mpa.get("no_take"):
            verdict = Verdict.CHECK_REGS
            reasons.append(f"Inside {place.mpa['name']} ({place.mpa['type']}): only certain species and "
                           "methods may be taken. Check the MPA's rules.")
        elif length is not None and length.truncated:
            verdict = Verdict.TOO_CLOSE_TO_CALL
            reasons.append("The fish runs off the edge of the photo, so its full length is unknown.")

    stale, stale_msg = _stale(ruleset, today or date.today())
    return Decision(verdict, governing, rulings, reasons, stale, stale_msg)
