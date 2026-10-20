#!/usr/bin/env bash
set -euo pipefail

# GitHub-hosted runners can sporadically terminate a brand-new disposable
# PostgreSQL container before its first readiness probe. Retry only that exact
# bootstrap signature; every SQL, ACL, contract, or assertion failure remains
# fail-fast and keeps its original exit code.
#
# Second known bootstrap signature: the official postgres image restarts the
# server once (temporary instance for initdb scripts, then the real one) —
# a readiness probe can land in that gap, pass, and the very next psql call
# then hits a socket that momentarily doesn't exist or is mid-shutdown. That
# error comes straight from psql (unguarded, non-"FAIL: ..." text) and its
# suffix varies by exact timing ("No such file or directory", "FATAL:  the
# database system is shutting down", ...), so match the whole class by its
# common "connection to server on socket ... failed:" prefix instead of one
# exact suffix — confirmed both suffixes on the same branch within minutes.
BOOTSTRAP_FAILURE_PATTERN='FAIL: PostgreSQL de teste não iniciou|connection to server on socket .* failed:'
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
  if ! grep -Eq "$BOOTSTRAP_FAILURE_PATTERN" "$log_file" || [[ "$attempt" -eq "$attempts" ]]; then
    cat "$log_file" >&2
    rm -f "$log_file"
    exit "$status"
  fi

  cat "$log_file" >&2
  rm -f "$log_file"
  printf 'WARN: PostgreSQL descartável não estabilizou; repetindo bootstrap (%s/%s)\n' "$attempt" "$attempts" >&2
done
