#!/usr/bin/env python3
"""Gate: every judge, lock and dependency of the judges matches its registered sha256, and no
judge is unregistered (S1 critic K7, K11, K16).

Two sums files, both written and verified through protocol/a2/scripts/sums.py's one parser:
  ops/mission/SHA256SUMS   rooted at ops/mission: locks, claims map, contract, judges, seat
  ops/mission/ROOTSUMS     rooted at the repo: what the judges depend on outside ops/mission
                           (playwright.config.ts, sums.py, loop.py, dogfood_lanes.py), every
                           tests/*.spec.ts and every file under tests/fixtures/ (S1b K42: the
                           existing suite is C1-C3's judge too)
Completeness: every file under ops/mission/gates/ and ops/mission/judges/, every top-level
ops/mission/*.py and *.sh, every tests/*.spec.ts, every file under tests/fixtures/ and every
.github/workflows/ file (the CI that runs the judges, S1b K52) must be
listed in one of them, and the four dependencies above must be in ROOTSUMS. An unregistered
judge fails. Changing a registered file inside a PR needs a contract amendment naming it, which
frozen.py checks in GitHub's CI (contract section 5).

Usage: python3 ops/mission/gates/registered.py
"""
import subprocess
import sys
from pathlib import Path

SUMS = "protocol/a2/scripts/sums.py"
MISSION = Path("ops/mission")
DEPENDENCIES = ("playwright.config.ts", "protocol/a2/scripts/sums.py", "protocol/scripts/loop.py",
                "protocol/scripts/dogfood_lanes.py")
EXEMPT = {"ops/mission/SHA256SUMS", "ops/mission/ROOTSUMS"}


def listed(path, prefix):
    return {prefix + line.split("  ", 1)[1] for line in path.read_text().splitlines() if "  " in line}


def main():
    problems = []
    for args in (["verify", str(MISSION / "SHA256SUMS")], ["verify", "--root", ".", str(MISSION / "ROOTSUMS")]):
        r = subprocess.run([sys.executable, SUMS, *args], capture_output=True, text=True)
        if r.returncode != 0:
            problems.append(f"{args[-1]}: {(r.stdout + r.stderr).strip().splitlines()[-1]}")
    registered = listed(MISSION / "SHA256SUMS", "ops/mission/") | listed(MISSION / "ROOTSUMS", "")
    must = {str(p) for d in ("gates", "judges") for p in (MISSION / d).rglob("*")
            if p.is_file() and "__pycache__" not in p.parts}
    must |= {str(p) for pat in ("*.py", "*.sh") for p in MISSION.glob(pat)}
    must |= {str(p) for p in Path("tests").glob("*.spec.ts")}
    must |= {str(p) for p in Path("tests/fixtures").rglob("*") if p.is_file()}
    must |= {str(p) for p in Path(".github/workflows").glob("*") if p.is_file()}  # S1b K52
    missing = sorted(must - registered - EXEMPT)
    if missing:
        problems.append(f"unregistered: {missing}")
    root = listed(MISSION / "ROOTSUMS", "")
    deps = [d for d in DEPENDENCIES if d not in root]
    if deps:
        problems.append(f"dependencies not in ROOTSUMS: {deps}")
    if problems:
        print("[FAIL] " + "; ".join(problems))
        sys.exit(1)
    print(f"[PASS] {len(registered)} registered files verified; no judge unregistered")


if __name__ == "__main__":
    main()
