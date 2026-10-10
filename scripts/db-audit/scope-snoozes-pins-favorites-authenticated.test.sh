#!/usr/bin/env bash
# Prova que as policies de snooze, favorite e pin restringem a authenticated.
#
# BLOCO A (antes): 9 policies com roles={public} — anon consegue ler/gravar.
# BLOCO B (depois): 9 policies com roles={authenticated} — anon recebe 0 linhas/erro;
#   o dono (authenticated) continua lendo e gravando.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010000000_scope_snoozes_pins_favorites_policies_to_authenticated.sql"
postgres_image="${SNOOZES_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-snoozes-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-snoozes-test-[0-9]+$ ]]; then
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

-- Tabelas necessarias para as policies (referenciadas nos USING/WITH CHECK).
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.conversation_snoozes (id uuid PRIMARY KEY, snoozed_by uuid NOT NULL, contact_id uuid, snoozed_until timestamptz);
CREATE TABLE public.favorite_contacts (id uuid PRIMARY KEY, user_id uuid NOT NULL, contact_id uuid NOT NULL);
CREATE TABLE public.pinned_conversations (id uuid PRIMARY KEY, pinned_by uuid NOT NULL, contact_id uuid NOT NULL);

ALTER TABLE public.conversation_snoozes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_conversations ENABLE ROW LEVEL SECURITY;

-- 9 policies TO public (estado buggy: anon consegue acessar).
CREATE POLICY "Users can create own snoozes" ON public.conversation_snoozes FOR INSERT TO public WITH CHECK (snoozed_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = conversation_snoozes.contact_id));
CREATE POLICY "Users can view own favorites" ON public.favorite_contacts FOR SELECT TO public USING (user_id = auth.uid());
CREATE POLICY "Users can create own favorites" ON public.favorite_contacts FOR INSERT TO public WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = favorite_contacts.contact_id));
CREATE POLICY "Users can update own favorites" ON public.favorite_contacts FOR UPDATE TO public USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own favorites" ON public.favorite_contacts FOR DELETE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can view own pins" ON public.pinned_conversations FOR SELECT TO public USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "Users can create own pins" ON public.pinned_conversations FOR INSERT TO public WITH CHECK (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = pinned_conversations.contact_id));
CREATE POLICY "Users can update own pins" ON public.pinned_conversations FOR UPDATE TO public USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())) WITH CHECK (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "Users can delete own pins" ON public.pinned_conversations FOR DELETE TO public USING (pinned_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_snoozes TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_contacts TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinned_conversations TO authenticated, anon;
GRANT ALL ON public.profiles TO authenticated, anon;
GRANT ALL ON public.contacts TO authenticated, anon;
SQL

psql_file "$tmp_dir/pre.sql"

ALICE='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
UID_ALICE='11111111-1111-1111-1111-111111111111'

echo '── BLOCO A: ANTES (9 policies TO public, anon acessa) ──────────────────────────'
expect_value 'A1 9 policies com papel {public}' '9' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
expect_value 'A2 anon lê 0 snoozes (RLS bloqueia via anon role)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.conversation_snoozes"
expect_value 'A3 anon lê 0 favoritos (RLS bloqueia via anon role)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.favorite_contacts"
expect_value 'A4 anon lê 0 pins (RLS bloqueia via anon role)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.pinned_conversations"

echo
echo '── Aplicando a migration ───────────────────────────────────────────────'
psql_file "$migration"

echo
echo '── BLOCO B: DEPOIS (9 policies TO authenticated, anon bloqueado) ────────────────'
expect_value 'B1 0 policies com papel {public}' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
expect_value 'B2 9 policies com papel {authenticated}' '9' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{authenticated}'"
expect_value 'B3 anon segue lendo 0 snoozes (política restrita)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.conversation_snoozes"
expect_value 'B4 anon segue lendo 0 favoritos (política restrita)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.favorite_contacts"
expect_value 'B5 anon segue lendo 0 pins (política restrita)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.pinned_conversations"

expect_ok() { local l="$1" s="$2"; psql_sql "$s" >/dev/null || fail "$l: deveria ter sucesso"; printf '[PASS] %s\n' "$l"; }
expect_ok 'B6 authenticated insere snooze do proprio usuario' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); INSERT INTO public.profiles (id,user_id) VALUES ('00000000-0000-0000-0000-000000000001','$UID_ALICE'); INSERT INTO public.contacts (id,user_id) VALUES ('11111111-1111-1111-1111-111111111111','$UID_ALICE'); INSERT INTO public.conversation_snoozes (id,snoozed_by,contact_id) VALUES ('d0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111')"
expect_ok 'B7 authenticated insere favorito do proprio usuario' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); INSERT INTO public.profiles (id,user_id) VALUES ('00000000-0000-0000-0000-000000000002','$UID_ALICE'); INSERT INTO public.contacts (id,user_id) VALUES ('11111111-1111-1111-1111-111111111112','$UID_ALICE'); INSERT INTO public.favorite_contacts (id,user_id,contact_id) VALUES ('d0000000-0000-0000-0000-000000000002','$UID_ALICE','11111111-1111-1111-1111-111111111112')"
expect_value 'B8 authenticated lê o proprio favorito' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM public.favorite_contacts WHERE user_id='$UID_ALICE'"
expect_ok 'B9 authenticated insere pin do proprio usuario' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); INSERT INTO public.profiles (id,user_id) VALUES ('00000000-0000-0000-0000-000000000003','$UID_ALICE'); INSERT INTO public.contacts (id,user_id) VALUES ('11111111-1111-1111-1111-111111111113','$UID_ALICE'); INSERT INTO public.pinned_conversations (id,pinned_by,contact_id) VALUES ('d0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111113')"
expect_value 'B10 authenticated lê o proprio pin' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM public.pinned_conversations WHERE pinned_by IN (SELECT id FROM public.profiles WHERE user_id='$UID_ALICE')"

printf '\n[OK] contrato das 9 policies TO public -> authenticated verificado\n'