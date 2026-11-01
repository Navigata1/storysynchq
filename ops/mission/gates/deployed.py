#!/usr/bin/env python3
"""Gate: production serves main's tip, and the reader and the demo tape load there (C10, merge
rule 3, S1b K49).

Fetches https://storysynchq.vercel.app/ and reads the ssync-build meta (layout.tsx sets it to
VERCEL_GIT_COMMIT_SHA), which must equal main's tip (A2_MAIN_REF, default origin/main, after a
fetch). Then /read must answer 200 and /demo/brave-little-star.ssync.json must parse as a tape
with pages. Exit 77 ("cannot run here") when the site cannot be reached from this environment
(network policy, DNS, proxy denial); exit 1 on a wrong build or a page or tape that fails.

Usage: python3 ops/mission/gates/deployed.py
  Fixture: A2_SITE=<base url> (a local server) and A2_MAIN_SHA=<sha> replace the live values.
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

SITE = os.environ.get("A2_SITE", "https://storysynchq.vercel.app")
CANNOT_RUN = 77


def get(path):
    try:
        with urllib.request.urlopen(SITE.rstrip("/") + path, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code in (403, 407) and "agentproxy" in str(e.headers).lower() + e.read().decode("utf-8", "replace").lower():
            print(f"[CANNOT RUN] the network policy denies {SITE}: {e}")
            sys.exit(CANNOT_RUN)
        return e.code, ""
    except (urllib.error.URLError, OSError) as e:
        print(f"[CANNOT RUN] {SITE} unreachable from here: {e}")
        sys.exit(CANNOT_RUN)


def main_tip():
    if os.environ.get("A2_MAIN_SHA"):
        return os.environ["A2_MAIN_SHA"]
    ref = os.environ.get("A2_MAIN_REF", "origin/main")
    subprocess.run(["git", "fetch", "-q", "origin", "main"], capture_output=True)
    return subprocess.run(["git", "rev-parse", ref], capture_output=True, text=True, check=True).stdout.strip()


def main():
    problems = []
    status, html = get("/")
    m = re.search(r'<meta[^>]*name="ssync-build"[^>]*content="([^"]*)"', html) or \
        re.search(r'<meta[^>]*content="([^"]*)"[^>]*name="ssync-build"', html)
    tip = main_tip()
    if status != 200 or not m:
        problems.append(f"/ answered {status} with no ssync-build meta")
    elif m.group(1) != tip:
        problems.append(f"production serves {m.group(1)[:12]}, main's tip is {tip[:12]}")
    status, _ = get("/read")
    if status != 200:
        problems.append(f"/read answered {status}")
    status, body = get("/demo/brave-little-star.ssync.json")
    try:
        pages = json.loads(body).get("pages") if status == 200 else None
    except json.JSONDecodeError:
        pages = None
    if not pages:
        problems.append(f"the demo tape did not load as a tape with pages (status {status})")
    if problems:
        print("[FAIL] " + "; ".join(problems))
        sys.exit(1)
    print(f"[PASS] {SITE} serves main's tip {tip[:12]}; /read and the demo tape load")


if __name__ == "__main__":
    main()
