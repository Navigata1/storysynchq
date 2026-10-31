#!/usr/bin/env python3
"""Gate: a phase's review round is closed at the head under test.

Reads ops/mission/reviews/<PHASE>/dispositions.json and fails unless:
  - it names the reviewed head, and every commit after that head touches only
    ops/mission/** (paperwork recorded after the review cannot hide a code change);
  - the review transcript it cites exists and its sha256 matches the recorded one;
  - the reviewer's canary was absent (isolation held);
  - no finding is open: every High is "fixed" with a confirming probe recorded,
    and every other finding has a status of fixed, rejected or deferred with a reason.

Usage: python3 ops/mission/gates/review_closed.py P0
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ALLOWED_AFTER_REVIEW = ("ops/mission/",)
CLOSED = {"fixed", "rejected", "deferred"}


def fail(msg):
    print(f"[FAIL] {msg}")
    sys.exit(1)


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout.strip()


def main():
    if len(sys.argv) != 2:
        fail("usage: review_closed.py <PHASE>")
    phase = sys.argv[1]
    path = Path("ops/mission/reviews") / phase / "dispositions.json"
    if not path.exists():
        fail(f"{path} does not exist: no review round recorded for {phase}")
    try:
        d = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        fail(f"{path} is not valid JSON: {e}")

    reviewed = d.get("reviewedHead", "")
    if len(reviewed) != 40:
        fail("reviewedHead must be a full 40-character SHA")
    try:
        git("merge-base", "--is-ancestor", reviewed, "HEAD")
    except subprocess.CalledProcessError:
        fail(f"reviewed head {reviewed[:12]} is not an ancestor of HEAD")
    changed = [f for f in git("diff", "--name-only", reviewed, "HEAD").splitlines() if f]
    stray = [f for f in changed if not f.startswith(ALLOWED_AFTER_REVIEW)]
    if stray:
        fail(f"files changed after the reviewed head outside ops/mission/: {stray[:8]}")

    transcript = Path(d.get("transcript", ""))
    if not transcript.is_file():
        fail(f"review transcript {transcript} is missing")
    if hashlib.sha256(transcript.read_bytes()).hexdigest() != d.get("transcriptSha256"):
        fail("review transcript sha256 does not match the recorded one")
    if d.get("canaryAbsent") is not True:
        fail("isolation not proven: canaryAbsent is not true")

    findings = d.get("findings")
    if not isinstance(findings, list):
        fail("findings must be a list (empty when the reviewer found nothing)")
    open_items = []
    for f in findings:
        fid, sev, status = f.get("id", "?"), str(f.get("severity", "")).lower(), f.get("status")
        if status not in CLOSED:
            open_items.append(f"{fid} ({sev}) status={status!r}")
        elif sev == "high" and status != "fixed":
            open_items.append(f"{fid} (high) must be fixed, is {status}")
        elif sev == "high" and not f.get("confirmedBy"):
            open_items.append(f"{fid} (high) fixed but no confirming probe recorded")
        elif status in ("rejected", "deferred") and not f.get("reason"):
            open_items.append(f"{fid} {status} without a reason")
    if open_items:
        fail("open findings: " + "; ".join(open_items))

    highs = sum(1 for f in findings if str(f.get("severity", "")).lower() == "high")
    print(f"[PASS] {phase} review closed at {reviewed[:12]}: {len(findings)} findings, {highs} high, none open")


if __name__ == "__main__":
    main()
