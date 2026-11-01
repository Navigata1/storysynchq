#!/usr/bin/env python3
"""Gate: first-load JavaScript per route stays within the frozen budget (C7, contract A7).

Builds and serves a production build of HEAD with the cloud configured (a placeholder project,
as production has one), via prod_server.sh (clean tree, `next build`, `next start`, the served
build's SHA checked), then runs js_measure.mjs: each route in a fresh browser context, every
same-origin script it requests until it is ready (the Player route: its cover on screen), route
prefetches for other pages excluded. Each route in judges/js-budget.json must come in at or under its budget, and
every budgeted route must have been measured.

Usage: python3 ops/mission/gates/js_budget.py
       A2_JS_MEASURED=<file.json> python3 ... (fixtures: a measurement instead of a build)
"""
import json
import os
import subprocess
import sys
from pathlib import Path

GATES = Path(__file__).resolve().parent
BUDGET = GATES.parent / "judges" / "js-budget.json"


def measure():
    if os.environ.get("A2_JS_MEASURED"):
        return json.loads(Path(os.environ["A2_JS_MEASURED"]).read_text())
    # the cloud configured, as in production, so its client is counted wherever a page loads
    # it; a placeholder project: the measuring browser's requests to it simply fail (P4-R1-04)
    env = {**os.environ, "NEXT_PUBLIC_SUPABASE_URL": "https://a2-placeholder.supabase.co",
           "NEXT_PUBLIC_SUPABASE_ANON_KEY": "a2-placeholder-anon-key"}
    r = subprocess.run(["bash", str(GATES / "prod_server.sh"), "node", str(GATES / "js_measure.mjs")],
                       capture_output=True, text=True, env=env)
    if r.returncode != 0:
        print(f"[FAIL] could not build and measure (exit {r.returncode}): {(r.stdout + r.stderr).strip()[-400:]}")
        sys.exit(1)
    lines = [l for l in r.stdout.splitlines() if l.startswith("{")]
    if not lines:
        print("[FAIL] the measurement printed no result")
        sys.exit(1)
    return json.loads(lines[-1])


def main():
    budget = json.loads(BUDGET.read_text())["routes"]
    got = measure()
    problems, rows = [], []
    for route, limit in budget.items():
        m = got.get(route)
        if not m:
            problems.append(f"{route} was not measured")
            continue
        size = m["gzipBytes"]
        rows.append(f"{route} {size / 1024:.0f}k/{limit / 1024:.0f}k")
        if size > limit:
            top = ", ".join(m.get("top", [])[:3])
            problems.append(f"{route} loads {size / 1024:.0f} KB of JS (gzip), over its {limit / 1024:.0f} KB budget [{top}]")
    if problems:
        print("[FAIL] " + "; ".join(problems))
        sys.exit(1)
    print("[PASS] first-load JS within budget: " + ", ".join(rows))


if __name__ == "__main__":
    main()
