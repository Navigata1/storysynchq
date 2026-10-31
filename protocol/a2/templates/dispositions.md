<!-- dispositions.md — the builder's table after a review round.
One row per finding: the finding, its disposition, the owner, and the state with its
red and green commits. Repair red before green, merge, run the full ladder, re-register
any changed rule text, rehearse, then open the next round. convergence.py reads this
table: an unmarked row counts as a High; a "(Medium)" or "(Low)" tag in the finding
cell does not. The worked rows are from H1e (2026-10-19). -->

# <round>'s findings and their dispositions (<stamp.sh --date>)

**What <round> was.** <the focused verification it ran, at head <SHA>, on <reviewer
family/model/effort>, inside the profile. Its tries and any content-filter stops.>

**The repairs it confirmed / rejected.** <which prior repairs stood, which did not.>

| Finding | Disposition | Owner | State |
|---|---|---|---|
| <id>: <one-line mechanism> | <the fix, in one or two sentences> | <agent/seat> | repaired: <red sha> red, <green sha> green (merged <sha>) |
| <id> (Medium): <...> | <fix> | <seat> | <open / deferred with reason> |

## What comes next
<the ordered next steps: merge, re-register, rehearse, next round, then the gated act.>

**State at <component> <SHA> (<stamp.sh --minutes>):** <every finding has a merged
repair, each red before green, OR what is still open>. <The checks: N tests pass; fmt,
clippy, docs clean. What was registered.>

<!-- WORKED ROW (H1e-5): finding "an unreferenced symlink or special file under the
packed folders passes verification and the seal, then makes the unsealer refuse the
whole archive"; fix on both sides (verify refuses exit 2 naming it; seal applies the
unsealer's tree rules); state "repaired: verify 944c733 red, 392311b green; seal
4728823 red, 7e088f8 green". -->
