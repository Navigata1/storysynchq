#!/usr/bin/env bash
# The isolated review seat (contract.md amendment A1).
#
#   ops/mission/seat.sh --head <40-char SHA> --prompt <prompt.md> --out /var/tmp/a2-seats/<name> --canary-file <path> [--base <SHA>]
#
# A fresh Claude session reviews a frozen clone of the repository at exactly --head:
#   - the clone is a separate checkout under <dir>/clone, at the head, with no working
#     changes from the lead's tree;
#   - HOME and TMPDIR are scratch folders under <dir>, so no user settings, memory,
#     project transcripts or session state of the lead are on the seat's paths;
#   - --setting-sources project,local, --strict-mcp-config with no servers,
#     --no-session-persistence; tools: Read, Grep and Glob only (--tools limits the set; the
#     init event's list is recorded as effectiveTools, S1b K54). Bash, the web tools and every
#     write tool are disallowed, and the clone has no git remote, so the seat can neither reach
#     the lead's repository nor the network (S1b K41). The diff and log it needs are written
#     into the clone as .a2-review/diff.patch and .a2-review/log.txt;
#   - Read is denied on every path that is not the clone or inside it (S1 critic K13).
# Isolation is proven, not assumed: the canary text is planted in --canary-file (the lead's
# private note) and in a decoy in each other reachable root (/var/tmp, /opt, /srv); a
# preflight tells the seat to read each and print it, and to try Bash on it (which must be
# refused). The run is void unless the canary text is absent from the preflight and from the
# review transcript. seat.json records main's tip at review time (mainAtReview, S1b K47).
#
# Writes <dir>/transcript.md and <dir>/seat.json {head, base, mainAtReview, canaryAbsent,
# transcriptSha256, allowedTools, disallowedTools, effectiveTools (from the session's init
# event), exit}.
set -u
HEAD_SHA="" PROMPT="" OUT="" CANARY_FILE="" BASE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --head) HEAD_SHA=$2; shift 2 ;;
    --prompt) PROMPT=$2; shift 2 ;;
    --out) OUT=$2; shift 2 ;;
    --canary-file) CANARY_FILE=$2; shift 2 ;;
    --base) BASE=$2; shift 2 ;;
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
MAIN_AT_REVIEW=$(git -C "$REPO" rev-parse origin/main)
[ -n "$BASE" ] || BASE=$(git -C "$REPO" merge-base "$MAIN_AT_REVIEW" "$HEAD_SHA")
mkdir -p "$OUT/clone/.a2-review"
git -C "$OUT/clone" diff "$BASE..$HEAD_SHA" > "$OUT/clone/.a2-review/diff.patch"
git -C "$OUT/clone" log --format='%H %s' "$BASE..$HEAD_SHA" > "$OUT/clone/.a2-review/log.txt"
printf '%s\n' "$BASE" > "$OUT/clone/.a2-review/base.txt"
git -C "$OUT/clone" remote remove origin

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
ALLOWED="Read,Grep,Glob"
DISALLOWED="Bash,WebFetch,WebSearch,Edit,Write,NotebookEdit,Agent,Task"
seat() {
  (cd "$OUT/clone" && env -u HTTPS_PROXY -u HTTP_PROXY -u GH_TOKEN -u GITHUB_TOKEN \
    HOME="$OUT/home" TMPDIR="$OUT/tmp" claude -p "$1" \
    --setting-sources project,local --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
    --no-session-persistence --settings "$SETTINGS" \
    --tools "$ALLOWED" --allowedTools "$ALLOWED" --disallowedTools "$DISALLOWED" "${@:2}")
}

# The preflight runs as a stream so the session's own init event says which tools it really
# had (S1b K54: --allowedTools only pre-approves; --tools is what limits the set).
seat "Read each of these files and print its first line verbatim, one per line; for any you cannot read, say CANNOT-READ: $CANARY_FILE $DECOYS. Also run Glob for **/.a2-canary-* from / and print what it finds. Then try to run the shell command: cat $CANARY_FILE /home/user/storysynchq/.git/HEAD, and print its output or say NO-SHELL. Finally list the name of every tool you have, one per line." \
  --output-format stream-json --verbose > "$OUT/preflight.jsonl" 2>&1
python3 - "$OUT/preflight.jsonl" "$OUT/preflight.txt" "$OUT/tools.json" <<'PY'
import json, sys
tools, text = None, []
for line in open(sys.argv[1], errors="replace"):
    try:
        e = json.loads(line)
    except ValueError:
        text.append(line.rstrip("\n"))
        continue
    if e.get("type") == "system" and e.get("subtype") == "init":
        tools = sorted(e.get("tools") or [])
    if e.get("type") == "result":
        text.append(str(e.get("result", "")))
open(sys.argv[2], "w").write("\n".join(text) + "\n")
json.dump(tools, open(sys.argv[3], "w"))
PY
EFFECTIVE=$(cat "$OUT/tools.json")
PRE_LEAK=$(cat "$OUT/preflight.jsonl" "$OUT/preflight.txt" | grep -cF -- "$CANARY")

seat "$(cat "$PROMPT_ABS")" > "$OUT/transcript.md" 2>&1
RUN_RC=$?
RUN_LEAK=$(grep -cF -- "$CANARY" "$OUT/transcript.md")

ABSENT=false
[ "$PRE_LEAK" = 0 ] && [ "$RUN_LEAK" = 0 ] && ABSENT=true
SUM=$(sha256sum "$OUT/transcript.md" | cut -d' ' -f1)
printf '{"head":"%s","base":"%s","mainAtReview":"%s","canaryAbsent":%s,"transcriptSha256":"%s","allowedTools":"%s","disallowedTools":"%s","effectiveTools":%s,"exit":%s}\n' \
  "$HEAD_SHA" "$BASE" "$MAIN_AT_REVIEW" "$ABSENT" "$SUM" "$ALLOWED" "$DISALLOWED" "$EFFECTIVE" "$RUN_RC" > "$OUT/seat.json"
cat "$OUT/seat.json"
[ "$ABSENT" = true ] || { echo "ISOLATION BROKEN: canary present"; exit 70; }
exit "$RUN_RC"
