#!/usr/bin/env python3
"""Derive the evidence bundle from the mission's own records (S1 critic K10).

Nobody writes ops/mission/evidence/bundle.json by hand. A claim's status comes from
ops/mission/claims.json, which names the phases that prove each claim (frozen with the
locks), and from ops/mission/evidence/phase-runs.jsonl (written by run_phase.py):

  verified    every proving phase's latest run is at HEAD with exit 0
  unverified  otherwise (never run, run at an older head, or failing)

Lanes take the evidence files the ledger recorded for each proving gate, with their
sha256 recomputed from disk; a file whose bytes no longer match the ledger is a finding.

Usage: python3 ops/mission/derive_bundle.py   (writes ops/mission/evidence/bundle.json)
"""
import hashlib
import json
import subprocess
from pathlib import Path

M = Path("ops/mission")
LANE_OF = {"static": "static", "runtime-journey": "runtime-journey", "visual": "visual",
           "recording": "recording", "resilience": "resilience"}


def main():
    head = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    idea = json.loads((M / "idea.lock.json").read_text())
    plan = json.loads((M / "plan.lock.json").read_text())
    proves = json.loads((M / "claims.json").read_text())["proves"]
    runs = {}
    rp = M / "evidence/phase-runs.jsonl"
    for line in (rp.read_text().splitlines() if rp.exists() else []):
        r = json.loads(line)
        runs[r["phase"]] = r
    ledger = [json.loads(l) for l in (M / "ledger.jsonl").read_text().splitlines()] if (M / "ledger.jsonl").exists() else []
    latest_ev = {}
    for e in ledger:
        if e.get("event") == "gate-run":
            latest_ev[e["gate"]] = e

    claims = []
    for c in idea["definitionOfDone"]:
        cid = c["claim"].split(" ")[0]
        phases = proves.get(cid, [])
        ok = bool(phases) and all(runs.get(p, {}).get("head") == head and runs.get(p, {}).get("exit") == 0 for p in phases)
        claims.append({"claim": c["claim"], "status": "verified" if ok else "unverified",
                       "evidenceRefs": [g["id"] for p in plan["phases"] if p["id"] in phases for g in p["gates"]]})

    lanes = {}
    for p in plan["phases"]:
        for g in p["gates"]:
            e = latest_ev.get(g["id"])
            if not e or e.get("status") != "passed":
                continue
            path = Path(e["evidence"])
            sha = hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
            for lane in p["evidenceRequired"]:
                L = lanes.setdefault(LANE_OF[lane], {"artifacts": [], "findings": []})
                if sha == e.get("evidenceSha256"):
                    L["artifacts"].append({"id": g["id"], "path": str(path), "sha256": sha, "kind": "gate-output"})
                else:
                    L["findings"].append(f"{g['id']} evidence bytes do not match the ledger")
    bundle = {"schemaVersion": "2.0", "target": f"storysynchq@{head[:12]}", "phaseId": "P6",
              "claimSurface": "ui", "claims": claims, "lanes": lanes}
    out = M / "evidence/bundle.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bundle, indent=2) + "\n")
    v = sum(1 for c in claims if c["status"] == "verified")
    print(f"wrote {out}: {v}/{len(claims)} claims verified at {head[:12]}")


if __name__ == "__main__":
    main()
