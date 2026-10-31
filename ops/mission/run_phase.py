#!/usr/bin/env python3
"""Run every gate of a phase fresh, at HEAD (S1 critic K3, K20).

  1. refuses unless state.json's gate ids and commands for the phase equal plan.lock.json's;
  2. resets the phase's gates to pending, so every gate runs again at this head;
  3. runs `loop.py run-gates <PHASE>` (evidence files and gate-run ledger entries);
  4. appends a `phase-run` event to the same hash-chained ledger:
     {phase, head, exit, gates: [{id, exit, evidenceSha256}]}, each gate's exit read from
     the evidence file loop.py wrote. The merge rule and the judges read this event.

Usage: python3 ops/mission/run_phase.py P0
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import a2lib  # noqa: E402

STATE = Path("ops/mission/state.json")


def gates(doc, phase):
    for p in doc.get("phases", []):
        if p.get("id") == phase:
            return p
    return None


def main():
    if len(sys.argv) != 2:
        print("usage: run_phase.py <PHASE>")
        sys.exit(64)
    phase = sys.argv[1]
    planned = gates(a2lib.plan(), phase)
    state = json.loads(STATE.read_text())
    current = gates(state, phase)
    if planned is None or current is None:
        print(f"[FAIL] phase {phase} missing from plan.lock or state.json")
        sys.exit(1)
    if [(g["id"], g["command"]) for g in planned["gates"]] != [(g["id"], g["command"]) for g in current["gates"]]:
        print(f"[FAIL] state.json gates for {phase} differ from plan.lock.json")
        sys.exit(1)
    for g in current["gates"]:
        g["status"] = "pending"
    STATE.write_text(json.dumps(state, indent=2) + "\n")

    at = a2lib.head()
    rc = subprocess.run([sys.executable, "protocol/scripts/loop.py", "run-gates", phase]).returncode
    after = gates(json.loads(STATE.read_text()), phase)
    record = []
    for g in after["gates"]:
        ev = Path(g.get("evidence", ""))
        text = ev.read_text() if ev.is_file() else ""
        m = re.search(r"^exit (-?\d+)$", text, flags=re.M)
        record.append({"id": g["id"], "exit": int(m.group(1)) if m else None,
                       "evidenceSha256": hashlib.sha256(ev.read_bytes()).hexdigest() if ev.is_file() else None})
    a2lib.loop().ledger_append({"event": "phase-run", "phase": phase, "head": at, "exit": rc, "gates": record})
    print(f"{phase} at {at[:12]}: exit {rc}; " + ", ".join(f"{g['id']}={g['exit']}" for g in record))
    sys.exit(rc)


if __name__ == "__main__":
    main()
