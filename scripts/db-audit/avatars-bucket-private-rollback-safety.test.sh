#!/usr/bin/env bash
# Executa a migration de bucket privado e seu rollback declarado em PostgreSQL
# descartavel. Prova que rollback nao torna avatars publico nem remove o escopo de
# dono das policies de DELETE existentes.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261009182648_avatars_bucket_private.sql"
n011_older="$repo_root/supabase/migrations/20261011000019_n011_storage_drop_duplicate_avatar_policies.sql"
n011_current="$repo_root/supabase/migrations/20261016105108_n011_storage_drop_duplicate_avatar_policies.sql"
postgres_image="${AVATARS_PRIVATE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-avatars-private-rollback-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-avatars-private-rollback-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$n011_older" ]] || fail "migration nao encontrada: $n011_older"
[[ -f "$n011_current" ]] || fail "migration nao encontrada: $n011_current"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL);
INSERT INTO storage.buckets VALUES ('avatars', 'avatars', true);
CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text NOT NULL, name text NOT NULL);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array(trim($1, '/'), '/')
$$;
CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
GRANT USAGE ON SCHEMA auth, storage TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;

CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete their own avatars" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
SQL

echo '── Aplicando migration de bucket privado ─────────────────────────────────────────'
psql_file "$migration" >/dev/null
rollback_sql="$(sed -n 's/^-- Rollback: //p' "$migration" | head -n1)"
[[ -n "$rollback_sql" ]] || fail 'rollback executavel nao encontrado no cabecalho da migration'
psql_sql "$rollback_sql" >/dev/null

expect_value 'bucket permanece privado apos rollback' 'f' \
  "SELECT public FROM storage.buckets WHERE id='avatars'"
expect_value 'policy de leitura autenticada privada preservada' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatars authenticated read' AND roles = ARRAY['authenticated']::name[]"
expect_value 'policies de leitura publica legadas ausentes' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname IN ('Anyone can view avatars','Avatar images are publicly accessible')"
expect_value 'DELETE do dono permanece com escopo de usuario' '2' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='DELETE' AND qual ILIKE '%foldername%' AND qual ILIKE '%auth.uid%'"

echo '── Rollbacks N-011 nao restauram policies removidas ─────────────────────────────'
psql_file "$n011_older" >/dev/null
n011_rollback="$(sed -n 's/^-- Rollback: //p' "$n011_older" | head -n1)"
[[ -n "$n011_rollback" ]] || fail 'rollback N-011 anterior ausente'
psql_sql "$n011_rollback" >/dev/null
expect_value 'N-011 anterior remove duplicata sem rollback permissivo' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='DELETE' AND qual ILIKE '%foldername%' AND qual ILIKE '%auth.uid%'"
psql_file "$n011_current" >/dev/null
n011_rollback="$(sed -n 's/^-- Rollback: //p' "$n011_current" | head -n1)"
[[ -n "$n011_rollback" ]] || fail 'rollback N-011 atual ausente'
psql_sql "$n011_rollback" >/dev/null
expect_value 'N-011 atual nao aumenta o numero de policies' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='DELETE' AND qual ILIKE '%foldername%' AND qual ILIKE '%auth.uid%'"
expect_value 'N-011 rollback nao altera a privacidade do bucket' 'f' \
  "SELECT public FROM storage.buckets WHERE id='avatars'"
expect_value 'N-011 rollback nao recria leitura legada' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname IN ('Anyone can view avatars','Avatar images are publicly accessible')"

psql_sql "INSERT INTO storage.objects VALUES ('10000000-0000-0000-0000-000000000001','avatars','30000000-0000-0000-0000-000000000001/a.png'), ('10000000-0000-0000-0000-000000000002','avatars','30000000-0000-0000-0000-000000000002/b.png')" >/dev/null
got="$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='30000000-0000-0000-0000-000000000002'; DELETE FROM storage.objects WHERE id='10000000-0000-0000-0000-000000000001' RETURNING id")"
[[ -z "$got" ]] || fail "usuario autenticado excluiu avatar alheio: $got"
printf '[PASS] %s\n' 'usuario autenticado nao exclui avatar de terceiro'
got="$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='30000000-0000-0000-0000-000000000001'; DELETE FROM storage.objects WHERE id='10000000-0000-0000-0000-000000000001' RETURNING id")"
[[ "$got" == '10000000-0000-0000-0000-000000000001' ]] || fail "dono nao conseguiu excluir seu avatar: $got"
printf '[PASS] %s\n' 'dono continua podendo excluir o proprio avatar'
expect_value 'anon nao le objetos do bucket privado' '0' \
  "SET ROLE anon; SELECT count(*) FROM storage.objects WHERE bucket_id='avatars'"

psql_file "$migration" >/dev/null
expect_value 'reaplicar migration apos rollback continua idempotente' 'f' \
  "SELECT public FROM storage.buckets WHERE id='avatars'"
printf '\n[OK] rollback preserva privacidade e escopo de dono\n'
