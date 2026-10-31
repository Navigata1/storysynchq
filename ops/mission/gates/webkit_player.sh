#!/usr/bin/env bash
# Gate: the Player journey specs pass under WebKit, the Safari engine (C8).
# Fails closed when no WebKit browser is installed.
set -u
cd "$(git rev-parse --show-toplevel)"
python3 ops/mission/gates/browser_available.py webkit || exit 1
grep -q "name: 'webkit'" playwright.config.ts || { echo "[FAIL] playwright.config.ts has no webkit project"; exit 1; }
CI=1 npx playwright test --project=webkit tests/wp-player.spec.ts tests/critic-player.spec.ts tests/vision-reader-m6.spec.ts tests/storysync-roundtrip.spec.ts
