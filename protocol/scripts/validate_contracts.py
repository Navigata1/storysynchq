#!/usr/bin/env python3
"""ARCHIPELAGO P1 gate-contract validator.
Usage:
  python3 scripts/validate_contracts.py                 # validate schemas + bundled examples
  python3 scripts/validate_contracts.py <artifact.json> # validate one artifact (schema auto-detected by filename)
Exit nonzero on any failure — suitable as a mission-control gate command (shell-agnostic, no &&).
"""
import json, sys
from pathlib import Path
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
MAP = {
    "idea.lock": "idea.lock.schema.json",
    "plan.lock": "plan.lock.schema.json",
    "build-instantiation-brief": "build-instantiation-brief.schema.json",
    "evidence-bundle": "evidence-bundle.schema.json",
    "bundle": "evidence-bundle.schema.json",
    "state.extension": "state.extension.schema.json",
    "state": "state.extension.schema.json",
}

def schema_for(path: Path):
    for key, s in MAP.items():
        if key in path.name:
            return json.loads((ROOT / "schemas" / s).read_text())
    sys.exit(f"no schema mapping for {path.name}")

def check(schema, inst, label):
    Draft202012Validator.check_schema(schema)
    errs = list(Draft202012Validator(schema).iter_errors(inst))
    if errs:
        print(f"[FAIL] {label}")
        for e in errs:
            print(f"   - {'/'.join(map(str, e.path)) or '<root>'}: {e.message}")
        return False
    print(f"[PASS] {label}")
    return True

if len(sys.argv) > 1:
    p = Path(sys.argv[1])
    ok = check(schema_for(p), json.loads(p.read_text()), p.name)
    sys.exit(0 if ok else 1)

ok = True
for ex in sorted((ROOT / "examples").glob("*.json")):
    ok &= check(schema_for(ex), json.loads(ex.read_text()), f"examples/{ex.name}")
sys.exit(0 if ok else 1)
