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
# `gen types typescript --db-url` subindo um container Docker
# (ghcr.io/supabase/postgres-meta), com --network host, que conecta usando a
# --db-url recebida em texto puro (confirmado empiricamente — nao e
# in-process nem evita Docker, ao contrario do que versoes anteriores deste
# comentario afirmavam). Esse caminho nao respeita PGPASSFILE (convencao
# exclusiva de libpq/psql/pgx). Mitigacao: ver bloco "Proxy local" abaixo.
# --local nao tem esse problema: nao usa credencial nenhuma, so o Postgres do
# Docker subido por `supabase db start`.
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

  # Proxy local: `--db-url` vai para um container Docker fora do nosso
  # controle (ver comentario acima), entao a credencial real de producao
  # ficaria em texto puro no argv/ambiente desse processo, visivel via
  # /proc a qualquer processo irmao no mesmo job (ex.: dependencia
  # comprometida por `bun install` mais adiante no workflow). Se pgbouncer
  # estiver disponivel, sobe um proxy so-loopback (127.0.0.1) cuja config
  # (com a credencial real) fica num arquivo 0600 dentro de um diretorio
  # 0700; o `--db-url` passado ao supabase CLI usa credencial descartavel
  # que nao aponta pra producao. server_tls_sslmode=verify-full com a CA
  # Supabase pinada no trecho pgbouncer->producao preserva a mesma postura
  # de TLS ja usada pelos outros scripts. Validado empiricamente (CLI
  # 2.116.0 + Docker): o container gerado alcanca 127.0.0.1 do runner.
  # Sem pgbouncer (ex.: uso manual local), cai no comportamento anterior.
  if command -v pgbouncer >/dev/null 2>&1; then
    PROXY_DIR="$(mktemp -d /tmp/pg-proxy.XXXXXX)"
    chmod 700 "$PROXY_DIR"
    trap 'rm -f "$TMP" "${TMP}.normalized"; kill "${PROXY_PID:-}" 2>/dev/null || true; rm -rf "$PROXY_DIR"' EXIT HUP INT TERM

    PROXY_PORT="$(node scripts/db-audit/local-pg-proxy.mjs "$PROXY_DIR")"

    pgbouncer "$PROXY_DIR/pgbouncer.ini" &
    PROXY_PID=$!

    i=0
    while [ "$i" -lt 50 ]; do
      # -d/-U tem que bater com o unico banco/usuario que o pgbouncer.ini
      # (local-pg-proxy.mjs) conhece: sem isso, pg_isready usa o dbname
      # padrao do libpq (usuario do SO no runner), pgbouncer rejeita com
      # "no such database" antes do handshake, e libpq classifica isso
      # como PQPING_NO_RESPONSE — falso negativo constante, nunca timing.
      if pg_isready -h 127.0.0.1 -p "$PROXY_PORT" -d proxydb -U proxy >/dev/null 2>&1; then
        break
      fi
      i=$((i + 1))
      sleep 0.2
    done
    if [ "$i" -ge 50 ]; then
      echo "Erro: proxy local (pgbouncer) nao subiu a tempo." >&2
      exit 1
    fi

    supabase gen types typescript \
      --db-url "postgresql://proxy:unused@127.0.0.1:${PROXY_PORT}/proxydb" \
      --schema public \
      > "$TMP"
  else
    echo "Aviso: pgbouncer ausente; DESTINO_URL vai direto no --db-url (visivel via ps/proc a processos deste job). Instale pgbouncer para blindar a credencial." >&2
    supabase gen types typescript \
      --db-url "$DESTINO_URL" \
      --schema public \
      > "$TMP"
  fi
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
