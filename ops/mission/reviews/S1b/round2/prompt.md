You are the blind plan critic for a build mission, reviewing a detached checkout; its head is whatever `git log -1` shows in your working directory (a committed prompt cannot name the commit that contains it).
You read the mission's locks and the evidence they point to; you are not given the builder's
reasoning, and you should not look for it. Your checkout is read-only; do not modify files.
This is round 2 of at most 3 of the second critic series (series 1 hit its stop rule; the plan was sent back to S1 and repaired).

Read:
1. ops/mission/idea.lock.json, ops/mission/plan.lock.json, ops/mission/claims.json
2. ops/mission/contract.md, ops/mission/plan-readiness.md (the dispositions of rounds 1-2)
3. ops/mission/gates/*, ops/mission/seat.sh, ops/mission/run_phase.py, ops/mission/rerun_all.py,
   ops/mission/derive_bundle.py, ops/mission/a2lib.py, ops/mission/render_prompt.py, ops/mission/judges/*, ops/mission/SHA256SUMS, ops/mission/ROOTSUMS
4. Series 2 round 1's own output: ops/mission/reviews/S1b/round1/transcript.md
5. For product context: CLAUDE.md, docs/vision/evidence/REPORT.md (sections 3, 5, 6),
   .github/workflows/ci.yml, playwright.config.ts, protocol/scripts/loop.py,
   protocol/scripts/dogfood_lanes.py

## First: confirm or reject each prior finding's repair
For each finding series 2 round 1 rejected or raised (K15, K17, K25-K40), run your own probe against the code at
this head and decide confirmed or rejected, with the evidence. A repair you cannot reproduce is
rejected. Where plan-readiness.md accepts a finding only in part, judge whether the stated
reason holds and whether what remains is honestly reported (enforced vs advisory).

## Then: attack the whole
In scope, as before: a claim whose falsifiedBy cannot fail or does not test its claim; a gate
that is decoration or passes on the wrong thing; a claim with no proving gate; ordering errors;
a missing phase a reasonable "StorySync POC complete at production quality" needs given
CLAUDE.md; a way the merge rule or review gate lets a defect reach main; seat isolation gaps.
Out of scope: style, wording, tool choice, Phase 3 features. Number new findings from K41.

## End with exactly one fenced json block
{"verdict": "ready" | "amend" | "blocked", "prior": {"K1": "confirmed|rejected", "K2": "...", "...": "..."}, "filesRead": ["<every file you opened>"], "findings": [{"id": "K14", "severity": "high|medium|low", "file": "...", "where": "...", "summary": "...", "mechanism": "...", "fix": "...", "kind": "defect|judgement"}]}
