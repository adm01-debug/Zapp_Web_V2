#!/bin/sh
# gen-types.sh [output_path]
# Requer: DESTINO_URL no ambiente
#         Binario: supabase CLI 2.116.0 (CI: supabase/setup-cli@v3 version: 2.116.0)
# POSIX sh (sem bashisms) — compativel com dash e bash
#
# Wrapper fino: a geracao roda em gen-types-safe.mjs (Node) para que a
# DESTINO_URL nunca chegue ao argv do processo `supabase` (mesmo padrao de
# psql-safe.mjs para o psql) -- --db-url com credencial embutida ficava
# visivel via ps/proc/pid/cmdline durante toda a execucao do CLI.
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$DESTINO_URL" ]; then
  echo "Erro: DESTINO_URL nao definida no ambiente." >&2
  exit 1
fi

exec node "$DIR/gen-types-safe.mjs" "${1:-/tmp/types.generated.ts}"
