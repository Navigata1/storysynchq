#!/usr/bin/env python3
"""Gate: every mission merge to main crossed its phase's gates at its own head (C9, S1 critic K9).

Walks the first-parent merge commits on origin/main made after the mission's kickoff
commit (the first commit that added ops/mission/state.json). For each, the merged head
(second parent) must have an exit-0 run in ops/mission/evidence/phase-runs.jsonl.

Usage: python3 ops/mission/gates/merged_scan.py
"""
import json
import subprocess
import sys
from pathlib import Path


def git(*a):
    return subprocess.run(["git", *a], capture_output=True, text=True, check=True).stdout.strip()


def main():
    try:
        kickoff = git("log", "--diff-filter=A", "--format=%H", "--", "ops/mission/state.json").splitlines()[-1]
    except (subprocess.CalledProcessError, IndexError):
        print("[FAIL] no kickoff commit (ops/mission/state.json was never added)")
        sys.exit(1)
    merges = git("rev-list", "--first-parent", "--merges", "origin/main").splitlines()
    rp = Path("ops/mission/evidence/phase-runs.jsonl")
    green = {json.loads(l)["head"] for l in rp.read_text().splitlines() if json.loads(l)["exit"] == 0} if rp.exists() else set()
    checked, bad = 0, []
    for m in merges:
        parents = git("rev-list", "--parents", "-n", "1", m).split()[1:]
        if len(parents) < 2:
            continue
        merged = parents[1]
        if subprocess.run(["git", "merge-base", "--is-ancestor", kickoff, merged]).returncode != 0:
            continue  # merged before the mission began
        checked += 1
        if merged not in green:
            bad.append(f"{m[:12]} merged {merged[:12]} with no green phase run at that head")
    if bad:
        print("[FAIL] " + "; ".join(bad))
        sys.exit(1)
    print(f"[PASS] {checked} mission merge(s) on main, each with a green phase run at its merged head")


if __name__ == "__main__":
    main()
