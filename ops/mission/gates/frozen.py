#!/usr/bin/env python3
"""CI gate: a registered judge cannot change in a PR without an amendment that names it
(S1b K42). GitHub runs this in the `verify` job, so the lead cannot satisfy it by writing a file.

For each of ops/mission/SHA256SUMS and ops/mission/ROOTSUMS, compare the base branch's
entries with the head's. An entry whose sha256 changed, or that was removed, passes only if
the PR appends to ops/mission/contract.md an amendment section, a heading
"### A<n> · <date> · <title>" numbered after the base's last one, whose text names that path
(S1b K53). The contract is append-only: the head's file must begin with the base's file byte
for byte, and what is appended must begin with such a heading. New entries are free (a judge
is born registered). A base with no sums file (the PR that introduces them) passes.

Usage (CI):  python3 ops/mission/gates/frozen.py <base-ref>      e.g. origin/main
"""
import re
import subprocess
import sys

CONTRACT = "ops/mission/contract.md"
HEADING = re.compile(r"^### A(\d+) · \d{4}-\d{2}-\d{2} · .+$", re.M)

SUMS = {"ops/mission/SHA256SUMS": "ops/mission/", "ops/mission/ROOTSUMS": ""}


def git(*a, check=True):
    r = subprocess.run(["git", *a], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise SystemExit(f"[FAIL] git {' '.join(a)}: {r.stderr.strip()[:200]}")
    return r


def entries(text, prefix):
    out = {}
    for line in text.splitlines():
        if "  " in line:
            digest, name = line.split("  ", 1)
            out[prefix + name] = digest
    return out


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(64)
    base = git("merge-base", sys.argv[1], "HEAD").stdout.strip()
    problems = []
    was = git("show", f"{base}:{CONTRACT}", check=False)
    now = git("show", f"HEAD:{CONTRACT}", check=False)
    before = was.stdout if was.returncode == 0 else ""
    after = now.stdout if now.returncode == 0 else ""
    amended = ""
    if was.returncode == 0:
        if not after.startswith(before):
            problems.append(f"{CONTRACT} was edited, not appended to: amendments only add text at its end")
        else:
            appended = after[len(before):]
            last = max([int(n) for n in HEADING.findall(before)] or [-1])
            if appended.strip():
                first = HEADING.search(appended)
                if not first or appended[:first.start()].strip():
                    problems.append(f"text appended to {CONTRACT} does not begin with an '### A<n> · <date> · <title>' heading")
                elif any(int(n) <= last for n in HEADING.findall(appended)):
                    problems.append(f"an appended amendment reuses a number at or below A{last}")
                else:
                    amended = appended
    for path, prefix in SUMS.items():
        before = git("show", f"{base}:{path}", check=False)
        if before.returncode != 0:
            continue
        old = entries(before.stdout, prefix)
        now = git("show", f"HEAD:{path}", check=False)
        new = entries(now.stdout, prefix) if now.returncode == 0 else {}
        for name, digest in old.items():
            if new.get(name) == digest:
                continue
            what = "removed" if name not in new else "changed"
            if name not in amended:
                problems.append(f"{name} {what} with no contract amendment naming it")
    if problems:
        print("[FAIL] " + "; ".join(problems))
        sys.exit(1)
    print("[PASS] no registered judge changed without an amendment naming it")


if __name__ == "__main__":
    main()
