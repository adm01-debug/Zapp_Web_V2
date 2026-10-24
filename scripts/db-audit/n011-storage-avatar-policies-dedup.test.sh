#!/usr/bin/env bash
# N-011 (P2 · banco, inventario A4): dedup de policies de leitura e exclusao em
# storage.objects para avatar, figurinha (stickers), meme (audio-memes) e emoji
# (custom-emojis).
#
# A prova roda num PostgreSQL 17 descartavel, contra os ARQUIVOS REAIS do repo
# aplicados verbatim (nada de CREATE POLICY copiado para dentro do teste):
#   20260511233306_0e3f3b66-5585-4762-af6b-549c050f6275.sql -> a origem, que cria
#     DOIS pares com USING identico em avatars (SELECT: "Anyone can view avatars"
#     + "Avatar images are publicly accessible"; DELETE: singular "Users can
#     delete their own avatar" + plural "Users can delete their own avatars") e
#     UMA policy por verbo de leitura/exclusao em stickers, audio-memes e
#     custom-emojis.
#   20261011000019_n011_storage_drop_duplicate_avatar_policies.sql -> o fix, que
#     apaga as 2 redundantes de avatars.
#
# O contrato prova:
#   (a) contagem exata por bucket+verbo: avatars SELECT/DELETE = 1 (os nomes
#       mantidos), stickers/audio-memes/custom-emojis SELECT/DELETE = 1;
#   (b) comportamento com papel real: dono apaga o proprio avatar, outro usuario
#       autenticado nao apaga o alheio, anonimo nao le nem apaga;
#   (c) reaplicacao do fix e idempotente.
#
# Migrations já aplicadas são imutáveis; este teste não executa os rollbacks
# documentados no cabeçalho.
#
# N011_WITHOUT_FIX=1 pula o fix para reproduzir o estado ANTERIOR (vermelho):
# as contagens de avatars voltam a 2 e o teste falha.
#
# Inicia container proprio e roda CREATE ROLE anon/authenticated — as roles sao
# globais ao cluster, entao o docker-shim do E47 colidiria com as do shim: o
# passo do workflow usa SKIP_DOCKER_SHIM=1, como os vizinhos.
# As sessoes usam SET ROLE + request.jwt.claim.sub, como no resto da suite.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migrations="$repo_root/supabase/migrations"
origin_migration="$migrations/20260511233306_0e3f3b66-5585-4762-af6b-549c050f6275.sql"
fix_migration="$migrations/20261011000019_n011_storage_drop_duplicate_avatar_policies.sql"
postgres_image="${N011_AVATAR_DEDUP_TEST_POSTGRES_IMAGE:-${POSTGRES_TEST_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}}"
container_name="n011-avatar-dedup-test-$$"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

run_as() {
  local role="$1" sub="$2" sql="$3"
  psql_test -Atqc "SET ROLE $role; SET request.jwt.claim.sub = '$sub'; $sql" 2>&1
}

expect_ok_as() {
  local label="$1" role="$2" sub="$3" sql="$4" out status
  set +e
  out="$(run_as "$role" "$sub" "$sql")"
  status=$?
  set -e
  (( status == 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria passar, mas falhou"; }
  printf '%s' "$out"
}

expect_error_as() {
  local label="$1" role="$2" sub="$3" needle="$4" sql="$5" out status
  set +e
  out="$(run_as "$role" "$sub" "$sql")"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava '$needle'"; }
  pass "$label"
}

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD=postgres "$postgres_image" >/dev/null; then
      printf 'WARN: container PostgreSQL nao subiu (tentativa %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 15); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: bootstrap do PostgreSQL nao ficou estavel (tentativa %s/3)\n' "$attempt" >&2
    docker logs "$container_name" >&2 || true
  done
  return 1
}

[[ -f "$origin_migration" ]] || fail "migration de origem ausente: $origin_migration"
[[ -f "$fix_migration" ]] || fail "migration do fix ausente: $fix_migration"

start_postgres || fail 'PostgreSQL de teste não iniciou'

owner_uid='30000000-0000-0000-0000-000000000001'
other_uid='30000000-0000-0000-0000-000000000002'

# Estudobios minimos que a migration de origem exige: ela nao os cria (no
# Supabase real ja existem), mas referencia cada um nas policies.
psql_test >/dev/null <<'SQL'
CREATE SCHEMA storage;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array(trim($1, '/'), '/')
$$;
CREATE FUNCTION public.is_admin_or_supervisor(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT false
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.contacts (id uuid PRIMARY KEY, assigned_to uuid);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid);
CREATE TABLE public.team_conversation_members (profile_id uuid NOT NULL, conversation_id uuid NOT NULL);
GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT SELECT ON storage.objects TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON public.contacts, public.profiles, public.team_conversation_members TO anon, authenticated;
SQL

psql_test < "$origin_migration" >/dev/null

if [[ "${N011_WITHOUT_FIX:-0}" != "1" ]]; then
  psql_test < "$fix_migration" >/dev/null
  # Idempotencia: aplicar de novo nao pode falhar.
  psql_test < "$fix_migration" >/dev/null
  pass "fix reaplicavel (idempotente)"
fi

# (a) Uma policy por bucket+verbo de leitura/exclusao, com os nomes mantidos.
check_count() {
  local label="$1" bucket="$2" cmd="$3" expected_names="$4" got
  got="$(psql_q "SELECT coalesce(string_agg(policyname, '|' ORDER BY policyname), '') FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = '$cmd' AND qual LIKE '%$bucket%'")"
  [[ "$got" == "$expected_names" ]] || fail "$label: esperado [$expected_names], obtido [$got]"
  pass "$label"
}

check_count "avatars SELECT dedup" "avatars" "SELECT" "Anyone can view avatars"
check_count "avatars DELETE dedup" "avatars" "DELETE" "Users can delete their own avatar"
check_count "stickers SELECT unica" "stickers" "SELECT" "Anyone can view stickers"
check_count "stickers DELETE unica" "stickers" "DELETE" "Users can delete own stickers"
check_count "audio-memes SELECT unica" "audio-memes" "SELECT" "Public read audio memes"
check_count "audio-memes DELETE unica" "audio-memes" "DELETE" "Users can delete own audio memes"
check_count "custom-emojis SELECT unica" "custom-emojis" "SELECT" "Public read for custom emojis"
check_count "custom-emojis DELETE unica" "custom-emojis" "DELETE" "Users can delete own custom emojis"

if [[ "${N011_WITHOUT_FIX:-0}" == "1" ]]; then
  fail "N011_WITHOUT_FIX=1: estado anterior reproduzido (contagens acima deveriam ter falhado)"
fi

# (b) Comportamento com papel real: o acesso efetivo nao muda com o dedup.
psql_q "INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '$owner_uid/a.png'), ('avatars', '$other_uid/b.png')" >/dev/null

got="$(expect_ok_as "dono le avatares" "authenticated" "$owner_uid" "SELECT count(*) FROM storage.objects WHERE bucket_id = 'avatars'")"
[[ "$got" == "2" ]] || fail "dono le avatares: esperado 2, obtido [$got]"
pass "dono le avatares"

got="$(expect_ok_as "dono apaga o proprio avatar" "authenticated" "$owner_uid" "DELETE FROM storage.objects WHERE bucket_id = 'avatars' AND name = '$owner_uid/a.png' RETURNING name")"
[[ "$got" == "$owner_uid/a.png" ]] || fail "dono apaga o proprio avatar: esperado [$owner_uid/a.png], obtido [$got]"
pass "dono apaga o proprio avatar"

got="$(expect_ok_as "outro usuario apaga o proprio" "authenticated" "$other_uid" "DELETE FROM storage.objects WHERE bucket_id = 'avatars' AND name = '$other_uid/b.png' RETURNING name")"
[[ "$got" == "$other_uid/b.png" ]] || fail "outro usuario apaga o proprio: esperado [$other_uid/b.png], obtido [$got]"
pass "outro usuario apaga o proprio"

psql_q "INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '$owner_uid/c.png')" >/dev/null
got="$(expect_ok_as "outro usuario nao apaga o alheio" "authenticated" "$other_uid" "DELETE FROM storage.objects WHERE bucket_id = 'avatars' AND name = '$owner_uid/c.png' RETURNING name")"
[[ -z "$got" ]] || fail "outro usuario nao apaga o alheio: esperado vazio, obtido [$got]"
pass "outro usuario nao apaga o alheio"

got="$(expect_ok_as "dono sobe o proprio avatar" "authenticated" "$owner_uid" "INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '$owner_uid/d.png') RETURNING name")"
[[ "$got" == "$owner_uid/d.png" ]] || fail "dono sobe o proprio avatar: esperado [$owner_uid/d.png], obtido [$got]"
pass "dono sobe o proprio avatar"

expect_error_as "outro usuario nao sobe avatar alheio" "authenticated" "$other_uid" "row-level security" \
  "INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '$owner_uid/evil.png')"

got="$(expect_ok_as "anonimo nao le avatares" "anon" "" "SELECT count(*) FROM storage.objects WHERE bucket_id = 'avatars'")"
[[ "$got" == "0" ]] || fail "anonimo nao le avatares: esperado 0, obtido [$got]"
pass "anonimo nao le avatares"

expect_error_as "anonimo nao apaga avatar" "anon" "" "permission denied" \
  "DELETE FROM storage.objects WHERE bucket_id = 'avatars' RETURNING name"

psql_test < "$fix_migration" >/dev/null
check_count "fix reaplicado (idempotente)" "avatars" "DELETE" "Users can delete their own avatar"

pass "N-011 dedup de policies de avatar provado"
