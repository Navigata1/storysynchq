#!/usr/bin/env python3
"""Gate: the band the mission reports is the band its evidence computes (S1 critic K10).

dogfood_lanes.py exits 0 only at band 5, so it cannot be a gate for a mission whose honest
ceiling is lower. This gate derives the bundle (derive_bundle.py), computes the band with
dogfood_lanes.compute, and passes only if ops/mission/governance.md declares exactly that
band on a line "Band: N/5". Reporting a higher band than the evidence computes fails, and so
does reporting a lower one.

Provenance (S1b K43): claims whose evidence rests on a record nobody can recompute are marked
"attested" in the bundle. The band is computed twice: with them as derived, and with every
attested claim held at unverified. governance.md must declare both, on the lines
"Band: N/5" (the strict band, the headline) and "Band counting attested claims: M/5".

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
    bundle = json.loads((M / "evidence/bundle.json").read_text())
    loose, loose_notes = lanes.compute(bundle)
    strict_bundle = json.loads(json.dumps(bundle))
    for c in strict_bundle["claims"]:
        if c.get("provenance") == "attested" and c["status"] == "verified":
            c["status"] = "unverified"
    band, notes = lanes.compute(strict_bundle)
    gov = M / "governance.md"
    text = gov.read_text() if gov.exists() else ""
    m = re.search(r"^Band:\s*(\d)/5\s*$", text, flags=re.M)
    m2 = re.search(r"^Band counting attested claims:\s*(\d)/5\s*$", text, flags=re.M)
    if not m or not m2:
        print(f"[FAIL] {gov} must declare 'Band: N/5' and 'Band counting attested claims: M/5' "
              f"(computed {band}/5 strict: {'; '.join(notes)}; {loose}/5 counting attested)")
        sys.exit(1)
    if int(m.group(1)) != band or int(m2.group(1)) != loose:
        print(f"[FAIL] governance declares {m.group(1)}/5 and {m2.group(1)}/5 but the evidence computes "
              f"{band}/5 strict ({'; '.join(notes)}) and {loose}/5 counting attested ({'; '.join(loose_notes)})")
        sys.exit(1)
    print(f"[PASS] declared bands equal the computed bands: {band}/5 strict ({'; '.join(notes)}), "
          f"{loose}/5 counting attested")


if __name__ == "__main__":
    main()
