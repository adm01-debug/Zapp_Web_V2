#!/usr/bin/env bash

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260829060000_reconcile_ledger_drift.sql"
container_name="zapp-v2-ledger-reconcile-test-$$"
postgres_image="${LEDGER_RECONCILE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-ledger-reconcile-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec -i "$container_name" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

apply_migration() {
  docker exec -i "$container_name" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$migration" >/dev/null
}

wait_for_postgres() {
  local attempt
  local container_logs
  for attempt in $(seq 1 60); do
    container_logs="$(docker logs "$container_name" 2>&1 || true)"
    if [[ "$container_logs" == *'PostgreSQL init process complete; ready for start up.'* ]] &&
      docker exec "$container_name" \
        psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'SELECT 1' \
          >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

reset_ledger() {
  psql_sql -c 'TRUNCATE supabase_migrations.schema_migrations' >/dev/null
}

insert_fixture() {
  psql_sql -v version="$1" -v name="$2" -v statement="$3" <<'SQL' >/dev/null
INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES (:'version', :'name', CASE WHEN :'statement' = '<NULL>' THEN NULL ELSE ARRAY[:'statement'] END);
SQL
}

ledger_name() {
  psql_sql -At -v version="$1" <<'SQL'
SELECT name
FROM supabase_migrations.schema_migrations
WHERE version = :'version';
SQL
}

assert_name() {
  local label="$1"
  local version="$2"
  local expected="$3"
  local actual
  actual="$(ledger_name "$version")"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  ((passed += 1))
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration ausente: $migration"

docker run --rm -d \
  --name "$container_name" \
  -e POSTGRES_PASSWORD=ledger_reconcile_test_only \
  "$postgres_image" >/dev/null

wait_for_postgres || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto em 60s"

psql_sql <<'SQL' >/dev/null
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  statements text[]
);
SQL

# Replay limpo: a versao pertence de verdade ao hardening de mcp_exec.
reset_ledger
insert_fixture \
  '20260829020000' \
  'mcp_exec_functions_harden' \
  'CREATE OR REPLACE FUNCTION public.mcp_exec(sql text, max_rows integer) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object() $$'
apply_migration
assert_name 'replay limpo de mcp_exec nao e renomeado' \
  '20260829020000' 'mcp_exec_functions_harden'
apply_migration
assert_name 'replay limpo permanece estavel na segunda aplicacao' \
  '20260829020000' 'mcp_exec_functions_harden'

# Colisao historica: o nome e antigo, mas o statement pertence a reassign.
reset_ledger
insert_fixture \
  '20260829020000' \
  'mcp_exec_functions_harden' \
  'CREATE OR REPLACE FUNCTION public.reassign_absent_agents(inactive_minutes integer DEFAULT 30) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS BODY_PLACEHOLDER'
apply_migration
assert_name 'colisao historica de reassign e reconciliada' \
  '20260829020000' 'fix_reassign_absent_agents_last_seen_at'
apply_migration
assert_name 'reconciliacao de reassign e idempotente' \
  '20260829020000' 'fix_reassign_absent_agents_last_seen_at'

# Registro ambiguo/hibrido nao deve ser transformado em evidencia falsa.
reset_ledger
insert_fixture \
  '20260829020000' \
  'mcp_exec_functions_harden' \
  'CREATE OR REPLACE FUNCTION public.reassign_absent_agents(integer) RETURNS integer; SELECT public.mcp_exec(NULL, 0)'
apply_migration
assert_name 'statement hibrido falha fechado sem rename' \
  '20260829020000' 'mcp_exec_functions_harden'

# Mesmo prefixo sem mcp_exec, mas corpo/hash diferente, tambem nao autoriza.
reset_ledger
insert_fixture \
  '20260829020000' \
  'mcp_exec_functions_harden' \
  'CREATE OR REPLACE FUNCTION public.reassign_absent_agents(inactive_minutes integer) RETURNS integer LANGUAGE sql AS $$ SELECT 99 $$'
apply_migration
assert_name 'assinatura criptografica divergente nao autoriza rename' \
  '20260829020000' 'mcp_exec_functions_harden'

# Ausencia de prova material tambem permanece intocada.
reset_ledger
insert_fixture '20260829020000' 'mcp_exec_functions_harden' '<NULL>'
apply_migration
assert_name 'statements nulos nao autorizam rename' \
  '20260829020000' 'mcp_exec_functions_harden'

# A referencia antiga do Gmail e corrigida, e uma segunda aplicacao e no-op.
reset_ledger
psql_sql <<'SQL' >/dev/null
INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES (
  '20260827130000',
  'fix_gmail_crypto_search_path_and_missing_key',
  ARRAY[
    'historical-evidence-a-must-be-preserved',
    'historical-evidence-b-must-be-preserved',
    '-- Fonte de verdade: supabase/migrations/20260827130000_fix_gmail_crypto_search_path.sql'
  ]
);
SQL
apply_migration
gmail_source="$(psql_sql -At -c "SELECT statements[3] FROM supabase_migrations.schema_migrations WHERE version = '20260827130000'")"
[[ "$gmail_source" == '-- Fonte de verdade: supabase/migrations/20260827130000_fix_gmail_crypto_search_path_and_missing_key.sql' ]] ||
  fail 'a primeira aplicacao nao corrigiu a referencia Gmail'
((passed += 1))
printf '[PASS] referencia Gmail stale e reconciliada\n'
gmail_untouched="$(psql_sql -At -F '|' -c "SELECT statements[1], statements[2] FROM supabase_migrations.schema_migrations WHERE version = '20260827130000'")"
[[ "$gmail_untouched" == 'historical-evidence-a-must-be-preserved|historical-evidence-b-must-be-preserved' ]] ||
  fail 'a reconciliacao sobrescreveu evidencias Gmail fora de statements[3]'
((passed += 1))
printf '[PASS] evidencias Gmail fora do marcador stale sao preservadas\n'
first_snapshot="$(psql_sql -At -c "SELECT md5(row_to_json(m)::text) FROM supabase_migrations.schema_migrations AS m WHERE version = '20260827130000'")"
apply_migration
second_snapshot="$(psql_sql -At -c "SELECT md5(row_to_json(m)::text) FROM supabase_migrations.schema_migrations AS m WHERE version = '20260827130000'")"
[[ "$first_snapshot" == "$second_snapshot" ]] || fail 'segunda aplicacao alterou o ledger reconciliado'
((passed += 1))
printf '[PASS] migration e idempotente apos reconciliar a referencia Gmail\n'

printf '[PASS] %s cenarios de reconciliacao do ledger validados\n' "$passed"
