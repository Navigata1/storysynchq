#!/usr/bin/env bash
# Run Playwright on a production build of a clean HEAD (prod_server.sh) and judge its JSON
# report with e2e_check.py, so no browser gate can pass on a run that skipped or lost its
# tests (S1b K25, K26, K32).
#
#   bash ops/mission/gates/judged.sh "<e2e_check options>" <playwright test args...>
set -u
cd "$(git rev-parse --show-toplevel)"
CHECK=$1; shift
REPORT=${TMPDIR:-/tmp}/a2-report-$$.json
rm -f "$REPORT"
CI=1 PLAYWRIGHT_JSON_OUTPUT_NAME="$REPORT" bash ops/mission/gates/prod_server.sh npx playwright test --reporter=dot,json "$@"
RC=$?
[ -f "$REPORT" ] || { echo "[FAIL] no report (exit $RC)"; exit "$([ "$RC" = 0 ] && echo 1 || echo "$RC")"; }
# shellcheck disable=SC2086
python3 ops/mission/gates/e2e_check.py "$REPORT" $CHECK || exit 5
exit "$RC"
