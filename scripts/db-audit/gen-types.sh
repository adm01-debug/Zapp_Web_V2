#!/bin/sh
# gen-types.sh [--local] [output_path]
# Gera types TypeScript a partir do schema do banco.
#
# Modo padrao: introspecta o banco DESTINO (producao) via --db-url.
#   Requer: DESTINO_URL no ambiente
#           Formato: postgresql://... (porta 5432 ou 6543 session-mode — nao pooler transaction)
#   Uso local: DESTINO_URL="postgresql://..." bash scripts/db-audit/gen-types.sh
#   Uso em CI: chamado por db-live-guard.yml (guarda de drift do banco oficial).
#
# Modo --local: introspecta um Postgres LOCAL (supabase db start), que aplica
#   automaticamente as migrations de supabase/migrations num volume novo.
#   Reflete so o que esta commitado em supabase/migrations; nao detecta
#   drift nao commitado no banco de producao.
#   Uso local: supabase db start && bash scripts/db-audit/gen-types.sh --local
#   Uso em CI: chamado por types-sync.yml, depois do step "Iniciar banco
#              local (supabase db start)".
#
# Binario: supabase CLI 2.116.0 (CI: supabase/setup-cli@v3 version: 2.116.0)
#
# POSIX sh (sem bashisms) — compativel com dash e bash
#
# NAO usa withPsqlEnvironment/PGPASSFILE (diferente de check-migration-drift.mjs,
# register-migration.mjs etc): a CLI 2.116.0 (rewrite TS/Effect) roda
# `gen types typescript --db-url` in-process via driver Postgres proprio, sem
# spawnar Docker/postgres-meta. Esse driver nao respeita PGPASSFILE (convencao
# exclusiva de libpq/psql/pgx) — por isso a credencial precisa ir direto no
# --db-url. --local nao tem esse problema: nao usa credencial nenhuma, so o
# Postgres do Docker subido por `supabase db start`.
set -e

MODE=db-url
if [ "${1:-}" = "--local" ]; then
  MODE=local
  shift
fi

OUTPUT="${1:-/tmp/types.generated.ts}"
TMP="$(mktemp /tmp/types.XXXXXX.ts)"
trap 'rm -f "$TMP" "${TMP}.normalized"' EXIT HUP INT TERM

if [ "$MODE" = local ]; then
  supabase gen types typescript \
    --local \
    --schema public \
    > "$TMP"
else
  if [ -z "$DESTINO_URL" ]; then
    echo "Erro: DESTINO_URL nao definida no ambiente." >&2
    exit 1
  fi

  supabase gen types typescript \
    --db-url "$DESTINO_URL" \
    --schema public \
    > "$TMP"
fi

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
