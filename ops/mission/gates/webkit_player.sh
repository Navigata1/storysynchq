#!/usr/bin/env bash
# Gate: the Player journey specs pass under WebKit, the Safari engine, against a production
# build of HEAD (C8). Exit 77 ("cannot run here") when no WebKit browser is installed.
set -u
cd "$(git rev-parse --show-toplevel)"
python3 ops/mission/gates/browser_available.py webkit || exit 77
grep -q "name: 'webkit'" playwright.config.ts || { echo "[FAIL] playwright.config.ts has no webkit project"; exit 1; }
CI=1 bash ops/mission/gates/prod_server.sh npx playwright test --project=webkit \
  tests/wp-player.spec.ts tests/critic-player.spec.ts tests/vision-reader-m6.spec.ts tests/storysync-roundtrip.spec.ts
