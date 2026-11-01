#!/usr/bin/env python3
"""Gate: a phase's review rounds are closed at the head under test.

Each round lives in ops/mission/reviews/<PHASE>/round<N>/ and holds the seat's own
output (transcript.md, seat.json, preflight.txt, all written by seat.sh) plus the
lead's dispositions.json. The gate judges the seat's output, not the lead's copy of it
(S1 critic K1, K2):

  - seat.json's head equals dispositions.reviewedHead, its transcriptSha256 matches
    transcript.md, and its canaryAbsent is true (K13);
  - the transcript's last fenced json block is a completed review (verdict approve,
    amend or ready) that lists the files it read;
  - every finding in every round's transcript appears in that round's dispositions,
    at a severity no lower than the seat gave, with a closed status (fixed, rejected or
    deferred, the last two with a reason) (K2);
  - stop rule (contract section 3, K8): the latest round finds no High, its "prior" map
    confirms every High from every earlier round, and there are at most 3 rounds;
  - after the reviewed head only ops/mission/reviews/** and ops/mission/evidence/** may
    change (K7): a judge, a lock or the contract changed after review voids the round. Once the
    phase has merged (the reviewed head is in main), the check runs up to the head of the PR
    that merged it, not HEAD, so later phases' work does not void it (S1b K47);
  - each round's prompt.md equals render_prompt.py's rendering of the registered template for
    that phase, round, reviewedHead and base (K22);
  - finding ids are unique across the phase's rounds, and a finding raised in the last round
    can only be rejected or deferred with a reason, since no code may change after it (K21);
  - each round's diff base is the one seat.sh recorded: the merge-base of main's tip at review
    time (seat.json mainAtReview, which must be in main's history: A2_MAIN_REF, default
    origin/main) and the reviewed head, so the seat saw the whole phase (S1b K31, K47);
  - every judge in judges/order.json, of any phase, that is registered (SHA256SUMS or ROOTSUMS)
    within base..reviewedHead is registered in a commit that precedes every src/ change there,
    and this phase's own judges must be registered by then (S1b K40, K46).

Usage: python3 ops/mission/gates/review_closed.py P0
"""
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ALLOWED_AFTER_REVIEW = ("ops/mission/reviews/", "ops/mission/evidence/")
CLOSED = {"fixed", "rejected", "deferred"}
DONE = {"approve", "amend", "ready"}
RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}
MAX_ROUNDS = 3


def fail(msg):
    print(f"[FAIL] {msg}")
    sys.exit(1)


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout.strip()


def ancestor(a, b):
    return subprocess.run(["git", "merge-base", "--is-ancestor", a, b], capture_output=True).returncode == 0


def pr_head(reviewed, main_ref):
    """Where after-review drift is judged up to (S1b K47): HEAD while the phase is unmerged;
    once the reviewed head is in main, the head of the PR that merged it (the second parent of
    the first merge on main's first-parent line that brought it in)."""
    if not ancestor(reviewed, main_ref):
        return "HEAD"
    line = git("rev-list", "--first-parent", "--ancestry-path", "--reverse", f"{reviewed}..{main_ref}").split()
    if not line:
        return reviewed
    parents = git("rev-parse", f"{line[0]}^@").split()
    if ancestor(reviewed, parents[0]) or len(parents) < 2:
        return reviewed
    return parents[1]


def last_json_block(text):
    blocks = re.findall(r"```(?:json)?\s*\n(.*?)\n```", text, flags=re.S)
    for raw in reversed(blocks):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            continue
    return None


def load_round(rdir, phase, n):
    disp_path, seat_path, tr_path = rdir / "dispositions.json", rdir / "seat.json", rdir / "transcript.md"
    for p in (disp_path, seat_path, tr_path, rdir / "prompt.md"):
        if not p.is_file():
            fail(f"{rdir.name}: {p.name} is missing")
    try:
        disp = json.loads(disp_path.read_text())
        seat = json.loads(seat_path.read_text())
    except json.JSONDecodeError as e:
        fail(f"{rdir.name}: unreadable json: {e}")
    tr_bytes = tr_path.read_bytes()
    if hashlib.sha256(tr_bytes).hexdigest() != seat.get("transcriptSha256"):
        fail(f"{rdir.name}: transcript.md does not match seat.json's transcriptSha256")
    if seat.get("canaryAbsent") is not True:
        fail(f"{rdir.name}: isolation not proven (seat.json canaryAbsent is not true)")
    if seat.get("head") != disp.get("reviewedHead"):
        fail(f"{rdir.name}: seat reviewed {seat.get('head')!r} but dispositions name {disp.get('reviewedHead')!r}")
    import render_prompt  # the renderer lives beside this gate's package
    if not disp.get("base"):
        fail(f"{rdir.name}: dispositions name no diff base")
    main_ref = os.environ.get("A2_MAIN_REF", "origin/main")
    at_review = seat.get("mainAtReview")
    if not at_review or not ancestor(at_review, main_ref):
        fail(f"{rdir.name}: seat.json mainAtReview {str(at_review)[:12]!r} is not in {main_ref}'s history")
    try:
        expected_base = git("merge-base", at_review, disp["reviewedHead"])
    except subprocess.CalledProcessError:
        fail(f"{rdir.name}: cannot compute merge-base of main at review and the reviewed head")
    if disp["base"] != expected_base or seat.get("base") != expected_base:
        fail(f"{rdir.name}: diff base {disp['base'][:12]} (seat {str(seat.get('base'))[:12]}) is not "
             f"merge-base(main at review, head) {expected_base[:12]}")
    if (rdir / "prompt.md").read_text() != render_prompt.render(phase, n, disp["reviewedHead"], disp["base"]):
        fail(f"{rdir.name}: prompt.md is not the registered template rendered for this round")
    verdict = last_json_block(tr_bytes.decode("utf-8", "replace"))
    if not isinstance(verdict, dict):
        fail(f"{rdir.name}: the transcript ends in no parseable json verdict")
    if verdict.get("verdict") not in DONE:
        fail(f"{rdir.name}: seat verdict {verdict.get('verdict')!r} is not a completed review")
    if not verdict.get("filesRead"):
        fail(f"{rdir.name}: the seat's verdict lists no files read")
    return disp, verdict


def check_dispositions(name, disp, verdict):
    mine = {f.get("id"): f for f in disp.get("findings", []) if isinstance(f, dict)}
    problems = []
    for sf in verdict.get("findings", []):
        fid, sev = sf.get("id"), str(sf.get("severity", "")).lower()
        df = mine.get(fid)
        if df is None:
            problems.append(f"{name}/{fid} has no disposition")
            continue
        if RANK.get(str(df.get("severity", "")).lower(), -1) < RANK.get(sev, 0):
            problems.append(f"{name}/{fid} downgraded from {sev} to {df.get('severity')}")
        status = df.get("status")
        if status not in CLOSED:
            problems.append(f"{name}/{fid} status={status!r}")
        elif status in ("rejected", "deferred") and not df.get("reason"):
            problems.append(f"{name}/{fid} {status} without a reason")
    return problems


def main():
    if len(sys.argv) != 2:
        fail("usage: review_closed.py <PHASE>")
    phase = sys.argv[1]
    base = Path("ops/mission/reviews") / phase
    rounds = sorted((p for p in base.glob("round*") if p.is_dir() and p.name[5:].isdigit()), key=lambda p: int(p.name[5:]))
    if not rounds:
        fail(f"no review round recorded under {base}")
    if [int(p.name[5:]) for p in rounds] != list(range(1, len(rounds) + 1)):
        fail(f"rounds must be numbered round1..roundN without gaps: {[p.name for p in rounds]}")
    if len(rounds) > MAX_ROUNDS:
        fail(f"{len(rounds)} rounds exceeds the stop rule's {MAX_ROUNDS}: the phase does not merge")

    loaded = [(p.name, *load_round(p, phase, i + 1)) for i, p in enumerate(rounds)]
    problems = []
    seen = {}
    for name, _, verdict in loaded:
        for f in verdict.get("findings", []):
            if f.get("id") in seen:
                problems.append(f"finding id {f.get('id')} repeats ({seen[f.get('id')]} and {name})")
            seen[f.get("id")] = name
    for name, disp, verdict in loaded:
        problems += check_dispositions(name, disp, verdict)

    last_name, last_disp, last_verdict = loaded[-1]
    mine = {f.get("id"): f for f in last_disp.get("findings", [])}
    for f in last_verdict.get("findings", []):
        if (mine.get(f.get("id")) or {}).get("status") == "fixed":
            problems.append(f"{last_name}/{f.get('id')} marked fixed in the last round, where no code may change")
    last_highs = [f.get("id") for f in last_verdict.get("findings", []) if str(f.get("severity", "")).lower() in ("high", "critical")]
    if last_highs:
        problems.append(f"{last_name} found High {last_highs}: another round must confirm the repairs")
    prior = last_verdict.get("prior", {}) or {}
    for name, _, verdict in loaded[:-1]:
        for f in verdict.get("findings", []):
            if str(f.get("severity", "")).lower() in ("high", "critical") and prior.get(f.get("id")) != "confirmed":
                problems.append(f"{name}/{f.get('id')} (high) not confirmed fixed by {last_name}")
    if problems:
        fail("open: " + "; ".join(problems))

    order_file = Path("ops/mission/judges/order.json")
    order = json.loads(order_file.read_text()) if order_file.exists() else {}
    judges = [(ph, j) for ph, js in order.items() if isinstance(js, list) for j in js]
    base = last_disp["base"]
    for owner, judge in judges:
        sums = ["ops/mission/ROOTSUMS", "ops/mission/SHA256SUMS"]
        key = judge if judge.startswith("tests/") else judge[len("ops/mission/"):]
        def registered_at(c):
            for f in sums:
                r = subprocess.run(["git", "show", f"{c}:{f}"], capture_output=True, text=True)
                if r.returncode == 0 and any(l.endswith("  " + key) for l in r.stdout.splitlines()):
                    return True
            return False
        if registered_at(base):
            continue
        reg = next((c for c in git("log", "--reverse", "--format=%H", f"{base}..{last_disp['reviewedHead']}", "--", *sums).split()
                    if registered_at(c)), None)
        if not reg:
            if owner == phase:
                problems.append(f"judge {judge} was never registered in {phase}'s range")
            continue  # another phase's judge that has not landed yet
        for c in git("log", "--format=%H", f"{base}..{last_disp['reviewedHead']}", "--", "src").split():
            if c == reg or subprocess.run(["git", "merge-base", "--is-ancestor", reg, c]).returncode != 0:
                problems.append(f"src change {c[:12]} is not after judge {judge} was registered ({reg[:12]})")
    if problems:
        fail("open: " + "; ".join(problems))

    reviewed = last_disp["reviewedHead"]
    if not ancestor(reviewed, "HEAD"):
        fail(f"reviewed head {reviewed[:12]} is not an ancestor of HEAD")
    end = pr_head(reviewed, os.environ.get("A2_MAIN_REF", "origin/main"))
    changed = [f for f in git("diff", "--name-only", reviewed, end).splitlines() if f]
    stray = [f for f in changed if not f.startswith(ALLOWED_AFTER_REVIEW)]
    if stray:
        fail(f"changed after the reviewed head outside reviews/ and evidence/: {stray[:8]}")

    total = sum(len(v.get("findings", [])) for _, _, v in loaded)
    print(f"[PASS] {phase}: {len(rounds)} round(s) closed at {reviewed[:12]}, {total} findings, none open")


if __name__ == "__main__":
    main()
