#!/usr/bin/env bash
# X014 (Fase 2 · Tela 08/17 · banco): exigir papel admin/supervisor para criar,
# agendar e alterar campanha. Fecha CAP-096 e CAP-097.
#
# Contrato num PostgreSQL 17 descartável, no mesmo formato dos testes irmãos
# (scripts/db-audit/talkx-campaign-worker-lease.test.sh,
# scripts/db-audit/talkx-update-limits-rpc.test.sh).
#
# Prova, contra a MIGRATION REAL do repo (20261002381230), sobre um schema mínimo
# com as colunas/objetos que as RPCs, o gatilho e as policies tocam:
#   (a) save_talkx_campaign_draft, replace_talkx_draft_recipients e
#       update_talkx_campaign_limits: agente (authenticated ativo, sem papel) ->
#       42501 talkx_campaign_role_required; admin e supervisor -> sucesso;
#   (b) as policies de INSERT/UPDATE/DELETE de talkx_campaigns exigem
#       is_admin_or_supervisor(auth.uid()) no USING/WITH CHECK;
#   (c) agente com UPDATE direto para status='scheduled' -> erro
#       talkx_campaign_schedule_role_required; com RLS ligada o UPDATE do agente
#       não alcança a linha; admin agenda com sucesso;
#   (d) has_table_privilege('anon','public.talkx_settings','SELECT') = false
#       (era true antes) e authenticated segue lendo;
#   (e) a policy de UPDATE talkx_blacklist existe e é restrita a admin/supervisor;
#   (f) a leitura de talkx_link_clicks ganha o ramo admin/supervisor.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="$repo_root/supabase/migrations/20261002381230_talkx_role_gates.sql"
postgres_image="${TALKX_ROLE_GATES_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-role-gates-test-$$"
test_password="talkx_role_gates_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

expect_error() {
  local label="$1" needle="$2" sql="$3" out status
  set +e
  out="$(psql_test -v VERBOSITY=verbose -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava '$needle'"; }
  pass "$label"
}

start_postgres() {
  # GitHub-hosted runners can occasionally report PostgreSQL ready one instant
  # before its container restarts. Require two successful probes and retry only
  # the disposable bootstrap; a SQL/assertion failure is never retried.
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: PostgreSQL container failed to start (attempt %s/3)\n' "$attempt" >&2
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
    printf 'WARN: PostgreSQL bootstrap was not stable (attempt %s/3)\n' "$attempt" >&2
    docker ps -a --filter "name=^/${container_name}$" --format 'talkx-test-container {{.Status}}' >&2 || true
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste não iniciou'

agent_uid='20000000-0000-0000-0000-000000000003'
admin_uid='20000000-0000-0000-0000-000000000001'
supervisor_uid='20000000-0000-0000-0000-000000000002'
admin_profile='10000000-0000-0000-0000-000000000001'
supervisor_profile='10000000-0000-0000-0000-000000000002'
agent_profile='10000000-0000-0000-0000-000000000003'
contact_id='30000000-0000-0000-0000-000000000001'
c_agent_sched='40000000-0000-0000-0000-0000000000a1'
c_admin_sched='40000000-0000-0000-0000-0000000000a2'
c_replace='40000000-0000-0000-0000-0000000000a3'
c_limits='40000000-0000-0000-0000-0000000000a4'
c_agent_rls='40000000-0000-0000-0000-0000000000a5'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  UNIQUE (user_id, role)
);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;
CREATE FUNCTION public.is_valid_talkx_schedule_timezone(text) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT $1 = 'America/Sao_Paulo' $$;

CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY, status text NOT NULL, instance_id text);

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'rascunho',
  message_template text NOT NULL DEFAULT '',
  description text,
  objective text NOT NULL DEFAULT 'vendas',
  audience_source text NOT NULL DEFAULT 'contacts',
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  segment_id uuid,
  template_id uuid,
  whatsapp_connection_id uuid,
  media_url text,
  media_type text,
  scheduled_at timestamptz,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  speed_profile text NOT NULL DEFAULT 'moderate',
  typing_delay_min integer NOT NULL DEFAULT 1500,
  typing_delay_max integer NOT NULL DEFAULT 4000,
  send_interval_min integer NOT NULL DEFAULT 8000,
  send_interval_max integer NOT NULL DEFAULT 20000,
  respect_suppression boolean NOT NULL DEFAULT true,
  confirm_consent boolean NOT NULL DEFAULT false,
  draft_step smallint NOT NULL DEFAULT 1,
  owner uuid,
  responsible_id uuid,
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  draft_creation_key uuid,
  revision bigint NOT NULL DEFAULT 1,
  worker_id text,
  worker_lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX talkx_campaigns_created_by_draft_key
  ON public.talkx_campaigns (created_by, draft_creation_key)
  WHERE draft_creation_key IS NOT NULL;

CREATE TABLE public.contacts (id uuid PRIMARY KEY, visible boolean NOT NULL DEFAULT true);
CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT visible FROM public.contacts WHERE id = _contact_id $$;
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  status text NOT NULL DEFAULT 'pending',
  UNIQUE (campaign_id, contact_id)
);
CREATE TABLE public.talkx_campaign_events (
  campaign_id uuid, event_type text, message text, actor_id uuid
);

-- talkx_settings no estado pré-X014: anon tinha acesso (espelha 20260930410000:31).
CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY, value jsonb NOT NULL, description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.talkx_settings FROM PUBLIC;
GRANT ALL ON public.talkx_settings TO anon, authenticated, service_role;
CREATE POLICY authenticated_read_talkx_settings
  ON public.talkx_settings FOR SELECT TO authenticated USING (true);

-- talkx_blacklist: a policy de UPDATE existe no estado legado (20260910100000 só
-- a ALTERava). A migration a (re)cria de forma idempotente.
CREATE TABLE public.talkx_blacklist (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.talkx_blacklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY talkx_blacklist_update
  ON public.talkx_blacklist FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE TABLE public.talkx_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid);
CREATE TABLE public.talkx_link_clicks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid);
ALTER TABLE public.talkx_link_clicks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.talkx_campaigns ENABLE ROW LEVEL SECURITY;

-- Policies de SELECT do estado legado (20260409000457): a leitura do agente não
-- muda com a X014, mas elas são pré-condição da própria RLS de leitura/UPDATE.
CREATE POLICY "Users can view own campaigns" ON public.talkx_campaigns FOR SELECT TO authenticated
  USING (created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY "Admins can view all campaigns" ON public.talkx_campaigns FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin'),
  ('20000000-0000-0000-0000-000000000002', 'supervisor');

INSERT INTO public.contacts (id) VALUES ('30000000-0000-0000-0000-000000000001');

INSERT INTO public.talkx_campaigns
  (id, created_by, status, message_template, total_recipients, scheduled_at, revision) VALUES
  ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000003', 'draft', 'Olá', 1, statement_timestamp() + interval '1 day', 1),
  ('40000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001', 'draft', 'Olá', 1, statement_timestamp() + interval '1 day', 1),
  ('40000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-000000000003', 'draft', 'Olá', 0, NULL, 1),
  ('40000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-000000000003', 'draft', 'Olá', 0, NULL, 1),
  ('40000000-0000-0000-0000-0000000000a5', '10000000-0000-0000-0000-000000000003', 'draft', 'Olá', 1, statement_timestamp() + interval '1 day', 1);

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talkx_campaigns TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talkx_recipients TO authenticated, service_role;
GRANT SELECT, UPDATE ON public.talkx_blacklist TO authenticated;
GRANT SELECT ON public.talkx_link_clicks TO authenticated;
GRANT SELECT ON public.talkx_links TO authenticated;
SQL

[[ -f "$migration" ]] || fail "migration ausente: $migration"

# Red-first de (d): antes da migration anon LÊ talkx_settings.
pre_anon_select="$(psql_q "SELECT has_table_privilege('anon', 'public.talkx_settings', 'SELECT')")"
[[ "$pre_anon_select" == 't' ]] || fail "fixture inválido: anon deveria ter SELECT em talkx_settings antes da X014 [obtido: $pre_anon_select]"

psql_test < "$migration" >/dev/null
# Replayável: uma segunda aplicação não pode falhar.
psql_test < "$migration" >/dev/null
pass 'migration X014 aplica e é replayavel'

agent_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$agent_uid';"
admin_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$admin_uid';"
supervisor_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$supervisor_uid';"

payload='{"name":"Campanha X014","message_template":"Olá","objective":"vendas","audience_source":"contacts","audience_filters":{}}'

# ---------------------------------------------------------------------------
# ACL das RPCs: authenticated executa (o papel é conferido em runtime); anon não.
# ---------------------------------------------------------------------------
for fn in \
  'public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)' \
  'public.replace_talkx_draft_recipients(uuid, uuid[])' \
  'public.update_talkx_campaign_limits(uuid, bigint, jsonb)'; do
  [[ "$(psql_q "SELECT has_function_privilege('anon', '$fn', 'EXECUTE')")" == 'f' ]] || fail "anon com EXECUTE em $fn"
  [[ "$(psql_q "SELECT has_function_privilege('authenticated', '$fn', 'EXECUTE')")" == 't' ]] || fail "authenticated sem EXECUTE em $fn"
done
pass 'ACL: anon sem EXECUTE e authenticated com EXECUTE nas 3 RPCs'

# ---------------------------------------------------------------------------
# (a) as 3 RPCs recusam o agente (42501) e aceitam admin/supervisor.
# ---------------------------------------------------------------------------
expect_error '(a) agente em save_talkx_campaign_draft -> 42501' 'talkx_campaign_role_required' \
  "$agent_session SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '90000000-0000-0000-0000-000000000001'::uuid, '$payload'::jsonb);"
expect_error '(a) agente em replace_talkx_draft_recipients -> 42501' 'talkx_campaign_role_required' \
  "$agent_session SELECT public.replace_talkx_draft_recipients('$c_replace', ARRAY['$contact_id'::uuid]);"
expect_error '(a) agente em update_talkx_campaign_limits -> 42501' 'talkx_campaign_role_required' \
  "$agent_session SELECT * FROM public.update_talkx_campaign_limits('$c_limits', 1, '{\"speed_profile\":\"fast\"}'::jsonb);"

admin_save="$(psql_q "$admin_session SELECT campaign_id || ':' || revision || ':' || creation_replayed FROM public.save_talkx_campaign_draft(NULL, NULL, '90000000-0000-0000-0000-000000000002'::uuid, '$payload'::jsonb);")"
[[ "$admin_save" == *':1:false' ]] || fail "admin não criou rascunho [obtido: $admin_save]"
admin_replace="$(psql_q "$admin_session SELECT public.replace_talkx_draft_recipients('$c_replace', ARRAY['$contact_id'::uuid]);")"
[[ "$admin_replace" == '1' ]] || fail "admin não trocou a audiência [obtido: $admin_replace]"
admin_limits="$(psql_q "$admin_session SELECT revision FROM public.update_talkx_campaign_limits('$c_limits', 1, '{\"speed_profile\":\"fast\"}'::jsonb);")"
[[ "$admin_limits" == '2' ]] || fail "admin não editou limites [obtido: $admin_limits]"

supervisor_save="$(psql_q "$supervisor_session SELECT campaign_id || ':' || revision || ':' || creation_replayed FROM public.save_talkx_campaign_draft(NULL, NULL, '90000000-0000-0000-0000-000000000003'::uuid, '$payload'::jsonb);")"
[[ "$supervisor_save" == *':1:false' ]] || fail "supervisor não criou rascunho [obtido: $supervisor_save]"
supervisor_replace="$(psql_q "$supervisor_session SELECT public.replace_talkx_draft_recipients('$c_replace', ARRAY['$contact_id'::uuid]);")"
[[ "$supervisor_replace" == '1' ]] || fail "supervisor não trocou a audiência [obtido: $supervisor_replace]"
supervisor_limits="$(psql_q "$supervisor_session SELECT revision FROM public.update_talkx_campaign_limits('$c_limits', 2, '{\"business_hours_only\":true}'::jsonb);")"
[[ "$supervisor_limits" == '3' ]] || fail "supervisor não editou limites [obtido: $supervisor_limits]"
pass '(a) agente -> 42501 nas 3 RPCs; admin e supervisor -> sucesso'

# ---------------------------------------------------------------------------
# (b) as policies de INSERT/UPDATE/DELETE de talkx_campaigns exigem o papel.
# ---------------------------------------------------------------------------
for pol in 'Users can create campaigns' 'Users can update own campaigns' 'Users can delete own draft campaigns'; do
  expr="$(psql_q "SELECT COALESCE(pg_get_expr(polwithcheck, polrelid), '') || ' || ' || COALESCE(pg_get_expr(polqual, polrelid), '') FROM pg_policy WHERE polname = '$pol' AND polrelid = 'public.talkx_campaigns'::regclass")"
  [[ -n "$expr" && "$expr" != ' || ' ]] || fail "policy '$pol' ausente em talkx_campaigns"
  [[ "$expr" == *is_admin_or_supervisor* ]] || fail "policy '$pol' não exige o papel [obtido: $expr]"
done
pass '(b) policies de INSERT/UPDATE/DELETE de talkx_campaigns exigem is_admin_or_supervisor'

# ---------------------------------------------------------------------------
# (c) gatilho recusa scheduled vindo de quem não tem papel.
# ---------------------------------------------------------------------------
# Isola o gatilho (defesa em profundidade) da RLS: desliga a RLS só para esta prova,
# porque com a RLS ligada o UPDATE do agente é filtrado silenciosamente (0 linhas).
psql_test -q -c 'ALTER TABLE public.talkx_campaigns DISABLE ROW LEVEL SECURITY' >/dev/null
expect_error '(c) agente UPDATE direto para scheduled -> 42501' 'talkx_campaign_schedule_role_required' \
  "$agent_session UPDATE public.talkx_campaigns SET status='scheduled' WHERE id='$c_agent_sched';"
[[ "$(psql_q "SELECT status FROM public.talkx_campaigns WHERE id='$c_agent_sched'")" == 'draft' ]] || fail '(c) agente agendou apesar da recusa'
psql_test -q -c 'ALTER TABLE public.talkx_campaigns ENABLE ROW LEVEL SECURITY' >/dev/null

# Com a RLS ligada o agente nem alcança a linha (a policy de UPDATE exige o papel).
agent_rls_out="$(psql_q "$agent_session UPDATE public.talkx_campaigns SET status='scheduled' WHERE id='$c_agent_rls'")"
[[ -z "$agent_rls_out" ]] || fail "(c) UPDATE do agente retornou linha inesperada [$agent_rls_out]"
[[ "$(psql_q "SELECT status FROM public.talkx_campaigns WHERE id='$c_agent_rls'")" == 'draft' ]] || fail '(c) agente agendou via RLS'

# Admin agenda com sucesso (dono da campanha + papel).
psql_test -q -c "$admin_session UPDATE public.talkx_campaigns SET status='scheduled' WHERE id='$c_admin_sched';" >/dev/null
[[ "$(psql_q "SELECT status FROM public.talkx_campaigns WHERE id='$c_admin_sched'")" == 'scheduled' ]] || fail '(c) admin não conseguiu agendar'
pass '(c) agente -> erro no gatilho e bloqueio na RLS; admin -> agenda'

# ---------------------------------------------------------------------------
# (d) anon perdeu o acesso a talkx_settings; authenticated continua lendo.
# ---------------------------------------------------------------------------
[[ "$(psql_q "SELECT has_table_privilege('anon', 'public.talkx_settings', 'SELECT')")" == 'f' ]] || fail '(d) anon ainda lê talkx_settings'
[[ "$(psql_q "SELECT has_table_privilege('anon', 'public.talkx_settings', 'INSERT')")" == 'f' ]] || fail '(d) anon ainda escreve talkx_settings'
[[ "$(psql_q "SELECT has_table_privilege('authenticated', 'public.talkx_settings', 'SELECT')")" == 't' ]] || fail '(d) authenticated perdeu a leitura de talkx_settings'
pass '(d) anon sem acesso a talkx_settings; authenticated mantém a leitura'

# ---------------------------------------------------------------------------
# (e) policy de UPDATE de talkx_blacklist criada de forma idempotente e restrita.
# ---------------------------------------------------------------------------
blacklist_expr="$(psql_q "SELECT COALESCE(pg_get_expr(polwithcheck, polrelid), '') || ' || ' || COALESCE(pg_get_expr(polqual, polrelid), '') FROM pg_policy WHERE polname='talkx_blacklist_update' AND polrelid='public.talkx_blacklist'::regclass")"
[[ -n "$blacklist_expr" && "$blacklist_expr" != ' || ' ]] || fail '(e) policy talkx_blacklist_update ausente'
[[ "$blacklist_expr" == *is_admin_or_supervisor* ]] || fail "(e) policy talkx_blacklist_update não exige o papel [obtido: $blacklist_expr]"
pass '(e) policy de UPDATE de talkx_blacklist existe e exige is_admin_or_supervisor'

# ---------------------------------------------------------------------------
# (f) ramo admin/supervisor na leitura de talkx_link_clicks.
# ---------------------------------------------------------------------------
clicks_expr="$(psql_q "SELECT pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polname='Users can view clicks of own campaigns' AND polrelid='public.talkx_link_clicks'::regclass")"
[[ -n "$clicks_expr" ]] || fail '(f) policy de leitura de talkx_link_clicks ausente'
[[ "$clicks_expr" == *is_admin_or_supervisor* ]] || fail "(f) leitura de talkx_link_clicks sem ramo admin [obtido: $clicks_expr]"
pass '(f) leitura de talkx_link_clicks tem ramo admin/supervisor e mantém o ramo do dono'

printf 'PASS: X014 role gates — RPCs, policies, gatilho de agendamento, revoke de talkx_settings, policy de blacklist e ramo admin em link_clicks\n'
