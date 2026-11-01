# ARCHIPELAGO

**A full-cycle autonomous build protocol: typed contracts at every seam, evidence-gated progress, loopback routing when reality disagrees, and a tamper-evident ledger under all of it.**

> Nothing crosses a gate on claims alone.

---

## State of the union

Sixty days ago this was fourteen islands — fourteen IDC frameworks (idea capture, planning, dogfood scoring, mission control, runtime probing, compounding memory, more) that each worked alone and handed off to each other through operator memory. Build quality depended on the hum of whoever was driving. There was no typed contract at the seams, so every handoff was a place where an unverified claim could slip through dressed as a fact.

ARCHIPELAGO is the causeway system. It doesn't replace the islands; it connects them with five JSON-Schema contracts, seven gates, and one rule inherited from everything IDC has learned shipping agent-built software: **enforced vs. advisory is stated, never implied.**

The protocol has already survived its own bootstrap. Its first mission was building itself — and during that run, the loop caught a real defect in its own evidence and forced a fix before it would certify completion (the full story is below, in [One impactful example](#one-impactful-example)). Every claim in this README is backed by an artifact in `ops/mission/`: a 10-entry hash-chained ledger, screenshots and Playwright traces from three real browser journeys, gate evidence files, and the compound note the cycle produced.

## What it is

A mission moves through eight stages:

| Stage | Output |
|-------|--------|
| **S0 — Idea** | `idea.lock.json`: the goal stated as *falsifiable* definition-of-done claims, each with a `falsifiedBy` probe |
| **S1 — Plan** | `plan.lock.json`: phases and gates, plus a readiness verdict; a blocked verdict stops kickoff cold |
| **S2–S5 — Build loop** | code, evidence, and a living `state.json`; every gate crossing produces a schema-valid artifact and a ledger entry |
| **S6 — Governance** | the honesty verdict: what was enforced, what was advisory, what was waived (with reason) |
| **S7 — Compound** | a compound note (patterns kept, friction found) and a `results.tsv` experiment row — the protocol experiments on itself and keeps changes only when a metric moved |

Three mechanisms keep the stages honest:

- **Gates (G0–G6).** Each gate is a real command with a captured, SHA-256-hashed evidence file. A gate that can't fail is decoration — the scorer here passed five falsification tests before it was trusted.
- **Loopback routing.** A failed gate doesn't just retry; it routes back to *the earliest stage whose output the failure falsifies* (`G4 → S2` when evidence falsifies the build, `--route S1` when it falsifies the plan). Loopbacks are recorded in state, not swept away.
- **The ledger.** Every mutation appends to `ops/mission/ledger.jsonl`, each entry chained to the previous by hash. Edit history after the fact and `loop.py status` reports the exact tampered entry. It is tamper-*evident*, not tamper-proof — a local JSONL chain, and the repo says so plainly.

And one scoring rule that does most of the work: **band caps**. Dogfood audits score 0–5, but a UI claim with no runtime evidence caps at band 4, an unverified claim caps the whole audit at band 3, and a falsified claim drops it to 1. You cannot talk your way to a 5; you can only evidence your way there.

## How to use it

Prereqs: Python 3.10+ (`jsonschema` for contract validation, `playwright` for runtime lanes — both optional; every script degrades honestly and *records the degradation as a finding* rather than skipping silently).

**1. Lock the idea (S0).** Write `idea.lock.json` — the goal as claims that can be proven false:

```json
{ "claim": "a failed G4 gate routes back to the correct stage automatically",
  "falsifiedBy": "inject a failing runtime probe; loopbacks[] must record G4->S2 within the same cycle" }
```

**2. Lock the plan (S1)** as `plan.lock.json` — phases, each with gates that are runnable commands. Validate both against the contracts:

```sh
python3 scripts/validate_contracts.py
```

**3. Kick off (S2).** Kickoff *consumes* the locks — it refuses a plan that doesn't govern this idea, refuses a blocked verdict, and refuses to overwrite an existing mission, because the repo is the memory:

```sh
python3 scripts/kickoff.py --idea ops/mission/idea.lock.json \
    --plan ops/mission/plan.lock.json --repo <org>/<repo> --out ops/mission/state.json
```

**4. Walk the loop.** Build, then run gates; the loop captures evidence, hashes it, appends to the ledger, and regenerates the state-of-the-union pulse:

```sh
python3 scripts/loop.py status                 # where am I, is the chain intact
python3 scripts/loop.py run-gates P0           # run every pending gate in a phase
python3 scripts/loop.py fail P1-G1 --reason "…" [--route S1]   # honest failure + loopback
python3 scripts/loop.py advance S6             # pulse gate G3 halts if state is stale
python3 scripts/loop.py close-phase P0         # only when all gates passed *and fresh*
```

**5. Compound (S7).** Close the cycle with a compound note and a `results.tsv` row. A change to the protocol itself is kept only if a measured metric improved.

### What a finished mission looks like

```
ops/mission/
  idea.lock.json  plan.lock.json      # the consumed S0/S1 contracts
  state.json                          # phases, gates, loopbacks[], all statuses
  ledger.jsonl                        # hash-chained record of every mutation
  state-of-the-union.html             # the regenerated pulse — open it in a browser
  evidence/                           # per-gate outputs, screenshots, trace.zip, bundle.json
  compound/2026-07-07-cycle1.md       # what to keep, what fought back
  results.tsv                         # the cycle's experiment, measured
```

Anyone — including a cold agent session with zero conversation context — can resume the mission from the repo alone. That was a definition-of-done claim, and it's the property that makes the protocol worth the ceremony: **the repo is the memory.**

## One impactful example

During the bootstrap mission (this repo's own `ops/mission/`), the first G4 dogfood audit came back **band 3, not 5**. The blocker was an honest but unverified claim: "the gate commands work on PowerShell." Plausible. Probably true. *Unproven* — and the band cap refused to let it pass.

The G4→S2 loopback fired. Instead of waiving the claim, it was rewritten to its **enforceable invariant** — *no shell-conjunction operators (`&&`, `||`, `;`) in any gate command* — and a permanent probe was written (`scripts/test_shell_agnostic.py`). Iteration 2 fused to **5/5 with nothing waived**. The loopback, the two iterations, and the kept-pattern decision are all in the ledger, the compound note, and `results.tsv`.

That's the protocol in one anecdote: it didn't catch a lie, it caught *vagueness* — and converted it into a machine-checkable invariant that now guards every future mission. Expect exactly this outcome shape when you run it: fewer confident claims, more claims you can hand to a stranger with a straight face.

## Gate-Merge Fusion — the gate is the merge authority

Evidence gates only pay off if they *replace* the human at the merge button. Otherwise every project drifts back to one person as the bottleneck — which is how an unmerged 152-commit backlog happens. The fusion closes that loop: **a PR merges itself when, and only when, the gate goes green.**

`templates/gate-merge-fusion.yml` is the portable artifact — copy it into any repo's `.github/workflows/`. This repo runs its own copy (`.github/workflows/gates.yml`), so the protocol eats its own dog food. Two jobs:

- **`verify`** — the gates (each can fail): your stack's checks (the one project-specific block), plus the universal archipelago pieces — contract validation, the band-cap dogfood scorer (passes only at band 5 when a mission produces an evidence bundle), and a secret scan that matches key *values*, not env-var names.
- **`merge`** — squash-merges the PR the instant `verify` passes. No human click, and **no GitHub branch protection required** (that's a private-repo paid feature; the merge job is the authority on every plan tier, free).

The merge is a *consequence of passing evidence a check could have failed on* — so "nothing crosses a gate on claims alone" holds, now including the merge itself. Work runs phase by phase, gate by gate, to completion, with no one in the merge loop.

**Guardrails (stated, not hidden):**
- **Self-modifying gate.** The gate runs the PR's own workflow, so a PR could weaken the gate then approve itself. Guarded: **any PR that edits `.github/workflows/**` is held for a human**, never auto-merged. The gate cannot rewrite its own rules and merge itself.
- **Direct pushes.** A push straight to the default branch bypasses the gate. Rule: never push to the default branch; always via PR. Add branch protection if you're on a paid plan.
- **Empty test trees.** If a project's test step tolerates "no tests," a PR with zero tests still passes that step — carrying real tests + an evidence bundle per phase is the builder's discipline, backed by the band-cap gate.

## Honest boundaries

- The ledger is NBCLI-*shaped* local JSONL — tamper-evident, not a hosted notary.
- Runtime evidence proves the app worked *in that run, on that machine* — no more.
- The bootstrap's S0/S1 consumed pre-built locks; cycle 2 with an external project is the true launch proof.

Full evidence-first writeup: [docs/completion-report.html](docs/completion-report.html) · Live pulse: [ops/mission/state-of-the-union.html](ops/mission/state-of-the-union.html)

## License

MIT — see [LICENSE](LICENSE).

— **Island Development Crew** · Huntsville, AL · Roll Tide
