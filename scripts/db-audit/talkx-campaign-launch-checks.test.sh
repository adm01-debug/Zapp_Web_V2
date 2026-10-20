#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
postgres_image="${TALKX_LAUNCH_CHECKS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="talkx-launch-checks-test-$$"
test_password="talkx_launch_checks_test_only"
migration="$repo_root/supabase/migrations/20261010042500_talkx_campaign_launch_checks.sql"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

started=0
for attempt in 1 2 3; do
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null || continue
  for _ in $(seq 1 15); do
    if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
      sleep 1
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        started=1
        break 2
      fi
    fi
    sleep 1
  done
done
[[ "$started" == 1 ]] || fail 'PostgreSQL de teste não iniciou'

# Esquema mínimo que a função lê; a migration sob teste é a real.
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user) $$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor')) $$;
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY, status text NOT NULL, instance_id text);
CREATE TABLE public.talkx_templates (id uuid PRIMARY KEY, status text NOT NULL);
CREATE TABLE public.talkx_settings (key text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY, message_template text NOT NULL DEFAULT '', media_url text,
  whatsapp_connection_id uuid, template_id uuid, owner uuid, created_by uuid,
  scheduled_at timestamptz, schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  send_window_start time, send_window_end time, business_hours_only boolean NOT NULL DEFAULT false);
CREATE TABLE public.talkx_recipients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL, status text NOT NULL DEFAULT 'pending');
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;

INSERT INTO public.profiles VALUES
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003');
INSERT INTO public.user_roles VALUES ('20000000-0000-0000-0000-000000000001','admin');
INSERT INTO public.whatsapp_connections VALUES
  ('50000000-0000-0000-0000-000000000001','connected','evo-live'),
  ('50000000-0000-0000-0000-000000000002','disconnected','evo-off');
INSERT INTO public.talkx_templates VALUES
  ('60000000-0000-0000-0000-000000000001','approved'),
  ('60000000-0000-0000-0000-000000000002','draft');
-- c1 completa (quarta 10:00 em São Paulo, janela 08–18, horário comercial)
-- c2 sem conexão viva · c3 template em rascunho · c4 sem público · c5 fora da janela
-- c6 agente dono · c7 pertence ao agente 2 (o agente 3 não é dono)
INSERT INTO public.talkx_campaigns (id, message_template, whatsapp_connection_id, template_id, owner, scheduled_at, send_window_start, send_window_end, business_hours_only)
SELECT ('70000000-0000-0000-0000-00000000000' || n)::uuid, 'Olá',
  CASE WHEN n = 2 THEN '50000000-0000-0000-0000-000000000002'::uuid ELSE '50000000-0000-0000-0000-000000000001'::uuid END,
  CASE WHEN n = 3 THEN '60000000-0000-0000-0000-000000000002'::uuid ELSE '60000000-0000-0000-0000-000000000001'::uuid END,
  CASE WHEN n IN (6,7) THEN '10000000-0000-0000-0000-000000000002'::uuid ELSE '10000000-0000-0000-0000-000000000001'::uuid END,
  CASE WHEN n = 5 THEN timestamptz '2026-10-14 03:00:00-03' ELSE timestamptz '2026-10-14 10:00:00-03' END,
  time '08:00', time '18:00', true
FROM generate_series(1, 7) n;
INSERT INTO public.talkx_recipients (campaign_id)
  SELECT id FROM public.talkx_campaigns WHERE id <> '70000000-0000-0000-0000-000000000004';
SQL

[[ -f "$migration" ]] || fail "migration ausente: $migration"
psql_test < "$migration" >/dev/null || fail 'migration não aplicou'

admin="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';"
owner_agent="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000002';"
other_agent="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000003';"
cid() { printf '70000000-0000-0000-0000-00000000000%s' "$1"; }

# severidade de um code para uma campanha, na sessão indicada
sev() {
  psql_test -Atqc "$1 SELECT i->>'severity' FROM jsonb_array_elements(public.talkx_campaign_launch_checks('$(cid "$2")')) i WHERE i->>'code'='$3';" | tail -n1
}

[[ "$(psql_test -Atqc "SELECT has_function_privilege('anon','public.talkx_campaign_launch_checks(uuid)','EXECUTE')")" == f ]] || fail 'anon recebeu EXECUTE'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('authenticated','public.talkx_campaign_launch_checks(uuid)','EXECUTE')")" == t ]] || fail 'authenticated sem EXECUTE'

blocks="$(psql_test -Atqc "$admin SELECT count(*) FROM jsonb_array_elements(public.talkx_campaign_launch_checks('$(cid 1)')) i WHERE i->>'severity'='block';" | tail -n1)"
[[ "$blocks" == 0 ]] || fail "campanha completa deveria aprovar (blocks=$blocks)"

psql_test -Atqc "INSERT INTO public.talkx_settings(key, value) VALUES ('business_hours', '{\"days\":[3]}'::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;" >/dev/null
[[ "$(sev "$admin" 1 schedule_reachable)" == block ]] || fail 'horario comercial sem start/end deveria reprovar fechado'
psql_test -Atqc "UPDATE public.talkx_settings SET value = '{\"start\":\"18:00\",\"end\":\"08:00\",\"days\":[3]}'::jsonb WHERE key = 'business_hours';" >/dev/null
[[ "$(sev "$admin" 1 schedule_reachable)" == block ]] || fail 'horario comercial invertido deveria reprovar fechado'
psql_test -Atqc "UPDATE public.talkx_settings SET value = '{\"start\":\"08:00\",\"end\":\"18:00\",\"days\":[1,2,3,4,5]}'::jsonb WHERE key = 'business_hours';" >/dev/null

[[ "$(sev "$admin" 2 connection_ready)" == block ]] || fail 'sem conexão conectada deveria reprovar'
[[ "$(sev "$admin" 3 template_approved)" == block ]] || fail 'template não aprovado deveria reprovar'
[[ "$(sev "$admin" 4 audience_not_empty)" == block ]] || fail 'público vazio deveria reprovar'
[[ "$(sev "$admin" 5 schedule_reachable)" == block ]] || fail 'início fora da janela deveria reprovar'
[[ "$(sev "$owner_agent" 6 connection_ready)" == ok ]] || fail 'agente dono deveria ler as checagens'
# cada reprovação é isolada: as demais checagens da mesma campanha seguem ok
[[ "$(sev "$admin" 2 audience_not_empty)" == ok ]] || fail 'reprovação de conexão contaminou outra checagem'

denied="$(psql_test -v VERBOSITY=verbose -c "$other_agent SELECT public.talkx_campaign_launch_checks('$(cid 7)');" 2>&1 || true)"
[[ "$denied" == *talkx_campaign_role_required* && "$denied" == *42501* ]] || fail 'agente que não é dono deveria receber 42501'
missing="$(psql_test -v VERBOSITY=verbose -c "$admin SELECT public.talkx_campaign_launch_checks('70000000-0000-0000-0000-0000000000ff');" 2>&1 || true)"
[[ "$missing" == *talkx_campaign_not_found* ]] || fail 'campanha inexistente deveria falhar'

psql_test -Atqc "DROP FUNCTION IF EXISTS public.talkx_campaign_launch_checks(uuid);" >/dev/null
[[ "$(psql_test -Atqc "SELECT to_regprocedure('public.talkx_campaign_launch_checks(uuid)') IS NULL;" | tail -n1)" == t ]] || fail 'rollback deveria remover a função'

printf 'PASS: talkx_campaign_launch_checks reprova sem conexão, sem template aprovado, sem público, fora da janela e horários inválidos, aprova o caso completo, respeita dono/papel e rollback remove a função\n'
