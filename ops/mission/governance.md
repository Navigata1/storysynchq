# Mission close: idea-storysync-poc-complete

The close report for the archipelago-2 mission "StorySync complete at production quality"
(ops/mission/idea.lock.json, plan.lock.json, contract.md). Written for P6, the close phase.
Every status below is what the mission's gates compute at the close PR's final head: rerun_all.py
runs every phase's gates there, then P6's own, and derive_bundle.py derives
ops/mission/evidence/bundle.json from those runs alone. band.py fails this phase unless the two
band lines here equal what that bundle computes.

Band: 3/5
Band counting attested claims: 3/5

## Why 3, and what would raise it

Every claim the evidence cannot settle here caps the band at 3 (dogfood_lanes.py: an
unverified claim means a partial result). Four claims are unverified, none falsified:

| Claim | Why unverified | What verifies it |
|---|---|---|
| C2b · the AAC path on a browser with a WebCodecs AAC encoder | No engine here encodes AAC: Chromium 153 has WebCodecs with Opus only, and no WebKit is installed (the environment must not run `playwright install`). P5-G2 exits 77. | Run `bash ops/mission/gates/aac_publish.sh` on a machine with Safari/WebKit or a Chrome build with its AAC encoder. |
| C8 · the Player in WebKit | No WebKit build here. P5-G1 exits 77. | Run `bash ops/mission/gates/webkit_player.sh` where Playwright's WebKit is installed. |
| C3b · production refuses anonymous listing | Waits on the operator: migration 003 applied to production and an `A2-ATTEST cloud-schema` comment (P1-G1 exits 77), then an authorised cloud run (P1-G2 exits 77). | The operator's attestation, then `cloud_e2e.sh` with production's public URL and anon key, A2_CLOUD_E2E=1 and a test account. |
| C4 · a production link opens with no account | The same authorised cloud run (P1-G2). | As above. |

With all four verified, the lane score (static, runtime-journey and visual artifacts: 85/100)
would give 4. Band 5 also needs a recording lane, which this mission never planned.

C3b and C9 are `attested` (claims.json): their answer also rests on a record nobody can
recompute. The headline band holds them at unverified. Here that changes nothing, because the
four claims above already cap both bands at 3.

## The claims at the close head

| Claim | Proving gates | Expected at the close head |
|---|---|---|
| C1 · the Child Journey in a production build, desktop and phone | P0-G5 (full suite, `tests/a2-journey.spec.ts` by exact key) | verified |
| C2 · published narration is AAC/M4A or WAV, never Opus/WebM; the WAV path round-trips | P0-G5 | verified |
| C2b · the AAC path | P5-G2 | unverified (77) |
| C3 · the client's COPPA posture | P0-G5 | verified |
| C3b · production refuses anonymous listing | P1-G1, P1-G2 | unverified (77) |
| C4 · a production link opens with no account | P1-G2 | unverified (77) |
| C5 · no sideways scroll, nothing clipped, landscape photo visible | P2-G5 | verified |
| C6 · zero serious or critical axe violations on product routes | P3-G5 | verified |
| C7 · first-load JavaScript within the frozen budget | P4-G6 | verified |
| C8 · the Player in WebKit | P5-G1 | unverified (77) |
| C9 · every mission merge crossed the ladder and a closed review | merged_scan.py, live | verified (attested) |
| C10 · production serves main's tip and opens the demo tape | deployed.py, live | verified |

## The merges

| PR | Phase | Merge commit | Green at |
|---|---|---|---|
| #6 | P0 baseline (M7 hardening, mission scaffolding) | 543cf86 | its head, run_phase P0 exit 0 |
| #7 | P2 layout at every width (C5) | 5b71bd1 | b8b0014 |
| #8 | P3 accessibility (C6) | 969eb13 | 7f4dc51 |
| #9 | P4 first-load JavaScript (C7) | 4ddec56 | 0e3d2c3 |

Each merged with a merge commit at the exact head its recorded run passed. CI `verify` and
`frozen` were green there, the PR was mergeable and contained main, and production was
confirmed serving the merge commit afterwards. One recorded run was red: P4 at ae62697. The
cause was an orphaned test runner from a run the lead had killed, not the product. It stays
in the ledger, and is explained in ops/mission/reviews/P4/run-incident-2026-11-01.md. The
re-run was at a new head.

P1 (cloud) and P5 (WebKit, AAC) merge nothing on their own runs (contract section 2). P5's
work lands with this PR:
- the codec rule against Chromium's MP4: Chromium records Opus inside MP4 when asked for
  "audio/mp4", and publish passed every MP4 through as AAC. Fixed in dc85923, judged by
  tests/a2-codec.spec.ts (A13);
- one-tap deletion offline: P4-R3-01, fixed in aec4631, judged by tests/vision-shelf.spec.ts;
- the AAC judge tests/a2-aac.spec.ts (A12);
- the AAC gate's encoder probe, now run in a secure context (A13).

## Enforced and advisory

As contract section 5 says, nothing here is enforced until main's ruleset is on:
ops/mission/hitl/ruleset.md describes it, and the operator attests it with `A2-ATTEST ruleset`.
That attestation has not been posted, so CI (`verify`, `frozen`) and GitHub's merge records
count as advisory for this mission. Everything else is advisory by nature:
- the review records under reviews/;
- the ledger and its phase-runs;
- the evidence files and the bundle.

These are files the lead writes. Their hashes prove internal consistency, not who ran what.

The review seat was an isolated session of the same model family (A1). Read, Grep and Glob
were its only tools, and its isolation was proven by a canary preflight, but it ran as the
lead's own user on the same machine. No second model family was reachable.

## Waiting on the operator

1. Turn on main's ruleset as ops/mission/hitl/ruleset.md describes, then post
   `A2-ATTEST ruleset` on a PR.
2. Apply supabase/migrations/003_share_lookup_by_code.sql to production (project
   pvtwlizzsbovwtkjvqix), then post `A2-ATTEST cloud-schema` with what was checked. Until 003
   is applied, migration 001's broad read policies stand in production. The app reads
   through the by-code function where it exists and falls back otherwise, but the database
   still allows listing.
3. Authorise the cloud run (C3b, C4). Set A2_CLOUD_E2E=1, production's public URL and anon
   key, and a test account (A2_CLOUD_EMAIL, A2_CLOUD_PASSWORD), then run
   `bash ops/mission/gates/cloud_e2e.sh`. Its judge, tests/a2-cloud.spec.ts, is not written
   yet. When it is, it must be registered before any src/ change in the PR that carries it
   (judges/order.json, S1b K40), so it belongs at the start of a fresh PR from main.
4. Run P5's two gates on a machine with WebKit and an AAC encoder (C2b, C8).
5. Earlier open items: the `booksynchq` project's RLS, and the silent-page decision.

## Residual findings

- None open from any review round. Every finding from S1, S1b, and P0 to P4 is fixed,
  rejected with a reason, or was deferred and then closed in a later phase (P2's lows in P3,
  P3-R3-01 in P4, P4-R3-01 in P5). P6's own rounds are under reviews/P6/.
- C7's headroom is thin on the share-link Player: 168 of 170 KB. New code on the Player's path
  should be weighed against it.
- The close runs on Chromium 153 (P0 to P4 ran on 140). Two judges needed repair for it, with
  no assertion loosened (A14): the no-network helper had counted the browser's own favicon
  load as a send, and an end-card layout test measured mid-animation.
- Two lead sessions worked this branch in parallel during P5; the second rebuilt on the
  first's commits without rewriting them, and A13 corrects one line of A12's text.
