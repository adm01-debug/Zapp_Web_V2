#!/bin/sh
set -eu
state="${XDG_STATE_HOME:-$HOME/.local/state}/repo-maintenance"
if ! mkdir -p "$state" 2>/dev/null || ! chmod 700 "$state" 2>/dev/null; then
  printf '%s\n' '{"status":"failed","message":"diretorio de estado inacessivel"}'
  exit 2
fi
if ! command -v flock >/dev/null 2>&1; then
  printf '%s\n' '{"status":"failed","message":"flock indisponível"}'
  exit 1
fi
exec 9>"$state/global.lock"
if ! flock -n 9; then
  printf '%s\n' '{"status":"skipped_busy","message":"Trava global ocupada"}'
  exit 75
fi
exec node "$(dirname "$0")/run.mjs" "$@"
