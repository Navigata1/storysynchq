#!/usr/bin/env python3
"""Derive the evidence bundle from the mission's own records (S1 critic K10, K19, K24).

Nobody writes ops/mission/evidence/bundle.json by hand. ops/mission/claims.json (frozen with
the locks) maps each claim to the gates that prove it, or to a live command. A claim is:

  verified    every proving gate's latest phase-run at HEAD exited 0 (or the live command did)
  falsified   any run of a proving gate at HEAD exited with a code other than 0 and 77, even
              if a later rerun there passed (S1b K44)
  unverified  otherwise: never run at HEAD, or a gate exited 77 ("cannot run here")

Each claim also carries its provenance from claims.json (S1b K43): "recomputable" when anyone
can rerun its proving gates at HEAD and get the same answer, "attested" when the answer also
rests on a record nobody can recompute (a human's attestation comment, the ledger's history of
earlier heads). band.py reports the band twice: counting attested claims, and with every
attested claim held at unverified. The headline band is the second.

Phase runs come from the hash-chained ledger (a2lib.phase_runs, which refuses a broken
chain). Lanes carry each passing gate's evidence file with its sha256 recomputed; bytes that
no longer match the ledger are a finding.

Usage: python3 ops/mission/derive_bundle.py   (writes ops/mission/evidence/bundle.json)
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import a2lib  # noqa: E402

M = a2lib.M


def status(spec, exits, history):
    if "live" in spec:
        rc = subprocess.run(spec["live"], shell=True).returncode
        return "verified" if rc == 0 else "unverified" if rc == a2lib.CANNOT_RUN else "falsified"
    if any(e not in (0, a2lib.CANNOT_RUN) for g in spec["gates"] for e in history.get(g, [])):
        return "falsified"
    got = [exits.get(g) for g in spec["gates"]]
    return "verified" if got and all(e == 0 for e in got) else "unverified"


def main():
    at = a2lib.head()
    idea = json.loads((M / "idea.lock.json").read_text())
    plan = a2lib.plan()
    proves = json.loads((M / "claims.json").read_text())["proves"]
    exits = a2lib.latest_gate_exits(at)
    history = a2lib.gate_exits_history(at)

    claims = []
    for c in idea["definitionOfDone"]:
        cid = c["claim"].split(" ")[0]
        spec = proves.get(cid, {"gates": []})
        prov = spec.get("provenance")
        if prov not in ("recomputable", "attested"):
            raise SystemExit(f"[FAIL] claims.json gives {cid} no provenance (recomputable or attested)")
        claims.append({"claim": c["claim"], "status": status(spec, exits, history), "provenance": prov,
                       "evidenceRefs": spec.get("gates", [])})

    ledger = [json.loads(l) for l in a2lib.loop().LEDGER.read_text().splitlines() if l.strip()] if a2lib.loop().LEDGER.exists() else []
    gate_runs = {e["gate"]: e for e in ledger if e.get("event") == "gate-run"}
    lanes = {}
    for p in plan["phases"]:
        for g in p["gates"]:
            e = gate_runs.get(g["id"])
            if exits.get(g["id"]) != 0 or not e:
                continue
            path = Path(e["evidence"])
            sha = hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
            for lane in p["evidenceRequired"]:
                L = lanes.setdefault(lane, {"artifacts": [], "findings": []})
                if sha == e.get("evidenceSha256"):
                    L["artifacts"].append({"id": g["id"], "path": str(path), "sha256": sha, "kind": "gate-output"})
                else:
                    L["findings"].append(f"{g['id']} evidence bytes do not match the ledger")
    bundle = {"schemaVersion": "2.0", "target": f"storysynchq@{at[:12]}", "phaseId": "P6",
              "claimSurface": "ui", "claims": claims, "lanes": lanes}
    out = M / "evidence/bundle.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bundle, indent=2) + "\n")
    counts = {s: sum(1 for c in claims if c["status"] == s) for s in ("verified", "unverified", "falsified")}
    print(f"wrote {out} at {at[:12]}: {counts}")


if __name__ == "__main__":
    main()
