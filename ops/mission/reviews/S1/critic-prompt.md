You are the blind plan critic for a build mission, reviewing a detached checkout at head ea9c1debadc08f3136c04645340c047d552e8318.
You read the mission's locks and the evidence they point to; you are not given the builder's
reasoning, and you should not look for it. Your checkout is read-only; do not modify files.

Read, in this order:
1. ops/mission/idea.lock.json — the claims (C1-C9) that define "done", each with falsifiedBy.
2. ops/mission/plan.lock.json — the phases and their gate commands.
3. ops/mission/contract.md — merge rule, frozen review threat model, stop rule, amendment A1.
4. ops/mission/gates/*.py, ops/mission/gates/e2e_prod.sh, ops/mission/seat.sh — the judges.
5. For context on the product: CLAUDE.md, docs/vision/evidence/REPORT.md (sections 3, 5, 6),
   .github/workflows/ci.yml, playwright.config.ts.

Attack the plan. In scope:
- A claim whose falsifiedBy cannot actually fail, or does not test the claim it is attached to.
- A gate that is decoration (cannot fail, or passes on the wrong thing, e.g. a stale build,
  a skipped test, a file the lead can write to satisfy a human-only check).
- A claim with no gate in any phase, or a phase whose gates do not cover its stated goal.
- An ordering error (a phase that depends on a later one), or a missing phase a reasonable
  definition of "the StorySync POC is complete at production quality" needs, given CLAUDE.md.
- A way the merge rule or review gate could let a defect reach main.
- Isolation gaps in seat.sh.
Out of scope: style, wording, the choice of tools, Phase 3 features named in CLAUDE.md.

For each finding give: id (K1, K2, ...), severity (high/medium/low), the file and line or
field, the mechanism (how it lets something false through), and a concrete fix.
Mark each as a hard defect or a judgement call.

End with exactly one fenced json block:
{"verdict": "ready" | "amend" | "blocked", "findings": [{"id": "K1", "severity": "...", "file": "...", "where": "...", "summary": "...", "mechanism": "...", "fix": "...", "kind": "defect|judgement"}]}
