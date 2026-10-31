#!/usr/bin/env bash

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260909180000_disable_legacy_public_api_token.sql"
container_name="zapp-v2-public-api-disable-test-$$"
postgres_image="${PUBLIC_API_DISABLE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-public-api-disable-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
postgres_ready=false
for _ in $(seq 1 90); do
  ready_markers="$(docker logs "$container_name" 2>&1 \
    | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$ready_markers" -ge 2 ]] \
    && psql_sql 'SELECT 1' >/dev/null 2>&1; then
    postgres_ready=true
    break
  fi
  sleep 1
done
[[ "$postgres_ready" == true ]] || fail "PostgreSQL descartavel nao ficou pronto"

psql_sql "
  CREATE TABLE public.global_settings (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key text NOT NULL UNIQUE,
    value text,
    description text
  );
  INSERT INTO public.global_settings (key, value) VALUES
    ('api_token', 'legacy-secret-must-disappear'),
    ('auto_reopen_hours', '2');
" >/dev/null

psql_file "$migration" >/dev/null

[[ "$(psql_sql "SELECT count(*) FROM public.global_settings WHERE key = 'api_token'")" == '0' ]] ||
  fail 'migration nao removeu o token legado'
[[ "$(psql_sql "SELECT value FROM public.global_settings WHERE key = 'auto_reopen_hours'")" == '2' ]] ||
  fail 'migration alterou configuracao nao relacionada'
[[ "$(psql_sql "SELECT convalidated FROM pg_constraint WHERE conname = 'global_settings_no_plaintext_api_token'")" == 't' ]] ||
  fail 'constraint nao foi validada'

set +e
insert_output="$(psql_sql "INSERT INTO public.global_settings (key, value) VALUES ('api_token', 'reintroduced')" 2>&1)"
insert_status=$?
set -e
if (( insert_status == 0 )) || [[ "$insert_output" != *'global_settings_no_plaintext_api_token'* ]]; then
  fail 'banco aceitou reintroducao do token plaintext'
fi

psql_file "$migration" >/dev/null
[[ "$(psql_sql 'SELECT count(*) FROM public.global_settings')" == '1' ]] ||
  fail 'segunda aplicacao nao foi idempotente'

printf 'Public API disable PostgreSQL 17 behavioral contract: PASS\n'
