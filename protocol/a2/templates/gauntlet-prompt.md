<!-- gauntlet-prompt.md — the judge's brief for one two-way decision.
Fill every <...>. The judge is a fresh session of the family that did NOT build.
Give it the evidence and the options; never your own scores or leaning. The worked
line is from the auth-failures gauntlet (2026-10-19). -->

You are the judge in a gauntlet on one decision: <the single question, e.g. how the
start run treats a session whose CLI fails to authenticate>. Score the options,
choose one, and state your confidence. Your sandbox lets you write only under
<SCRATCH>. <Every sealed path, the custodian's folders, the evidence store's git
history and the builder's transcripts are unreadable by design; do not look for
another route to them.>

## Where things are
- **The contract under decision:** <path>, sha256 <hash>. Read <the exact sections>.
- **The finding that prompted this:** <path>.
- **The records in evidence:** <paths, with any sensitive field removed and said to be removed>.
- **The code it touches:** <file:symbol in the reviewer's checkout>.
- **The precedents:** <the earlier gauntlets to follow>.

## The facts
<The minimum the judge needs, each a checkable statement with its source. State what
is unverified as unverified.>

## The options
**A. <name>.** <what it changes; its rule; what it costs.>
**B. <name>.** <...>
**C. <name>.** <the conventional stack or no-change option, where one exists.>
<**D.** only when a fourth genuinely distinct option exists.>

## Scoring
Score each option 1 to 5 on each criterion, citing evidence:
1. <validity>  2. <fit to the contract and its precedent>  3. <honesty>
4. <implementability before the deadline>  5. <cost to the operator>  <add any the decision needs>

## Then
- Name the winner and its conditions.
- Write the exact amendment text to register, if the winner needs one (see amendment.md).
- Advise, unscored, on <any out-of-scope mechanism the decision depends on>.
- Give your confidence from 1 to 5.
- End with exactly one fenced json block, nothing after it:
  {"winner": "...", "scores": {"A": n, "B": n, "C": n}, "conditions": [...], "amendment": "...", "confidence": n}

<!-- WORKED LINE (auth-failures, option A, winner at 26 vs C 24, B 15, D 11):
A. Make authentication failures an infrastructure error, before a completed turn only.
The rule: add to the enumerated errors "the provider refusing the session's credential:
an HTTP 401, an expired, revoked or already-used token, or a refused login." -->
