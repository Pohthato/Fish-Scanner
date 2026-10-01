"""Download research-grade iNaturalist photos of California fish via GBIF.

Two modes:

  python training/fetch_inat.py --download
      Requests an official GBIF download (needs a free GBIF account:
      set GBIF_USER, GBIF_PWD, GBIF_EMAIL). The download gets a DOI, which is
      written to training/data/DOWNLOAD.json — cite it if you publish anything.

  python training/fetch_inat.py --search --per-species 300
      Pages through the public occurrence search API instead (no account,
      no DOI). Fine for experiments.

Either way, images are saved to training/data/images/<species_id>/ and listed
in training/data/manifest.csv with observer and license, so prepare.py can
split by observer and drop licenses you can't use.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fishid.species.catalog import load_catalog  # noqa: E402

API = "https://api.gbif.org/v1"
INAT_DATASET = "50c9509d-22c7-4a22-a47d-8c48425ef4a7"  # iNaturalist research-grade observations
LICENSES = {"CC0_1_0", "CC_BY_4_0", "CC_BY_NC_4_0"}
DATA = Path(__file__).resolve().parent / "data"


def client() -> httpx.Client:
    return httpx.Client(base_url=API, timeout=60, headers={"User-Agent": "fishid-training"})


def taxon_keys(http: httpx.Client) -> dict[str, int]:
    keys = {}
    for sp in load_catalog().values():
        name = " ".join(sp.scientific.split()[:2])
        r = http.get("/species/match", params={"name": name, "strict": "true"}).json()
        if r.get("usageKey") and r.get("rank") in ("SPECIES", "SUBSPECIES"):
            keys[sp.id] = r.get("speciesKey") or r["usageKey"]
        else:
            print(f"  no GBIF match for {sp.id} ({name})", file=sys.stderr)
    return keys


# --------------------------------------------------------------------- search mode
def search(http: httpx.Client, keys: dict[str, int], per_species: int, outside_ca: bool) -> list[dict]:
    rows = []
    for sid, key in keys.items():
        got, offset = 0, 0
        while got < per_species:
            params = {"datasetKey": INAT_DATASET, "taxonKey": key, "mediaType": "StillImage",
                      "limit": 300, "offset": offset}
            if not outside_ca:
                params.update(country="US", stateProvince="California")
            page = http.get("/occurrence/search", params=params).json()
            for occ in page.get("results", []):
                lic = (occ.get("license") or "").rsplit("/", 1)[-1].upper().replace("-", "_").replace(".", "_")
                lic = {"ZERO_1_0": "CC0_1_0", "BY_4_0": "CC_BY_4_0", "BY_NC_4_0": "CC_BY_NC_4_0"}.get(lic, lic)
                for i, m in enumerate(occ.get("media", [])[:2]):
                    if m.get("type") != "StillImage" or not m.get("identifier"):
                        continue
                    rows.append({"species_id": sid, "gbif_id": occ["key"], "url": m["identifier"],
                                 "observer": occ.get("recordedBy", ""), "license": lic, "n": i})
                    got += 1
            if page.get("endOfRecords") or not page.get("results"):
                break
            offset += 300
        print(f"{sid}: {got}")
    return [r for r in rows if r["license"] in LICENSES]


# --------------------------------------------------------------------- download mode
def request_download(http: httpx.Client, keys: dict[str, int]) -> str:
    user, pwd, email = (os.environ.get(k) for k in ("GBIF_USER", "GBIF_PWD", "GBIF_EMAIL"))
    if not (user and pwd and email):
        sys.exit("Set GBIF_USER, GBIF_PWD and GBIF_EMAIL for --download (or use --search).")
    predicate = {"type": "and", "predicates": [
        {"type": "equals", "key": "DATASET_KEY", "value": INAT_DATASET},
        {"type": "equals", "key": "MEDIA_TYPE", "value": "StillImage"},
        {"type": "in", "key": "TAXON_KEY", "values": [str(k) for k in keys.values()]},
        {"type": "in", "key": "LICENSE", "values": sorted(LICENSES)},
    ]}
    body = {"creator": user, "notificationAddress": [email], "format": "DWCA", "predicate": predicate}
    r = http.post("/occurrence/download/request", json=body, auth=(user, pwd))
    r.raise_for_status()
    key = r.text.strip()
    print(f"GBIF download {key} requested; waiting for it to be ready…")
    while True:
        meta = http.get(f"/occurrence/download/{key}").json()
        if meta["status"] == "SUCCEEDED":
            DATA.mkdir(parents=True, exist_ok=True)
            (DATA / "DOWNLOAD.json").write_text(json.dumps({"key": key, "doi": meta.get("doi"),
                                                            "created": meta.get("created")}, indent=2))
            print(f"ready — DOI {meta.get('doi')}")
            return meta["downloadLink"]
        if meta["status"] in ("FAILED", "KILLED", "CANCELLED"):
            sys.exit(f"download {meta['status']}")
        time.sleep(30)


def rows_from_dwca(link: str, keys: dict[str, int]) -> list[dict]:
    by_key = {v: k for k, v in keys.items()}
    data = httpx.get(link, follow_redirects=True, timeout=600).content
    zf = zipfile.ZipFile(io.BytesIO(data))
    occ = {}
    with zf.open("occurrence.txt") as f:
        for row in csv.DictReader(io.TextIOWrapper(f, "utf-8"), delimiter="\t"):
            sid = by_key.get(int(row.get("speciesKey") or 0))
            if sid:
                occ[row["gbifID"]] = (sid, row.get("recordedBy", ""), row.get("license", ""))
    rows = []
    with zf.open("multimedia.txt") as f:
        for row in csv.DictReader(io.TextIOWrapper(f, "utf-8"), delimiter="\t"):
            if row["gbifID"] in occ and row.get("identifier"):
                sid, observer, lic = occ[row["gbifID"]]
                rows.append({"species_id": sid, "gbif_id": row["gbifID"], "url": row["identifier"],
                             "observer": observer, "license": lic, "n": 0})
    return rows


# --------------------------------------------------------------------- images
def fetch_images(rows: list[dict], workers: int = 8) -> list[dict]:
    out_dir = DATA / "images"

    def one(row):
        path = out_dir / row["species_id"] / f"{row['gbif_id']}_{row['n']}.jpg"
        if path.exists():
            return {**row, "path": str(path.relative_to(DATA))}
        url = row["url"].replace("/original.", "/medium.")  # iNat: medium is ~500 px
        try:
            r = httpx.get(url, timeout=60, follow_redirects=True)
            r.raise_for_status()
        except httpx.HTTPError:
            return None
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(r.content)
        return {**row, "path": str(path.relative_to(DATA))}

    with ThreadPoolExecutor(workers) as pool:
        done = [r for r in pool.map(one, rows) if r]
    return done


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--download", action="store_true", help="official GBIF download with DOI")
    mode.add_argument("--search", action="store_true", help="public search API, no account")
    ap.add_argument("--per-species", type=int, default=300)
    ap.add_argument("--outside-ca", action="store_true", help="also use observations outside California (rare species)")
    ap.add_argument("--no-nc", action="store_true", help="drop CC-BY-NC images (needed for commercial use)")
    args = ap.parse_args()

    with client() as http:
        keys = taxon_keys(http)
        print(f"{len(keys)} species matched in GBIF")
        rows = rows_from_dwca(request_download(http, keys), keys) if args.download else \
            search(http, keys, args.per_species, args.outside_ca)
    if args.no_nc:
        rows = [r for r in rows if "NC" not in r["license"]]
    rows = fetch_images(rows)
    DATA.mkdir(parents=True, exist_ok=True)
    with open(DATA / "manifest.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["path", "species_id", "gbif_id", "observer", "license", "url", "n"])
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} images -> {DATA / 'manifest.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
