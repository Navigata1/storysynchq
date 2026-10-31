#!/usr/bin/env bash
# Gate: the full suite (desktop + mobile, CI mode) on a production build of a clean HEAD. Every
# registered test must pass or be an allow-listed skip, every family in judges/required.json
# must meet its minimum, plus any phase's own required files given as arguments (S1b K25, K26).
#   bash ops/mission/gates/e2e_prod.sh [ops/mission/judges/required-P2.json ...]
set -u
cd "$(git rev-parse --show-toplevel)"
J=ops/mission/judges
CHECK="--skips $J/e2e-skips.txt --present $J/e2e-present.txt --required $J/required.json"
for extra in "$@"; do CHECK="$CHECK --required $extra"; done
exec bash ops/mission/gates/judged.sh "$CHECK"
