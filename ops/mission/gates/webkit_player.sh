#!/usr/bin/env bash
# Gate: the Player journey specs pass under WebKit, the Safari engine, on a production build of
# HEAD, judged with no skips allowed (C8). Exit 77 ("cannot run here") with no WebKit installed.
set -u
cd "$(git rev-parse --show-toplevel)"
python3 ops/mission/gates/browser_available.py webkit || exit 77
grep -q "name: 'webkit'" playwright.config.ts || { echo "[FAIL] playwright.config.ts has no webkit project"; exit 1; }
exec bash ops/mission/gates/judged.sh "--required ops/mission/judges/required-P5-webkit.json" --project=webkit \
  tests/wp-player.spec.ts tests/critic-player.spec.ts tests/vision-reader-m6.spec.ts tests/storysync-roundtrip.spec.ts
