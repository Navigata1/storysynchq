#!/usr/bin/env python3
"""Gate: a human attestation is on file.

Some claims rest on acts only the human can perform or observe (applying Supabase
migrations, reading production's schema). This gate passes only when
ops/mission/hitl/<NAME>.json exists, names who attested and when, and lists what was
attested. The lead never writes these files; a lead-written attestation is a
falsified claim.

Usage: python3 ops/mission/gates/hitl.py cloud-schema
"""
import json
import sys
from pathlib import Path

REQUIRED = ("attestedBy", "attestedAt", "statements")


def main():
    if len(sys.argv) != 2:
        print("[FAIL] usage: hitl.py <NAME>")
        sys.exit(1)
    path = Path("ops/mission/hitl") / f"{sys.argv[1]}.json"
    if not path.exists():
        print(f"[FAIL] no human attestation at {path} (waiting on the operator)")
        sys.exit(1)
    d = json.loads(path.read_text())
    missing = [k for k in REQUIRED if not d.get(k)]
    if missing:
        print(f"[FAIL] {path} lacks {missing}")
        sys.exit(1)
    if str(d["attestedBy"]).lower().startswith("claude"):
        print(f"[FAIL] {path} is attested by the lead, not the human")
        sys.exit(1)
    print(f"[PASS] {path}: attested by {d['attestedBy']} at {d['attestedAt']} ({len(d['statements'])} statements)")


if __name__ == "__main__":
    main()
