#!/usr/bin/env bash
# Prova da migration 20261012120000_webhook_failures_replay.sql num PostgreSQL
# descartável (nunca produção): as colunas do replay existem, o índice da fila
# filtra o que ainda não foi resolvido, e o ACL segue fechado — service_role
# grava/lê o evento reprocessável; anon e authenticated são NEGADOS.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
original_migration="$repo_root/supabase/migrations/20260830153000_webhook_failures_dead_letter.sql"
harden_migration="$repo_root/supabase/migrations/20260831120000_harden_webhook_failures_acl.sql"
replay_migration="$repo_root/supabase/migrations/20261012120000_webhook_failures_replay.sql"
acl_guard_sql="$repo_root/scripts/db-audit/check-webhook-failures-acl.sql"
replay_guard_sql="$repo_root/scripts/db-audit/check-webhook-failures-replay.sql"
container_name="zapp-v2-webhook-replay-test-$$"
postgres_image="${WEBHOOK_REPLAY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-webhook-replay-test-[0-9]+$ ]]; then
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
  psql_file "$replay_migration" >/dev/null
}

run_guard() {
  local guard_file="$1" output_var="$2" status_var="$3" guard_output guard_status
  set +e
  guard_output="$(psql_file "$guard_file" 2>&1)"
  guard_status=$?
  set -e
  printf -v "$output_var" '%s' "$guard_output"
  printf -v "$status_var" '%s' "$guard_status"
}

assert_replay_passes() {
  local label="$1" output status
  run_guard "$replay_guard_sql" output status
  if (( status != 0 )) || [[ "$output" != *'OK: webhook_failures reprocessavel'* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label deveria passar"
  fi
  ((passed += 1))
  printf '[PASS] %s\n' "$label"
}

assert_replay_fails() {
  local label="$1" mutation="$2" output status
  reset_fixture
  psql_sql "$mutation" >/dev/null
  run_guard "$replay_guard_sql" output status
  if (( status == 0 )) || [[ "$output" != *'FALHA: contrato da dead-letter reprocessavel'* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label deveria falhar"
  fi
  ((passed += 1))
  printf '[PASS] %s (bloqueado com status %s)\n' "$label" "$status"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=replay_test_only "$postgres_image" >/dev/null
wait_for_postgres || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

psql_sql '
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
' >/dev/null

reset_fixture
assert_replay_passes 'migration de replay + ACL fechado'

# A migration nova não pode afrouxar o contrato anterior: o guard antigo
# (policy única service_role_full + zero grant para anon/authenticated) tem de
# continuar passando depois dela.
run_guard "$acl_guard_sql" acl_output acl_status
if (( acl_status != 0 )) || [[ "$acl_output" != *'OK: webhook_failures restrita'* ]]; then
  printf '%s\n' "$acl_output" >&2
  fail 'guard de ACL anterior deixou de passar depois da migration de replay'
fi
((passed += 1))
printf '[PASS] guard de ACL anterior segue verde depois da migration\n'

assert_replay_fails 'coluna replay_payload removida' \
  'ALTER TABLE public.webhook_failures DROP COLUMN replay_payload'
assert_replay_fails 'coluna external_id removida' \
  'ALTER TABLE public.webhook_failures DROP COLUMN external_id'
assert_replay_fails 'indice da fila de replay removido' \
  'DROP INDEX public.webhook_failures_replay_pendente_idx'
assert_replay_fails 'anon recebeu leitura da dead-letter' \
  'GRANT SELECT ON public.webhook_failures TO anon'
assert_replay_fails 'anon recebeu leitura por coluna do replay' \
  'GRANT SELECT (replay_payload) ON public.webhook_failures TO anon'
assert_replay_fails 'authenticated recebeu escrita por coluna' \
  'GRANT UPDATE (replay_payload) ON public.webhook_failures TO authenticated'
assert_replay_fails 'service_role perdeu a escrita do evento' \
  'REVOKE INSERT ON public.webhook_failures FROM service_role'

printf 'Webhook replay guard (%s): %s cenarios aprovados.\n' "$postgres_image" "$passed"
