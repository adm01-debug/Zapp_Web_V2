#!/usr/bin/env bash
# N-094 r2 (X037) — attrs/RLS, refresh com cursor, RLS no DDD, rollback real.
# A: sem objetos (vermelho). B: migration REAL. Deps reais 20251215025014,
# 20260329175853, 20260909200000. Apoio sintético. Papeis reais via SET ROLE.
set -Eeuo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011003016_talkx_contact_attributes_rls.sql"
dep_roles="$repo_root/supabase/migrations/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql"
dep_visib="$repo_root/supabase/migrations/20260909200000_harden_inbox_contact_authorization.sql"
dep_enum="$repo_root/supabase/migrations/20260329175853_8f18172f-981a-4c58-b505-ce1630af8ab6.sql"
postgres_image="${TALKX_CONTACT_ATTR_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-talkx-contact-attr-test-$$"
cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-talkx-contact-attr-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }
as_user() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$1', false); $2"; }
as_role() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SET ROLE $1; $2"; }
expect_value() { local l="$1" e="$2" s="$3" a; a="$(psql_sql "$s" | tail -n1)"; [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"; printf '[PASS] %s\n' "$l"; }
expect_value_as() { local l="$1" e="$2" j="$3" s="$4" a; a="$(as_user "$j" "$s" | tail -n1)"; [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"; printf '[PASS] %s\n' "$l"; }
expect_value_role() { local l="$1" e="$2" r="$3" s="$4" a; a="$(as_role "$r" "$s" | tail -n1)"; [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"; printf '[PASS] %s\n' "$l"; }
expect_error_as() { local l="$1" needle="$2" j="$3" s="$4" out st; set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e; (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }; [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }; printf '[PASS] %s\n' "$l"; }
expect_error_role() { local l="$1" needle="$2" r="$3" s="$4" out st; set +e; out="$(as_role "$r" "$s" 2>&1)"; st=$?; set -e; (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }; [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }; printf '[PASS] %s\n' "$l"; }
command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "sem migration: $migration"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'
psql_sql "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth;" >/dev/null
psql_sql "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS \$\$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid \$\$;" >/dev/null
psql_sql "CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS \$\$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')::text \$\$;" >/dev/null
psql_sql "GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;" >/dev/null
psql_sql "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null
docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
CREATE PUBLICATION supabase_realtime;
CREATE TABLE public.auth_users_stub_tmp (id uuid PRIMARY KEY);
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE, name text NOT NULL, is_active boolean DEFAULT true);
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, phone text, assigned_to uuid, queue_id uuid, deleted_at timestamptz, is_lid_legacy boolean NOT NULL DEFAULT false, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.contact_notes (contact_id uuid, author_id uuid);
CREATE TABLE public.queue_members (queue_id uuid, profile_id uuid, is_active boolean DEFAULT true);
CREATE TABLE public.agent_visibility_grants (agent_id uuid, can_see_agent_id uuid);
CREATE TABLE public.messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid REFERENCES public.contacts(id), sender text, created_at timestamptz DEFAULT now());
CREATE TABLE public.sales_pipeline_stages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.sales_deals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid REFERENCES public.contacts(id), stage_id uuid REFERENCES public.sales_pipeline_stages(id), status text DEFAULT 'open', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
SQL
psql_sql "CREATE SCHEMA IF NOT EXISTS auth; DROP TABLE IF EXISTS auth.users; ALTER TABLE public.auth_users_stub_tmp RENAME TO users; ALTER TABLE public.users SET SCHEMA auth;" >/dev/null
psql_sql "GRANT SELECT ON public.contacts, public.profiles TO anon, authenticated, service_role;" >/dev/null
psql_file "$dep_roles"
psql_file "$dep_enum"
psql_file "$dep_visib"
UID_O="00000000-0000-0000-0000-000000000001"
UID_A="00000000-0000-0000-0000-000000000002"
UID_B="00000000-0000-0000-0000-000000000003"
JWT_O="{\"sub\":\"$UID_O\",\"role\":\"authenticated\"}"
JWT_A="{\"sub\":\"$UID_A\",\"role\":\"authenticated\"}"
JWT_B="{\"sub\":\"$UID_B\",\"role\":\"authenticated\"}"
psql_sql "INSERT INTO auth.users (id) VALUES ('$UID_O'), ('$UID_A'), ('$UID_B');" >/dev/null
psql_sql "INSERT INTO public.profiles (id, user_id, name) VALUES ('10000000-0000-0000-0000-000000000001', '$UID_O', 'Dono'), ('10000000-0000-0000-0000-000000000002', '$UID_A', 'Vendedor A'), ('10000000-0000-0000-0000-000000000003', '$UID_B', 'Vendedor B');" >/dev/null
psql_sql "INSERT INTO public.user_roles (user_id, role) VALUES ('$UID_O', 'admin');" >/dev/null
PA="10000000-0000-0000-0000-000000000002"
PB="10000000-0000-0000-0000-000000000003"
echo '== BLOCO A (defeito) =='
expect_error_as 'A1 sem tabela' 'does not exist' "$JWT_A" "SELECT count(*) FROM public.talkx_contact_attributes;"
expect_error_as 'A2 sem funcao' 'does not exist' "$JWT_O" "SELECT * FROM public.talkx_refresh_local_attributes(10, NULL);"
expect_error_as 'A3 sem helper' 'does not exist' "$JWT_O" "SELECT public.can_manage_contacts('$UID_O');"
echo '== aplica migration =='
psql_file "$migration"
psql_sql "INSERT INTO public.sales_pipeline_stages (id, name) VALUES ('20000000-0000-0000-0000-000000000001', 'Prospecção'), ('20000000-0000-0000-0000-000000000002', 'Negociação');" >/dev/null
# 27 elegiveis: 14 A, 12 B, 1 sem vendedor.
docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
INSERT INTO public.contacts (name, phone, assigned_to)
SELECT 'Contato Silva ' || g,
  '55' || (ARRAY['31','11','81','41','61'])[1 + ((g - 1) % 5)] || '98888' || lpad(g::text, 4, '0'),
  CASE WHEN g <= 14 THEN '$PA'::uuid WHEN g <= 26 THEN '$PB'::uuid ELSE NULL END
FROM generate_series(1, 27) g;
INSERT INTO public.contacts (name, phone, assigned_to) VALUES ('Apagado Silva', '5531988887799', '$PA'), ('Legado Silva', '5531988887800', '$PB');
UPDATE public.contacts SET deleted_at = now() WHERE name = 'Apagado Silva';
UPDATE public.contacts SET is_lid_legacy = true WHERE name = 'Legado Silva';
SQL
STALE="$(psql_sql "SELECT id FROM public.contacts WHERE assigned_to = '$PA' AND name LIKE 'Contato%' ORDER BY id LIMIT 1;" | tail -n1)"
psql_sql "INSERT INTO public.talkx_contact_attributes (contact_id, salesperson_name, salesperson_profile_id, state, region) VALUES ('$STALE', 'Vendedor B', '$PB', 'RJ', 'Sudeste');" >/dev/null
MID1="$(psql_sql "SELECT id FROM public.contacts WHERE assigned_to = '$PA' AND name LIKE 'Contato%' ORDER BY id LIMIT 1 OFFSET 1;" | tail -n1)"
MID2="$(psql_sql "SELECT id FROM public.contacts WHERE assigned_to = '$PB' AND name LIKE 'Contato%' ORDER BY id LIMIT 1;" | tail -n1)"
DID="$(psql_sql "SELECT id FROM public.contacts WHERE assigned_to = '$PA' AND name LIKE 'Contato%' ORDER BY id LIMIT 1 OFFSET 2;" | tail -n1)"
psql_sql "INSERT INTO public.messages (contact_id, sender, created_at) VALUES ('$MID1', 'agent', '2026-10-02 10:00:00+00'), ('$MID1', 'contact', '2026-10-01 10:00:00+00'), ('$MID2', 'agent', '2026-10-02 10:00:00+00');" >/dev/null
psql_sql "INSERT INTO public.sales_deals (contact_id, stage_id, status, created_at, updated_at) VALUES ('$DID', '20000000-0000-0000-0000-000000000001', 'open', '2026-09-01 10:00:00+00', '2026-09-02 10:00:00+00'), ('$DID', '20000000-0000-0000-0000-000000000002', 'open', '2026-09-10 10:00:00+00', '2026-09-11 10:00:00+00');" >/dev/null
echo '== P1 RLS + P2 cursor =='
expect_value_role 'C0 pagina unica = 10' '10' 'service_role' "SELECT processed FROM public.talkx_refresh_local_attributes(10, NULL);"
after="$(psql_sql "SELECT last_id FROM public.talkx_refresh_local_attributes(10, NULL) LIMIT 1;" | tail -n1)"
total=10
for _ in $(seq 1 10); do
  row="$(psql_sql "SELECT processed::text || '|' || coalesce(last_id::text,'') FROM public.talkx_refresh_local_attributes(10, '$after');" | tail -n1)"
  n="${row%%|*}"; after="${row##*|}"
  total=$((total + n))
  (( n == 0 )) && break
done
[[ "$total" == "27" ]] || fail "C1 cursor: esperado total 27, obtido '$total'"
printf '[PASS] C1 cursor soma 27\n'
expect_value 'C2 total 27 sem duplicar' '27' "SELECT count(*) FROM public.talkx_contact_attributes;"
expect_value_as 'B1 owner ve 27' '27' "$JWT_O" "SELECT count(*) FROM public.talkx_contact_attributes;"
expect_value_as 'B2 A ve 14' '14' "$JWT_A" "SELECT count(*) FROM public.talkx_contact_attributes ca JOIN public.contacts c ON c.id = ca.contact_id WHERE c.assigned_to = '$PA';"
expect_value_as 'B3 B ve 12' '12' "$JWT_B" "SELECT count(*) FROM public.talkx_contact_attributes ca JOIN public.contacts c ON c.id = ca.contact_id WHERE c.assigned_to = '$PB';"
BCONTACT="$(psql_sql "SELECT id FROM public.contacts WHERE assigned_to = '$PA' AND name LIKE 'Contato%' ORDER BY id LIMIT 1;" | tail -n1)"
expect_value_as 'B4 B nao ve contato de A' '0' "$JWT_B" "SELECT count(*) FROM public.talkx_contact_attributes WHERE contact_id = '$BCONTACT';"
expect_value_role 'B5 service_role 27' '27' 'service_role' "SELECT count(*) FROM public.talkx_contact_attributes;"
expect_error_role 'B6 anon sem SELECT attrs' 'permission denied' 'anon' "SELECT count(*) FROM public.talkx_contact_attributes;"
expect_error_as 'B7 auth sem INSERT' 'permission denied' "$JWT_O" "INSERT INTO public.talkx_contact_attributes (contact_id) VALUES (gen_random_uuid());"
expect_value_as 'B8 helper owner=true' 'true' "$JWT_O" "SELECT public.can_manage_contacts('$UID_O')::text;"
expect_value_as 'B9 helper vendedor=false' 'false' "$JWT_A" "SELECT public.can_manage_contacts('$UID_A')::text;"
expect_value_as 'D1 DDD legivel p/ auth (67)' '67' "$JWT_O" "SELECT count(*) FROM public.talkx_ddd_regions;"
expect_error_role 'D2 DDD anon sem SELECT' 'permission denied' 'anon' "SELECT count(*) FROM public.talkx_ddd_regions;"
expect_error_as 'D3 DDD auth sem INSERT' 'permission denied' "$JWT_O" "INSERT INTO public.talkx_ddd_regions (ddd, state, region) VALUES (10, 'XX', 'X');"
expect_value 'D4 DDD com RLS ligada' 'true' "SELECT relrowsecurity::text FROM pg_class WHERE relname = 'talkx_ddd_regions';"
expect_value_as 'C3 stale corrigido p/ A' 'Vendedor A' "$JWT_O" "SELECT salesperson_name FROM public.talkx_contact_attributes WHERE contact_id = '$STALE';"
expect_value 'C4 apagado fora' '0' "SELECT count(*) FROM public.talkx_contact_attributes WHERE contact_id = (SELECT id FROM public.contacts WHERE name = 'Apagado Silva');"
expect_value 'C5 legado fora' '0' "SELECT count(*) FROM public.talkx_contact_attributes WHERE contact_id = (SELECT id FROM public.contacts WHERE name = 'Legado Silva');"
expect_value 'C6 M1 vale msg contact' '2026-10-01 10:00:00+00' "SELECT to_char(last_message_at, 'YYYY-MM-DD HH24:MI:SS+00') FROM public.talkx_contact_attributes WHERE contact_id = '$MID1';"
expect_value 'C7 M2 sem msg contact = NULL' '1' "SELECT count(*) FROM public.talkx_contact_attributes WHERE contact_id = '$MID2' AND last_message_at IS NULL;"
expect_value 'C8 deal recente vence' 'Negociação' "SELECT funnel_stage FROM public.talkx_contact_attributes WHERE contact_id = '$DID';"
expect_error_as 'C9 auth nao executa refresh' 'permission denied' "$JWT_O" "SELECT * FROM public.talkx_refresh_local_attributes(10, NULL);"
expect_error_role 'C10 anon nao executa' 'permission denied' 'anon' "SELECT * FROM public.talkx_refresh_local_attributes(10, NULL);"
expect_error_role 'C11 p_limit invalido' 'p_limit deve ser' 'service_role' "SELECT * FROM public.talkx_refresh_local_attributes(0, NULL);"
echo '== Rollback REAL (extraido da migration) =='
grep -q '^(a policy' "$migration" && fail 'rollback com comentario na linha executavel'
RB="$(grep '^-- Rollback:' "$migration" | sed 's/^-- Rollback: //')"
[[ -n "$RB" ]] || fail 'linha -- Rollback: vazia'
psql_sql "$RB" >/dev/null
printf '[PASS] R0 rollback da linha 2 executou\n'
expect_value 'R1 attrs removida' '' "SELECT to_regclass('public.talkx_contact_attributes')::text;"
expect_value 'R2 ddd removida' '' "SELECT to_regclass('public.talkx_ddd_regions')::text;"
expect_value 'R3 funcoes removidas' '0' "SELECT count(*) FROM pg_proc WHERE proname IN ('talkx_refresh_local_attributes','can_manage_contacts');"
psql_file "$migration" >/dev/null
expect_value 'R4 reaplica limpa (67 DDD)' '67' "SELECT count(*) FROM public.talkx_ddd_regions;"
printf '\n[OK] talkx-contact-attributes: todos os asserts passaram\n'
