"""Shared helpers for the mission's runner and judges (one implementation, not four).

- The ledger is loop.py's hash-chained ops/mission/ledger.jsonl; phase runs are recorded in
  it as `phase-run` events (S1 critic K20), never in a separate unchained file.
- A merging phase is one whose plan gates include the full ladder (LADDER below); only a
  green run of a merging phase can justify a merge (S1 critic K9, K15).
- Exit code 77 means "cannot run here" (a fail-closed gate missing access the operator must
  supply). Any other non-zero exit is a real failure (S1 critic K19).
"""
import importlib.util
import json
import subprocess
from pathlib import Path

M = Path("ops/mission")
CANNOT_RUN = 77
LADDER = ("npx tsc --noEmit", "npm run lint", "python3 ops/mission/gates/registered.py",
          "python3 -m unittest ops/mission/gates/test_gates.py", "bash ops/mission/gates/e2e_prod.sh",
          "python3 ops/mission/gates/review_closed.py")


def loop():
    spec = importlib.util.spec_from_file_location("a2_loop", "protocol/scripts/loop.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def head():
    return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()


def plan():
    return json.loads((M / "plan.lock.json").read_text())


def merging_phases(plan_doc=None):
    out = set()
    for p in (plan_doc or plan())["phases"]:
        cmds = [g["command"] for g in p["gates"]]
        if all(any(c.startswith(step) for c in cmds) for step in LADDER):
            out.add(p["id"])
    return out


def phase_runs():
    """Every phase-run event in the ledger, oldest first. Refuses a broken chain."""
    lp = loop()
    if not lp.LEDGER.exists():
        return []
    ok, msg = lp.ledger_verify()
    if not ok:
        raise SystemExit(f"[FAIL] ledger {msg}")
    return [e for e in (json.loads(l) for l in lp.LEDGER.read_text().splitlines() if l.strip())
            if e.get("event") == "phase-run"]


def latest_gate_exits(at_head):
    """{gate id: exit} from the latest phase-run of each phase recorded at at_head."""
    latest = {}
    for e in phase_runs():
        if e["head"] == at_head:
            latest[e["phase"]] = e
    return {g["id"]: g["exit"] for e in latest.values() for g in e["gates"]}
