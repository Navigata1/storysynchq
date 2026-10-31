#!/usr/bin/env python3
"""Gate: every mission PR merged to main crossed a merging phase at its own head
(C9; S1 critic K9, K15).

Lists the merged pull requests into main from GitHub (so squash and rebase merges count, and
no stale local ref is trusted). A mission PR is one whose head commit descends from the
kickoff commit (the commit that added ops/mission/state.json). For each, the ledger must hold
an exit-0 phase-run of a *merging* phase (one whose gates carry the full ladder:
a2lib.LADDER) at exactly that head. Zero mission merges fails: an empty scan proves nothing.

Usage: python3 ops/mission/gates/merged_scan.py
       A2_MERGED_PRS=<file.json> ...   (fixtures: [{"number", "head": {"sha"}, "merged_at"}])
"""
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import a2lib  # noqa: E402

REPO = "Navigata1/storysynchq"


def merged_prs():
    fixture = os.environ.get("A2_MERGED_PRS")
    if fixture:
        return json.loads(Path(fixture).read_text())
    r = subprocess.run(["gh", "api", "--paginate", f"repos/{REPO}/pulls?state=closed&base=main&per_page=100"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(f"[FAIL] cannot list merged PRs: {r.stderr.strip()[:200]}")
        sys.exit(1)
    prs = []
    for chunk in r.stdout.replace("][", "]\n[").splitlines():
        if chunk.strip():
            prs.extend(json.loads(chunk))
    return [p for p in prs if p.get("merged_at")]


def is_ancestor(a, b):
    return subprocess.run(["git", "merge-base", "--is-ancestor", a, b], capture_output=True).returncode == 0


def main():
    added = subprocess.run(["git", "log", "--diff-filter=A", "--format=%H", "--", "ops/mission/state.json"],
                           capture_output=True, text=True).stdout.split()
    if not added:
        print("[FAIL] no kickoff commit (ops/mission/state.json was never added)")
        sys.exit(1)
    kickoff = added[-1]
    merging = a2lib.merging_phases()
    green = {e["head"] for e in a2lib.phase_runs() if e["exit"] == 0 and e["phase"] in merging}
    checked, bad = 0, []
    for pr in merged_prs():
        sha = pr["head"]["sha"]
        if not is_ancestor(kickoff, sha):
            continue  # merged before the mission began
        checked += 1
        if sha not in green:
            bad.append(f"PR #{pr['number']} merged head {sha[:12]} with no green merging-phase run there")
    if bad:
        print("[FAIL] " + "; ".join(bad))
        sys.exit(1)
    if checked == 0:
        print("[FAIL] no mission merge found: nothing to check")
        sys.exit(1)
    print(f"[PASS] {checked} mission PR(s) merged, each with a green merging-phase run at its head")


if __name__ == "__main__":
    main()
