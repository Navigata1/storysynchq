#!/usr/bin/env python3
"""CI gate: a registered judge cannot change in a PR without an amendment that names it
(S1b K42). GitHub runs this in the `verify` job, so the lead cannot satisfy it by writing a file.

For each of ops/mission/SHA256SUMS and ops/mission/ROOTSUMS, compare the base branch's
entries with the head's. An entry whose sha256 changed, or that was removed, passes only if
the PR's own diff of ops/mission/contract.md adds a line naming that path. New entries are
free (a judge is born registered). A base with no sums file (the PR that introduces them)
passes.

Usage (CI):  python3 ops/mission/gates/frozen.py <base-ref>      e.g. origin/main
"""
import subprocess
import sys

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
    added_lines = [l[1:] for l in git("diff", f"{base}..HEAD", "--", "ops/mission/contract.md").stdout.splitlines()
                   if l.startswith("+") and not l.startswith("+++")]
    problems = []
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
            if not any(name in l for l in added_lines):
                problems.append(f"{name} {what} with no contract amendment naming it")
    if problems:
        print("[FAIL] " + "; ".join(problems))
        sys.exit(1)
    print("[PASS] no registered judge changed without an amendment naming it")


if __name__ == "__main__":
    main()
