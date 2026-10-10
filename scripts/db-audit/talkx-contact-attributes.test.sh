#!/usr/bin/env bash
# N-094 refazer 1 (X037) — talkx_contact_attributes: RLS, helper gestor e refresh em upsert único.
#
# Roda o MESMO roteiro no mesmo container descartável, em dois blocos:
#   BLOCO A — estado ANTERIOR (defeito): sem a tabela, sem can_manage_contacts e
#             sem talkx_refresh_local_attributes (a entrega anterior ainda
#             referenciava talkx_ddd_regions/get_ddd_from_phone inexistentes e a
#             função era inalcançável: grant só p/ service_role com trava interna
#             de admin que reprova uid NULL).
#   BLOCO B — migration aplicada (ARQUIVO REAL em supabase/migrations/): tabela
#             criada com RLS, helper gestor dedicado, DDD populada (67 linhas) e
#             refresh em UPSERT ÚNICO com ON CONFLICT.
#
# Dependências (is_admin_or_supervisor, is_contact_visible_to_user) vêm dos
# ARQUIVOS REAIS de migration (não há cópia de helper neste teste): só as
# TABELAS de apoio são sintéticas, porque os arquivos reais carregam dependências
# não replicáveis no PG descartável (FK auth.users, storage, publication).
#   fontes: 20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql (user_roles,
#             has_role, is_admin_or_supervisor),
#             20260329175853_8f18172f-981a-4c58-b505-ce1630af8ab6.sql (enum special_agent) e
#             20260909200000_harden_inbox_contact_authorization.sql
#             (get_profile_id_for_user, get_visible_agent_ids,
#              is_contact_visible_to_user).
# Papéis reais (SET ROLE authenticated + request.jwt.claims; SET ROLE
# service_role/anon), nunca postgres nas leituras. É o padrão do repo
# (team-membership-bootstrap-owner.test.sh): o PostgREST só injeta role+claims,
# e o papel anon é exercido via SET ROLE anon (sem grants -> 42501).
#
# Pontos da recusa cobertos:
#   P1 (OWNER): owner (admin) encontra por UUID, nome e vendedor; vendedores A/B
#       isolados; service_role intacto; can_manage_contacts(owner)=true.
#   P2 (lote): página de 27 elegíveis (15 com attrs + 10 sem + 1 sem vendedor +
#       1 stale) processada numa chamada; 10 recebem vendedor; 15 intactos.
#   P3 (fundamentos): vendedor resolvido no banco; um upsert com ON CONFLICT;
#       WHERE com duas condições AND sem OR (deleted_at, is_lid_legacy);
#       3 branches (upsert ok / cond1 exclui / cond2 exclui) + ACL da função.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010150000_talkx_contact_attributes_rls.sql"
dep_roles="$repo_root/supabase/migrations/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql"
dep_visib="$repo_root/supabase/migrations/20260909200000_harden_inbox_contact_authorization.sql"
dep_enum="$repo_root/supabase/migrations/20260329175853_8f18172f-981a-4c58-b505-ce1630af8ab6.sql"
postgres_image="${TALKX_CONTACT_ATTR_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-talkx-contact-attr-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-talkx-contact-attr-test-[0-9]+$ ]]; then
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
as_role() {
  local role="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $role; $sql"
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
expect_value_role() {
  local l="$1" e="$2" r="$3" s="$4" a
  a="$(as_role "$r" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_error_role() {
  local l="$1" needle="$2" r="$3" s="$4" out st
  set +e; out="$(as_role "$r" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$dep_roles" ]] || fail "dependencia nao encontrada: $dep_roles"
[[ -f "$dep_visib" ]] || fail "dependencia nao encontrada: $dep_visib"
[[ -f "$dep_enum" ]] || fail "dependencia nao encontrada: $dep_enum"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

# Superfície mínima do Supabase (papéis + auth.uid()/auth.role()).
psql_sql "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth;" >/dev/null
psql_sql "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS \$\$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid \$\$;" >/dev/null
psql_sql "CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS \$\$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')::text \$\$;" >/dev/null
psql_sql "GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;" >/dev/null
psql_sql "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null

# Tabelas de apoio (sintéticas) para aplicar os ARQUIVOS REAIS de dependência.
docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
CREATE PUBLICATION supabase_realtime;
CREATE TABLE public.auth_users_stub_tmp (id uuid PRIMARY KEY);
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean DEFAULT true
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text,
  assigned_to uuid,
  queue_id uuid,
  deleted_at timestamptz,
  is_lid_legacy boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.contact_notes (contact_id uuid, author_id uuid);
CREATE TABLE public.queue_members (queue_id uuid, profile_id uuid, is_active boolean DEFAULT true);
CREATE TABLE public.agent_visibility_grants (agent_id uuid, can_see_agent_id uuid);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id),
  sender text,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.sales_pipeline_stages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.sales_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id),
  stage_id uuid REFERENCES public.sales_pipeline_stages(id),
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
SQL
# auth.users como alias da tabela real de usuários do teste.
psql_sql "CREATE SCHEMA IF NOT EXISTS auth; DROP TABLE IF EXISTS auth.users; ALTER TABLE public.auth_users_stub_tmp RENAME TO users; ALTER TABLE public.users SET SCHEMA auth;" >/dev/null

# Dependências REAIS (arquivos de migration, sem copiar helper).
# Apoio sem RLS: o isolamento sob teste mora na policy de talkx_contact_attributes.
psql_sql "GRANT SELECT ON public.contacts, public.profiles TO anon, authenticated, service_role;" >/dev/null
psql_file "$dep_roles"
psql_file "$dep_enum"
psql_file "$dep_visib"

# Usuários: dono (admin), vendedores A e B (agent).
UID_O="00000000-0000-0000-0000-000000000001"
UID_A="00000000-0000-0000-0000-000000000002"
UID_B="00000000-0000-0000-0000-000000000003"
JWT_O="{\"sub\":\"$UID_O\",\"role\":\"authenticated\"}"
JWT_A="{\"sub\":\"$UID_A\",\"role\":\"authenticated\"}"
JWT_B="{\"sub\":\"$UID_B\",\"role\":\"authenticated\"}"

psql_sql "INSERT INTO auth.users (id) VALUES ('$UID_O'), ('$UID_A'), ('$UID_B');" >/dev/null
psql_sql "INSERT INTO public.profiles (id, user_id, name) VALUES
  ('10000000-0000-0000-0000-000000000001', '$UID_O', 'Dono'),
  ('10000000-0000-0000-0000-000000000002', '$UID_A', 'Vendedor A'),
  ('10000000-0000-0000-0000-000000000003', '$UID_B', 'Vendedor B');" >/dev/null
psql_sql "INSERT INTO public.user_roles (user_id, role) VALUES ('$UID_O', 'admin');" >/dev/null
PA="10000000-0000-0000-0000-000000000002"
PB="10000000-0000-0000-0000-000000000003"

echo '== BLOCO A (defeito: sem tabela, sem helper, sem funcao) =='
expect_error_as 'A1 tabela talkx_contact_attributes nao existe' 'does not exist' "$JWT_A" \
  "SELECT count(*) FROM public.talkx_contact_attributes;"
expect_error_as 'A2 funcao talkx_refresh_local_attributes nao existe' 'does not exist' "$JWT_O" \
  "SELECT public.talkx_refresh_local_attributes(10);"
expect_error_as 'A3 helper can_manage_contacts nao existe' 'does not exist' "$JWT_O" \
  "SELECT public.can_manage_contacts('$UID_O');"

echo '== aplica migration REAL =='
psql_file "$migration"

# Estágios do funil.
S1="20000000-0000-0000-0000-000000000001"
S2="20000000-0000-0000-0000-000000000002"
psql_sql "INSERT INTO public.sales_pipeline_stages (id, name) VALUES ('$S1', 'Prospecção'), ('$S2', 'Negociação');" >/dev/null

# Contatos com UUID fixo (alvos das buscas): C1 (A), M1 (A, msgs mistas),
# M2 (B, só msg de agent), D1 (A, 2 deals), STALE (A, attrs com vendedor errado),
# SEM_VEND (sem assigned_to), DEL (apagado), LEG (legado).
C1="30000000-0000-0000-0000-000000000001"
M1="30000000-0000-0000-0000-000000000002"
M2="30000000-0000-0000-0000-000000000003"
D1="30000000-0000-0000-0000-000000000004"
STALE="30000000-0000-0000-0000-000000000005"
SEM_VEND="30000000-0000-0000-0000-000000000006"
DEL="30000000-0000-0000-0000-000000000007"
LEG="30000000-0000-0000-0000-000000000008"

docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
-- 8 de A com DDD 31 (dos 15 pré-existentes; C1, M1 e D1 estão entre eles).
INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
  ('$C1', 'Contato C1 Silva', '5531988887777', '$PA'),
  ('$M1', 'Contato M1 Silva', '5531988887778', '$PA'),
  ('$D1', 'Contato D1 Silva', '5531988887779', '$PA'),
  ('30000000-0000-0000-0000-000000000011', 'Contato E4 Silva', '5531988887781', '$PA'),
  ('30000000-0000-0000-0000-000000000012', 'Contato E5 Silva', '5531988887782', '$PA'),
  ('30000000-0000-0000-0000-000000000013', 'Contato E6 Silva', '5531988887783', '$PA'),
  ('30000000-0000-0000-0000-000000000014', 'Contato E7 Silva', '5531988887784', '$PA'),
  ('30000000-0000-0000-0000-000000000015', 'Contato E8 Silva', '5531988887785', '$PA'),
-- 7 de B com DDD 11 (dos 15; M2 entre eles).
  ('$M2', 'Contato M2 Silva', '11999998888', '$PB'),
  ('30000000-0000-0000-0000-000000000021', 'Contato E10 Silva', '11999998889', '$PB'),
  ('30000000-0000-0000-0000-000000000022', 'Contato E11 Silva', '11999998890', '$PB'),
  ('30000000-0000-0000-0000-000000000023', 'Contato E12 Silva', '11999998891', '$PB'),
  ('30000000-0000-0000-0000-000000000024', 'Contato E13 Silva', '11999998892', '$PB'),
  ('30000000-0000-0000-0000-000000000025', 'Contato E14 Silva', '11999998893', '$PB'),
  ('30000000-0000-0000-0000-000000000026', 'Contato E15 Silva', '11999998894', '$PB'),
-- STALE: atribuído a A, mas os attrs dirão B (o refresh corrige).
  ('$STALE', 'Contato Stale Silva', '5521988887777', '$PA'),
-- 10 novos com attrs ausentes: 5 de A (DDD 81), 5 de B (DDD 41).
  ('30000000-0000-0000-0000-000000000031', 'Contato N1 Silva', '5581988887777', '$PA'),
  ('30000000-0000-0000-0000-000000000032', 'Contato N2 Silva', '5581988887778', '$PA'),
  ('30000000-0000-0000-0000-000000000033', 'Contato N3 Silva', '5581988887779', '$PA'),
  ('30000000-0000-0000-0000-000000000034', 'Contato N4 Silva', '5581988887780', '$PA'),
  ('30000000-0000-0000-0000-000000000035', 'Contato N5 Silva', '5581988887781', '$PA'),
  ('30000000-0000-0000-0000-000000000036', 'Contato N6 Silva', '5541988887777', '$PB'),
  ('30000000-0000-0000-0000-000000000037', 'Contato N7 Silva', '5541988887778', '$PB'),
  ('30000000-0000-0000-0000-000000000038', 'Contato N8 Silva', '5541988887779', '$PB'),
  ('30000000-0000-0000-0000-000000000039', 'Contato N9 Silva', '5541988887780', '$PB'),
  ('30000000-0000-0000-0000-000000000040', 'Contato N10 Silva', '5541988887781', '$PB'),
-- Sem vendedor (região preenche, vendedor fica NULL).
  ('$SEM_VEND', 'Contato SemVendedor Silva', '5561988887777', NULL),
-- Apagado e legado (inelegíveis: cond1 e cond2 do WHERE).
  ('$DEL', 'Contato Apagado Silva', '5531988887799', '$PA'),
  ('$LEG', 'Contato Legado Silva', '5531988887800', '$PB');
UPDATE public.contacts SET deleted_at = now() WHERE id = '$DEL';
UPDATE public.contacts SET is_lid_legacy = true WHERE id = '$LEG';
-- Mensagens: M1 tem agent (nova) + contact (antiga) -> vale a do contact;
-- M2 tem SÓ agent -> last_message_at NULL.
INSERT INTO public.messages (contact_id, sender, created_at) VALUES
  ('$M1', 'agent', '2026-10-02 10:00:00+00'),
  ('$M1', 'contact', '2026-10-01 10:00:00+00'),
  ('$M2', 'agent', '2026-10-02 10:00:00+00');
-- Deals: D1 tem 2 (Negociação mais recente vence); E4 tem 1 Prospecção.
INSERT INTO public.sales_deals (contact_id, stage_id, status, created_at, updated_at) VALUES
  ('$D1', '$S1', 'open', '2026-09-01 10:00:00+00', '2026-09-02 10:00:00+00'),
  ('$D1', '$S2', 'open', '2026-09-10 10:00:00+00', '2026-09-11 10:00:00+00'),
  ('30000000-0000-0000-0000-000000000011', '$S1', 'open', '2026-09-05 10:00:00+00', '2026-09-06 10:00:00+00');
-- Attrs pré-existentes CORRETOS p/ os 15 (refresh deve mantê-los) + STALE errado.
INSERT INTO public.talkx_contact_attributes
  (contact_id, salesperson_name, salesperson_profile_id, state, region, funnel_stage, last_message_at)
  SELECT c.id,
    CASE WHEN c.assigned_to = '$PA' THEN 'Vendedor A' ELSE 'Vendedor B' END,
    c.assigned_to,
    CASE WHEN c.phone LIKE '55%' AND substring(regexp_replace(c.phone, '\D', '', 'g') from 3 for 2) = '31' THEN 'MG' ELSE 'SP' END,
    CASE WHEN c.phone LIKE '55%' AND substring(regexp_replace(c.phone, '\D', '', 'g') from 3 for 2) = '31' THEN 'Sudeste' ELSE 'Sudeste' END,
    CASE WHEN c.id = '$D1' THEN 'Negociação'
         WHEN c.id = '30000000-0000-0000-0000-000000000011' THEN 'Prospecção' END,
    CASE WHEN c.id = '$M1' THEN '2026-10-01 10:00:00+00'::timestamptz END
  FROM public.contacts c
  WHERE c.id IN ('$C1','$M1','$D1',
    '30000000-0000-0000-0000-000000000011','30000000-0000-0000-0000-000000000012',
    '30000000-0000-0000-0000-000000000013','30000000-0000-0000-0000-000000000014',
    '30000000-0000-0000-0000-000000000015','$M2',
    '30000000-0000-0000-0000-000000000021','30000000-0000-0000-0000-000000000022',
    '30000000-0000-0000-0000-000000000023','30000000-0000-0000-0000-000000000024',
    '30000000-0000-0000-0000-000000000025','30000000-0000-0000-0000-000000000026');
INSERT INTO public.talkx_contact_attributes
  (contact_id, salesperson_name, salesperson_profile_id, state, region)
  VALUES ('$STALE', 'Vendedor B', '$PB', 'RJ', 'Sudeste');
SQL

echo '== BLOCO B: P1 (OWNER encontra; vendedor isolado; service_role; anon) =='
expect_value_as 'B01 owner por UUID' '1' "$JWT_O" \
  "SELECT count(*) FROM public.talkx_contact_attributes ca JOIN public.contacts c ON c.id = ca.contact_id WHERE c.id = '$C1';"
expect_value_as 'B02 owner por nome' '16' "$JWT_O" \
  "SELECT count(*) FROM public.talkx_contact_attributes ca JOIN public.contacts c ON c.id = ca.contact_id WHERE c.name ILIKE '%Silva%';"
expect_value_as 'B03 owner por vendedor A' '9' "$JWT_O" \
  "SELECT count(*) FROM public.talkx_contact_attributes ca JOIN public.contacts c ON c.id = ca.contact_id WHERE c.assigned_to = '$PA';"
expect_value_as 'B04 vendedor A ve o proprio (UUID)' '1' "$JWT_A" \
  "SELECT count(*) FROM public.talkx_contact_attributes ca JOIN public.contacts c ON c.id = ca.contact_id WHERE c.id = '$C1';"
expect_value_as 'B05 vendedor B nao ve contato de A (UUID)' '0' "$JWT_B" \
  "SELECT count(*) FROM public.talkx_contact_attributes ca JOIN public.contacts c ON c.id = ca.contact_id WHERE c.id = '$C1';"
expect_value_as 'B06 vendedor A por nome ve so os seus' '9' "$JWT_A" \
  "SELECT count(*) FROM public.talkx_contact_attributes ca JOIN public.contacts c ON c.id = ca.contact_id WHERE c.name ILIKE '%Silva%';"
expect_value_as 'B07 vendedor B por nome ve so os seus' '7' "$JWT_B" \
  "SELECT count(*) FROM public.talkx_contact_attributes ca JOIN public.contacts c ON c.id = ca.contact_id WHERE c.name ILIKE '%Silva%';"
expect_value_as 'B08 vendedor A por vendedor B = 0 (isolado)' '0' "$JWT_A" \
  "SELECT count(*) FROM public.talkx_contact_attributes ca JOIN public.contacts c ON c.id = ca.contact_id WHERE c.assigned_to = '$PB';"
expect_value_role 'B09 service_role enxerga tudo (nao quebra)' '16' 'service_role' \
  "SELECT count(*) FROM public.talkx_contact_attributes;"
expect_error_role 'B10 anon sem SELECT (sem grant)' 'permission denied' 'anon' \
  "SELECT count(*) FROM public.talkx_contact_attributes;"
expect_error_as 'B11 authenticated sem INSERT' 'permission denied' "$JWT_O" \
  "INSERT INTO public.talkx_contact_attributes (contact_id) VALUES (gen_random_uuid());"
expect_error_as 'B12 authenticated sem UPDATE' 'permission denied' "$JWT_O" \
  "UPDATE public.talkx_contact_attributes SET state = 'XX' WHERE contact_id = '$C1';"
expect_error_as 'B13 authenticated sem DELETE' 'permission denied' "$JWT_O" \
  "DELETE FROM public.talkx_contact_attributes WHERE contact_id = '$C1';"
expect_value_as 'B14 can_manage_contacts(owner)=true' 'true' "$JWT_O" \
  "SELECT public.can_manage_contacts('$UID_O')::text;"
expect_value_as 'B15 can_manage_contacts(vendedor)=false' 'false' "$JWT_A" \
  "SELECT public.can_manage_contacts('$UID_A')::text;"
expect_value_as 'B16 DDD populada (67 linhas)' '67' "$JWT_O" \
  "SELECT count(*) FROM public.talkx_ddd_regions;"

echo '== BLOCO B: P2+P3 (lote + fundamentos + ACL da funcao) =='
expect_value_role 'C01 refresh processa os 27 elegiveis' '27' 'service_role' \
  "SELECT public.talkx_refresh_local_attributes(100);"
expect_value 'C02 total de linhas = 27 (sem duplicar os 15)' '27' \
  "SELECT count(*) FROM public.talkx_contact_attributes;"
expect_value 'C03 os 10 novos receberam vendedor' '10' \
  "SELECT count(*) FROM public.talkx_contact_attributes ca WHERE ca.salesperson_profile_id IS NOT NULL AND ca.contact_id IN
   ('30000000-0000-0000-0000-000000000031','30000000-0000-0000-0000-000000000032','30000000-0000-0000-0000-000000000033','30000000-0000-0000-0000-000000000034','30000000-0000-0000-0000-000000000035','30000000-0000-0000-0000-000000000036','30000000-0000-0000-0000-000000000037','30000000-0000-0000-0000-000000000038','30000000-0000-0000-0000-000000000039','30000000-0000-0000-0000-000000000040');"
expect_value_as 'C04 stale corrigido para Vendedor A' 'Vendedor A' "$JWT_O" \
  "SELECT salesperson_name FROM public.talkx_contact_attributes WHERE contact_id = '$STALE';"
expect_value 'C05 os 15 intactos (vendedor+UF+regiao conferem)' '15' \
  "SELECT count(*) FROM public.talkx_contact_attributes ca JOIN public.contacts c ON c.id = ca.contact_id
   LEFT JOIN public.profiles p ON p.id = c.assigned_to
   WHERE ca.contact_id IN ('$C1','$M1','$D1',
    '30000000-0000-0000-0000-000000000011','30000000-0000-0000-0000-000000000012',
    '30000000-0000-0000-0000-000000000013','30000000-0000-0000-0000-000000000014',
    '30000000-0000-0000-0000-000000000015','$M2',
    '30000000-0000-0000-0000-000000000021','30000000-0000-0000-0000-000000000022',
    '30000000-0000-0000-0000-000000000023','30000000-0000-0000-0000-000000000024',
    '30000000-0000-0000-0000-000000000025','30000000-0000-0000-0000-000000000026')
    AND ca.salesperson_profile_id IS NOT DISTINCT FROM c.assigned_to
    AND ca.salesperson_name IS NOT DISTINCT FROM p.name
    AND ca.state IS NOT DISTINCT FROM (CASE WHEN substring(regexp_replace(c.phone, '\D', '', 'g') from 3 for 2) = '31' THEN 'MG' ELSE 'SP' END)
    AND ca.region = 'Sudeste';"
expect_value 'C06 PE/Nordeste e PR/Sul nos novos (DDD real)' '10' \
  "SELECT count(*) FROM public.talkx_contact_attributes WHERE (state = 'PE' AND region = 'Nordeste') OR (state = 'PR' AND region = 'Sul');"
expect_value 'C07 sem vendedor: linha com regiao e vendedor NULL' '1' \
  "SELECT count(*) FROM public.talkx_contact_attributes WHERE contact_id = '$SEM_VEND' AND salesperson_profile_id IS NULL AND state = 'DF' AND region = 'Centro-Oeste';"
expect_value 'C08 condicao 1: apagado fora da projecao' '0' \
  "SELECT count(*) FROM public.talkx_contact_attributes WHERE contact_id = '$DEL';"
expect_value 'C09 condicao 2: legado fora da projecao' '0' \
  "SELECT count(*) FROM public.talkx_contact_attributes WHERE contact_id = '$LEG';"
expect_value 'C10 M1: vale a msg do contact, nao a do agent' '2026-10-01 10:00:00+00' \
  "SELECT to_char(last_message_at, 'YYYY-MM-DD HH24:MI:SS+00') FROM public.talkx_contact_attributes WHERE contact_id = '$M1';"
expect_value 'C11 M2: so msg de agent -> last_message NULL' '1' \
  "SELECT count(*) FROM public.talkx_contact_attributes WHERE contact_id = '$M2' AND last_message_at IS NULL;"
expect_value 'C12 D1: deal mais recente vence (Negociação)' 'Negociação' \
  "SELECT funnel_stage FROM public.talkx_contact_attributes WHERE contact_id = '$D1';"
expect_value 'C13 sem deals/msgs: linha com funil e msg NULL' '1' \
  "SELECT count(*) FROM public.talkx_contact_attributes WHERE contact_id = '$C1' AND funnel_stage IS NULL AND last_message_at IS NULL;"
expect_error_as 'C14 authenticated nao executa refresh' 'permission denied' "$JWT_O" \
  "SELECT public.talkx_refresh_local_attributes(10);"
expect_error_role 'C15 anon nao executa refresh' 'permission denied' 'anon' \
  "SELECT public.talkx_refresh_local_attributes(10);"
expect_error_role 'C16 p_limit invalido rejeitado' 'p_limit deve ser' 'service_role' \
  "SELECT public.talkx_refresh_local_attributes(0);"
expect_value_role 'C17 rerun idempotente (27, sem duplicar)' '27' 'service_role' \
  "SELECT public.talkx_refresh_local_attributes(100);"
expect_value 'C18 total segue 27 apos rerun' '27' \
  "SELECT count(*) FROM public.talkx_contact_attributes;"

echo '== Rollback (executa o -- Rollback: da migration e prova que voltou) =='
psql_sql "DROP FUNCTION IF EXISTS public.talkx_refresh_local_attributes(integer); DROP TABLE IF EXISTS public.talkx_contact_attributes; DROP FUNCTION IF EXISTS public.can_manage_contacts(uuid); DROP TABLE IF EXISTS public.talkx_ddd_regions;" >/dev/null
expect_value 'R1 attrs removida' '' "SELECT to_regclass('public.talkx_contact_attributes')::text;"
expect_value 'R2 ddd removida' '' "SELECT to_regclass('public.talkx_ddd_regions')::text;"
expect_value 'R3 funcoes removidas' '0' "SELECT count(*) FROM pg_proc WHERE proname IN ('talkx_refresh_local_attributes','can_manage_contacts');"

printf '\n[OK] talkx-contact-attributes: todos os asserts passaram\n'
