#!/usr/bin/env python3
"""Pull the Made in Indiana manufacturer database, diff vs the last snapshot,
and write linkedin-prep/MEP-NEW.md listing companies not seen before.

Dedupe chain: this script dedupes vs the snapshot file (data state); the
monthly automation agent additionally cross-checks basalt_list_outreach so
nothing already in the funnel gets re-added.

Usage: python3 scripts/mep-refresh.py [--baseline]
  --baseline: first run — record everything, report zero new.
"""
import json, re, html, sys
from pathlib import Path
from datetime import date
from urllib.request import urlopen, Request

REPO = Path(__file__).resolve().parent
STATE = REPO / "mep-state.json"
OUT = REPO / "MEP-NEW.md"
URL = "https://mep.purdue.edu/made-in-indiana/company/"
GIANTS = ("alcoa", "arcelormittal", "ge aerospace", "subaru", "caterpillar",
          "cummins", "rolls-royce", "boston scientific", "eli lilly",
          "steel dynamics", "nucor", "kroger", "sirva", "stanley black")

def fetch_rows():
    req = Request(URL, headers={"User-Agent": "madcactus-mep-refresh/1.0"})
    src = html.unescape(urlopen(req, timeout=60).read().decode("utf-8", "replace"))
    rows = []
    for c in re.split(r'(?=<div class="event col-lg-4)', src):
        m = re.search(r'data-search="([^"]*)" data-category="([^"]*)"', c)
        if not m:
            continue
        name, cat = html.unescape(m.group(1)).strip(), html.unescape(m.group(2)).strip()
        locs = re.findall(r'<span class="timeLocation">([^<]+)</span>', c)
        loc = next((html.unescape(l.strip()) for l in locs if "," in l), "?")
        rows.append({"name": name, "cat": cat, "loc": loc})
    return rows

def main():
    baseline = "--baseline" in sys.argv
    rows = fetch_rows()
    prev = set()
    if STATE.exists():
        prev = {r["name"] for r in json.loads(STATE.read_text())}
    new = [r for r in rows if r["name"] not in prev]
    # ponytail: giant-name filter is coarse; the agent pass still gates on size/ownership
    new = [r for r in new if not any(g in r["name"].lower() for g in GIANTS)]

    STATE.write_text(json.dumps(rows, indent=1))
    print(f"pulled {len(rows)} companies · {len(new)} new (not in previous snapshot)")

    if baseline or not new:
        OUT.write_text(f"# MEP refresh — {date.today()}\n\nNo new companies ({len(rows)} total, dedup vs {len(prev)} known). Next pull next month.\n")
        return
    lines = [f"# MEP refresh — {date.today()}", "",
             f"{len(new)} new Made-in-Indiana companies since last pull ({len(rows)} total).",
             "These need the funnel gates (owner-led, ≤6 tech titles, $10-70M-ish, US) before outreach.", ""]
    for r in sorted(new, key=lambda x: x["loc"]):
        lines.append(f"- **{r['name']}** — {r['loc']} — {r['cat']}")
    OUT.write_text("\n".join(lines) + "\n")
    print(f"wrote {len(new)} candidates to linkedin-prep/MEP-NEW.md")

if __name__ == "__main__":
    main()
