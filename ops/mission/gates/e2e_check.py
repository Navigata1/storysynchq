#!/usr/bin/env python3
"""Judge a Playwright JSON report (S1 critic K6).

Fails unless:
  - the report has no failed, timed-out or interrupted test;
  - every family in ops/mission/judges/required.json reached its minimum number of passing
    tests on each project (a missing or emptied judge fails, S1 critic K17);
  - every skipped test is on the registered allow-list ops/mission/judges/e2e-skips.txt
    (one "<project> › <file> › <title path>" per line). A skip that is not on the list is
    a test that silently stopped running.

Usage: python3 ops/mission/gates/e2e_check.py report.json
       python3 ops/mission/gates/e2e_check.py report.json --list-skips   (prints the skip keys)
"""
import json
import sys
from pathlib import Path

REQUIRED = Path("ops/mission/judges/required.json")
ALLOW = Path("ops/mission/judges/e2e-skips.txt")


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
    if "--list-skips" in sys.argv:
        print("\n".join(skips))
        return
    problems = []
    bad = [f"{p} › {f} › {t}" for p, f, t, s in rows if s == "unexpected"]
    if bad:
        problems.append(f"{len(bad)} failed: {bad[:5]}")
    req = json.loads(REQUIRED.read_text())
    for fam, minimum in req["families"].items():
        for proj in req["projects"]:
            n = sum(1 for p, f, t, s in rows if f.startswith(fam) and p == proj and s in ("expected", "flaky"))
            if n < minimum:
                problems.append(f"family {fam!r} on {proj}: {n} passing, needs {minimum}")
    allowed = set(ALLOW.read_text().splitlines()) if ALLOW.exists() else set()
    stray = [k for k in skips if k not in allowed]
    if stray:
        problems.append(f"{len(stray)} skip(s) not on {ALLOW}: {stray[:5]}")
    passed = sum(1 for r in rows if r[3] in ("expected", "flaky"))
    if problems:
        print("[FAIL] " + "; ".join(problems))
        sys.exit(1)
    print(f"[PASS] {passed} passed, {len(skips)} skipped (all allow-listed), every required family met its minimum")


if __name__ == "__main__":
    main()
