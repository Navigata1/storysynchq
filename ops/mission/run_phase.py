#!/usr/bin/env python3
"""Run every gate of a phase fresh, at HEAD (S1 critic K3).

The vendored loop.py skips a gate already marked passed, and reads its gates from
state.json. This wrapper:
  1. refuses unless state.json's gate ids and commands for the phase equal plan.lock.json's;
  2. resets the phase's gates to pending, so every gate runs again at this head;
  3. runs `loop.py run-gates <PHASE>` (which writes the evidence and the ledger entries);
  4. appends {phase, head, exit, at} to ops/mission/evidence/phase-runs.jsonl.

The merge rule (contract section 2) reads phase-runs.jsonl: the phase's latest run must be
at the PR head with exit 0.

Usage: python3 ops/mission/run_phase.py P0
"""
import json
import subprocess
import sys
import time
from pathlib import Path

PLAN = Path("ops/mission/plan.lock.json")
STATE = Path("ops/mission/state.json")
RUNS = Path("ops/mission/evidence/phase-runs.jsonl")


def gates(doc, phase):
    for p in doc.get("phases", []):
        if p.get("id") == phase:
            return [(g["id"], g["command"]) for g in p.get("gates", [])], p
    return None, None


def main():
    if len(sys.argv) != 2:
        print("usage: run_phase.py <PHASE>")
        sys.exit(64)
    phase = sys.argv[1]
    plan_gates, _ = gates(json.loads(PLAN.read_text()), phase)
    state = json.loads(STATE.read_text())
    state_gates, state_phase = gates(state, phase)
    if plan_gates is None or state_gates is None:
        print(f"[FAIL] phase {phase} missing from plan.lock or state.json")
        sys.exit(1)
    if plan_gates != state_gates:
        print(f"[FAIL] state.json gates for {phase} differ from plan.lock.json")
        sys.exit(1)
    for g in state_phase["gates"]:
        g["status"] = "pending"
    STATE.write_text(json.dumps(state, indent=2) + "\n")

    head = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    rc = subprocess.run([sys.executable, "protocol/scripts/loop.py", "run-gates", phase]).returncode
    RUNS.parent.mkdir(parents=True, exist_ok=True)
    with RUNS.open("a") as f:
        f.write(json.dumps({"phase": phase, "head": head, "exit": rc,
                            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}) + "\n")
    print(f"{phase} at {head[:12]}: exit {rc}")
    sys.exit(rc)


if __name__ == "__main__":
    main()
