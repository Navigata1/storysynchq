#!/usr/bin/env python3
"""Count Highs per review round and say whether the stop rule is met.

Input is one JSON file, or one or more dispositions files (Markdown), in round order.

JSON: a list of rounds, each {"round": "H1c", "highs": 9} or
{"round": "H1c", "findings": [{"id": "H1c-1", "severity": "high"}, ...]}. Critical and
high count as Highs; medium, low and info do not; any other severity is refused. When
both "highs" and "findings" are given they must agree.

Markdown: each file is one round. A table row whose first cell starts with a finding
id such as H1e-4 is a finding, and the id's prefix names the round. A severity in
parentheses right after the id, (Medium), (Low) or (Info), marks a non-High. An
unmarked row counts as a High, so an unreadable severity cannot make a round look
cleaner than it was.

Stop rules, frozen before the first round:
  the default: met when the latest round draws no High;
  --max-rounds N: also met, as a bounded stop, once N rounds have run; the latest
  round's open Highs must then be disclosed with their limitations.

usage: convergence.py [--max-rounds N] [--json] FILE...
exit: 0 met; 1 not met; 2 unreadable input.
"""
import argparse
import json
import re
import sys
from pathlib import Path

HIGH = {"critical", "high"}
NOT_HIGH = {"medium", "low", "info"}
FINDING_ID = re.compile(r"\s*([A-Za-z][A-Za-z0-9]*)-(\d+)\b\s*(?:\((\w+)\))?")


class InputError(Exception):
    """Input this script cannot read with confidence (exit 2)."""


def plural(n: int) -> str:
    return f"{n} High" if n == 1 else f"{n} Highs"


def _count_findings(name: str, findings) -> int:
    if not isinstance(findings, list):
        raise InputError(f"round {name}: findings must be a list")
    count = 0
    for finding in findings:
        severity = finding.get("severity") if isinstance(finding, dict) else None
        if not isinstance(severity, str):
            raise InputError(f"round {name}: a finding has no severity")
        level = severity.strip().casefold()
        if level in HIGH:
            count += 1
        elif level not in NOT_HIGH:
            raise InputError(f"round {name}: unknown severity {severity!r}")
    return count


def _json_round(item):
    if not isinstance(item, dict):
        raise InputError("every round must be an object")
    name = item.get("round")
    if not isinstance(name, str) or not name.strip():
        raise InputError("every round needs a non-empty name")
    highs, findings = item.get("highs"), item.get("findings")
    if highs is None and findings is None:
        raise InputError(f"round {name}: give highs or findings")
    if highs is not None and (isinstance(highs, bool) or not isinstance(highs, int) or highs < 0):
        raise InputError(f"round {name}: highs must be a whole number")
    counted = None if findings is None else _count_findings(name, findings)
    if highs is not None and counted is not None and highs != counted:
        raise InputError(f"round {name}: highs {highs} disagrees with {counted} High findings")
    return name, highs if highs is not None else counted


def from_json(path: str):
    try:
        data = json.loads(Path(path).read_text())
    except (OSError, ValueError) as err:
        raise InputError(f"{path}: {err}") from None
    if not isinstance(data, list) or not data:
        raise InputError(f"{path}: expected a non-empty list of rounds")
    return [_json_round(item) for item in data]


def from_markdown(path: str):
    try:
        text = Path(path).read_text()
    except OSError as err:
        raise InputError(f"{path}: {err}") from None
    prefixes, rows, highs = set(), 0, 0
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        match = FINDING_ID.match(stripped[1:].split("|", 1)[0])
        if not match:
            continue
        rows += 1
        prefixes.add(match.group(1))
        if (match.group(3) or "").casefold() not in NOT_HIGH:
            highs += 1
    if rows == 0:
        raise InputError(f"{path}: no finding rows; give a round without findings in JSON")
    if len(prefixes) != 1:
        raise InputError(f"{path}: rows from more than one round: {', '.join(sorted(prefixes))}")
    return [(prefixes.pop(), highs)]


def load(paths):
    if len(paths) == 1 and paths[0].endswith(".json"):
        rounds = from_json(paths[0])
    elif any(p.endswith(".json") for p in paths):
        raise InputError("give one JSON file, or dispositions files only")
    else:
        rounds = [r for p in paths for r in from_markdown(p)]
    names = [name for name, _ in rounds]
    if len(set(names)) != len(names):
        raise InputError("a round name appears twice")
    return rounds


def evaluate(rounds, max_rounds):
    name, latest = rounds[-1]
    if latest == 0:
        return True, f"stop rule met: {name} drew no High"
    if max_rounds and len(rounds) >= max_rounds:
        return True, (f"stop rule met as a bounded stop after {len(rounds)} rounds: disclose "
                      f"{name}'s {latest} open {'High' if latest == 1 else 'Highs'} with their limitations")
    return False, f"stop rule not met: {name} drew {plural(latest)}"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--max-rounds", type=int, default=0)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("files", nargs="+")
    args = ap.parse_args(argv)
    try:
        if args.max_rounds < 0:
            raise InputError("--max-rounds must not be negative")
        rounds = load(args.files)
    except InputError as err:
        print(f"convergence.py: {err}", file=sys.stderr)
        return 2
    met, reason = evaluate(rounds, args.max_rounds)
    rule = "no High in the latest round"
    if args.max_rounds:
        rule += f", or a bounded stop at {args.max_rounds} rounds"
    if args.json:
        print(json.dumps({"rounds": [{"round": n, "highs": h} for n, h in rounds],
                          "rule": rule, "met": met, "reason": reason}, indent=2))
    else:
        for n, h in rounds:
            print(f"round {n}: {plural(h)}")
        print("trend: " + " -> ".join(str(h) for _, h in rounds))
        print(f"{reason} (rule: {rule})")
    return 0 if met else 1


if __name__ == "__main__":
    sys.exit(main())
