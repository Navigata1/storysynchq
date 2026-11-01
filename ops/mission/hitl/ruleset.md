# HITL · protect main (S1b K52, K57; contract amendment A2)

Only the operator can do this; the lead prepares it and never performs it.

In GitHub: **Navigata1/storysynchq → Settings → Rules → Rulesets → New branch ruleset**

- Name: `main · mission`; Enforcement status: **Active**; Target branches: **Default branch**
- Bypass list: **empty** (no one, admins included; this is what stops a direct push, K57)
- Rules:
  - **Restrict deletions**, **Block force pushes**
  - **Require a pull request before merging** (0 approvals is fine; the review seat is the gate)
    with *Allowed merge methods*: **Merge** only (no squash, no rebase: K56)
  - **Require status checks to pass**, *Require branches to be up to date* on, with checks:
    - `frozen` (workflow `mission-guard`, runs from main's own definition)
    - `verify` (workflow `ci`)
- Save.

Then post on the open mission PR a comment whose first line is exactly

    A2-ATTEST ruleset

followed by one line per rule above as you set it. Until that comment exists, contract
section 5 counts every CI check as advisory, not enforced.
