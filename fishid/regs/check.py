"""`python -m fishid regs check`: has CDFW changed an in-season page?

Fetches the pages where CDFW posts mid-season changes and compares their text
with what was seen last time. It only reports — rule files are edited by hand.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime

import httpx

from fishid.config import USER_DIR

PAGES = {
    "Groundfish (rockfish, lingcod, cabezon…)": "https://wildlife.ca.gov/Fishing/Ocean/Regulations/Groundfish-Summary",
    "Ocean salmon": "https://wildlife.ca.gov/Fishing/Ocean/Regulations/Salmon",
    "Pacific halibut": "https://wildlife.ca.gov/Conservation/Marine/Pacific-Halibut",
    "Sturgeon": "https://wildlife.ca.gov/Conservation/Fishes/Sturgeon",
}
STATE = USER_DIR / "regs_check.json"


def _page_text(html: str) -> str:
    """Main text only, so menus, scripts and timestamps don't trigger changes."""
    html = re.sub(r"(?is)<(script|style|nav|header|footer)\b.*?</\1>", " ", html)
    m = re.search(r'(?is)<main\b.*?</main>', html)
    body = m.group(0) if m else html
    text = re.sub(r"(?s)<[^>]+>", " ", body)
    return re.sub(r"\s+", " ", text).strip()


def check(client: httpx.Client | None = None) -> list[dict]:
    client = client or httpx.Client(timeout=30, follow_redirects=True, headers={"User-Agent": "fishid-regs-check"})
    try:
        before = json.loads(STATE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        before = {}
    now = datetime.now().isoformat(timespec="seconds")
    report, after = [], dict(before)
    for name, url in PAGES.items():
        try:
            r = client.get(url)
            r.raise_for_status()
        except httpx.HTTPError as e:
            report.append({"page": name, "url": url, "status": "error", "detail": str(e)})
            continue
        digest = hashlib.sha256(_page_text(r.text).encode()).hexdigest()
        prev = before.get(url)
        if prev is None:
            status = "first check"
        elif prev["sha256"] != digest:
            status = "CHANGED"
        else:
            status = "unchanged"
        report.append({"page": name, "url": url, "status": status,
                       "last_seen": prev["checked"] if prev else None})
        if status != "unchanged":
            after[url] = {"sha256": digest, "checked": now}
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(after, indent=2), encoding="utf-8")
    return report
