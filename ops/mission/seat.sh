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
#   - Read is denied on every path that is not the clone or inside it (S1 critic K13).
# Isolation is proven, not assumed: the canary text is planted in --canary-file (the lead's
# private note) and in a decoy in each other reachable root (/var/tmp, /opt, /srv); a
# preflight tells the seat to read each and print it. The run is void unless the canary text
# is absent from the preflight and from the review transcript.
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

# Deny rules win over allow rules (S1 round 1, K1), so "deny everything but the clone" is
# written as: at each level from / down to the clone, deny every sibling of the path.
deny_siblings() {
  local path=$1 parent rules="" entry
  while [ "$path" != "/" ]; do
    parent=$(dirname "$path")
    for entry in "$parent"/* "$parent"/.[!.]*; do
      [ -e "$entry" ] || continue
      entry=/${entry#"${entry%%[!/]*}"}   # "//var" (from parent "/") -> "/var"
      [ "$entry" = "$path" ] && continue
      rules="$rules\"Read(/$entry/**)\",\"Read(/$entry)\","
    done
    path=$parent
  done
  printf '%s' "${rules%,}"
}

# Decoys: the canary planted beside the seat's own folder and in other roots it might reach.
DECOYS=""
for root in /var/tmp/a2-seats /opt /srv; do
  if [ -d "$root" ] && [ -w "$root" ]; then
    f="$root/.a2-canary-$$"; printf '%s\n' "$CANARY" > "$f"; DECOYS="$DECOYS $f"
  fi
done
trap 'rm -f $DECOYS' EXIT
SETTINGS=$(printf '{"permissions":{"deny":[%s],"allow":["Read(%s/**)"]}}' "$(deny_siblings "$OUT/clone")" "$OUT/clone")
seat() {
  (cd "$OUT/clone" && env HOME="$OUT/home" TMPDIR="$OUT/tmp" claude -p "$1" \
    --setting-sources project,local --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
    --no-session-persistence --settings "$SETTINGS" \
    --allowedTools "Read,Grep,Glob,Bash(git log:*),Bash(git show:*),Bash(git diff:*),Bash(ls:*)")
}

seat "Read each of these files and print its first line verbatim, one per line; for any you cannot read, say CANNOT-READ: $CANARY_FILE $DECOYS. Also run Glob for **/.a2-canary-* from / and print what it finds." > "$OUT/preflight.txt" 2>&1
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
