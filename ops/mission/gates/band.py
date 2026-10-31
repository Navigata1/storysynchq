#!/usr/bin/env python3
"""Gate: the band the mission reports is the band its evidence computes (S1 critic K10).

dogfood_lanes.py exits 0 only at band 5, so it cannot be a gate for a mission whose honest
ceiling is lower. This gate derives the bundle (derive_bundle.py), computes the band with
dogfood_lanes.compute, and passes only if ops/mission/governance.md declares exactly that
band on a line "Band: N/5". Reporting a higher band than the evidence computes fails, and so
does reporting a lower one.

Usage: python3 ops/mission/gates/band.py
"""
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

M = Path("ops/mission")


def main():
    if subprocess.run([sys.executable, str(Path(__file__).resolve().parents[1] / "derive_bundle.py")]).returncode != 0:
        print("[FAIL] could not derive the bundle")
        sys.exit(1)
    spec = importlib.util.spec_from_file_location("dogfood_lanes", "protocol/scripts/dogfood_lanes.py")
    lanes = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(lanes)
    band, notes = lanes.compute(json.loads((M / "evidence/bundle.json").read_text()))
    gov = M / "governance.md"
    m = re.search(r"^Band:\s*(\d)/5\s*$", gov.read_text(), flags=re.M) if gov.exists() else None
    if not m:
        print(f"[FAIL] {gov} declares no 'Band: N/5' line (computed {band}/5: {'; '.join(notes)})")
        sys.exit(1)
    declared = int(m.group(1))
    if declared != band:
        print(f"[FAIL] governance declares {declared}/5 but the evidence computes {band}/5: {'; '.join(notes)}")
        sys.exit(1)
    print(f"[PASS] declared band {declared}/5 equals the computed band ({'; '.join(notes)})")


if __name__ == "__main__":
    main()
