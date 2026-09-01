#!/usr/bin/env bash

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
guard_sql="$repo_root/scripts/db-audit/check-mcp-exec-acl.sql"
contract_migration="$repo_root/supabase/migrations/20260829020000_mcp_exec_functions_harden.sql"
container_name="zapp-v2-acl-test-$$"
postgres_image="${ACL_TEST_POSTGRES_IMAGE:-postgres:16-alpine}"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-acl-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

wait_for_postgres() {
  local attempt
  local container_logs
  for attempt in $(seq 1 60); do
    # A imagem oficial sobe um servidor temporario durante initdb e o encerra
    # antes do processo final. pg_isready sozinho pode capturar essa janela e
    # causar falha intermitente no primeiro psql. O marcador abaixo so aparece
    # depois que a inicializacao temporaria terminou.
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

reset_fixture() {
  psql_sql "
    DROP FUNCTION IF EXISTS public.mcp_exec_many(text[], integer);
    DROP FUNCTION IF EXISTS public.mcp_exec(text, integer);
    DROP ROLE IF EXISTS acl_owner, acl_direct, acl_inheritor, acl_reachable, acl_alt_grantor;
    ALTER ROLE authenticator NOINHERIT;
    ALTER ROLE postgres INHERIT;
    ALTER ROLE supabase_realtime_admin NOINHERIT;
    ALTER ROLE supabase_storage_admin NOINHERIT;
    REVOKE authenticator FROM supabase_storage_admin;
    REVOKE authenticator FROM postgres;
    REVOKE service_role FROM authenticator;
    REVOKE service_role FROM supabase_realtime_admin;
    REVOKE service_role FROM supabase_storage_admin;
    REVOKE service_role FROM postgres;
    GRANT service_role TO authenticator;
    GRANT service_role TO postgres WITH ADMIN OPTION;
    GRANT service_role TO supabase_realtime_admin;
    GRANT authenticator TO postgres WITH ADMIN OPTION;
    GRANT authenticator TO supabase_storage_admin;
  " >/dev/null

  psql_file "$contract_migration" >/dev/null

  psql_sql "
    REVOKE EXECUTE ON FUNCTION public.mcp_exec(text, integer) FROM PUBLIC, anon, authenticated;
    REVOKE EXECUTE ON FUNCTION public.mcp_exec_many(text[], integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.mcp_exec(text, integer) TO postgres, service_role;
    GRANT EXECUTE ON FUNCTION public.mcp_exec_many(text[], integer) TO postgres, service_role;
  " >/dev/null
}

run_guard() {
  local output_var="$1"
  local status_var="$2"
  local guard_output
  local guard_status

  set +e
  guard_output="$(psql_file "$guard_sql" 2>&1)"
  guard_status=$?
  set -e

  printf -v "$output_var" '%s' "$guard_output"
  printf -v "$status_var" '%s' "$guard_status"
}

assert_guard_passes() {
  local label="$1"
  local expected_many_hash="${2:-509fb7baea9d4a7c77b36d381a1527cd}"
  local output
  local status

  run_guard output status

  if (( status != 0 )) || [[ "$output" != *"OK: mcp_exec e mcp_exec_many"* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label deveria passar, mas saiu com status $status"
  fi
  if [[ "$output" != *'"body_md5": "8f8356d5fbeb51bcb5f6ab4e5a4fc1c8"'* ]] ||
    [[ "$output" != *"\"body_md5\": \"$expected_many_hash\""* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label nao publicou os fingerprints seguros dos corpos"
  fi

  ((passed += 1))
  printf '[PASS] %s\n' "$label"
}

assert_guard_fails() {
  local label="$1"
  local output
  local status

  run_guard output status

  if (( status == 0 )) || [[ "$output" != *"FALHA: contrato de ACL"* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label deveria falhar, mas saiu com status $status"
  fi

  if [[ "$output" == *'extra argument "1" ignored'* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label recaiu no comportamento fail-open de \\quit 1"
  fi

  ((passed += 1))
  printf '[PASS] %s (bloqueado com status %s)\n' "$label" "$status"
}

run_negative_sql_case() {
  local label="$1"
  local mutation="$2"

  reset_fixture
  psql_sql "$mutation" >/dev/null
  assert_guard_fails "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$guard_sql" ]] || fail "guard ausente: $guard_sql"
[[ -f "$contract_migration" ]] || fail "migration de contrato ausente: $contract_migration"

docker run --rm -d \
  --name "$container_name" \
  -e POSTGRES_PASSWORD=acl_test_only \
  "$postgres_image" >/dev/null

wait_for_postgres || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto em 60s"

psql_sql "
  CREATE ROLE service_role NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticator NOLOGIN NOINHERIT;
  CREATE ROLE supabase_realtime_admin NOLOGIN NOINHERIT;
  CREATE ROLE supabase_storage_admin NOLOGIN NOINHERIT;
" >/dev/null

reset_fixture
assert_guard_passes 'baseline seguro com topologia Supabase Cloud PG 17.6'

reset_fixture
docker exec -i "$container_name" \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.mcp_exec_many(statements text[], max_rows integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare i int; n int := coalesce(array_length(statements, 1), 0); res jsonb := '[]'::jsonb; t0 timestamptz := clock_timestamp();
begin
  for i in 1 .. n loop
    res := res || jsonb_build_object('i', i, 'sql', left(statements[i], 200), 'result', public.mcp_exec(statements[i], max_rows));
  end loop;
  return jsonb_build_object('ok', true, 'count', n, 'results', res, 'ms', round(extract(epoch from clock_timestamp()-t0)*1000));
end $function$;
SQL
assert_guard_passes \
  'representacao compacta e semanticamente equivalente do runtime' \
  '61948e225a30ce3f73e13c833716e74c'
[[ "$(psql_sql "SELECT public.mcp_exec_many(ARRAY['SELECT 1 AS value'], 10)->'results'->0->'result'->'rows'->0->>'value'")" == *'1'* ]] ||
  fail 'mcp_exec_many compacto nao preservou o comportamento esperado'

reset_fixture
# Simula uma ACL restaurada de dump com grantor superuser diferente. A alteracao
# direta de catalogo ocorre somente dentro deste PostgreSQL descartavel.
psql_sql "
  CREATE ROLE acl_alt_grantor SUPERUSER NOLOGIN;
  SET allow_system_table_mods = on;
  UPDATE pg_catalog.pg_proc
  SET proacl = ARRAY[
    format('%I=X/%I', 'postgres', 'postgres')::aclitem,
    format('%I=X/%I', 'service_role', 'acl_alt_grantor')::aclitem
  ]
  WHERE oid = 'public.mcp_exec(text,integer)'::regprocedure;
" >/dev/null
assert_guard_passes 'grant explicito legitimo com grantor diferente'

run_negative_sql_case \
  'funcao esperada ausente' \
  'DROP FUNCTION public.mcp_exec_many(text[], integer)'

run_negative_sql_case \
  'overload inesperado' \
  "CREATE FUNCTION public.mcp_exec(text) RETURNS jsonb LANGUAGE sql AS 'SELECT jsonb_build_object()'"

run_negative_sql_case \
  'owner inesperado' \
  'CREATE ROLE acl_owner NOLOGIN; ALTER FUNCTION public.mcp_exec(text, integer) OWNER TO acl_owner'

run_negative_sql_case \
  'SECURITY INVOKER' \
  'ALTER FUNCTION public.mcp_exec(text, integer) SECURITY INVOKER'

run_negative_sql_case \
  'atributo de execucao adulterado' \
  'ALTER FUNCTION public.mcp_exec(text, integer) IMMUTABLE'

run_negative_sql_case \
  'grant para PUBLIC' \
  'GRANT EXECUTE ON FUNCTION public.mcp_exec(text, integer) TO PUBLIC'

run_negative_sql_case \
  'grant para anon' \
  'GRANT EXECUTE ON FUNCTION public.mcp_exec(text, integer) TO anon'

run_negative_sql_case \
  'grant para authenticated' \
  'GRANT EXECUTE ON FUNCTION public.mcp_exec(text, integer) TO authenticated'

run_negative_sql_case \
  'grant direto para role custom' \
  'CREATE ROLE acl_direct NOLOGIN; GRANT EXECUTE ON FUNCTION public.mcp_exec(text, integer) TO acl_direct'

run_negative_sql_case \
  'role custom herdando service_role' \
  'CREATE ROLE acl_inheritor NOLOGIN INHERIT; GRANT service_role TO acl_inheritor'

run_negative_sql_case \
  'role custom NOINHERIT alcancando service_role' \
  'CREATE ROLE acl_reachable NOLOGIN NOINHERIT; GRANT service_role TO acl_reachable'

run_negative_sql_case \
  'authenticator deixou de ser NOINHERIT' \
  'ALTER ROLE authenticator INHERIT'

run_negative_sql_case \
  'service_role com WITH GRANT OPTION' \
  'GRANT EXECUTE ON FUNCTION public.mcp_exec(text, integer) TO service_role WITH GRANT OPTION'

run_negative_sql_case \
  'search_path ausente' \
  'ALTER FUNCTION public.mcp_exec(text, integer) RESET search_path'

reset_fixture
sed '0,/DEFAULT 200/s//DEFAULT 201/' "$contract_migration" | \
  docker exec -i "$container_name" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null
assert_guard_fails 'default do contrato adulterado'

run_negative_sql_case \
  'search_path ausente em mcp_exec_many' \
  'ALTER FUNCTION public.mcp_exec_many(text[], integer) RESET search_path'

reset_fixture
sed '0,/DEFAULT 100/s//DEFAULT 101/' "$contract_migration" | \
  docker exec -i "$container_name" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null
assert_guard_fails 'default de mcp_exec_many adulterado'

reset_fixture
docker exec -i "$container_name" \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.mcp_exec(sql text, max_rows integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  RETURN jsonb_build_object('tampered', true);
END
$function$;
SQL
assert_guard_fails 'corpo/contrato adulterado'

reset_fixture
docker exec -i "$container_name" \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.mcp_exec_many(statements text[], max_rows integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  RETURN jsonb_build_object('tampered', true);
END
$function$;
SQL
assert_guard_fails 'corpo/contrato de mcp_exec_many adulterado'

run_negative_sql_case \
  'role interna do Supabase deixou de ser NOINHERIT' \
  'ALTER ROLE supabase_realtime_admin INHERIT'

run_negative_sql_case \
  'caminho direto inesperado para Storage' \
  'GRANT service_role TO supabase_storage_admin'

run_negative_sql_case \
  'aresta obrigatoria da plataforma ausente' \
  'REVOKE service_role FROM supabase_realtime_admin'

run_negative_sql_case \
  'membership do authenticator passou a herdar service_role' \
  'GRANT service_role TO authenticator WITH INHERIT TRUE'

run_negative_sql_case \
  'SET OPTION interno removido' \
  'REVOKE SET OPTION FOR service_role FROM supabase_realtime_admin'

run_negative_sql_case \
  'ADMIN OPTION interno inesperado' \
  'GRANT service_role TO supabase_realtime_admin WITH ADMIN OPTION'

printf 'ACL guard (%s): %s cenarios aprovados.\n' "$postgres_image" "$passed"
