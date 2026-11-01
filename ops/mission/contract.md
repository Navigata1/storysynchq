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
2. the head's GitHub CI (`verify`) is green, GitHub reports the PR mergeable, and the head
   already contains main's tip, so what lands is what the ladder ran (S1b K30); the PR is
   merged with a merge commit (no squash, no rebase), so the reviewed head stays in main's
   history (S1b K56), and nothing reaches main except through a mission PR (S1b K57);
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
  `ops/mission/gates/review_closed.py` judges the seat's recorded output, not the lead's summary
  of it (advisory: see section 5): every
  seat finding needs a disposition at no lower severity, the last round must find no High and
  confirm every earlier High in its own "prior" map, and a judge, lock or the contract changed
  after the reviewed head voids the round. Finding ids are unique within a phase; a finding
  raised in the last round can only be rejected or deferred with a reason (K21).

## 4. Process budget (archipelago-2 step 10)

Census: characters in `ops/**` and `protocol/a2/**` (process) against characters in `src/**`
and `tests/**` changed by the mission (product), counted at close. Cap: process ≤ 40% of
product changed. `protocol/` outside `a2/` is vendored upstream and not counted.

## 5. What is enforced, and what is advisory

**Enforced** means a check the lead cannot satisfy by writing a file, because GitHub runs it or
GitHub keeps the record (S1b K34, K42). Precisely, what CI enforces is that a judge cannot
change without that change, and an amendment naming it, sitting visibly in the PR's diff for
the review seat; it does not stop the lead from proposing one (S1b K53). And CI binds only
once main's ruleset is on (amendment A2): until the operator attests it (`A2-ATTEST ruleset`,
`ops/mission/hitl/ruleset.md`), every item below counts as **advisory**:
- `.github/workflows/mission-guard.yml` (`frozen`), a `pull_request_target` job, so GitHub runs
  it as it stands on main and a PR cannot rewrite it (S1b K52): main's own `frozen.py` compares
  the PR's `SHA256SUMS` and `ROOTSUMS` with the base branch's and fails on any changed or
  removed entry not named in an appended amendment section of this file (`### A<n> · <date> ·
  <title>`, numbered after the last; the file is append-only, S1b K53). So a registered judge
  (the gates, the judge data, every `tests/*.spec.ts` and `tests/fixtures/**`,
  `playwright.config.ts`, every `.github/workflows/` file) changes only with an amendment
  naming it;
- the `verify` job of `.github/workflows/ci.yml` on every PR head: tsc, lint, build, the
  suite on desktop and mobile, `registered.py` and the judges' own fixtures. A PR could rewrite
  ci.yml, but ci.yml is registered, so that rewrite needs a named amendment (above);
- GitHub's merge records, read by `merged_scan.py`: which PRs merged, their heads, merge
  commits, and the `verify` check-run's conclusion.

**Advisory** (it guards against accident, not against the lead): everything that runs only on
the lead's machine. The review records under `reviews/`, the ledger and its phase-runs, the
evidence files and the bundle are files the lead writes and could rewrite whole; their hashes
prove internal consistency only. A local gate run is recomputable by anyone who reruns it at
the same head, and is reported as such, but that it ran is the lead's record. Claims whose
answer rests on a record nobody can recompute are marked `attested` in `claims.json` and held
at unverified in the headline band (S1b K43).

The review seat (A1) has Read, Grep and Glob only: `--tools` limits the session's toolset, and
`seat.json` records the list the session's own init event reports (`effectiveTools`), which
`review_closed.py` requires to be within those three (S1b K54). Bash, the web tools and every
write tool are also disallowed, so it can run no command, reach no network and write nothing; its clone has
no git remote, and the diff and log it needs are written into the clone as `.a2-review/`
(S1b K39, K41). Reads outside the clone are denied, and the canary preflight (decoys in the
lead's scratchpad, `/var/tmp/a2-seats`, `/opt` and `/srv`, read, globbed and tried through a
shell) proves them absent. The seat
still runs as the lead's own user on the same machine; a separate uid or a namespace sandbox
is not available here, so that residue is stated, not hidden. The human attestations below
are advisory too.

## 5a. Human attestations (advisory)

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
- **First mission PR:** #6. `merged_scan.py` treats every PR merged into main from #6 on as a
  mission PR (S1b K28).
- **Production's Supabase project:** `pvtwlizzsbovwtkjvqix` (the host the deployed bundle names,
  read 2026-10-31). `cloud_e2e.sh` refuses any other project (K18).

## Amendments

### A0 · 2026-10-31 · Plan readiness (S1)

The locks, the judges and this contract were reworked before kickoff by the dispositions of
the blind plan critic's rounds in `ops/mission/plan-readiness.md`; this is the text they
produced. From kickoff on, this file changes only by amendment.

Stated deviation (S1b K48): C1's own judge, `tests/a2-journey.spec.ts` (the whole Child
Journey in one flow, required by exact key in `judges/required.json`), was written after
PR #6's M7 product fixes, not before them. P0 therefore has no `judges/order.json` entry: the
order rule cannot hold for P0 and is not claimed to. Every later phase registers its judges
before its first `src/` change.

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

### A2 · 2026-11-01 · Plan readiness after series 2 (the operator's ruling)

**Question put to the operator (verbatim):** "The archipelago-2 plan critic hit its stop rule
again: series 2 round 3 came back 'amend' with one High (K52). CI's frozen-judge check runs
from ci.yml, which the PR under test can rewrite, so it isn't really enforced. It also raised 4
Medium findings: the seat could reach more tools than Read/Grep/Glob, the journey test passes
even when narration can't decode, a direct push to main is never scanned, and contract
amendments are loosely matched. All are real and recorded; the mission has not kicked off and
PR #6 is not merged. Closing K52 for real needs a GitHub ruleset on main that only you can
set. How should I proceed?"

**Operator's answer (verbatim choice):** "Fix, then kick off (Recommended)": "I fix K53-K58
and the parts of K52 that code can fix (a pull_request_target guard run from main, ci.yml
registered). I write up the main ruleset as a HITL step for you and label CI 'advisory until
the ruleset is on' in the contract. Your ruling goes in as amendment A2, and I kick off and run
P0 without a third critic series."

**Text entering the contract:** series 2 round 3's findings are repaired as
`ops/mission/plan-readiness.md` records, without a further critic series, and the plan is
ready by this ruling. Main's ruleset (`ops/mission/hitl/ruleset.md`) is the operator's act; until
`A2-ATTEST ruleset` is on record, contract section 5 counts CI as advisory.

### A3 · 2026-11-01 · P2's deferred judge repairs, and C6's judge

`tests/a2-layout.spec.ts` changes as P2's last review round asked (P2-R3-01, P2-R3-03): a
thumbnail under the Filmstrip's pinned handle that no scroll clears is reported, not excused,
and the "recording, Voice card closed" state asserts the card really closed before judging.
Both make the judge stricter; it still passes at this head (144 of 144). `tests/a2-a11y.spec.ts`
is C6's judge, new and registered before P3's first `src/` change; it injects axe-core, now a
pinned devDependency (4.11.1, test-only, not shipped).

### A4 · 2026-11-01 · READ THIS meets WCAG: the T19 spec follows

`tests/vision-read-this.spec.ts` pinned two things C6's judge found to fail WCAG AA: the READ
THIS label in tape red on paper (3.99:1) and the rule that the card never takes a Tab stop,
even when its words scroll (axe scrollable-region-focusable, serious). It now asserts the ink
red (`--ss-red-ink`, 4.5:1 or better) and that the card takes no Tab stop unless its words
overflow, and then exactly one: the words, a named region, between Close Voice and Stop. The
tape-red dot, the card's paper, ink and type are unchanged.
This PR also appends to `ops/mission/contract.md` itself (A3 and A4), which changes that file's
registered sum.

### A5 · 2026-11-01 · P3 round 1: the judges cover more, and C6 states its scope

`tests/a2-layout.spec.ts` now asserts the page's words are on screen and uncovered mid-take
with the Voice card closed (P3-R1-01). `tests/a2-a11y.spec.ts` adds the Player's Reading
options dialog (P3-R1-02) and states its scope: C6 covers the five product routes (/, /read,
the Player, /studio, /protocol) and the dialogs it opens; /classic, which CLAUDE.md keeps
untouched, is out of scope and has serious contrast failures (gray-500 card text) that C6 does
not claim to clear. Both judges get stricter or wider. `ops/mission/contract.md` changes by
this appended section.

### A6 · 2026-11-01 · C6's claim text says the scope A5 set

P3's review (P3-R2-03) found the frozen C6 text in `ops/mission/idea.lock.json` still read
"Every route", while its judge and A5 exclude /classic. The claim now names the product routes
(/, /read and the Player, /studio, /protocol) and states /classic out of scope, so no report of
C6 can claim more than `tests/a2-a11y.spec.ts` checks. `ops/mission/contract.md` changes by this
appended section.
