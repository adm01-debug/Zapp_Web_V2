#!/usr/bin/env bash
# N-144 — Prova que a migration revoga EXECUTE de PUBLIC na função de gatilho
# do Multiplix (multiplix_audiences_validate_shared_roles) e que só
# postgres e service_role conservam EXECUTE depois da migration.
#
# Bloco A — estado ANTERIOR (defeito): PUBLIC tem EXECUTE.
# Bloco B — migration aplicada: só postgres/service_role têm EXECUTE.
# Bloco C — rollback executado: PUBLIC tem EXECUTE de volta.
# Bloco D — reaplicação idempotente: só postgres/service_role têm EXECUTE.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010101613_revoke_execute_public_multiplix_trigger.sql"
postgres_image="${MULTIPLIX_REVOKE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-multiplix-revoke-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-multiplix-revoke-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}

expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}

expect_value_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}

expect_error_as() {
  local l="$1" j="$2" s="$3" output status
  set +e
  output="$(as_user "$j" "$s" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$l: deveria ter falhado, mas passou"
  fi
  printf '[PASS] %s\n' "$l"
}

printf '=== Iniciando container Postgres descartável ===\n'
docker run --rm -d --name "$container_name" \
  -e POSTGRES_PASSWORD=test_only \
  "$postgres_image" >/dev/null

# Prontidão
for _ in 1 2; do
  docker exec "$container_name" psql -X -qAt -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1 || sleep 1
done

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# pre.sql: schema mínimo + a função de gatilho no estado ANTERIOR à migration
# (sem SECURITY DEFINER, SET search_path = public — igual ao original).
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Função de gatilho no estado ANTERIOR (publica, sem SECURITY DEFINER):
-- EXECUTE para PUBLIC é o defeito que a migration corrige.
CREATE OR REPLACE FUNCTION public.multiplix_audiences_validate_shared_roles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
printf '=== Schema pré-migration criado ===\n'

# ── Bloco A: defeito existe (PUBLIC tem EXECUTE) ──────────────────────────
printf '\n=== Bloco A: estado ANTERIOR (defeito) ===\n'

expect_value 'A.1 anon tem EXECUTE da função (defeito)' 't' \
  "SELECT has_function_privilege('anon','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'A.2 authenticated tem EXECUTE da função (defeito)' 't' \
  "SELECT has_function_privilege('authenticated','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'A.3 service_role tem EXECUTE da função' 't' \
  "SELECT has_function_privilege('service_role','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'A.4 postgres tem EXECUTE da função' 't' \
  "SELECT has_function_privilege('postgres','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

# ── Bloco B: migration aplicada (só postgres/service_role) ────────────────
printf '\n=== Bloco B: migration aplicada ===\n'
psql_file "$migration" >/dev/null
printf 'Migration aplicada.\n'

expect_value 'B.1 anon NÃO tem mais EXECUTE' 'f' \
  "SELECT has_function_privilege('anon','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'B.2 authenticated NÃO tem mais EXECUTE' 'f' \
  "SELECT has_function_privilege('authenticated','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'B.3 service_role conserva EXECUTE' 't' \
  "SELECT has_function_privilege('service_role','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'B.4 postgres conserva EXECUTE' 't' \
  "SELECT has_function_privilege('postgres','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

# ── Bloco C: rollback executado (PUBLIC tem EXECUTE de volta) ─────────────
printf '\n=== Bloco C: rollback executado ===\n'
rollback_sql="GRANT EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles() TO PUBLIC, anon, authenticated;"
psql_sql "$rollback_sql" >/dev/null
printf 'Rollback executado.\n'

expect_value 'C.1 anon tem EXECUTE de volta (rollback)' 't' \
  "SELECT has_function_privilege('anon','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'C.2 authenticated tem EXECUTE de volta (rollback)' 't' \
  "SELECT has_function_privilege('authenticated','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'C.3 service_role tem EXECUTE de volta (rollback, via PUBLIC)' 't' \
  "SELECT has_function_privilege('service_role','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

# ── Bloco D: reaplicação idempotente (só postgres/service_role) ───────────
printf '\n=== Bloco D: reaplicação idempotente ===\n'
psql_file "$migration" >/dev/null
printf 'Migration reaplicada.\n'

expect_value 'D.1 anon NÃO tem EXECUTE (reaplicação)' 'f' \
  "SELECT has_function_privilege('anon','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'D.2 authenticated NÃO tem EXECUTE (reaplicação)' 'f' \
  "SELECT has_function_privilege('authenticated','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'D.3 service_role conserva EXECUTE (reaplicação)' 't' \
  "SELECT has_function_privilege('service_role','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'D.4 postgres conserva EXECUTE (reaplicação)' 't' \
  "SELECT has_function_privilege('postgres','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

printf '\n=== Todos os blocos passaram ===\n'