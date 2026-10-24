#!/usr/bin/env bash
# Higiene de grants (SEC-DEFINER_GRANTS_STORAGE-07):
#  1) public.multiplix_audiences_validate_shared_roles() deixa de ter EXECUTE para
#     PUBLIC/anon/authenticated (segue service_role e o dono);
#  2) policies DUPLICADAS de storage.objects (mesmo bucket+verbo) caem, ficando UMA
#     por verbo/bucket nos quatro buckets citados.
#
# Estado inicial seguro: bucket privado, leitura apenas autenticada, duas DELETE
# redundantes com o mesmo escopo do dono. Este teste verifica apenas forward SQL e
# idempotencia; migrations já aplicadas são imutáveis e seus rollbacks não são executados.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011010001_higiene_grants_public_policies.sql"
postgres_image="${HIGIENE_GRANTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-higiene-grants-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-higiene-grants-test-[0-9]+$ ]]; then
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

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

-- storage.objects minimo (so o que as policies leem)
CREATE SCHEMA storage;
CREATE SCHEMA auth;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', false);
CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array(trim($1, '/'), '/')
$$;
GRANT USAGE ON SCHEMA storage, auth TO anon, authenticated;

-- funcao de TRIGGER, sem argumentos (identidade real). CREATE FUNCTION ja da
-- EXECUTE a PUBLIC; o GRANT explicito a anon/authenticated/service_role imita os
-- default privileges do Supabase (que aparecem no schema-manifest).
CREATE FUNCTION public.multiplix_audiences_validate_shared_roles()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.marcador = 'dispara' THEN
    RAISE EXCEPTION 'trigger_multiplix_disparou';
  END IF;
  RETURN NEW;
END $$;
GRANT EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles()
  TO anon, authenticated, service_role;

-- tabela+trigger reais para provar que o trigger continua disparando sem EXECUTE
CREATE TABLE public.multiplix_audiences (marcador text);
GRANT INSERT ON public.multiplix_audiences TO authenticated;
CREATE TRIGGER trg_multiplix_audiences_validate_shared_roles
  BEFORE INSERT OR UPDATE ON public.multiplix_audiences
  FOR EACH ROW EXECUTE FUNCTION public.multiplix_audiences_validate_shared_roles();

-- Par de SELECT real da migration: a policy canonica fica, a redundante deve cair.
CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "Anyone can view stickers" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'stickers');
CREATE POLICY "Public read audio memes" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'audio-memes');
CREATE POLICY "Public read for custom emojis" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'custom-emojis');

-- Par duplicado em avatars (DELETE)
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete their own avatars" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
GRANT SELECT, DELETE ON storage.objects TO anon, authenticated;
SQL

psql_file "$tmp_dir/pre.sql"

sel_avatars="SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT' AND qual LIKE '%bucket_id = ''avatars''%'"
del_avatars="SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='DELETE' AND qual LIKE '%bucket_id = ''avatars''%'"
sel_stickers="SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT' AND qual LIKE '%bucket_id = ''stickers''%'"
sel_audio="SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT' AND qual LIKE '%bucket_id = ''audio-memes''%'"
sel_emoji="SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT' AND qual LIKE '%bucket_id = ''custom-emojis''%'"
exec_role() { printf "SELECT has_function_privilege('%s','public.multiplix_audiences_validate_shared_roles()','EXECUTE')" "$1"; }

echo '── BLOCO A: ANTES (bucket privado + DELETE redundante) ───────────────────────────'
expect_value 'A1 avatars SELECT duplicado (2)' '2' "$sel_avatars"
expect_value 'A2 avatars DELETE duplicado (2)' '2' "$del_avatars"
expect_value 'A3 PUBLIC executa a funcao' 't' "$(exec_role anon)"
expect_value 'A4 authenticated executa a funcao' 't' "$(exec_role authenticated)"

echo
echo '── Aplicando a migration ─────────────────────────────────────────────────────────'
psql_file "$migration"

echo
echo '── BLOCO B: DEPOIS (higiene aplicada) ────────────────────────────────────────────'
expect_value 'B1 avatars SELECT = 1 (so a canonica)' '1' "$sel_avatars"
expect_value 'B2 SELECT canonica mantida e policy publica redundante removida' 'Anyone can view avatars' \
  "SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT' AND qual LIKE '%bucket_id = ''avatars''%'"
expect_value 'B3 avatars DELETE = 1 (so a canonica)' '1' "$del_avatars"
expect_value 'B4 a canonica mantida e "Users can delete their own avatar"' 'Users can delete their own avatar' \
  "SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='DELETE' AND qual LIKE '%bucket_id = ''avatars''%'"
expect_value 'B4a DELETE canonica segue escopada ao dono' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete their own avatar' AND qual ILIKE '%foldername%' AND qual ILIKE '%auth.uid%'"
expect_value 'B5 stickers SELECT = 1 (nada removido)' '1' "$sel_stickers"
expect_value 'B6 audio-memes SELECT = 1 (nada removido)' '1' "$sel_audio"
expect_value 'B7 custom-emojis SELECT = 1 (nada removido)' '1' "$sel_emoji"
expect_value 'B8 anon perdeu EXECUTE' 'f' "$(exec_role anon)"
expect_value 'B9 authenticated perdeu EXECUTE' 'f' "$(exec_role authenticated)"
expect_value 'B10 service_role MANTEVE EXECUTE' 't' "$(exec_role service_role)"

# Prova de efeito colateral: o trigger roda como o dono e NAO depende de EXECUTE do
# papel que dispara — entao o INSERT como authenticated continua disparando a funcao.
trig_out="$(docker exec "$container_name" psql -X -qAt -U postgres -d postgres \
  -c "SET ROLE authenticated; INSERT INTO public.multiplix_audiences(marcador) VALUES ('dispara');" 2>&1 || true)"
if [[ "$trig_out" != *trigger_multiplix_disparou* ]]; then
  fail "B11 trigger nao disparou para authenticated apos o REVOKE: $trig_out"
fi
printf '[PASS] %s\n' 'B11 trigger segue disparando como authenticated (sem depender de EXECUTE)'

echo
echo '── BLOCO C: reaplicacao idempotente ──────────────────────────────────────────────'
psql_file "$migration"
expect_value 'C1 avatars SELECT segue 1' '1' "$sel_avatars"
expect_value 'C2 avatars DELETE segue 1' '1' "$del_avatars"
expect_value 'C3 anon segue sem EXECUTE' 'f' "$(exec_role anon)"

printf '\n[OK] higiene de grants e policies duplicadas verificada\n'
