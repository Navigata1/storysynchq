#!/usr/bin/env python3
"""Re-run every gate of every phase at the final head (S1 critic K10).

Runs each phase except the close phase through run_phase.py, so every gate runs fresh at
HEAD and a phase-run event lands in the ledger; derive_bundle.py then reads those runs. Exit
0 only if every phase passes. A phase that waits on the human or on an engine this machine
lacks (P1, P5) exits 77 per gate here and is reported unverified, not hidden. Merged phases'
review gates still pass at the final head: review_closed.py judges after-review drift only up
to the head of the PR that merged the phase (S1b K47).

Usage: python3 ops/mission/rerun_all.py
"""
import json
import subprocess
import sys
from pathlib import Path

CLOSE = "P6"


def main():
    plan = json.loads(Path("ops/mission/plan.lock.json").read_text())
    results = {}
    for p in plan["phases"]:
        if p["id"] == CLOSE:
            continue
        results[p["id"]] = subprocess.run([sys.executable, "ops/mission/run_phase.py", p["id"]]).returncode
    for pid, rc in results.items():
        print(f"{pid}: {'passed' if rc == 0 else f'FAILED (exit {rc})'}")
    sys.exit(0 if all(rc == 0 for rc in results.values()) else 1)


if __name__ == "__main__":
    main()
