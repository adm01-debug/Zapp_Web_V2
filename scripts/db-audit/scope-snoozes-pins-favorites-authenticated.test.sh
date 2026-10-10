#!/usr/bin/env bash
# Prova que as policies de snooze, favorite e pin restringem a authenticated.
#
# BLOCO A (antes): 9 policies com roles={public} — anon consegue ler/gravar.
# BLOCO B (depois): 9 policies com roles={authenticated}; anon recebe 0 linhas
#   ou erro, e o dono continua lendo e gravando.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010000000_scope_snoozes_pins_favorites_policies_to_authenticated.sql"
postgres_image="${SNOOZE_FAV_PIN_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-snooze-fav-pin-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-snooze-fav-pin-test-[0-9]+$ ]]; then
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

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;

-- Tabelas (sem FK para manter o teste isolado).
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.conversation_snoozes (id uuid PRIMARY KEY, snoozed_by uuid NOT NULL, contact_id uuid NOT NULL, snoozed_at timestamptz DEFAULT now());
CREATE TABLE public.favorite_contacts (id uuid PRIMARY KEY, user_id uuid NOT NULL, contact_id uuid NOT NULL);
CREATE TABLE public.pinned_conversations (id uuid PRIMARY KEY, pinned_by uuid NOT NULL, contact_id uuid NOT NULL, pinned_at timestamptz DEFAULT now());

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_snoozes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_conversations ENABLE ROW LEVEL SECURITY;

-- 9 policies originais sem TO authenticated (o bug: TO public ou sem role).
CREATE POLICY "Users can create own snoozes" ON public.conversation_snoozes FOR INSERT TO public WITH CHECK (snoozed_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can view own favorites" ON public.favorite_contacts FOR SELECT TO public USING (user_id = auth.uid());
CREATE POLICY "Users can create own favorites" ON public.favorite_contacts FOR INSERT TO public WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own favorites" ON public.favorite_contacts FOR UPDATE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can delete own favorites" ON public.favorite_contacts FOR DELETE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can view own pins" ON public.pinned_conversations FOR SELECT TO public USING (pinned_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can create own pins" ON public.pinned_conversations FOR INSERT TO public WITH CHECK (pinned_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own pins" ON public.pinned_conversations FOR UPDATE TO public USING (pinned_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own pins" ON public.pinned_conversations FOR DELETE TO public USING (pinned_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_snoozes TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_contacts TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinned_conversations TO authenticated, anon;
SQL

psql_file "$tmp_dir/pre.sql"

ALICE="{\"sub\":\"11111111-1111-1111-1111-111111111111\",\"role\":\"authenticated\"}"
UID_ALICE='11111111-1111-1111-1111-111111111111'
PROFILE_ALICE='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
CONTACT_ALICE='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

echo '── BLOCO A: ANTES (9 policies TO public — bug) ──────────────────────────'
expect_value 'A1 9 policies com papel {public}' '9' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
expect_value 'A2 anon lê 0 favoritos (bug: deveria bloquear)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.favorite_contacts"
expect_value 'A3 anon insere favorito (BUG — anon grava)' '1' \
  "SET ROLE anon; INSERT INTO public.favorite_contacts (id,user_id,contact_id) VALUES ('c0000000-0000-0000-0000-000000000001','$UID_ALICE','$CONTACT_ALICE'); SELECT count(*) FROM public.favorite_contacts WHERE id='c0000000-0000-0000-0000-000000000001'"

echo
echo '── Aplicando a migration ─────────────────────────────────────────────────'
psql_file "$migration"

echo
echo '── BLOCO B: DEPOIS (9 policies TO authenticated) ─────────────────────────'
expect_value 'B1 0 policies com papel {public}' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
expect_value 'B2 9 policies com papel {authenticated}' '9' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{authenticated}'"
expect_value 'B3 anon lê 0 favoritos (RLS bloqueia anon)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.favorite_contacts"
expect_value 'B4 anon insere favorito (RLS bloqueia anon)' '0' \
  "SET ROLE anon; INSERT INTO public.favorite_contacts (id,user_id,contact_id) VALUES ('c0000000-0000-0000-0000-000000000002','$UID_ALICE','$CONTACT_ALICE'); SELECT count(*) FROM public.favorite_contacts WHERE id='c0000000-0000-0000-0000-000000000002'" 2>/dev/null || true

expect_ok() { local l="$1" s="$2"; psql_sql "$s" >/dev/null || fail "$l: deveria ter sucesso"; printf '[PASS] %s\n' "$l"; }
expect_ok 'B5 authenticated insere o próprio favorito' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); INSERT INTO public.favorite_contacts (id,user_id,contact_id) VALUES ('d0000000-0000-0000-0000-000000000001','$UID_ALICE','$CONTACT_ALICE')"
expect_value 'B6 authenticated lê o próprio favorito' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM public.favorite_contacts WHERE user_id='$UID_ALICE'"

expect_ok 'B7 authenticated insere próprio snooze' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); INSERT INTO public.conversation_snoozes (id,snoozed_by,contact_id) VALUES ('e0000000-0000-0000-0000-000000000001','$PROFILE_ALICE','$CONTACT_ALICE')"
expect_value 'B8 authenticated lê próprio snooze' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM public.conversation_snoozes WHERE snoozed_by='$PROFILE_ALICE'"

expect_ok 'B9 authenticated insere próprio pin' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); INSERT INTO public.pinned_conversations (id,pinned_by,contact_id) VALUES ('f0000000-0000-0000-0000-000000000001','$PROFILE_ALICE','$CONTACT_ALICE')"
expect_value 'B10 authenticated lê próprio pin' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM public.pinned_conversations WHERE pinned_by='$PROFILE_ALICE'"

printf '\n[OK] 9 policies TO authenticated verificadas — anon bloqueado, dono preservado\n'