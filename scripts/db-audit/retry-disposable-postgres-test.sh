#!/usr/bin/env bash
set -euo pipefail

# GitHub-hosted runners can sporadically terminate a brand-new disposable
# PostgreSQL container before its first readiness probe. Retry only that exact
# bootstrap signature; every SQL, ACL, contract, or assertion failure remains
# fail-fast and keeps its original exit code.
if [[ "$#" -eq 0 ]]; then
  printf 'usage: %s <test command> [args...]\n' "${0##*/}" >&2
  exit 64
fi

attempts=3
for attempt in $(seq 1 "$attempts"); do
  log_file=$(mktemp)
  if "$@" >"$log_file" 2>&1; then
    cat "$log_file"
    rm -f "$log_file"
    exit 0
  else
    status=$?
  fi
  if ! grep -Fqx 'FAIL: PostgreSQL de teste não iniciou' "$log_file" || [[ "$attempt" -eq "$attempts" ]]; then
    cat "$log_file" >&2
    rm -f "$log_file"
    exit "$status"
  fi

  cat "$log_file" >&2
  rm -f "$log_file"
  printf 'WARN: PostgreSQL descartável não estabilizou; repetindo bootstrap (%s/%s)\n' "$attempt" "$attempts" >&2
done
