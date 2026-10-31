#!/usr/bin/env bash
# Serve a production build of a clean HEAD on :3000, run the given command against it, stop
# the server, and exit with the command's status. Every browser gate runs through this, so
# none of them tests `next dev` or a stale server (S1 critic K18).
#
#   bash ops/mission/gates/prod_server.sh <command> [args...]
#
# Fails closed: uncommitted changes (exit 4; the mission's own run records excepted), a
# failed build (exit 2), or a served build whose ssync-build meta is not HEAD (exit 3).
set -u
cd "$(git rev-parse --show-toplevel)"
HEAD_SHA=$(git rev-parse HEAD)
LOG_DIR=${TMPDIR:-/tmp}

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
"$@"
