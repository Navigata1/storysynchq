# P4 recorded run at ae62697: red from a lead-caused interference, not the product

**What happened.** The lead started `run_phase.py P4` at ae62697 from a shell whose command line
contained the text `next start|next-server` (a `ps | grep` before the run). `prod_server.sh`
stops old servers by matching that pattern, so it killed the lead's own shell during P4-G5. The
run's Playwright workers and server were orphaned and kept running. G1–G4 of that run passed and
were recorded; G5 recorded nothing.

**The second run at the same head** (`run_phase.py P4`, plain command line) overlapped with the
orphans and is recorded red in the ledger:

- P4-G2 (`npm run lint`) exit 2: eslint crashed walking `test-results/`
  (`ENOENT: scandir '/home/user/storysynchq/test-results'`) while the orphaned Playwright run
  rewrote that directory. No lint finding was reported.
- P4-G5 (`e2e_prod.sh`) exit 5: 8 failed, 2050 passed. Every retry failed with
  `net::ERR_CONNECTION_REFUSED` at `localhost:3000` (15 occurrences), when the orphan's teardown
  stopped the shared server mid-suite. All 8 are consecutive `wp-player` mobile tests from that
  window. Their first attempts failed for the same reason: the server was gone, or the end card's
  lazy chunk could not be fetched.
- P4-G1, G3, G4, G6 (JS budget) and G7 (review closed) passed.

**Why it is not the product.** The early production run at fef3a0b (identical product code
except two comments, plus the new `share-rest.spec.ts`) passed 2038 tests. Its only failures
were the share-lookup judge, fixed by A10, which passes in this run. CI `verify` and `frozen`
are green at ae62697.

**What changes.** Nothing under `src/`, `tests/` or the judges: after the reviewed head only
review and evidence records may change (review_closed.py, K7). This note is the new head, and
P4 is re-run there with no other process on port 3000 and no orphaned runner. The red entries
stay in the ledger. From now on the lead starts recorded runs from a command line that does
not contain the server patterns `prod_server.sh` matches.

**Addendum (P6-R1-03).** The ledger holds two red phase-run records at ae62697, not one:
09:50:43Z and 09:51:54Z, both P4-G2=2 and P4-G5=5. Two `run_phase.py P4` processes wrote them:
the orphaned first run (its shell was killed, its Python process was not, and it ran on) and
the second run. They overlapped, so each failed from the other's interference, and each
appended its own phase-run when it finished. Neither is explained by the product. The green
run at 0e3d2c3 is the one P4 merged on.
