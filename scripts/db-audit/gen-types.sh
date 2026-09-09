#!/bin/sh
# gen-types.sh [output_path]
# Gera types TypeScript a partir do schema do banco DESTINO.
#
# Requer: DESTINO_URL no ambiente
#         Formato: postgresql://... (porta 5432 ou 6543 session-mode — nao pooler transaction)
#         Binario: supabase CLI 2.116.0 (CI: supabase/setup-cli@v3 version: 2.116.0)
#
# Uso local: DESTINO_URL="postgresql://..." bash scripts/db-audit/gen-types.sh
# Uso em CI: chamado por types-sync.yml e db-guard.yml
#
# POSIX sh (sem bashisms) — compativel com dash e bash
set -e

OUTPUT="${1:-/tmp/types.generated.ts}"
TMP="$(mktemp /tmp/types.XXXXXX.ts)"
trap 'rm -f "$TMP" "${TMP}.normalized"' EXIT HUP INT TERM

if [ -z "$DESTINO_URL" ]; then
  echo "Erro: DESTINO_URL nao definida no ambiente." >&2
  exit 1
fi

supabase gen types typescript \
  --db-url "$DESTINO_URL" \
  --schema public \
  > "$TMP"

# A CLI pode emitir mais de uma quebra de linha no EOF. Normalize apenas as
# linhas vazias finais para que o artefato seja deterministico e passe em
# `git diff --check`, preservando linhas vazias internas.
awk '
  NF {
    while (blank_lines > 0) {
      print ""
      blank_lines--
    }
    print
    next
  }
  { blank_lines++ }
' "$TMP" > "${TMP}.normalized"

mv "${TMP}.normalized" "$OUTPUT"
echo "types gerado: ${OUTPUT} ($(wc -c < "$OUTPUT") bytes)"
