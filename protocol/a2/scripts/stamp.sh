#!/bin/bash
# stamp.sh: print the current UTC time in the record format.
# Take every record's time from it, inside the command that writes the record:
# a time typed from memory once mis-stamped records by up to two hours.
set -eu

usage() {
  cat <<'EOF'
usage: stamp.sh [--seconds | --minutes | --date]

Prints the current UTC time from `date -u`:
  --seconds  2026-10-19T04:09:34Z   (the default: tries, starts, ends)
  --minutes  2026-10-19T04:24Z      (amendment and change-log headings)
  --date     2026-10-19             (folder and file names)

Take the time in the same command that writes it:
  echo "try 1 at $(stamp.sh)" >> tries.txt
  printf '**%s: what changed.**\n' "$(stamp.sh --minutes)" >> CHANGES.md
EOF
}

if [ "$#" -gt 1 ]; then
  usage >&2
  exit 2
fi

format='+%Y-%m-%dT%H:%M:%SZ'
case "${1:-}" in
  '' | --seconds) ;;
  --minutes) format='+%Y-%m-%dT%H:%MZ' ;;
  --date) format='+%Y-%m-%d' ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

exec date -u "$format"
