#!/usr/bin/env bash
# 20261113120000_remove_enum_special_agent: recria public.app_role sem 'special_agent'.
#
# Prova comportamental (PostgreSQL 17 descartavel, papeis reais via SET ROLE +
# request.jwt.claim.sub, default ACL de producao do Supabase reproduzido):
#  A. ESTADO DE PRODUCAO (antes, medido em 2026-11-13): enum com 4 rotulos, as 4 colunas
#     do tipo, CHECK user_roles_no_special_agent, 7 linhas de seed special_agent em
#     role_permissions, has_role/effective_role/admin_set_role com o md5 de producao,
#     view whatsapp_connections_safe (security_invoker) e as 21 policies dependentes.
#     Uma sessao "velha" (S1) e aberta ANTES da migration e aquece o cache do plpgsql.
#  C. Guardas fecham sem mudar nada (banco espelho): usuario com special_agent em
#     user_roles; corpo de has_role diferente do medido.
#  B. Migration aplicada 2x (idempotente) e:
#     1. rotulos = admin,supervisor,agent (mesma ordem); app_role__old nao existe.
#     2. colunas no tipo novo; DEFAULT 'agent' mantido; CHECK de special_agent fora.
#     3. as 21 policies voltam IDENTICAS (nome, comando, papeis, predicado deparseado) e a
#        view volta identica, com security_invoker.
#     4. ACL de has_role/admin_set_role/effective_role igual a de producao; comentario mantido.
#     5. seed special_agent apagado (7 linhas auditadas), seeds dos outros papeis intactos.
#     6. comportamento: admin le ai_providers e o agente nao; admin_set_role promove;
#        effective_role; get_my_protection_policy; gatilho de sync de profiles.role.
#     7. 'special_agent' recusado em user_roles e em multiplix_audiences.shared_with_roles.
#     8. sessao S1 (aberta antes) continua funcionando depois da troca do tipo.
#  D. Rollback do cabecalho executa (fora de transacao) e devolve rotulo + seed + CHECK;
#     reaplicar a migration volta a B.
#
# Schema vem das MIGRATIONS REAIS onde o arquivo e aplicavel standalone (falha dura se
# algum sumir). O resto e harness sintetico rotulado HARNESS, copiado de
# pg_get_functiondef/pg_policies de producao (2026-11-13).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MIG_DIR="$REPO_ROOT/supabase/migrations"

F_AUDIT_RP="$MIG_DIR/20260830030000_audit_role_permissions_trigger.sql"
F_ADMIN_SET_ROLE="$MIG_DIR/20260925100657_admin_set_role_last_admin_floor.sql"
F_AUDIENCES="$MIG_DIR/20261001261230_f35_multiplix_audiences.sql"
F_VOICE="$MIG_DIR/20261003132707_f64_voz_assets_e_grants.sql"
F_PROTECTION="$MIG_DIR/20261015225226_ct091_contact_protection_policy.sql"
F_REMOVE_SA="$MIG_DIR/20261103201500_remove_pagamentos_e_special_agent.sql"
F_NEW="$MIG_DIR/20261113120000_remove_enum_special_agent.sql"

fail() { echo "[FAIL] $*" >&2; exit 1; }
ok()   { echo "[OK] $*"; }

for f in "$F_AUDIT_RP" "$F_ADMIN_SET_ROLE" "$F_AUDIENCES" "$F_VOICE" "$F_PROTECTION" \
         "$F_REMOVE_SA" "$F_NEW"; do
  [[ -f "$f" ]] || fail "migration real ausente: $f"
done
ROLLBACK_SQL=$(sed -n '/^-- Rollback (SQL/,/^-- Fim do rollback/p' "$F_NEW" | sed -n 's/^--   //p')
[[ -n "$ROLLBACK_SQL" ]] || fail "bloco -- Rollback (SQL executavel) vazio em $(basename "$F_NEW")"
ok "migrations reais presentes e rollback extraido"

# --- postgres descartavel ------------------------------------------------------
IMAGE="${REMOVE_ENUM_SPECIAL_AGENT_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
CID="remove-enum-special-agent-test-$$"
WORK="$(mktemp -d)"
S1_PID=""
cleanup() {
  exec 3>&- 2>/dev/null || true
  [[ -n "$S1_PID" ]] && kill "$S1_PID" 2>/dev/null || true
  docker rm -f "$CID" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
docker rm -f "$CID" >/dev/null 2>&1 || true
docker run -d --name "$CID" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null \
  || fail "subir postgres descartavel ($IMAGE)"
ready=false
for _ in $(seq 1 120); do
  if docker exec "$CID" pg_isready -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  docker logs "$CID" 2>&1 | tail -n 20 >&2 || true
  fail "postgres descartavel nao ficou pronto"
fi
sleep 5
ready=false
for _ in $(seq 1 60); do
  if docker exec "$CID" pg_isready -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || fail "postgres descartavel caiu apos o setup inicial"

PSQL=(docker exec -i "$CID" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -t -A)
PSQL_NO_STOP=(docker exec -i "$CID" psql -U postgres -d postgres -v ON_ERROR_STOP=0 -q -t -A)
apply() {
  "${PSQL[@]}" < "$1" >/dev/null || fail "aplicar migration real: $1"
  echo "[OK] aplicada: $(basename "$1")"
}
run() { "${PSQL[@]}" -c "$*"; }
expect_error() { # expect_error <padrao> <sql>
  local out
  out=$("${PSQL_NO_STOP[@]}" -c "$2" 2>&1 || true)
  echo "$out" | grep -q "$1" || fail "esperava erro '$1', veio: $out"
}

# --- harness: auth mock, papeis, default ACL do Supabase ------------------------
run "CREATE SCHEMA IF NOT EXISTS auth;"
run "CREATE SCHEMA IF NOT EXISTS storage;"
run "CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);"
run "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS \$\$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;"
run "CREATE TABLE auth.users (id uuid PRIMARY KEY);"
run "CREATE ROLE anon NOLOGIN;"
run "CREATE ROLE authenticated NOLOGIN;"
run "CREATE ROLE service_role NOLOGIN BYPASSRLS;"
run "GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;"
run "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;"
# HARNESS (default ACL de producao do Supabase para objetos criados pelo postgres em public).
run "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;"
run "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;"

# HARNESS (tipo como esta em producao: 20251215025014 + ADD VALUE da 20260830060000).
run "CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent', 'special_agent');"
"${PSQL[@]}" >/dev/null <<'SQL' || fail "harness base"
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, user_id uuid UNIQUE, name text, role text,
  can_download boolean NOT NULL DEFAULT false,
  CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'agent'::text, 'special_agent'::text]))
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'agent'::public.app_role,
  CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.audit_logs (id bigserial PRIMARY KEY, user_id uuid, action text, entity_type text, entity_id uuid, details jsonb);
CREATE TABLE public.permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL);
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission_id uuid NOT NULL REFERENCES public.permissions(id),
  CONSTRAINT role_permissions_role_permission_id_key UNIQUE (role, permission_id)
);
CREATE TABLE public.agent_visibility_grants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid, can_see_agent_id uuid);
ALTER TABLE public.agent_visibility_grants ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN NEW.updated_at := now(); RETURN NEW; END $f$;
-- HARNESS (pg_get_functiondef de producao, 2026-11-13; md5 conferido pela guarda da migration).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::app_role
  )
$function$;
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
$function$;
SQL

apply "$F_AUDIT_RP"
apply "$F_ADMIN_SET_ROLE"
# HARNESS (ACL e comentario de producao da admin_set_role).
run "REVOKE ALL ON FUNCTION public.admin_set_role(uuid, public.app_role) FROM PUBLIC, anon;"
run "COMMENT ON FUNCTION public.admin_set_role(uuid, public.app_role) IS 'Troca o papel de um usuario exigindo sessao JWT de admin. Unico caminho de troca de papel com autoria garantida em audit_logs. service_role sem JWT recebe jwt_session_required.';"
apply "$F_AUDIENCES"
apply "$F_VOICE"
apply "$F_PROTECTION"
apply "$F_REMOVE_SA"
# HARNESS (ACL de producao da effective_role: so postgres e service_role).
run "REVOKE ALL ON FUNCTION public.effective_role(uuid) FROM PUBLIC, anon, authenticated;"
run "CREATE TRIGGER sync_profile_role AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role_from_user_roles();"

# HARNESS (tabelas e policies de producao que dependem do tipo/has_role e cujas migrations
# de origem nao sao aplicaveis standalone; predicados = pg_policies de producao).
"${PSQL[@]}" >/dev/null <<'SQL' || fail "harness policies"
CREATE TABLE public.ai_providers (id serial PRIMARY KEY, name text);
CREATE TABLE public.app_settings (id serial PRIMARY KEY);
CREATE TABLE public.blocked_ips (id serial PRIMARY KEY);
CREATE TABLE public.channel_connections (id serial PRIMARY KEY);
CREATE TABLE public.password_reset_requests (id serial PRIMARY KEY);
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can delete AI providers" ON public.ai_providers FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert AI providers" ON public.ai_providers FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update AI providers" ON public.ai_providers FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view AI providers" ON public.ai_providers FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "app_settings_admin_all" ON public.app_settings FOR ALL TO authenticated USING ((EXISTS ( SELECT 1 FROM user_roles ur WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = 'admin'::app_role)))));
CREATE POLICY "Only admins can view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only admins can view blocked IPs" ON public.blocked_ips FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1 FROM user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))) OR is_admin_or_supervisor(auth.uid())));
CREATE POLICY "Admins full access to channels" ON public.channel_connections FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete password reset requests" ON public.password_reset_requests FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update reset requests without token access" ON public.password_reset_requests FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view reset requests" ON public.password_reset_requests FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
-- Producao: "Admins can update contact protection policy" tem USING e WITH CHECK.
DROP POLICY "Admins can update contact protection policy" ON public.contact_protection_policy;
CREATE POLICY "Admins can update contact protection policy" ON public.contact_protection_policy FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, phone_number text, status text,
  is_default boolean, qr_code text, instance_id text, farewell_message text, farewell_enabled boolean,
  battery_level integer, is_plugged boolean, retry_count integer, max_retries integer,
  last_health_check timestamptz, health_status text, health_response_ms integer, created_by uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), health_reason text
);
CREATE VIEW public.whatsapp_connections_safe WITH (security_invoker = true) AS
 SELECT id, name, phone_number, status, is_default,
   CASE WHEN has_role(auth.uid(), 'admin'::app_role) THEN qr_code ELSE NULL::text END AS qr_code,
   CASE WHEN has_role(auth.uid(), 'admin'::app_role) THEN instance_id ELSE NULL::text END AS instance_id,
   farewell_message, farewell_enabled, battery_level, is_plugged, retry_count, max_retries,
   last_health_check, health_status, health_response_ms, created_by, created_at, updated_at, health_reason
 FROM whatsapp_connections;
REVOKE ALL ON public.whatsapp_connections_safe FROM anon;
GRANT SELECT ON public.whatsapp_connections_safe TO anon;
-- HARNESS (seed de 20260830090000 + seeds dos outros papeis).
INSERT INTO public.permissions (name) VALUES ('view_dashboard'), ('view_inbox'), ('send_messages'),
  ('view_contacts'), ('view_queues'), ('view_agents'), ('view_settings'), ('manage_users');
INSERT INTO public.role_permissions (role, permission_id)
  SELECT r::public.app_role, p.id FROM public.permissions p,
    unnest(ARRAY['special_agent', 'agent']) r
   WHERE p.name <> 'manage_users';
INSERT INTO public.role_permissions (role, permission_id)
  SELECT 'admin', p.id FROM public.permissions p;
SQL
ok "harness com o estado de producao montado"

# --- massa ---------------------------------------------------------------------
ADMIN_SUB="11111111-1111-4111-8111-111111111111"
ADMIN_PROFILE="22222222-2222-4222-8222-222222222222"
AGENT_SUB="44444444-4444-4444-8444-444444444444"
AGENT_PROFILE="33333333-3333-4333-8333-333333333333"
run "INSERT INTO auth.users (id) VALUES ('$ADMIN_SUB'), ('$AGENT_SUB');"
run "INSERT INTO public.profiles (id, user_id, name, role) VALUES ('$ADMIN_PROFILE', '$ADMIN_SUB', 'Admin', NULL), ('$AGENT_PROFILE', '$AGENT_SUB', 'Agente', NULL);"
run "INSERT INTO public.user_roles (user_id, role) VALUES ('$ADMIN_SUB', 'admin'), ('$AGENT_SUB', 'agent');"
run "INSERT INTO public.ai_providers (name) VALUES ('p1');"
run "INSERT INTO public.contact_protection_policy (scope_role, limite_fichas_hora) VALUES ('agent', 7);"
run "INSERT INTO public.multiplix_voice_grants (voice_id, titular, roles) VALUES ('v1', 'x', ARRAY['agent']::public.app_role[]);"

AS_ADMIN="SET ROLE authenticated; SET request.jwt.claim.sub = '$ADMIN_SUB';"
AS_AGENT="SET ROLE authenticated; SET request.jwt.claim.sub = '$AGENT_SUB';"

SNAP_POLICIES="SELECT string_agg(format('%s|%s|%s|%s|%s|%s', c.relname, pol.polname, pol.polcmd, pol.polroles::regrole[]::text, pg_get_expr(pol.polqual, pol.polrelid), pg_get_expr(pol.polwithcheck, pol.polrelid)), E'\n' ORDER BY c.relname, pol.polname) FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid WHERE c.relnamespace = 'public'::regnamespace;"
SNAP_VIEW="SELECT pg_get_viewdef('public.whatsapp_connections_safe'::regclass, true) || ' ' || array_to_string(reloptions, ',') || ' ' || coalesce(relacl::text, '') FROM pg_class WHERE oid = 'public.whatsapp_connections_safe'::regclass;"
SNAP_ACL="SELECT string_agg(format('%s %s %s', proname, coalesce(proacl::text, 'default'), coalesce(obj_description(oid, 'pg_proc'), '')), E'\n' ORDER BY proname) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('has_role', 'admin_set_role', 'effective_role');"

# ================================================================== A. estado de producao
[[ "$(run "SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype;")" == "admin,supervisor,agent,special_agent" ]] \
  || fail "A: enum do harness diferente de producao"
[[ "$(run "SELECT md5(prosrc) FROM pg_proc WHERE proname = 'effective_role';")" == "07814d09481f4979ebbe0e03910835ff" ]] \
  || fail "A: effective_role da 20261103201500 nao bate com o md5 de producao"
[[ "$(run "SELECT md5(prosrc) FROM pg_proc WHERE proname = 'admin_set_role';")" == "a59220e0f3abcc9e06a12b15c67129f6" ]] \
  || fail "A: admin_set_role da 20260925100657 nao bate com o md5 de producao"
[[ "$(run "SELECT count(*) FROM public.role_permissions WHERE role = 'special_agent';")" == "7" ]] \
  || fail "A: seed special_agent ausente"
N_DEP=$(run "SELECT count(DISTINCT objid) FROM pg_depend WHERE classid = 'pg_policy'::regclass AND ((refclassid = 'pg_type'::regclass AND refobjid IN ('public.app_role'::regtype, 'public.app_role[]'::regtype)) OR (refclassid = 'pg_proc'::regclass AND refobjid = 'public.has_role(uuid,public.app_role)'::regprocedure));")
[[ "$N_DEP" == "21" ]] || fail "A: esperava 21 policies dependentes (producao), harness tem $N_DEP"
POL_BEFORE=$(run "$SNAP_POLICIES")
VIEW_BEFORE=$(run "$SNAP_VIEW")
ACL_BEFORE=$(run "$SNAP_ACL")
ok "A: estado de producao reproduzido (4 rotulos, md5, seed, 21 policies dependentes)"

# ================================================================== C. guardas fecham
# Espelho = copia do estado A (antes de abrir a sessao S1: o template nao pode ter conexao).
run "CREATE DATABASE guard_mirror TEMPLATE postgres;"
MIRROR=(docker exec -i "$CID" psql -U postgres -d guard_mirror -v ON_ERROR_STOP=1 -q -t -A)
"${MIRROR[@]}" -c "ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_no_special_agent; INSERT INTO public.user_roles (user_id, role) VALUES ('$AGENT_SUB', 'special_agent');" >/dev/null
OUT=$("${MIRROR[@]}" < "$F_NEW" 2>&1 || true)
echo "$OUT" | grep -q "linha(s) em user_roles com special_agent" || fail "C: guarda de user_roles nao abortou: $OUT"
[[ "$("${MIRROR[@]}" -c "SELECT count(*) FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype;")" == "4" ]] \
  || fail "C: guarda abortou mas o tipo mudou"
"${MIRROR[@]}" -c "DELETE FROM public.user_roles WHERE role = 'special_agent'; CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE AS \$f\$ SELECT true \$f\$;" >/dev/null
OUT=$("${MIRROR[@]}" < "$F_NEW" 2>&1 || true)
echo "$OUT" | grep -q "corpo de has_role mudou" || fail "C: guarda de md5 nao abortou: $OUT"
[[ "$("${MIRROR[@]}" -c "SELECT count(*) FROM public.role_permissions WHERE role = 'special_agent';")" == "7" ]] \
  || fail "C: guarda abortou mas o seed foi apagado"
ok "C: guardas fecham sem mudar nada (usuario special_agent; corpo de has_role diferente)"

# Sessao S1: aberta ANTES da migration, aquece cache de plpgsql/planos com o tipo antigo.
mkfifo "$WORK/s1.in"
docker exec -i "$CID" psql -U postgres -d postgres -v ON_ERROR_STOP=0 -q -t -A \
  < "$WORK/s1.in" > "$WORK/s1.out" 2>&1 &
S1_PID=$!
exec 3>"$WORK/s1.in"
s1() { printf '%s\n' "$1" >&3; }
s1 "SET request.jwt.claim.sub = '$AGENT_SUB';"
s1 "SELECT 'S1pre:' || (SELECT count(*) FROM public.get_my_protection_policy());"
s1 "SELECT 'S1pre:' || public.has_role('$ADMIN_SUB', 'admin');"
s1 "UPDATE public.user_roles SET role = role WHERE user_id = '$AGENT_SUB';"
s1 "INSERT INTO public.multiplix_audiences (name, kind, shared_with_roles) VALUES ('s1pre', 'rule', '{agent}');"
for _ in $(seq 1 30); do grep -q "S1pre:t" "$WORK/s1.out" 2>/dev/null && break; sleep 1; done
grep -q "S1pre:1" "$WORK/s1.out" || fail "A: sessao S1 nao aqueceu: $(cat "$WORK/s1.out")"

# ================================================================== B. migration 2x
assert_b() {
  local fase="$1"
  [[ "$(run "SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype;")" == "admin,supervisor,agent" ]] \
    || fail "$fase: rotulos errados"
  [[ "$(run "SELECT to_regtype('public.app_role__old') IS NULL;")" == "t" ]] || fail "$fase: app_role__old sobrou"
  [[ "$(run "SELECT string_agg(x, ',' ORDER BY x) FROM (SELECT format('%s.%s=%s', a.attrelid::regclass, a.attname, format_type(a.atttypid, a.atttypmod)) AS x FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid WHERE a.atttypid IN ('public.app_role'::regtype, 'public.app_role[]'::regtype) AND c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace AND a.attnum > 0) t;")" \
      == "contact_protection_policy.scope_role=app_role,multiplix_voice_grants.roles=app_role[],role_permissions.role=app_role,user_roles.role=app_role" ]] \
    || fail "$fase: colunas fora do tipo novo"
  [[ "$(run "SELECT pg_get_expr(adbin, adrelid) FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum WHERE d.adrelid = 'public.user_roles'::regclass AND a.attname = 'role';")" == "'agent'::app_role" ]] \
    || fail "$fase: DEFAULT de user_roles.role"
  [[ "$(run "SELECT count(*) FROM pg_constraint WHERE conname = 'user_roles_no_special_agent';")" == "0" ]] \
    || fail "$fase: CHECK user_roles_no_special_agent sobrou"
  [[ "$(run "$SNAP_POLICIES")" == "$POL_BEFORE" ]] || {
    diff <(echo "$POL_BEFORE") <(run "$SNAP_POLICIES") >&2 || true
    fail "$fase: policies mudaram"
  }
  [[ "$(run "$SNAP_VIEW")" == "$VIEW_BEFORE" ]] || fail "$fase: view mudou: $(run "$SNAP_VIEW")"
  [[ "$(run "$SNAP_ACL")" == "$ACL_BEFORE" ]] || fail "$fase: ACL/comentario mudou: $(run "$SNAP_ACL") vs $ACL_BEFORE"
  [[ "$(run "SELECT count(*) FROM public.role_permissions WHERE role::text = 'special_agent';")" == "0" ]] \
    || fail "$fase: seed special_agent sobrou"
  [[ "$(run "SELECT string_agg(role::text || '=' || n, ',' ORDER BY role) FROM (SELECT role, count(*) n FROM public.role_permissions GROUP BY role) x;")" == "admin=8,agent=7" ]] \
    || fail "$fase: seeds dos outros papeis mudaram"
  [[ "$(run "SELECT count(*) FROM public.audit_logs WHERE action = 'permission_revoked_from_role' AND details->>'role' = 'special_agent';")" == "7" ]] \
    || fail "$fase: remocao do seed nao auditada (7)"
  # comportamento
  [[ "$(run "$AS_ADMIN SELECT count(*) FROM public.ai_providers;")" == "1" ]] || fail "$fase: admin nao le ai_providers"
  [[ "$(run "$AS_AGENT SELECT count(*) FROM public.ai_providers;")" == "0" ]] || fail "$fase: agente le ai_providers"
  [[ "$(run "$AS_AGENT SELECT count(*) FROM public.multiplix_voice_grants;")" == "1" ]] || fail "$fase: agente nao le grant de voz por papel"
  [[ "$(run "$AS_AGENT SELECT limite_fichas_hora || ':' || origem FROM public.get_my_protection_policy();")" == "7:papel" ]] \
    || fail "$fase: get_my_protection_policy do agente"
  [[ "$(run "SELECT public.effective_role('$ADMIN_SUB') || ',' || public.effective_role('$AGENT_SUB');")" == "admin,agent" ]] \
    || fail "$fase: effective_role"
  expect_error 'invalid input value for enum app_role: "special_agent"' \
    "INSERT INTO public.user_roles (user_id, role) VALUES ('$AGENT_SUB', 'special_agent');"
  expect_error 'fora do catalogo app_role' \
    "INSERT INTO public.multiplix_audiences (name, kind, shared_with_roles) VALUES ('x', 'rule', '{special_agent}');"
}

apply "$F_NEW"
assert_b "B1"
run "$AS_ADMIN SELECT out_new_role FROM public.admin_set_role('$AGENT_SUB', 'supervisor');" | grep -q '^supervisor$' \
  || fail "B1: admin_set_role nao promoveu"
[[ "$(run "SELECT role FROM public.profiles WHERE user_id = '$AGENT_SUB';")" == "supervisor" ]] \
  || fail "B1: gatilho de sync nao atualizou profiles.role"
run "$AS_ADMIN SELECT 1 FROM public.admin_set_role('$AGENT_SUB', 'agent');" >/dev/null
ok "B1: tipo recriado, 21 policies e view identicas, ACL igual, seed morto auditado, comportamento ok"

apply "$F_NEW"
assert_b "B2"
ok "B2: reaplicar e idempotente"

# Sessao S1 (aberta antes da troca) segue funcionando com o tipo novo.
s1 "SELECT 'S1pos:' || (SELECT count(*) FROM public.get_my_protection_policy());"
s1 "SELECT 'S1pos:' || public.has_role('$ADMIN_SUB', 'admin');"
s1 "UPDATE public.user_roles SET role = role WHERE user_id = '$AGENT_SUB';"
s1 "INSERT INTO public.multiplix_audiences (name, kind, shared_with_roles) VALUES ('s1pos', 'rule', '{agent}');"
s1 "SELECT 'S1fim';"
for _ in $(seq 1 30); do grep -q "S1fim" "$WORK/s1.out" 2>/dev/null && break; sleep 1; done
grep -q "S1pos:1" "$WORK/s1.out" && grep -q "S1pos:t" "$WORK/s1.out" \
  || fail "B: sessao S1 quebrou depois da troca: $(cat "$WORK/s1.out")"
if grep -qi "error\|erro" "$WORK/s1.out"; then fail "B: sessao S1 com erro: $(cat "$WORK/s1.out")"; fi
[[ "$(run "SELECT count(*) FROM public.multiplix_audiences WHERE name = 's1pos';")" == "1" ]] \
  || fail "B: insert da S1 depois da troca nao gravou"
ok "B: sessao aberta antes da migration continua funcionando (sem cache de tipo velho)"

# ================================================================== D. rollback
while IFS= read -r stmt; do
  [[ -z "$stmt" ]] && continue
  run "$stmt" </dev/null >/dev/null || fail "D: rollback falhou em: $stmt"
done <<< "$ROLLBACK_SQL"
[[ "$(run "SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype;")" == "admin,supervisor,agent,special_agent" ]] \
  || fail "D: rollback nao devolveu o rotulo"
[[ "$(run "SELECT count(*) FROM public.role_permissions WHERE role = 'special_agent';")" == "7" ]] \
  || fail "D: rollback nao devolveu o seed"
[[ "$(run "SELECT count(*) FROM pg_constraint WHERE conname = 'user_roles_no_special_agent';")" == "1" ]] \
  || fail "D: rollback nao devolveu o CHECK"
ok "D: rollback devolve rotulo, seed e CHECK"
apply "$F_NEW"
[[ "$(run "SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype;")" == "admin,supervisor,agent" ]] \
  || fail "D: reaplicar depois do rollback"
[[ "$(run "$SNAP_POLICIES")" == "$POL_BEFORE" ]] || fail "D: policies mudaram depois de reaplicar"
ok "D: reaplicar depois do rollback volta ao estado B"

echo "remove-enum-special-agent: todas as provas passaram"
