#!/usr/bin/env bash

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
original_migration="$repo_root/supabase/migrations/20260830153000_webhook_failures_dead_letter.sql"
harden_migration="$repo_root/supabase/migrations/20260831120000_harden_webhook_failures_acl.sql"
guard_sql="$repo_root/scripts/db-audit/check-webhook-failures-acl.sql"
container_name="zapp-v2-webhook-acl-test-$$"
postgres_image="${WEBHOOK_ACL_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-webhook-acl-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

wait_for_postgres() {
  local attempt logs
  for attempt in $(seq 1 60); do
    logs="$(docker logs "$container_name" 2>&1 || true)"
    if [[ "$logs" == *'PostgreSQL init process complete; ready for start up.'* ]] &&
      docker exec "$container_name" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

reset_fixture() {
  psql_sql 'DROP TABLE IF EXISTS public.webhook_failures CASCADE;' >/dev/null
  psql_file "$original_migration" >/dev/null
  psql_file "$harden_migration" >/dev/null
}

run_guard() {
  local output_var="$1" status_var="$2" guard_output guard_status
  set +e
  guard_output="$(psql_file "$guard_sql" 2>&1)"
  guard_status=$?
  set -e
  printf -v "$output_var" '%s' "$guard_output"
  printf -v "$status_var" '%s' "$guard_status"
}

assert_passes() {
  local label="$1" output status
  run_guard output status
  if (( status != 0 )) || [[ "$output" != *'OK: webhook_failures restrita'* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label deveria passar"
  fi
  ((passed += 1))
  printf '[PASS] %s\n' "$label"
}

assert_fails() {
  local label="$1" mutation="$2" output status
  reset_fixture
  psql_sql "$mutation" >/dev/null
  run_guard output status
  if (( status == 0 )) || [[ "$output" != *'FALHA: contrato de ACL'* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label deveria falhar"
  fi
  ((passed += 1))
  printf '[PASS] %s (bloqueado com status %s)\n' "$label" "$status"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=acl_test_only "$postgres_image" >/dev/null
wait_for_postgres || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

psql_sql '
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
' >/dev/null

psql_sql 'DROP TABLE IF EXISTS public.webhook_failures CASCADE;' >/dev/null
psql_file "$original_migration" >/dev/null
run_guard pre_output pre_status
if (( pre_status == 0 )); then
  fail 'migration original insegura deveria ser bloqueada'
fi
((passed += 1))
printf '[PASS] migration original insegura foi bloqueada\n'

reset_fixture
assert_passes 'baseline endurecido'

assert_fails 'grant SELECT para anon' \
  'GRANT SELECT ON public.webhook_failures TO anon'
assert_fails 'grant UPDATE para authenticated' \
  'GRANT UPDATE ON public.webhook_failures TO authenticated'
assert_fails 'policy voltou a PUBLIC' \
  'DROP POLICY service_role_full ON public.webhook_failures; CREATE POLICY service_role_full ON public.webhook_failures USING (true) WITH CHECK (true)'
assert_fails 'policy adicional inesperada' \
  'CREATE POLICY extra_policy ON public.webhook_failures TO authenticated USING (false)'
assert_fails 'RLS desabilitado' \
  'ALTER TABLE public.webhook_failures DISABLE ROW LEVEL SECURITY'
assert_fails 'service_role recebeu TRUNCATE' \
  'GRANT TRUNCATE ON public.webhook_failures TO service_role'
assert_fails 'service_role recebeu GRANT OPTION' \
  'GRANT SELECT ON public.webhook_failures TO service_role WITH GRANT OPTION'
assert_fails 'tabela ausente' \
  'DROP TABLE public.webhook_failures'

printf 'Webhook ACL guard (%s): %s cenarios aprovados.\n' "$postgres_image" "$passed"
