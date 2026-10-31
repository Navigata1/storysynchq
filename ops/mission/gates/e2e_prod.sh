#!/usr/bin/env bash
# Gate: the full Playwright suite (desktop + mobile, CI mode) against a production build of a
# clean HEAD (prod_server.sh), judged by e2e_check.py: every required spec family must reach
# its minimum passing count on both projects, and every skip must be allow-listed (K6, K17).
set -u
cd "$(git rev-parse --show-toplevel)"
REPORT=${TMPDIR:-/tmp}/a2-e2e-report.json
rm -f "$REPORT"
CI=1 PLAYWRIGHT_JSON_OUTPUT_NAME="$REPORT" bash ops/mission/gates/prod_server.sh npx playwright test --reporter=dot,json
RC=$?
[ -f "$REPORT" ] || exit "$RC"
python3 ops/mission/gates/e2e_check.py "$REPORT" || exit 5
exit "$RC"
