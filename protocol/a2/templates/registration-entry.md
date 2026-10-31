<!-- registration-entry.md — one change-log entry for the sums/registration file.
Every rule text an independent party relies on (seed format, resume policy, prompts,
accepted provider messages, continuation bytes) is registered by sha256. When it
changes, add an entry that says WHAT changed, WHICH finding drove it, and WHY it is not
tuned to held-out material. The hashes live in a SHA256SUMS written by sums.py. The
worked facts are from the H1e registration (2026-10-19). -->

**<stamp.sh --minutes>: <what changed>** (<the round or gauntlet that drove it>;
<component> <SHA>). `<file>` was `<old-hash-prefix>…` and is now `<new-hash-prefix>…`.
Each change states what the repaired rule enforces.

- **<area> (<finding id>):** <the exact rule as it now reads — byte-level where it
  matters, e.g. "an fs or proc scope holds no comma">.
- **<area> (<finding id>):** <...>.
- **<any file left unchanged>:** unchanged (`<hash-prefix>…`).
- **Why it isn't host-specific:** <no change names a held-out program or a cell's
  content; each follows the contract and a finding whose probes are synthetic>.
- **Re-registered beside it:** <any sibling policy file and its new hash, and who
  receives it versus who does not>.

<!-- WORKED LINE (H1e): "SEED-FORMAT.md was 3a8844eb… and is now e6076cf3…. The packed
tree (H1e-5): every entry under the packed folders must be a regular file or a folder;
otherwise `seeds verify` exits 2, naming every such entry, and refuses no seed." The
entry closes by stating no change names a host or a cell's content. -->
