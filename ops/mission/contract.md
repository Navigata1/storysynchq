# StorySync mission contract (archipelago-2)

This is the frozen contract for the mission in `ops/mission/` (idea `idea-storysync-poc-complete`).
It is amended, never edited: each change is a dated, numbered amendment below. Its sha256,
and those of the locks, `claims.json`, the judges and the seat, are registered in
`ops/mission/SHA256SUMS`, checked by the G3 gate of every merging phase (S1 critic K7).
Re-registering changed bytes is part of an amendment, never a quiet fix.

## 1. Roles

- **Operator (human):** Navigata1. Ratifies decisions, applies Supabase migrations, owns
  secrets, domains, network policy and credentials. Delegated merge decisions to the lead on
  2026-10-31 ("make the decision on moving through with the merge or not until storysync is
  complete").
- **Lead (builder):** Claude Code, session `session_01D11dTdZfftxxLRXZaWUsTN`. Writes code,
  runs gates, writes dispositions, merges only when every gate of the phase has passed.
- **Review seat:** an isolated Claude session run by `ops/mission/seat.sh` (amendment A1).

## 2. The merge rule

A phase's PR merges to `main` only when:
1. `python3 ops/mission/run_phase.py <P>` exited 0 at the PR head for a *merging* phase (one
   whose gates carry the full ladder): it reruns every gate fresh at that head (loop.py alone
   skips gates that passed earlier, S1 critic K3) and appends a `phase-run` event with each
   gate's exit to the hash-chained ledger (K20). P1 and P5 never merge on their own runs;
   their files land in a merging phase's PR (K15);
2. the head's GitHub CI (`verify`) is green and GitHub reports the PR mergeable;
3. after merging, the deployment of the merge commit is confirmed serving that SHA.
A failed gate is a loopback (`loop.py fail <gate> --reason … --route <stage>`), never a
retry until green. Exit 77 from a gate means "cannot run here" (access the operator must
supply) and leaves its claim unverified; any other non-zero exit falsifies it (K19).
`ops/mission/gates/merged_scan.py` checks the rule after the fact from GitHub's list of merged
PRs (C9).

## 3. Review rounds

- **Threat model (frozen):** defects a user would meet in the Child Journey (create, record,
  music, gate, publish, share, read); COPPA posture (gate before publish/share, deletion,
  no third-party requests from the Player, unguessable share codes); the published-codec rule;
  regressions against the tests the diff touches; claims in docs or PR text the diff does not
  support. Out of scope: style preferences, Phase 3 items, rewrites of untouched code.
- **Severity:** High = a user-facing defect in the threat model, a COPPA breach, a codec-rule
  breach, or a false claim; Medium = a real defect outside the main journey or a missing test
  for a changed behaviour; Low = everything else worth noting.
- **Stop rule (frozen):** a phase's rounds stop when a round finds no High and every prior High
  is confirmed fixed by that round's own probe, or after 3 rounds (then the open items are
  reported at their band and the phase does not merge).
- Each round lives in `ops/mission/reviews/<P>/round<N>/`: the prompt (rendered by
  `ops/mission/render_prompt.py` from the registered `judges/review-prompt.tmpl`, and checked
  byte for byte by the gate, K22), the seat's own `transcript.md`, `seat.json` and
  `preflight.txt` (written by `seat.sh`), and the lead's `dispositions.json`.
  `ops/mission/gates/review_closed.py` judges the seat's output, not the lead's copy: every
  seat finding needs a disposition at no lower severity, the last round must find no High and
  confirm every earlier High in its own "prior" map, and a judge, lock or the contract changed
  after the reviewed head voids the round. Finding ids are unique within a phase; a finding
  raised in the last round can only be rejected or deferred with a reason (K21).

## 4. Process budget (archipelago-2 step 10)

Census: characters in `ops/**` and `protocol/a2/**` (process) against characters in `src/**`
and `tests/**` changed by the mission (product), counted at close. Cap: process ≤ 40% of
product changed. `protocol/` outside `a2/` is vendored upstream and not counted.

## 5. Human attestations (advisory)

A claim that rests on the operator's own act (applying migrations, reading production) is
attested by a PR comment from `Navigata1` whose first line is `A2-ATTEST <name>`
(`ops/mission/gates/hitl.py`). The lead acts on GitHub with the operator's token, so this is
not tamper-proof: the gate rejects any comment carrying the Claude Code footer, and the lead
never posts an A2-ATTEST line. The second half is discipline, so every hitl gate is reported
**advisory**, never enforced.

## 6. Registered values

- **C7 first-load JS:** a reasoned per-route target (not the current size), registered by
  amendment together with `ops/mission/gates/js_budget.py` before P4's first commit; P4 may not
  raise it (S1 critic K23).
- **Production's Supabase project:** `pvtwlizzsbovwtkjvqix` (the host the deployed bundle names,
  read 2026-10-31). `cloud_e2e.sh` refuses any other project (K18).

## Amendments

### A0 · 2026-10-31 · Plan readiness (S1)

The locks, the judges and this contract were reworked before kickoff by the dispositions of
the blind plan critic's rounds in `ops/mission/plan-readiness.md`; this is the text they
produced. From kickoff on, this file changes only by amendment.

### A1 · 2026-10-31 · The review seat is an isolated Claude session

**Question put to the operator (verbatim):** "Archipelago-2 says the builder's model family
never reviews its own work. The other family here is Codex/OpenAI, and this session can't
reach it: api.openai.com is blocked by the network policy and there's no Codex credential.
How should merge gates work until that's fixed?"

**Operator's answer (verbatim choice):** "Same-family, no deviation" — "Treat an isolated
Claude reviewer as the review gate and don't log it as a deviation."

**Text entering the contract:** The review seat for every phase is a fresh Claude session
started by `ops/mission/seat.sh` against a `file://` clone at the exact head under review, with
scratch `HOME` and `TMPDIR`, `--setting-sources project,local`, `--strict-mcp-config` with no
servers, `--no-session-persistence`, read-only tools, and Read denied on every path that is
not the clone. Isolation is proven each round by a canary preflight: the canary text sits in
the lead's private note and in decoys in /var/tmp, /opt and /srv; the seat is told to read
each; the canary must be absent from its preflight and its transcript. This seat is the review
gate by the operator's decision. It is not a cross-family seat and no document of this mission
calls it one. When a second model family becomes reachable, the operator may amend this.

**Why recorded here and not as a deviation:** the operator ruled it is the gate, not a
departure from it; the contract records the ruling so a reader sees exactly what the gate is.
