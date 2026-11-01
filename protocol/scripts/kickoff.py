#!/usr/bin/env python3
"""ARCHIPELAGO P3 — kickoff.

Consumes idea.lock.json + plan.lock.json and writes a mission-control-compatible
ops/mission/state.json with the additive `archipelago` block. A copy, not a translation:
plan.lock phases[] map 1:1 onto mission-control's phases[] shape (state-schema.md v1).

Usage:
  python3 scripts/kickoff.py --idea ops/mission/idea.lock.json --plan ops/mission/plan.lock.json \
      --repo Navigata1/archipelago --repo-path . --out ops/mission/state.json
Refuses to overwrite an existing state.json (missions are durable; use loop.py to advance).
"""
import argparse, json, sys, time
from pathlib import Path

def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--idea", required=True)
    ap.add_argument("--plan", required=True)
    ap.add_argument("--repo", required=True)
    ap.add_argument("--repo-path", default=".")
    ap.add_argument("--out", default="ops/mission/state.json")
    args = ap.parse_args()

    out = Path(args.out)
    if out.exists():
        sys.exit(f"refusing to overwrite existing mission state: {out} (the repo is the memory)")
    idea = json.loads(Path(args.idea).read_text())
    plan = json.loads(Path(args.plan).read_text())
    if plan["ideaLock"] != idea["id"]:
        sys.exit(f"plan.lock governs '{plan['ideaLock']}' but idea.lock is '{idea['id']}' — G1 refuses")
    if plan["verdict"]["nbcli"] not in ("ready", "warning"):
        sys.exit("plan verdict is blocked — G1 refuses")

    phases = []
    for p in plan["phases"]:
        phases.append({
            "id": p["id"], "title": p["title"], "goal": p["goal"],
            "status": "pending", "sessionsEstimate": p.get("sessionsEstimate", ""),
            "gates": [{"id": g["id"], "title": g["title"], "command": g["command"],
                       "status": "pending", "evidence": None, "lastRun": None, "notes": ""}
                      for g in p["gates"]],
            "tasks": [],
        })
    state = {
        "version": 1,
        "mission": {
            "name": idea["id"], "tagline": idea["problem"]["statement"][:120],
            "repo": args.repo, "repoPath": args.repo_path, "defaultBranch": "main",
            "planDoc": plan.get("planDoc", ""), "northStar": "; ".join(idea["problem"]["successCriteria"]),
            "status": "active", "started": now()[:10], "updated": now(), "sessionCount": 1,
        },
        "policies": {"merge": "review", "branchPrefix": "mission/", "maxPrLines": 400,
                     "notes": "review until dogfood band 5 is routine; then auto."},
        "phases": phases,
        "metrics": [{"label": "Definition-of-done claims verified",
                     "baseline": "0", "current": "0",
                     "target": str(len(idea["definitionOfDone"])), "direction": "up"}],
        "risks": [{"title": idea["confidence"]["biggestRisk"], "severity": "medium",
                   "note": f"from idea.lock (confidence {idea['confidence']['score']}/10)"}],
        "prLog": [],
        "resume": {"activePhase": phases[0]["id"] if phases else None,
                   "nextActions": [idea["confidence"]["nextAction"]],
                   "blockers": [], "conventions": [
                       "One task = one branch = one PR",
                       "Update state.json + render + commit after every merge",
                       "Gate commands are shell-agnostic (no &&)"]},
        "archipelago": {
            "protocolVersion": "1.0",
            "ideaLock": args.idea, "planLock": args.plan,
            "loop": {"cycle": 1, "stage": "S2", "loopbacks": []},
            "governance": {"ledgerRunId": "", "budgetSpentUsd": 0.0, "branchSweeps": []},
            "compound": {"notes": [], "memorySync": "pending", "experiments": []},
            "fableShim": {"rewriterVersion": "1.0.0", "refusals": []},
        },
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(state, indent=2))
    (out.parent / "journal.md").write_text(
        f"# Mission journal — {idea['id']}\n\n- {now()}: kickoff. G0+G1 artifacts consumed; "
        f"{len(phases)} phase(s); stage S2.\n")
    print(f"[PASS] mission kicked off -> {out} ({len(phases)} phases, stage S2, cycle 1)")

if __name__ == "__main__":
    main()
