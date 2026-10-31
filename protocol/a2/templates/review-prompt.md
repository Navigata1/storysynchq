<!-- review-prompt.md — a focused-verification review round.
The reviewer is a fresh session of the family that did NOT build, run through
review-run.sh at an exact head. It first CONFIRMS or REJECTS every prior repair with
its own probe, then attacks the whole under a bounded, frozen threat model. A High
closes only when a later round of the reviewing family confirms the repair. The worked
facts are from H1f (2026-10-19). -->

You are reviewing <component> at head <full SHA>, from a detached checkout. You are a
fresh session of the family that did not build it. Write only under <SCRATCH>. <The
seal rule: every sealed path, the custodian's folders, the evidence store's history
and the builder's transcripts are denied; do not seek another route.>

## The threat model, frozen for this round
<The bounded set of ways the result could be wrong — tuned, leaked, mis-scored,
unverifiable, late. Nothing outside it is in scope. This bound is what makes the round
converge instead of eating the cycle.>

## First: confirm or reject each prior repair
For each finding in the dispositions table <path>, run its own probe and decide
confirmed or rejected, with the evidence. A repair you cannot reproduce is rejected.

| Prior finding | Decision | Evidence |
|---|---|---|
| <id> | <confirmed / rejected> | <what you ran, what you saw> |

## Then: attack the whole
Find any NEW defect in scope. For each, give id, severity (critical/high/medium/low),
file, line, the mechanism, and a fix. Distinguish a hard defect from a judgement call.

## Hashes and environment
Confirm the supplied <contract/seed-format/prompt> hashes match. Report the build and
test result; exclude failures caused by the review profile's own restrictions and say
you did. Run no live model session; leave the checkout unchanged.

## End with exactly one fenced json block
{"verdict": "amend" | "approve" | "blocked", "prior": {"<id>": "confirmed|rejected"}, "findings": [{"id": "...", "severity": "...", "file": "...", "line": N, "summary": "...", "mechanism": "...", "fix": "..."}]}

<!-- WORKED LINE (H1f): "At 6ebc76e, I found two High defects and one Medium defect.
The supplied protocol, seed-format and prompt hashes matched. The build succeeded.
Tests reported 654 passed and 62 failed; the failures arose from review-profile
restrictions on sealed paths, nested sandboxes, process inspection or checkout writes.
I excluded them from findings." -->
