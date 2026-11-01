You are reviewing StorySyncHQ at head af2fa7d880346b7917aa9b46d4a62f7e977f5b4e, from a detached checkout, as the review seat
for phase P2, round 2 of at most 3. You are an isolated session: you do not see
the builder's reasoning and should not look for it. Your checkout is read-only, and your tools
are Read, Grep and Glob: you cannot run commands, git included.

Read ops/mission/contract.md section 3 (the frozen threat model and severities),
ops/mission/plan.lock.json (phase P2: its goal and gates), ops/mission/idea.lock.json,
and CLAUDE.md. The change under review is `git diff 543cf86d461a1d3cdd528b7a88e7c01c0226c5a0..af2fa7d880346b7917aa9b46d4a62f7e977f5b4e`, written for you into the
checkout as .a2-review/diff.patch, with its commits (`git log 543cf86d461a1d3cdd528b7a88e7c01c0226c5a0..af2fa7d880346b7917aa9b46d4a62f7e977f5b4e`, oldest last) in
.a2-review/log.txt; read the diff, every file it touches at this head, and whatever those files
depend on that you need.

## The threat model, frozen for this round
Defects a user would meet in the Child Journey (create, record, music, parental gate,
publish, share, read); the COPPA posture (gate before publish and share, deletion, no
third-party requests from the Player, unguessable share codes); the published-codec rule
(AAC/M4A or WAV only); regressions against the tests the diff touches; claims in docs, PR
text or commit messages the diff does not support. Out of scope: style, Phase 3 items,
rewrites of untouched code.

## First: confirm or reject each prior finding's repair
Prior findings of this phase: P2-R1-01, P2-R1-02. For each, read its round's transcript under
ops/mission/reviews/P2/ and that round's dispositions.json, probe the code at this head
yourself, and decide confirmed or rejected with the evidence. A repair you cannot reproduce is
rejected. (If the list is "none", skip this section.)

## Then: attack the whole
Find any new defect in scope. For each give a new id (unique within this phase), severity
(high/medium/low as contract section 3 defines them), file, line, the mechanism, and a fix.
Mark each a hard defect or a judgement call.

## End with exactly one fenced json block
{"verdict": "approve" | "amend" | "blocked", "prior": {"<id>": "confirmed|rejected"}, "filesRead": ["<every file you opened>"], "findings": [{"id": "...", "severity": "...", "file": "...", "line": 0, "summary": "...", "mechanism": "...", "fix": "...", "kind": "defect|judgement"}]}
