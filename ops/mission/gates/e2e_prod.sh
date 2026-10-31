#!/usr/bin/env bash
# Gate: the full Playwright suite (desktop + mobile, CI mode) against a production
# build of HEAD served by `next start`, as .github/workflows/ci.yml runs it.
#
# Fails closed:
#   - a working tree with uncommitted changes is refused (exit 4), so the build is HEAD
#     and nothing else (S1 critic K6);
#   - a build that does not carry HEAD's SHA in its ssync-build meta is refused (exit 3),
#     so a stale .next can never stand in for the head under test;
#   - the run's JSON report is judged by e2e_check.py: every required spec family must
#     have run and passed, and every skip must be on the registered allow-list (K6).
set -u
cd "$(git rev-parse --show-toplevel)"
HEAD_SHA=$(git rev-parse HEAD)
LOG_DIR=${TMPDIR:-/tmp}

# The mission's own run records (written by run_phase.py and loop.py while gates run)
# cannot reach the build; everything else must be committed.
RECORDS=(':!ops/mission/state.json' ':!ops/mission/ledger.jsonl' ':!ops/mission/evidence' ':!ops/mission/reviews')
if [ -n "$(git status --porcelain -- . "${RECORDS[@]}")" ]; then
  echo "refusing: the working tree has uncommitted changes"; git status --short -- . "${RECORDS[@]}" | head; exit 4
fi

pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 2

VERCEL_GIT_COMMIT_SHA=$HEAD_SHA npm run build > "$LOG_DIR/a2-build.log" 2>&1 || {
  echo "build failed (log: $LOG_DIR/a2-build.log)"; tail -20 "$LOG_DIR/a2-build.log"; exit 2; }

npx next start -p 3000 > "$LOG_DIR/a2-next-start.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; pkill -f next-server 2>/dev/null' EXIT

for _ in $(seq 1 90); do
  [ "$(curl -s --noproxy localhost -o /dev/null -w '%{http_code}' http://localhost:3000/)" = 200 ] && break
  sleep 2
done

SERVED=$(curl -s --noproxy localhost http://localhost:3000/ | grep -o 'name="ssync-build" content="[^"]*"' | grep -o '[0-9a-f]\{40\}')
if [ "$SERVED" != "$HEAD_SHA" ]; then
  echo "refusing: served build is '${SERVED:-none}', HEAD is $HEAD_SHA"; exit 3
fi
echo "serving HEAD $HEAD_SHA"

REPORT=$LOG_DIR/a2-e2e-report.json
CI=1 PLAYWRIGHT_JSON_OUTPUT_NAME="$REPORT" npx playwright test --reporter=dot,json
RC=$?
python3 ops/mission/gates/e2e_check.py "$REPORT" || exit 5
exit $RC
