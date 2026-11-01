<!-- brief-common.md — the shared rules every agent in a fleet receives.
One writer per file, one worktree per agent. This file holds what is the same for all
of them: why it matters, what each may read, the seal rule, how to work (red before
green), and the fixed report shape. A per-agent brief adds only that agent's findings.
The lead merges and runs the full ladder. The worked lines are from the H1c COMMON.md
(2026-10-19). -->

# Shared rules for the <band> agents (<stamp.sh --date>)

You are <what the fleet is doing: repairing findings from <round>, a cross-family
review of <component> at <SHA>>.

**Why it matters.** <the one paragraph that says why being right here is load-bearing —
what downstream step trusts this work and cannot be redone if it is wrong>.

## What you may read
- Your own worktree, which holds the source.
- <this brief folder>: <the frozen contract by hash, the spec, the verdict, the
  synthetic probes you may build red tests from>.
- <the one development-data folder you may open>.

## What you must never read, list, open, hash or copy
This is the seal rule. If you are unsure about a path, do not touch it.
- **Any path with a component named `sealed`.**
- **All of `<work root>`.**
- **Everything in `<evidence store>` except `<the one allowed folder>`.**
- **<any sibling repository>.**

Scope every search (`grep -r`, `find`, `rg`, `ls -R`) to your worktree or a folder
listed above. Never run one from the project root; it would walk into sealed folders.

## How to work
- **Your branch.** Commit only on your worktree's branch, which starts at <SHA>. Never
  push, merge or switch branches, and never write in another worktree. The only file
  outside your worktree you may write is the one named under *What to report*.
- **Test first.** For each finding: commit the failing test as `<area>: red: <what must
  hold>` (it must compile and fail for the finding's reason; say so in the body), then
  the repair as `<area>: green: <what now holds>`. End every message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not change the git identity.
- **Write like the surrounding code.** Match its naming, errors and layout; keep
  functions short; prefer a new file to growing one past ~600 lines; put new tests in
  new files so parallel branches merge cleanly.
- **Before your last commit, run <the focused ladder: fmt, lint, the crate's tests>.**
  <Note any known flake and that you reran it alone.>
- **No live runs.** Never run a model CLI; never start a custodian, rehearsal or scored
  run except through the code's own tests.
- **Keep the development fixtures valid** under every repaired rule. If a repair refuses
  a fixture, decide by the registered rules: fix the fixture and report it, or the
  repair is wrong.

## What to report when you finish
- For each finding: its red and green commits with the test names; two or three
  sentences on what the repair does and does not cover.
- Interface changes: every change to a documented flag, field or schema, and every
  caller you updated.
- Gaps: anything you could not do, and anything you found that <round> did not.

<!-- WORKED LINE (H1c): "Scope every search to your worktree or to a folder listed
above. Never run one from the project root: it would walk into sealed folders." -->
