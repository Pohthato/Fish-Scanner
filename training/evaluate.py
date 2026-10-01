"""Evaluate the whole app on real labeled photos.

    python training/evaluate.py photos.csv [--out report.json]

photos.csv columns:
    path            image file (relative to the CSV)
    species_id      true species (see fishid/data/species.yaml)
    true_length_in  measured on a board, in the species' TL/FL convention
    reference       what was in the photo for scale: dollar_bill, card, quarter, soda_can, gear, none
    lat, lon        optional catch location
    date            optional YYYY-MM-DD
    true_verdict    optional: the verdict a careful angler would reach (KEEP, RELEASE_UNDERSIZED, …)

Reports species top-1/top-3, length error by scale source, and a verdict
confusion table with false KEEPs (the app said keep, the truth says
otherwise) called out — that number must be zero.
"""
from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fishid.pipeline import Analyzer  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv")
    ap.add_argument("--out")
    args = ap.parse_args()
    base = Path(args.csv).resolve().parent
    rows = list(csv.DictReader(open(args.csv, encoding="utf-8")))
    analyzer = Analyzer()

    top1 = top3 = n_species = 0
    errors: dict[str, list[float]] = defaultdict(list)
    confusion: Counter = Counter()
    false_keep = []
    details = []
    for row in rows:
        result = analyzer.analyze(
            (base / row["path"]).read_bytes(),
            lat=float(row["lat"]) if row.get("lat") else None,
            lon=float(row["lon"]) if row.get("lon") else None,
            on=date.fromisoformat(row["date"]) if row.get("date") else None,
        )
        fish = result["fish"][0] if result.get("fish") else None
        guesses = [s["id"] for s in fish["species"]] if fish else []
        n_species += 1
        top1 += bool(guesses[:1] == [row["species_id"]])
        top3 += row["species_id"] in guesses[:3]
        measured = fish["length"]["value"] if fish and fish["length"] else None
        source = result["scale"]["source"] if result.get("scale") else "none"
        if measured and row.get("true_length_in"):
            true = float(row["true_length_in"])
            errors[source].append(abs(measured - true) / true)
        verdict = fish["verdict"] if fish else "NO_FISH"
        if row.get("true_verdict"):
            confusion[(row["true_verdict"], verdict)] += 1
            if verdict == "KEEP" and row["true_verdict"] != "KEEP":
                false_keep.append(row["path"])
        details.append({"path": row["path"], "truth": row["species_id"], "guesses": guesses[:3],
                        "length": measured, "scale": source, "verdict": verdict})

    print(f"Species  top-1 {top1 / max(1, n_species):.1%}   top-3 {top3 / max(1, n_species):.1%}   (n={n_species})")
    print("Length error by scale source (median / 90th pct):")
    for src, errs in sorted(errors.items()):
        errs.sort()
        p90 = errs[min(len(errs) - 1, int(0.9 * len(errs)))]
        print(f"  {src:<10} {statistics.median(errs):6.1%} / {p90:6.1%}   (n={len(errs)})")
    if confusion:
        print("Verdict confusion (truth -> app):")
        for (t, a), c in sorted(confusion.items()):
            flag = "   <-- FALSE KEEP" if a == "KEEP" and t != "KEEP" else ""
            print(f"  {t:<20} -> {a:<20} {c}{flag}")
    print(f"FALSE KEEPS: {len(false_keep)}" + (f"  {false_keep}" if false_keep else ""))
    if args.out:
        Path(args.out).write_text(json.dumps({"top1": top1 / max(1, n_species), "top3": top3 / max(1, n_species),
                                              "length_errors": errors, "false_keep": false_keep,
                                              "details": details}, indent=2))
    return 1 if false_keep else 0


if __name__ == "__main__":
    sys.exit(main())
