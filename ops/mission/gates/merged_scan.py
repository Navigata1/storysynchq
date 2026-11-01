#!/usr/bin/env python3
"""Gate: every mission PR merged to main crossed a merging phase at its own head (C9).

Mission PRs are the PRs merged into main numbered FIRST_MISSION_PR or later (contract section
6), listed from GitHub, so squash and rebase merges count (S1b K28). For each:
  - its head is fetched (refs/pull/N/head); a head that cannot be fetched fails;
  - the ledger holds an exit-0 phase-run of a merging phase (a2lib.LADDER) at that head, and no
    run of that phase at that head failed: a red run is never erased by a rerun (K29);
  - main's tip just before the merge (the merge commit's first parent) is in the head, so what
    landed is what the ladder ran (K30);
  - GitHub's `verify` check-run on that head concluded success (merge rule 2, K35);
  - the merge is a true merge commit whose second parent is the PR head (contract section 2:
    merge commits only, so the reviewed head stays in main's history, S1b K56);
  - every commit on main's first-parent line since the mission began (MAIN_AT_KICKOFF) is the
    merge commit of a mission PR, so a direct push to main fails the scan (S1b K57).
Exit 77 when GitHub cannot be read (cannot run here, K33); 1 on any violation or when no
mission PR has merged.

Usage: python3 ops/mission/gates/merged_scan.py
  Fixtures: A2_MERGED_PRS=<json list of {number, head: {sha}, merge_commit_sha}>,
            A2_CHECKS=<json {sha: conclusion}>, A2_NO_FETCH=1, A2_MAIN_REF=<ref>,
            A2_MAIN_AT_KICKOFF=<sha>
"""
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import a2lib  # noqa: E402

REPO = "Navigata1/storysynchq"
FIRST_MISSION_PR = 6
MAIN_AT_KICKOFF = "dd727b10436b3461b1cdb5cd7805dacf22553de7"  # main's tip when the mission began (PR #5's merge)


def gh(path):
    r = subprocess.run(["gh", "api", "--paginate", path], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"[CANNOT RUN] GitHub unreadable: {r.stderr.strip()[:200]}")
        sys.exit(a2lib.CANNOT_RUN)
    out = []
    for chunk in r.stdout.replace("][", "]\n[").splitlines():
        if chunk.strip():
            v = json.loads(chunk)
            out.extend(v if isinstance(v, list) else [v])
    return out


def merged_prs():
    if os.environ.get("A2_MERGED_PRS"):
        return json.loads(Path(os.environ["A2_MERGED_PRS"]).read_text())
    return [p for p in gh(f"repos/{REPO}/pulls?state=closed&base=main&per_page=100") if p.get("merged_at")]


def verify_conclusion(sha):
    if os.environ.get("A2_CHECKS"):
        return json.loads(Path(os.environ["A2_CHECKS"]).read_text()).get(sha)
    runs = gh(f"repos/{REPO}/commits/{sha}/check-runs")
    for page in runs:
        for cr in page.get("check_runs", []):
            if cr.get("name") == "verify":
                return cr.get("conclusion")
    return None


def git_ok(*a):
    return subprocess.run(["git", *a], capture_output=True).returncode == 0


def main():
    prs = [p for p in merged_prs() if p["number"] >= FIRST_MISSION_PR]
    if not prs:
        print("[FAIL] no mission PR has merged: nothing to check")
        sys.exit(1)
    merging = a2lib.merging_phases()
    runs = [e for e in a2lib.phase_runs() if e["phase"] in merging]
    if not os.environ.get("A2_NO_FETCH"):
        git_ok("fetch", "-q", "origin", "main")
    bad = []
    for pr in prs:
        n, sha = pr["number"], pr["head"]["sha"]
        if not os.environ.get("A2_NO_FETCH"):
            git_ok("fetch", "-q", "origin", f"pull/{n}/head")
        if not git_ok("cat-file", "-e", f"{sha}^{{commit}}"):
            bad.append(f"PR #{n}: head {sha[:12]} cannot be fetched")
            continue
        at = [e for e in runs if e["head"] == sha]
        green = {e["phase"] for e in at if e["exit"] == 0}
        red = {e["phase"] for e in at if e["exit"] not in (0, a2lib.CANNOT_RUN)}
        if not green - red:
            bad.append(f"PR #{n}: no merging phase green at {sha[:12]} without an earlier red run there")
        mc = pr.get("merge_commit_sha")
        if not mc or not git_ok("merge-base", "--is-ancestor", f"{mc}^1", sha):
            bad.append(f"PR #{n}: main's tip before the merge is not in the head (the merged result was never laddered)")
        if mc and git_ok("cat-file", "-e", f"{mc}^{{commit}}"):
            parents = subprocess.run(["git", "rev-parse", f"{mc}^@"], capture_output=True, text=True).stdout.split()
            if len(parents) != 2 or parents[1] != sha:
                bad.append(f"PR #{n}: {mc[:12]} is not a merge commit of the PR head (merge commits only)")
        if verify_conclusion(sha) != "success":
            bad.append(f"PR #{n}: GitHub verify did not succeed on {sha[:12]}")
    main_ref = os.environ.get("A2_MAIN_REF", "origin/main")
    start = os.environ.get("A2_MAIN_AT_KICKOFF", MAIN_AT_KICKOFF)
    merges = {pr.get("merge_commit_sha") for pr in prs}
    line = subprocess.run(["git", "rev-list", "--first-parent", f"{start}..{main_ref}"], capture_output=True, text=True)
    if line.returncode != 0:
        bad.append(f"cannot walk {main_ref} from {start[:12]}: {line.stderr.strip()[:120]}")
    for c in line.stdout.split():
        if c not in merges:
            bad.append(f"{c[:12]} is on main but is no mission PR's merge commit (a direct push)")
    if bad:
        print("[FAIL] " + "; ".join(bad))
        sys.exit(1)
    print(f"[PASS] {len(prs)} mission PR(s): each green on a merging phase at its head, up to date with main, CI green")


if __name__ == "__main__":
    main()
