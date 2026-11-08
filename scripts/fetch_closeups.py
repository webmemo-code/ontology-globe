#!/usr/bin/env python3
"""Download each article's larger photo for the close-up tiles on the dome.

The atlas holds WordPress's 150x150 crops at 64 px: fine for the mosaic, a
blur once a tile fills the screen. This fetches the 'src' size that
fetch_thumbs.py recorded in .cache/thumbs/{site}/manifest.json (medium_large,
~768 px) to .cache/closeups/{site}/{post_id}.{ext}; build-closeups.mjs then
scales them down for public/. The blogs send no CORS headers, so the viewer
cannot load these from them directly. Resumable, read-only, no credentials:

  python scripts/fetch_closeups.py --site reisememo
  python scripts/fetch_closeups.py --site travelmemo --limit 3
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from curl_cffi import requests

ROOT = Path(__file__).resolve().parent.parent
HEADERS = {"User-Agent": "travel-ontology-visualization/1.0"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True, choices=["travelmemo", "reisememo"])
    ap.add_argument("--limit", type=int, default=0, help="only the first N posts (smoke test)")
    ap.add_argument("--delay", type=float, default=0.25, help="seconds between requests")
    args = ap.parse_args()

    manifest = json.loads((ROOT / ".cache" / "thumbs" / args.site / "manifest.json").read_text(encoding="utf-8"))
    rows = [(pid, m["src"]) for pid, m in manifest.items() if m and m.get("src")]
    if args.limit:
        rows = rows[: args.limit]
    out = ROOT / ".cache" / "closeups" / args.site
    out.mkdir(parents=True, exist_ok=True)

    downloaded = skipped = failed = 0
    for pid, src in rows:
        target = out / f"{pid}{Path(src.split('?')[0]).suffix.lower() or '.jpg'}"
        if target.exists() and target.stat().st_size > 0:
            skipped += 1
            continue
        try:
            r = requests.get(src, headers=HEADERS, impersonate="chrome120", timeout=60)
            r.raise_for_status()
            target.write_bytes(r.content)
            downloaded += 1
        except Exception as exc:
            print(f"  post {pid}: {type(exc).__name__}: {exc} ({src})", file=sys.stderr)
            failed += 1
        time.sleep(args.delay)
    print(f"{args.site}: downloaded {downloaded}, already had {skipped}, failed {failed} of {len(rows)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
