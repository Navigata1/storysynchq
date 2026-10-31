# StorySync mission contract (archipelago-2)

This is the frozen contract for the mission in `ops/mission/` (idea `idea-storysync-poc-complete`).
It is amended, never edited: each change is a dated, numbered amendment below, and the
file's sha256 is registered in `ops/mission/SHA256SUMS` after every amendment.

## 1. Roles

- **Operator (human):** Navigata1. Ratifies decisions, applies Supabase migrations, owns
  secrets, domains, network policy and credentials. Delegated merge decisions to the lead on
  2026-10-31 ("make the decision on moving through with the merge or not until storysync is
  complete").
- **Lead (builder):** Claude Code, session `session_01D11dTdZfftxxLRXZaWUsTN`. Writes code,
  runs gates, writes dispositions, merges only when every gate of the phase has passed.
- **Review seat:** an isolated Claude session run by `ops/mission/seat.sh` (amendment A1).

## 2. The merge rule

A phase's PR merges to `main` only when `python3 protocol/scripts/loop.py run-gates <P>` exits
0 at the PR head, the head's GitHub CI (`verify`) is green, GitHub reports it mergeable, and
the merge commit's deployment is then confirmed serving that SHA. A failed gate is a loopback
(`loop.py fail <gate> --reason … --route <stage>`), never a retry until green.

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
- Each round's prompt is `protocol/a2/templates/review-prompt.md` filled for the phase; its
  dispositions are `ops/mission/reviews/<P>/dispositions.json`, checked by
  `ops/mission/gates/review_closed.py`.

## 4. Process budget (archipelago-2 step 10)

Census: characters in `ops/**` and `protocol/a2/**` (process) against characters in `src/**`
and `tests/**` changed by the mission (product), counted at close. Cap: process ≤ 40% of
product changed. `protocol/` outside `a2/` is vendored upstream and not counted.

## 5. Registered budgets

- **C7 first-load JS:** registered by amendment before P3's work starts (measured on the P2
  head, then frozen; P3 may not raise it).

## Amendments

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
servers, `--no-session-persistence`, read-only tools, and Read denied outside its clone.
Isolation is proven each round by a canary preflight (the seat is told to read the lead's
private canary file; the canary text must be absent from its output). This seat is the review
gate by the operator's decision. It is not a cross-family seat and no document of this mission
calls it one. When a second model family becomes reachable, the operator may amend this.

**Why recorded here and not as a deviation:** the operator ruled it is the gate, not a
departure from it; the contract records the ruling so a reader sees exactly what the gate is.
