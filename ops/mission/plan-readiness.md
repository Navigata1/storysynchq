# Plan readiness (S1): the blind plan critic's findings and their dispositions

The critic is the isolated seat (contract A1), reading the locks, the judges and the
product docs from a clone at the named head; it never sees the lead's reasoning. Its own
output for each round is in `reviews/S1/round<N>/` (transcript, seat.json, preflight).

## Round 1 · head 31c9e48 · verdict blocked

| id | sev | disposition | what changed |
|---|---|---|---|
| K1 | high | **accepted** | The seat could not read its own clone (a `/tmp` deny rule covered it). Seat checkouts moved to `/var/tmp/a2-seats/`; a round whose seat verdict is `blocked` or that lists no files read cannot close. |

## Round 2 · head f8e047e · verdict amend · prior K1 rejected (half done)

| id | sev | disposition | what changed |
|---|---|---|---|
| K1 | high | **accepted** | `review_closed.py` now reads the verdict and files read from the seat's own sha-pinned transcript and `seat.json`, never from the lead's dispositions. |
| K2 | high | **accepted** | Every finding in the seat's transcript must have a disposition at no lower severity; fixtures for a dropped and a downgraded finding. |
| K3 | high | **accepted** | `ops/mission/run_phase.py` checks state.json's gates against plan.lock, resets them, reruns all of them at HEAD and records `{head, exit}` in `phase-runs.jsonl`; the merge rule (contract §2) reads that. The vendored `loop.py` is left byte-identical. |
| K4 | high | **accepted in part** | P1 gains `cloud_e2e.sh` (publish, then open in a fresh context, against production) and P5 gains `webkit_player.sh` (the Player specs under a WebKit project); both fail closed here. The attestation moved from a repo file to a GitHub comment by `Navigata1` with no Claude Code footer. *Not done:* making it tamper-proof. The lead acts with the operator's token, so no check can tell a human comment from one the lead posts without the footer; the hitl gate is therefore reported **advisory** (contract §5), not enforced. |
| K5 | high | **accepted** | C3 split: C3 is the client posture (proved in P0); C3b is the database posture (no anonymous listing, i.e. migration 003 applied), proved only by P1's production check. The cloud phase moved to P1, straight after the baseline, and the operator is told now. |
| K6 | medium | **accepted** | `e2e_prod.sh` refuses a dirty tree (untracked files included; only the mission's run records are exempt) and judges the JSON report with `e2e_check.py`: every required spec family must pass on both projects, and every skip must be on the registered allow-list `judges/e2e-skips.txt`. The allow-list is taken from a census run of the suite at the P0 baseline and reviewed line by line before registration: it freezes which tests may skip, so a test that later stops running fails the gate. |
| K7 | medium | **accepted** | After the reviewed head only `reviews/` and `evidence/` may change. `ops/mission/SHA256SUMS` registers the locks, claims map, contract, judges and seat; every merging phase runs the sums check (G3) and the judges' fixtures (G4). |
| K8 | medium | **accepted** | One folder per round; the last round must find no High and confirm every earlier High in its own "prior" map; more than 3 rounds fails. |
| K9 | medium | **accepted** | Every merging phase (P0, P2, P3, P4) runs the full ladder: tsc, lint, sums, fixtures, the suite on a production build, review. C9's falsifier is `merged_scan.py`, which walks the mission's merges on main. P1 and P5 merge nothing on their own (their work lands only after their gates can pass). |
| K10 | medium | **accepted** | P6 now: `merged_scan.py`, `band.py` (passes when the band declared in `governance.md` equals the band `dogfood_lanes.compute` gives the bundle `derive_bundle.py` builds from the records), the ledger check. `rerun_all.py` reruns every phase at the final head before P6. |
| K11 | medium (judgement) | **accepted in part** | The C5 and C6 judges become specs inside the full suite (so they run on the production build, not a dev server) and are committed and registered in SHA256SUMS before any fix commit of their phase; the sums gate and the review gate's "judge changed after review" rule hold them frozen. *Not done now:* writing them before kickoff; each is written at its phase's start, before that phase's first fix, which is the method's "before the work it judges". The C7 budget will be a reasoned target registered by amendment, not the current size. |
| K12 | low (judgement) | **accepted** | C2 split: C2 covers the codec rule and the WAV path; C2b is the AAC path, unverified until a browser with a WebCodecs AAC encoder runs it (P5). |
| K13 | low | **accepted** | The seat denies Read on every path but its clone (rules generated per level; a `//var` glob bug that denied the clone's own ancestor was found and fixed in trial). Decoy canaries in /var/tmp, /opt, /srv; the trial seat read none of them. `review_closed.py` requires `seat.json.head == reviewedHead`. |

`verdict.adversarialFindingsResolved` is set only after a further round confirms the Highs above
(K1–K5) and finds no new High.

### K6 · the skip allow-list, from the census

Census run at 43d4caa (`e2e_prod.sh`, production build, CI mode): 1873 passed, 1 flaky (passed
on retry), 48 skipped; every required family passed on both projects. Each of the 48 skips is
an explicit `test.skip` whose condition is the project (a desktop-only seam or capture, a
phone-only width) or the environment (`process.env.CI` for the dev-only cloud seam; no cloud
library for the QR sticker). None is a test that stopped running. The 48 keys are registered
as `judges/e2e-skips.txt` in SHA256SUMS; `e2e_check.py` on the census report then passes.

## Round 3 · head 71d7134 · verdict amend · stop rule reached (3 of 3)

Confirmed: K1 (both rounds), K2, K3, K4 (in part, reason holds), K5, K6, K7, K8, K10, K13.
Rejected: K9 (merged_scan accepts any phase's green run), K11 (tests/ judges cannot be
registered by the ops/mission-rooted sums file), K12 (no gate exercises the AAC path).
New: K14 (high: C2b verified by a gate that never runs AAC), K15 (high: merged_scan accepts a
non-merging phase and misses squash merges), K16-K22 (medium), K23-K24 (low).

**Status: not ready.** By the stop rule the plan did not kick off on series 1. The operator
chose (2026-11-01): loop back to S1, repair, and run a fresh critic series; kick off only on
"ready". Series 2's rounds live in `reviews/S1b/`.

| id | sev | disposition | what changed |
|---|---|---|---|
| K9, K15 | high | **accepted** | `merged_scan.py` lists merged PRs from GitHub (squash and rebase merges count), accepts only an exit-0 phase-run of a *merging* phase (`a2lib.merging_phases`: gates carry the full ladder) at the PR head, and fails on zero mission merges. P6 now carries the full ladder; P1 and P5 merge nothing on their own runs. |
| K11, K16 | medium | **accepted** | `gates/registered.py` (the G3 of every merging phase) verifies `SHA256SUMS` (rooted at ops/mission) and the new repo-rooted `ROOTSUMS` (playwright.config.ts, sums.py, loop.py, dogfood_lanes.py, and every tests/a2-*.spec.ts judge), and fails on any unregistered judge (proved with a planted stray file). |
| K12, K14 | high | **accepted** | C2b is proved by `aac_publish.sh` (P5-G2): it probes `AudioEncoder.isConfigSupported` for mp4a.40.2 and exits 77 when no engine supports it; when one does, `tests/a2-aac.spec.ts` must publish AAC, play it, and play a recorder-native AAC tape. |
| K17 | medium | **accepted** | Required families and their minimum passing counts per project live in the registered `judges/required.json`; each a2 judge is added with its count when registered. |
| K18 | medium | **accepted** | `prod_server.sh` serves a production build of a clean HEAD (SHA-checked) for every browser gate (suite, WebKit, AAC, cloud). `cloud_e2e.sh` refuses any Supabase project but production's registered `pvtwlizzsbovwtkjvqix`. |
| K19 | medium | **accepted** | Exit 77 = cannot run here (unverified); any other non-zero exit falsifies the claim. Per-gate exits are recorded. |
| K20 | medium | **accepted** | `run_phase.py` writes a `phase-run` event (head, per-gate exits, evidence sha256) into loop.py's hash-chained ledger; the judges read it through `a2lib.phase_runs`, which refuses a broken chain. Fixtures added for derive_bundle, band, merged_scan and run_phase (45 fixtures pass). |
| K21 | medium | **accepted** | Finding ids must be unique across a phase's rounds; a last-round finding can only be rejected or deferred with a reason. |
| K22 | medium (judgement) | **accepted** | Phase prompts are rendered from the registered `judges/review-prompt.tmpl` by `render_prompt.py`; `review_closed.py` requires prompt.md to equal the rendering for that phase, round, head and base. (The S1 critic prompt is not a phase prompt and is not gated.) |
| K23 | low | **accepted** | Contract section 6: one rule, a reasoned per-route target registered with js_budget.py before P4's first commit. |
| K24 | low | **accepted** | Claims map to gate ids, not phases; C9 is checked live by merged_scan, so the band cannot flip on the close phase's own record. |

**Process budget (contract section 4):** at this point the mission's process files (~80k
characters under ops/ and protocol/a2/) exceed 40% of the product changed so far (PR #6:
~760 lines in src/ and tests/). Recorded as over budget; repairs from here reuse `a2lib.py`
rather than adding parallel scripts.

## Series 2

### Round 1 · head 915ee66 · verdict amend

Confirmed: K9, K11, K12, K14, K16, K18, K19, K20, K21, K22, K23, K24. Rejected: K15 (squash
merges skipped), K17 (no a2 family frozen). New: K25 (high), K26-K34 (medium), K35-K40 (low).

| id | sev | disposition | what changed |
|---|---|---|---|
| K25, K17 | high | **accepted** | C5's and C6's judges are frozen now, before they exist: `judges/required-P2.json` (a2-layout, 35 on desktop) and `required-P3.json` (a2-a11y, 8 per project); P2-G5 and P3-G5 pass them to e2e_prod, which fails "0 passing, needs 35" until the judge runs. |
| K26 | medium | **accepted** | `judges/e2e-present.txt` registers the census's 1874 passing test keys; a registered test that does not pass (deleted, renamed, newly skipped) fails e2e_check. |
| K27 | medium | **accepted** | `state-of-the-union.html` (written by loop.py's pulse) is gitignored, so it no longer dirties the tree. |
| K28, K15 | medium | **accepted** | Mission PRs are those numbered from #6 (contract section 6), listed from GitHub; each head is fetched (`pull/N/head`) and an unfetchable head fails. |
| K29 | medium | **accepted** | A phase that ran red at a head cannot be made green there by a rerun. |
| K30 | medium | **accepted** | merged_scan requires the merge commit's first parent (main before the merge) to be in the PR head; the merge rule says so. |
| K31 | medium | **accepted** | A round's base must be merge-base(main, reviewedHead). |
| K32 | medium | **accepted** | Every browser gate runs through `judged.sh` (production build + JSON report + e2e_check with its own required file; no skips unless listed). aac_publish maps chromium to the `desktop` project. |
| K33 | medium | **accepted** | merged_scan exits 77 when GitHub is unreadable, 1 on a violation; C9's live check maps 1 to falsified. |
| K34 | medium (judgement) | **accepted as advisory** | Contract section 5 now states it: review records and the ledger are lead-writable and advisory; what is enforced is GitHub's own records (merges, heads, verify check-runs), the gate runs themselves and the registered sha256s. |
| K35 | low | **accepted** | merged_scan checks the `verify` check-run on each mission PR head (rule 2). Rule 3 (deployment serving the merge SHA) stays the lead's post-merge check, advisory. |
| K36 | low | **accepted** | The production project URL is matched exactly. |
| K37 | low | **accepted** | hitl rejects both attribution forms ("Generated by" and "Generated with"); fixture for the second. |
| K38 | low | **accepted** | `reviews/` is no longer exempt from the clean-tree check, so a phase run judges committed review records only. |
| K39 | low (judgement) | **accepted as stated** | seat.sh's header now says what the seat has (Bash inside the clone); the property that matters, no reads outside the clone, is what the canary proves each round. |
| K40 | low | **accepted** | `judges/order.json` names each phase's judges; review_closed requires each to be registered in a commit before every src/ change in the phase's range (fixtures for both orders). |

55 fixtures pass.

### Round 2 · head 4ce0f22 · verdict amend

Confirmed: K15, K17, K25-K33, K35-K38, K40. Rejected: K34 and K39 (the advisory relabel did not
match what the lead can rewrite, and the seat had Bash). New: K42 (high), K41 and K43-K48
(medium), K49-K51 (low).

| id | sev | disposition | what changed |
|---|---|---|---|
| K42 | high | **accepted** | frozen.py runs in GitHub's verify job and compares the PR's sums with the base branch's; a changed or removed entry needs an added contract line naming it. tests/*.spec.ts and tests/fixtures/** are registered in ROOTSUMS, and registered.py requires them. Contract section 5 now names exactly what is enforced (GitHub-run CI and GitHub's merge records) and calls everything local advisory. |
| K41 | medium | **accepted** | The seat has Read, Grep and Glob only (Bash, web and write tools disallowed); its clone's remote is removed; diff and log are written into .a2-review/; proxy and GitHub token variables are unset for it; the preflight also tries a shell; seat.json records both tool lists. A separate uid or namespace sandbox is not available here, and contract section 5 says so. |
| K43 | medium | **accepted** | claims.json gives every claim a provenance (C3b and C9 attested); the bundle carries it; band.py computes the band twice and the headline holds attested claims at unverified. governance.md must declare both bands. Fixtures for both. |
| K44 | medium | **accepted** | derive_bundle reads every run of a proving gate at HEAD (a2lib.gate_exits_history): any exit other than 0 or 77 falsifies the claim, even after a green rerun. Red-then-green fixture. |
| K45 | medium | **accepted** | e2e_prod.sh and ci.yml run --project=desktop --project=mobile. The webkit project exists only under A2_WEBKIT=1 (webkit_player.sh sets it). playwright.config.ts collects a2-cloud only under A2_CLOUD_E2E=1 and a2-aac only under A2_AAC=1 (aac_publish.sh sets it), so the full suite carries no unregistered skip. |
| K46 | medium | **accepted** | review_closed applies the order rule to every judge in order.json, whichever phase owns it, that is registered within the reviewed range; a phase's own judge must be registered there. required-P1-cloud.json names, by exact key, the anon-listing refusal test for storybooks, shared_links and page_media and the C4 link test (e2e_check 'mustPass'). Fixtures for both. |
| K47 | medium | **accepted** | seat.sh records base and mainAtReview in seat.json; review_closed checks base = merge-base(mainAtReview, head) with mainAtReview in main's history, and once the phase has merged judges after-review drift only up to the head of the PR that merged it. Fixtures: merged phase with later work passes; unmerged drift still fails; mainAtReview off main fails. |
| K48 | medium | **accepted** | tests/a2-journey.spec.ts runs the whole journey in one flow on both projects: pictures through the file input and Snap the next drawing, a take on every page from a Chrome-like recorder (Opus/WebM label, real tone), auto music, the gate with consent, publish (narration normalized to WAV here), the link opened and played through to the end card with no key pressed and narration heard on every page. required.json requires it by exact key. It was written after PR #6's M7 fixes; contract A0 states that deviation. |
| K49 | low | **accepted** | gates/deployed.py (P6-G9, claim C10, checked live) fetches production, compares ssync-build with main's tip and loads /read and the demo tape; exit 77 when the network is denied (as here). Fixtures with a local server. |
| K50 | low | **accepted** | C9's text now says the close PR's own merge is scanned after it lands and reported in its thread as an advisory record. |
| K51 | low | **accepted** | hitl.py exits 77 when GitHub cannot be read; fixture with a failing gh. |
| K34 | medium | **accepted** | Rejected by round 2; repaired with K42: contract section 5 rewritten (enforced = GitHub-run CI including frozen.py, and GitHub's merge records; everything local advisory). |
| K39 | low | **accepted** | Rejected by round 2; repaired with K41: the seat no longer has Bash, and section 5 describes the seat as it now runs. |

76 fixtures pass. The process budget stays over its 40% line, as recorded above: this round's
changes are all mission judges, plus one product-facing test (the journey) and env-gated
projects in playwright.config.ts.

### Round 3 · head c34892e · verdict amend · stop rule reached (3 of 3)

Confirmed: K43-K51. Rejected: K34, K39, K41, K42. New: K52 (high), K53-K55 and K57 (medium),
K56 and K58 (low). The plan is **not ready** and the mission has not kicked off; every
finding is deferred to the operator's ruling (contract section 3's stop rule).

| id | sev | finding |
|---|---|---|
| K52 | high | The CI guard runs from a workflow file the PR itself can rewrite. Real; a code-only fix (pull_request_target running main's frozen.py) still lets an admin push bypass it. The binding fix is a GitHub ruleset on main, which only the operator can set. |
| K53 | medium | Any added line naming a path counts as an amendment, and contract lines can be removed unchecked. Real: require a new dated '### A<n>' section and fail on removed contract lines. |
| K54 | medium | The seat had more tools than Read/Grep/Glob (Artifact, SendMessage, Workflow and others reachable). Real isolation gap: restrict the set with --tools and record the session's effective tools from its init event. |
| K55 | medium | Player.tsx:885 ends a page on a media error, so undecodable narration still reaches the end card. Real: count ended events with no error, and decode each published take. |
| K57 | medium | A direct push to main is never scanned. Real: walk main's first-parent history since kickoff. |
| K56 | low | Squash merges break review_closed later. Real: fix the merge method (merge commits, ^2 == PR head). |
| K58 | low | registered.py has no fixture. Real: add them. |
| K34 | medium | Rejected again: rests on K52 (the CI it calls enforced can be rewritten by the PR). |
| K39 | low | Rejected again: rests on K54 (the seat's toolset is wider than stated). |
| K41 | medium | Rejected: rests on K54. |
| K42 | high | Rejected: rests on K52. |
