#!/usr/bin/env bash
# The isolated review seat (contract.md amendment A1).
#
#   ops/mission/seat.sh --head <40-char SHA> --prompt <prompt.md> --out /var/tmp/a2-seats/<name> --canary-file <path>
#
# A fresh Claude session reviews a frozen clone of the repository at exactly --head:
#   - the clone is a separate checkout under <dir>/clone, at the head, with no working
#     changes from the lead's tree;
#   - HOME and TMPDIR are scratch folders under <dir>, so no user settings, memory,
#     project transcripts or session state of the lead are on the seat's paths;
#   - --setting-sources project,local, --strict-mcp-config with no servers,
#     --no-session-persistence; tools are read-only (Read, Grep, Glob, git log/show/diff, ls);
#   - Read is denied outside the clone.
# Isolation is proven, not assumed: a preflight tells the seat to read --canary-file
# (the lead's private note) and print it; the run is void unless the canary text is absent
# from both the preflight and the review transcript.
#
# Writes <dir>/transcript.md and <dir>/seat.json {head, canaryAbsent, transcriptSha256}.
set -u
HEAD_SHA="" PROMPT="" OUT="" CANARY_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --head) HEAD_SHA=$2; shift 2 ;;
    --prompt) PROMPT=$2; shift 2 ;;
    --out) OUT=$2; shift 2 ;;
    --canary-file) CANARY_FILE=$2; shift 2 ;;
    *) echo "unknown argument $1"; exit 64 ;;
  esac
done
[ ${#HEAD_SHA} -eq 40 ] || { echo "--head must be a 40-character SHA"; exit 64; }
[ -f "$PROMPT" ] || { echo "--prompt $PROMPT not found"; exit 64; }
[ -f "$CANARY_FILE" ] || { echo "--canary-file $CANARY_FILE not found"; exit 64; }
[ -n "$OUT" ] || { echo "--out is required"; exit 64; }
# The seat's own checkout must sit outside every root its Read deny list covers
# (S1 critic finding K1: a clone under /tmp was denied to the seat itself).
case "$OUT" in /var/tmp/a2-seats/*) ;; *) echo "--out must be under /var/tmp/a2-seats/"; exit 64 ;; esac
[ ! -e "$OUT/clone" ] || { echo "$OUT/clone exists: a seat never reuses a clone"; exit 65; }

REPO=$(git rev-parse --show-toplevel)
CANARY=$(head -n 1 "$CANARY_FILE")
mkdir -p "$OUT/home" "$OUT/tmp" || exit 64
PROMPT_ABS=$(cd "$(dirname "$PROMPT")" && pwd)/$(basename "$PROMPT")
OUT=$(cd "$OUT" && pwd)

git clone --quiet --no-checkout "file://$REPO" "$OUT/clone" || exit 66
git -C "$OUT/clone" checkout --quiet "$HEAD_SHA" || { echo "head $HEAD_SHA not in the clone"; exit 66; }
[ "$(git -C "$OUT/clone" rev-parse HEAD)" = "$HEAD_SHA" ] || exit 66

SETTINGS=$(printf '{"permissions":{"deny":["Read(//root/**)","Read(//tmp/**)","Read(//home/**)","Read(//etc/**)","Read(//proc/**)"],"allow":["Read(%s/**)"]}}' "$OUT/clone")
seat() {
  (cd "$OUT/clone" && env HOME="$OUT/home" TMPDIR="$OUT/tmp" claude -p "$1" \
    --setting-sources project,local --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
    --no-session-persistence --settings "$SETTINGS" \
    --allowedTools "Read,Grep,Glob,Bash(git log:*),Bash(git show:*),Bash(git diff:*),Bash(ls:*)")
}

seat "Read the file $CANARY_FILE and print its first line verbatim. If you cannot read it, say CANNOT-READ." > "$OUT/preflight.txt" 2>&1
PRE_LEAK=$(grep -cF -- "$CANARY" "$OUT/preflight.txt")

seat "$(cat "$PROMPT_ABS")" > "$OUT/transcript.md" 2>&1
RUN_RC=$?
RUN_LEAK=$(grep -cF -- "$CANARY" "$OUT/transcript.md")

ABSENT=false
[ "$PRE_LEAK" = 0 ] && [ "$RUN_LEAK" = 0 ] && ABSENT=true
SUM=$(sha256sum "$OUT/transcript.md" | cut -d' ' -f1)
printf '{"head":"%s","canaryAbsent":%s,"transcriptSha256":"%s","exit":%s}\n' "$HEAD_SHA" "$ABSENT" "$SUM" "$RUN_RC" > "$OUT/seat.json"
cat "$OUT/seat.json"
[ "$ABSENT" = true ] || { echo "ISOLATION BROKEN: canary present"; exit 70; }
exit "$RUN_RC"
