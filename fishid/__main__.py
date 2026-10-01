"""Command line.

    python -m fishid serve [--host 127.0.0.1] [--port 8000]
    python -m fishid analyze photo.jpg [--lat .. --lon ..] [--water id] [--date YYYY-MM-DD] [--mode boat|shore|dive]
    python -m fishid regs check
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date
from pathlib import Path


def _serve(args) -> int:
    import uvicorn

    from fishid.server import create_app

    app = create_app(warm=not args.lazy)
    print(f"California Fish ID on http://{args.host}:{args.port}  (Ctrl+C to stop)")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    return 0


def _analyze(args) -> int:
    from fishid.pipeline import Analyzer

    data = Path(args.image).read_bytes()
    result = Analyzer().analyze(
        data, lat=args.lat, lon=args.lon, water_id=args.water, mode=args.mode,
        on=date.fromisoformat(args.date) if args.date else None, species_id=args.species,
        progress=lambda s: print(f"  … {s}", file=sys.stderr),
    )
    if args.json:
        for key in ("image", "annotated_png"):
            result.pop(key, None)
        print(json.dumps(result, indent=2, default=str))
        return 0 if result["ok"] else 1
    if not result["ok"]:
        print(result["message"])
        return 1
    print(f"Location: {result['place']['label']}  ({result['place']['source']})")
    for w in result["place"]["warnings"]:
        print(f"  ! {w}")
    if result["scale"]:
        s = result["scale"]
        print(f"Scale: {s['source']} — {s['detail']}")
    for n in result["scale_notes"]:
        print(f"  ! {n}")
    for f in result["fish"]:
        sp = ", ".join(f"{s['name']} {s['prob']:.0%}" for s in f["species"]) or "unknown"
        length = f["length"]["display"] if f["length"] else "not measured"
        print(f"\nFish #{f['number']}: {sp}")
        print(f"  Length: {length}")
        print(f"  Verdict: {f['verdict']}")
        for r in f["reasons"]:
            print(f"   - {r}")
        for c in f["citations"]:
            print(f"   [{c['ccr']}] verified {c['verified']}")
    if result.get("stale"):
        print(f"\n! {result['stale_message']}")
    print(f"\n{result['disclaimer']}")
    return 0


def _regs_check(_args) -> int:
    from fishid.regs.check import check

    changed = False
    for row in check():
        mark = {"CHANGED": "!!", "error": "??"}.get(row["status"], "  ")
        print(f"{mark} {row['status']:<12} {row['page']}\n   {row['url']}")
        changed |= row["status"] == "CHANGED"
    if changed:
        print("\nA page changed since the last check. Review it and update fishid/data/regs/ by hand.")
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(prog="fishid", description="California fish ID, length, and regulations.")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("serve", help="run the web app")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8000)
    s.add_argument("--lazy", action="store_true", help="load models on first request instead of at startup")
    s.set_defaults(func=_serve)

    a = sub.add_parser("analyze", help="analyze one photo")
    a.add_argument("image")
    a.add_argument("--lat", type=float)
    a.add_argument("--lon", type=float)
    a.add_argument("--water", help="water body id (see /api/waters)")
    a.add_argument("--date", help="catch date YYYY-MM-DD (default: photo date or today)")
    a.add_argument("--mode", choices=["boat", "shore", "dive"])
    a.add_argument("--species", help="skip species ID and use this species id")
    a.add_argument("--json", action="store_true")
    a.set_defaults(func=_analyze)

    r = sub.add_parser("regs", help="regulation data tools")
    rsub = r.add_subparsers(dest="regs_cmd", required=True)
    rc = rsub.add_parser("check", help="report CDFW in-season pages that changed")
    rc.set_defaults(func=_regs_check)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
