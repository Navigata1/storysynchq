#!/usr/bin/env python3
"""Judge a Playwright JSON report (S1 critic K6).

Fails unless:
  - the report has no failed, timed-out or interrupted test;
  - every family in ops/mission/judges/required.json reached its minimum number of passing
    tests on each project (a missing or emptied judge fails, S1 critic K17);
  - every skipped test is on the registered allow-list ops/mission/judges/e2e-skips.txt
    (one "<project> › <file> › <title path>" per line). A skip that is not on the list is
    a test that silently stopped running.

Usage: python3 ops/mission/gates/e2e_check.py report.json [--required FILE ...] [--skips FILE] [--present FILE]
       python3 ops/mission/gates/e2e_check.py report.json --list-skips | --list-passed
  --required  family minimums (default judges/required.json); several files merge. A family
              maps to a number (each project) or to {project: minimum} (S1b K25).
  --skips     allow-listed skips; without it, any skip fails (S1b K32).
  --present   registered test keys that must each pass or be an allowed skip, so a deleted or
              renamed test fails the gate (S1b K26).
"""
import json
import sys
from pathlib import Path

def opt(name, default=None, many=False):
    vals = [sys.argv[i + 1] for i, a in enumerate(sys.argv[:-1]) if a == name]
    return vals if many else (vals[-1] if vals else default)


def walk(suite, trail):
    for child in suite.get("suites", []) or []:
        yield from walk(child, trail + [child.get("title", "")])
    for spec in suite.get("specs", []) or []:
        for test in spec.get("tests", []) or []:
            yield trail + [spec.get("title", "")], spec.get("file", ""), test


def results(report):
    for top in report.get("suites", []):
        for trail, file, test in walk(top, []):
            file = file or top.get("file", "") or top.get("title", "")
            project = test.get("projectName", "")
            status = test.get("status")  # expected | unexpected | flaky | skipped
            titles = [t for t in trail if t and t != file]
            yield project, Path(file).name, " › ".join(titles), status


def main():
    if len(sys.argv) < 2:
        print("[FAIL] usage: e2e_check.py report.json [--list-skips]")
        sys.exit(1)
    report = json.loads(Path(sys.argv[1]).read_text())
    rows = list(results(report))
    skips = sorted({f"{p} › {f} › {t}" for p, f, t, s in rows if s == "skipped"})
    passed_keys = {f"{p} › {f} › {t}" for p, f, t, s in rows if s in ("expected", "flaky")}
    if "--list-skips" in sys.argv:
        print("\n".join(skips))
        return
    if "--list-passed" in sys.argv:
        print("\n".join(sorted(passed_keys)))
        return
    problems = []
    bad = [f"{p} › {f} › {t}" for p, f, t, s in rows if s == "unexpected"]
    if bad:
        problems.append(f"{len(bad)} failed: {bad[:5]}")
    for rf in opt("--required", many=True) or ["ops/mission/judges/required.json"]:
        req = json.loads(Path(rf).read_text())
        for fam, minimum in req["families"].items():
            mins = minimum if isinstance(minimum, dict) else {proj: minimum for proj in req["projects"]}
            for proj, need in mins.items():
                n = sum(1 for p, f, t, s in rows if f.startswith(fam) and p == proj and s in ("expected", "flaky"))
                if n < need:
                    problems.append(f"family {fam!r} on {proj}: {n} passing, needs {need}")
    skip_file = opt("--skips")
    allowed = set(Path(skip_file).read_text().splitlines()) if skip_file else set()
    stray = [k for k in skips if k not in allowed]
    if stray:
        problems.append(f"{len(stray)} skip(s) not allowed: {stray[:5]}")
    present = opt("--present")
    if present:
        gone = [k for k in Path(present).read_text().splitlines() if k and k not in passed_keys and k not in allowed]
        if gone:
            problems.append(f"{len(gone)} registered test(s) did not pass: {gone[:5]}")
    passed = sum(1 for r in rows if r[3] in ("expected", "flaky"))
    if problems:
        print("[FAIL] " + "; ".join(problems))
        sys.exit(1)
    print(f"[PASS] {passed} passed, {len(skips)} skipped (all allow-listed), every required family met its minimum")


if __name__ == "__main__":
    main()
