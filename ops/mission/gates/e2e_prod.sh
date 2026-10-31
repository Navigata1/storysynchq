#!/usr/bin/env bash
# Gate: the full Playwright suite (desktop + mobile, CI mode) against a production
# build of HEAD served by `next start`, as .github/workflows/ci.yml runs it.
#
# Fails closed: a build that does not carry HEAD's SHA in its ssync-build meta is
# refused (exit 3), so a stale .next can never stand in for the head under test.
set -u
cd "$(git rev-parse --show-toplevel)"
HEAD_SHA=$(git rev-parse HEAD)
LOG_DIR=${TMPDIR:-/tmp}

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

CI=1 npx playwright test --reporter=dot
