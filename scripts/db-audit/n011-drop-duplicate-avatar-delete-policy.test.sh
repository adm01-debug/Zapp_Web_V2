#!/usr/bin/env bash
# N-011: prova que a migration dropa a policy duplicada "Users can delete their own avatars"
# (plural) e mantém a policy singular "Users can delete their own avatar".
#
# Roda em Postgres descartável (docker). Aplica a migration real e prova com papel real
# (SET ROLE authenticated + request.jwt.claims).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010000000_storage_drop_duplicate_avatar_delete_policy.sql"
postgres_image="${N011_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-n011-storage-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-n011-storage-test-[0-9]+$ ]]; then
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
expect_ok_as() { local l="$1" j="$2" s="$3"; as_user "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como authenticated)"; printf '[PASS] %s\n' "$l"; }
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL,
  owner uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(_name text)
  RETURNS text[] LANGUAGE sql IMMUTABLE STRICT
  AS $$ SELECT string_to_array(_name, '/'); $$;

CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Users can delete their own avatars" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

GRANT SELECT ON storage.objects TO anon, authenticated, service_role;
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null

printf '\n============ BLOCO A — estado ANTERIOR (defeito: policy duplicada) ============\n'

DUPLICATE_COUNT="$(psql_sql "SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can delete their own avatars';")"
[[ "$DUPLICATE_COUNT" == "1" ]] || fail "B.1 esperava 1 policy duplicada 'Users can delete their own avatars', obteve '$DUPLICATE_COUNT'"
printf '[PASS] B.1 policy duplicada "Users can delete their own avatars" existe antes da migration\n'

SINGULAR_COUNT="$(psql_sql "SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can delete their own avatar';")"
[[ "$SINGULAR_COUNT" == "1" ]] || fail "B.2 esperava 1 policy singular 'Users can delete their own avatar', obteve '$SINGULAR_COUNT'"
printf '[PASS] B.2 policy singular "Users can delete their own avatar" existe antes da migration\n'

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$migration" >/dev/null

DUPLICATE_AFTER="$(psql_sql "SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can delete their own avatars';")"
[[ "$DUPLICATE_AFTER" == "0" ]] || fail "B.3 esperava 0 policies duplicadas apos migration, obteve '$DUPLICATE_AFTER'"
printf '[PASS] B.3 policy duplicada "Users can delete their own avatars" foi removida\n'

SINGULAR_AFTER="$(psql_sql "SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can delete their own avatar';")"
[[ "$SINGULAR_AFTER" == "1" ]] || fail "B.4 esperava 1 policy singular apos migration, obteve '$SINGULAR_AFTER'"
printf '[PASS] B.4 policy singular "Users can delete their own avatar" permanece\n'

printf '\nPASS: N-011 — policy duplicada "Users can delete their own avatars" removida, policy singular mantida.\n'