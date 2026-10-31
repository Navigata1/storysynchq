<!-- gauntlet-audit.md — the builder's audit of the judge's verdict.
The builder wrote the prompt, so the builder's own premises can be wrong. This audit
checks the verdict against the code and the contract, AND re-reads the prompt for a
premise the judge inherited. A premise error is corrected in-session (correction-N.md)
and the judge re-rules; the builder never edits the verdict's text. The worked facts
are from the auth-failures audit (2026-10-19). -->

# Audit of the <decision> verdict (<builder family + model>, <stamp.sh --minutes>)

**The judge.** <family, model, effort>, <isolation: one thread, scratch HOME, profile>.
- **Timing:** <try windows from tries.txt, each from stamp.sh>.
- **Denials:** <none is an attempt on a real sealed path, OR name what was denied>.

**The ruling.** <winner> won, <scores>, at confidence <n> of 5.

## The correction, if the prompt was wrong (and why it was mine)
- **The error.** <the prompt premise that overstated or misstated the contract>.
- **Why it matters.** <the contract's actual words, cited; the code that implements them>.
- **What I did.** Put the correction to the judge in its own session (correction-N.md),
  not by editing the verdict.
- **What the judge did.** <withdrew / kept / changed which clause, and whether the
  winner or scores moved>.

## What I checked
- **The facts.** <the hashes, digests and code the judge cited match>.
- **The structure fits the contract.** <retries, completed-turn rule, exclusion, etc.>.
- **The conditions are implementable before <deadline>.** <test-first obligations>.
- **Residuals.** <what the winner leaves exposed, and the mitigation>.

## What I adopted
<the judge's text, verbatim, as amendment N; only the header gains the adoption time
and citation. The superseded draft is kept>.

## The obligations it creates
<numbered: the harness work, the operator's decisions, the dry run, the next review>.

<!-- WORKED LINE (auth-failures): My prompt's criterion 1 said "no attempt that did
agent work is dropped". The contract's pair rule excludes a pair "only when, in at
least one arm, every one of its three attempts failed before completing any agent
turn" — so a mate that completed turns leaves with its pair. I corrected the premise
in correction-1.md; the judge withdrew its special clause (e); the winner and scores
did not change. -->
