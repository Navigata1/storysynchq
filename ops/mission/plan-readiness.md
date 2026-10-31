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

**Status: not ready.** By the contract's stop rule the plan does not kick off on this series.
Dispositions are pending the operator's decision on how to proceed.
