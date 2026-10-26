#!/usr/bin/env bash
# Read-only GNU/Linux snapshot. CSV has no header so append is safe.
set -euo pipefail
if [[ $# -ne 1 || ! -d $1 ]]; then
  echo 'Usage: bash tools/disk_snapshot.sh /actual/database/directory' >&2
  exit 2
fi
path=$(realpath -- "$1")
host=$(hostname)
# Prevent malformed records; normal Linux installation paths are unaffected.
if [[ "$path$host" == *','* || "$path$host" == *'"'* || "$path$host" == *$'\n'* || "$path$host" == *$'\r'* ]]; then
  echo 'CSV-unsafe host or path' >&2; exit 2
fi
allocated=$(du -s -B1 -- "$path" | awk '{print $1}')
apparent=$(du -s -B1 --apparent-size -- "$path" | awk '{print $1}')
printf '%s,%s,%s,%s,%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$host" "$path" "$allocated" "$apparent"
