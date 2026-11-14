#!/usr/bin/env bash
# QA-sweep: prova, num Postgres descartavel, que merge_brinde_state (SECURITY DEFINER,
# 20261031110000_copilot_live_helpers.sql) fica executavel pela role `authenticated` mesmo
# apos `REVOKE ALL ... FROM PUBLIC` — porque o default privilege da role `postgres` no
# schema `public` concede EXECUTE a `authenticated`/`service_role` no CREATE FUNCTION, antes
# do REVOKE/GRANT explicitos da migration rodarem — e prova que a migration corretiva
# 20261114173000_fix_merge_brinde_state_execute_grant.sql fecha isso sem afetar service_role.
#
# Usa o Postgres local descartavel desta sessao (nao e o Supabase Cloud oficial do projeto);
# cria e derruba um banco proprio, nao toca em dados de ninguem.

set -Eeuo pipefail

# Conexao com o Postgres (precisa ser SUPERUSUARIO: o teste cria banco, cria as
# roles do projeto e mexe em default ACL).
#
# No CI o Postgres e o SERVICO COMPARTILHADO do job `db-guard` (postgres:17-alpine,
# por TCP; coordenadas em POSTGRES_SERVICE_*). O cluster nativo do runner NAO serve:
# ele ja vem na porta 5432, a mesma que o service container publica no host, e o
# `postgresql.service` do Ubuntu retorna 0 mesmo sem subir a instancia -- o socket
# /var/run/postgresql/.s.PGSQL.5432 nunca aparece (runs 43633207624 e 43637xxxxx).
# Num dev local sem essas variaveis, segue o caminho antigo: socket Unix e peer auth.
#
# O banco criado aqui e proprio (merge_brinde_test_$$) e e derrubado no fim; as roles
# anon/authenticated/service_role sao globais ao cluster e criadas com IF NOT EXISTS,
# entao rodar no servico compartilhado nao altera o que os outros testes veem.
if [[ -n "${POSTGRES_SERVICE_HOST:-}" ]]; then
  psql_su() {
    PGPASSWORD="${POSTGRES_SERVICE_PASS:-}" psql \
      -h "$POSTGRES_SERVICE_HOST" \
      -p "${POSTGRES_SERVICE_PORT:-5432}" \
      -U "${POSTGRES_SERVICE_USER:-postgres}" \
      "$@"
  }
else
  psql_su() { sudo -u postgres psql "$@"; }
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
original_migration="$repo_root/supabase/migrations/20261031110000_copilot_live_helpers.sql"
fix_migration="$repo_root/supabase/migrations/20261114173000_fix_merge_brinde_state_execute_grant.sql"
dbname="merge_brinde_test_$$"
passed=0

cleanup() {
  psql_su -At -c "DROP DATABASE IF EXISTS \"$dbname\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

pass() {
  ((passed += 1))
  printf '[PASS] %s\n' "$1"
}

psql_db() {
  psql_su -X -At -v ON_ERROR_STOP=1 -d "$dbname" "$@"
}

[[ -f "$original_migration" ]] || fail "migration original nao encontrada: $original_migration"
[[ -f "$fix_migration" ]] || fail "migration corretiva nao encontrada: $fix_migration"

psql_su -At -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$dbname\";" >/dev/null

# Simula o ambiente Supabase: roles do projeto (globais ao cluster, podem já existir de
# outra execucao) + default ACL que a role `postgres` (owner das migrations) tem no schema
# public em qualquer projeto Supabase Cloud.
psql_db -c "
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
    END IF;
  END \$\$;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
" >/dev/null

# Pre-requisito minimo da migration original: a tabela que a funcao faz UPDATE.
psql_db -c "
  CREATE TABLE public.copilot_sessions (
    id uuid PRIMARY KEY,
    brinde_state jsonb NOT NULL DEFAULT '{}'::jsonb,
    state_version integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
" >/dev/null

psql_db -f "$original_migration" >/dev/null

has_execute() {
  psql_db -c "SELECT has_function_privilege('$1', 'public.merge_brinde_state(uuid,jsonb,integer)', 'EXECUTE');"
}

# --- Bug: codigo antigo (so a migration original) ---
auth_before="$(has_execute authenticated)"
svc_before="$(has_execute service_role)"

[[ "$svc_before" == "t" ]] || fail "service_role deveria poder executar mesmo antes do fix (precondicao invalida)"

if [[ "$auth_before" != "t" ]]; then
  fail "bug nao reproduzido: authenticated já NÃO tem EXECUTE so com a migration original (pre-condicao do teste mudou — confira o default privilege configurado)"
fi
pass "bug reproduzido: authenticated tem EXECUTE em merge_brinde_state so com REVOKE ALL FROM PUBLIC (default privilege de postgres vaza)"

# --- Patch: aplica a migration corretiva ---
psql_db -f "$fix_migration" >/dev/null

auth_after="$(has_execute authenticated)"
svc_after="$(has_execute service_role)"

[[ "$auth_after" == "f" ]] || fail "depois do patch, authenticated AINDA tem EXECUTE em merge_brinde_state"
pass "patch fecha o acesso: authenticated sem EXECUTE em merge_brinde_state"

[[ "$svc_after" == "t" ]] || fail "depois do patch, service_role perdeu EXECUTE em merge_brinde_state (regressao)"
pass "patch preserva o uso legitimo: service_role continua com EXECUTE em merge_brinde_state"

printf '\n%s testes passaram.\n' "$passed"
