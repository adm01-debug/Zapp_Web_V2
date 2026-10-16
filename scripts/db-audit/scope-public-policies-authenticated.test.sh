#!/usr/bin/env bash
# Contrato das 14 policies TO public -> TO authenticated (higiene de papel; sem
# efeito funcional porque todas ja exigem auth.uid()/is_admin_or_supervisor).
#
# BLOCO A (antes): 14 policies com roles={public}.
# BLOCO B (depois): 0 {public}, 14 {authenticated}; e o comportamento de leitura
#   nao muda (anon segue lendo 0; authenticated segue lendo o proprio).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930142000_scope_public_policies_to_authenticated.sql"
postgres_image="${PUBLIC_POLICY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-public-policy-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-public-policy-test-[0-9]+$ ]]; then
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
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT false $$;

CREATE TABLE public.favorite_contacts (id uuid PRIMARY KEY, user_id uuid NOT NULL, contact_id uuid NOT NULL);
CREATE TABLE public.pinned_conversations (id uuid PRIMARY KEY, user_id uuid NOT NULL, conversation_id uuid NOT NULL);
CREATE TABLE public.conversation_snoozes (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.login_attempts (id uuid PRIMARY KEY, user_id uuid, email text);
CREATE TABLE public.talkx_templates (id uuid PRIMARY KEY, name text, created_by uuid);

ALTER TABLE public.favorite_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_snoozes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_templates ENABLE ROW LEVEL SECURITY;

-- As 14 policies TO public (nomes exatos de producao).
CREATE POLICY "Users can create own snoozes" ON public.conversation_snoozes FOR INSERT TO public WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can create own favorites" ON public.favorite_contacts FOR INSERT TO public WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own favorites" ON public.favorite_contacts FOR DELETE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can update own favorites" ON public.favorite_contacts FOR UPDATE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can view own favorites" ON public.favorite_contacts FOR SELECT TO public USING (user_id = auth.uid());

CREATE POLICY "Admins and supervisors can view login attempts" ON public.login_attempts FOR SELECT TO public USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Users can create own pins" ON public.pinned_conversations FOR INSERT TO public WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own pins" ON public.pinned_conversations FOR DELETE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can update own pins" ON public.pinned_conversations FOR UPDATE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can view own pins" ON public.pinned_conversations FOR SELECT TO public USING (user_id = auth.uid());

CREATE POLICY "talkx_templates_delete" ON public.talkx_templates FOR DELETE TO public USING (created_by = auth.uid());
CREATE POLICY "talkx_templates_insert" ON public.talkx_templates FOR INSERT TO public WITH CHECK (created_by = auth.uid());
CREATE POLICY "talkx_templates_select" ON public.talkx_templates FOR SELECT TO public USING (created_by = auth.uid());
CREATE POLICY "talkx_templates_update" ON public.talkx_templates FOR UPDATE TO public USING (created_by = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_contacts TO authenticated, anon;
SQL

psql_file "$tmp_dir/pre.sql"

ALICE="{\"sub\":\"11111111-1111-1111-1111-111111111111\",\"role\":\"authenticated\"}"
UID_ALICE='11111111-1111-1111-1111-111111111111'

echo '── BLOCO A: ANTES ─────────────────────────────────────────────────────────────────'
expect_value 'A1 14 policies com papel {public}' '14' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
expect_value 'A2 anon lê 0 favoritos (RLS bloqueia)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.favorite_contacts"

echo
echo '── Aplicando a migration ───────────────────────────────────────────────────────────'
psql_file "$migration"

echo
echo '── BLOCO B: DEPOIS ─────────────────────────────────────────────────────────────────'
expect_value 'B1 0 policies com papel {public}' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
expect_value 'B2 14 policies com papel {authenticated}' '14' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{authenticated}'"
expect_value 'B3 anon segue lendo 0 favoritos (sem efeito funcional)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.favorite_contacts"

expect_ok() { local l="$1" s="$2"; psql_sql "$s" >/dev/null || fail "$l: deveria ter sucesso"; printf '[PASS] %s\n' "$l"; }
expect_ok 'B4 authenticated insere o próprio favorito (política preservada)' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); INSERT INTO public.favorite_contacts (id,user_id,contact_id) VALUES ('d0000000-0000-0000-0000-000000000001','$UID_ALICE','e0000000-0000-0000-0000-000000000001')"
expect_value 'B5 authenticated lê o próprio favorito' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM public.favorite_contacts WHERE user_id='$UID_ALICE'"

printf '\n[OK] contrato das 14 policies TO public -> authenticated verificado\n'
