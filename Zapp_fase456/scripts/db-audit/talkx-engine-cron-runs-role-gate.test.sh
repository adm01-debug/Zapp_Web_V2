#!/usr/bin/env bash
# Harness descartavel (Docker postgres:17-alpine) — R3-SEC-001 / item 118 (M-DB-03).
#
# Prova, em PostgreSQL 17, que o helper SECURITY DEFINER public.talkx_engine_cron_runs
# nao pode mais ser chamado direto por um authenticated sem papel privilegiado:
#   RED (antes da migration 20261006193506):
#     - authenticated comum chama a RPC direto e LE as execucoes do cron (2 linhas);
#   GREEN (depois):
#     1. authenticated comum -> 42501 talkx_admin_required (helper nao e mais alcançavel);
#     2. admin e supervisor -> leem (2 linhas);
#     3. service_role -> le (2 linhas);
#     4. anon nao tem EXECUTE (ACL) e nao le;
#     5. a view talkx_engine_health continua funcionando para o agente (sinais nao-cron)
#        e expoe cron_run so para admin/service_role — ninguem depende de escolher a view;
#     6. o chamador interno talkx_engine_alerts() (service_role) segue enxergando o cron
#        e abrindo cron_degraded;
#     7. reaplicar a migration nao quebra (idempotencia);
#     8. o Rollback do cabecalho roda e devolve o estado anterior (agente volta a ler).
#
# As migrations REAIS sao encontradas pelos marcadores internos
# 'talkx_x033_objetos_ausentes' (cria o helper) e 'talkx_cron_runs_role_gate'
# (aplica o gate); sobrevivem ao rename do hermes-db-migrar --nova.
#
# Fixtures: apenas o ambiente minimo (schema auth, profiles/user_roles, tabelas e
# stubs) que a migration real toca — a MESMA abordagem dos testes irmaos
# (talkx-engine-health.test.sh, talkx-role-gates.test.sh). O objeto sob teste e
# aplicado do arquivo real de supabase/migrations, nunca recriado aqui.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

find_migration() {
  local marker="$1"
  grep -rlF "$marker" "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true
}

migration_x033="$(find_migration 'talkx_x033_objetos_ausentes')"
[[ -n "$migration_x033" && -f "$migration_x033" ]] || { printf '[FALHA] migration X033 nao encontrada (marcador talkx_x033_objetos_ausentes)\n' >&2; exit 1; }
migration_gate="$(find_migration 'talkx_cron_runs_role_gate')"
[[ -n "$migration_gate" && -f "$migration_gate" ]] || { printf '[FALHA] migration do gate nao encontrada (marcador talkx_cron_runs_role_gate)\n' >&2; exit 1; }

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

cid="talkx-cron-gate-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^talkx-cron-gate-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_val()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label (= $actual)"
}
assert_has() {
  local label="$1" pattern="$2" actual="$3"
  [[ "$actual" == *"$pattern"* ]] || fail "$label: esperado conter '$pattern', obtido -> $actual"
  pass "$label ($pattern)"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
pg_image="${TALKX_CRON_GATE_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=talkx_cron_gate_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ── identificadores ───────────────────────────────────────────────────────────
user_admin='a0000000-0000-0000-0000-000000000001'
user_agent='a0000000-0000-0000-0000-000000000002'
user_super='a0000000-0000-0000-0000-000000000003'
profile_admin='b0000000-0000-0000-0000-000000000001'
profile_agent='b0000000-0000-0000-0000-000000000002'
profile_super='b0000000-0000-0000-0000-000000000003'
c_stall='d0000000-0000-0000-0000-000000000001'

# ── fixtures (o suficiente para a X033 rodar) ─────────────────────────────────
psql_exec >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
-- Stub de ambiente: mesma semantica do public.is_admin_or_supervisor real
-- (20251215025014) — EXISTS em user_roles com papel admin/supervisor.
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _uid AND r.role IN ('admin','supervisor'))
  $$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO anon, authenticated, service_role;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'campanha',
  message_template text NOT NULL DEFAULT 'Oi',
  status text NOT NULL DEFAULT 'draft',
  whatsapp_connection_id uuid,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  worker_id text,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  total_recipients integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid,
  status text NOT NULL DEFAULT 'pending',
  personalized_message text,
  media_url_snapshot text,
  media_type_snapshot text,
  sent_at timestamptz,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  retry_after timestamptz,
  delivery_claim_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid,
  entity_type text,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid,
  recipient_id uuid,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  ua text,
  ip_hash text
);

-- Stub do pg_cron: o job do Talk X e as execucoes.
CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid bigserial PRIMARY KEY,
  jobname text,
  schedule text,
  command text,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE cron.job_run_details (
  jobid bigint,
  runid bigserial PRIMARY KEY,
  job_pid integer,
  database text,
  username text,
  command text,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
);
INSERT INTO cron.job (jobname, schedule, command)
  VALUES ('talkx-scheduler-1min', '* * * * *', 'SELECT public.trigger_talkx_engine_tick()');

-- Stubs do Vault/net (resolvidos so em runtime do tick, nao no CREATE).
CREATE SCHEMA vault;
CREATE TABLE vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, secret text
);

CREATE FUNCTION public.get_talkx_cron_secret() RETURNS text LANGUAGE sql AS $$ SELECT 'segredo-de-teste'::text $$;
CREATE FUNCTION public.kick_talkx_campaign(p uuid) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;
CREATE FUNCTION public.sweep_talkx_stuck_recipients(p integer) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
CREATE FUNCTION public.complete_talkx_campaign_if_drained(p uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;

GRANT SELECT ON public.talkx_campaigns, public.talkx_recipients, public.talkx_settings TO authenticated, service_role;

INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('last_purge_at', 'null'::jsonb, 'fixture'),
  ('retention_days_message', '180'::jsonb, 'fixture'),
  ('retention_days_clicks', '365'::jsonb, 'fixture'),
  ('retention_days_test_sends', '90'::jsonb, 'fixture'),
  ('retention_days_ai', '90'::jsonb, 'fixture'),
  ('business_hours', '{"tz":"America/Sao_Paulo","start":"08:00","end":"18:00","days":[1,2,3,4,5]}'::jsonb, 'fixture');
SQL

psql_exec >/dev/null <<SQL
INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('$profile_admin', '$user_admin', true),
  ('$profile_agent', '$user_agent', true),
  ('$profile_super', '$user_super', true);
INSERT INTO public.user_roles (user_id, role) VALUES
  ('$user_admin', 'admin'),
  ('$user_super', 'supervisor');
SQL

# 3 execucoes do cron do Talk X, todas falhas (sinal de cron_degraded).
psql_exec >/dev/null <<'SQL'
INSERT INTO cron.job_run_details (jobid, status, return_message, start_time)
SELECT jobid, 'failed', 'job startup timeout', now() - interval '1 minute' FROM cron.job WHERE jobname='talkx-scheduler-1min';
INSERT INTO cron.job_run_details (jobid, status, return_message, start_time)
SELECT jobid, 'failed', 'job startup timeout', now() - interval '2 minutes' FROM cron.job WHERE jobname='talkx-scheduler-1min';
INSERT INTO cron.job_run_details (jobid, status, return_message, start_time)
SELECT jobid, 'failed', 'job startup timeout', now() - interval '3 minutes' FROM cron.job WHERE jobname='talkx-scheduler-1min';
SQL

# ═════════════════════════════════════════════════════════════════════════════
# RED — antes do gate: authenticated comum le as execucoes do cron
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration_x033" >/dev/null || fail 'migration X033 nao aplicou'
pass "migration X033 aplicada ($(basename "$migration_x033"))"

agent_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_agent';"
admin_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_admin';"
super_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_super';"
svc_session="SET ROLE service_role; SET request.jwt.claim.role = 'service_role'; SET request.jwt.claim.sub = '$user_admin';"
anon_session="SET ROLE anon; SET request.jwt.claim.role = 'anon';"

red_agent="$(psql_val "$agent_session SELECT count(*) FROM public.talkx_engine_cron_runs(60)")"
assert_eq 'RED: authenticated comum le o cron direto (defeito vivo)' '3' "$red_agent"
red_anon_acl="$(psql_val "SELECT has_function_privilege('anon', 'public.talkx_engine_cron_runs(integer)', 'EXECUTE')::text")"
assert_eq 'RED: anon nunca teve EXECUTE no helper' 'false' "$red_anon_acl"

# ═════════════════════════════════════════════════════════════════════════════
# GREEN — aplica o gate (migration real)
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration_gate" >/dev/null || fail 'migration do gate nao aplicou (GREEN)'
pass "migration do gate aplicada ($(basename "$migration_gate"))"

# ── 1) authenticated comum -> 42501 ──────────────────────────────────────────
agent_call="$(psql_val "$agent_session SELECT count(*) FROM public.talkx_engine_cron_runs(60)")"
assert_has '1. agente comum e barrado (42501 talkx_admin_required)' 'talkx_admin_required' "$agent_call"
agent_call2="$(psql_val "$agent_session SELECT count(*) FROM public.talkx_engine_cron_runs()")"
assert_has '1. agente comum barrado tambem no DEFAULT (p_limit omitido)' 'talkx_admin_required' "$agent_call2"

# ── 2) admin e supervisor leem ───────────────────────────────────────────────
admin_rows="$(psql_val "$admin_session SELECT count(*) FROM public.talkx_engine_cron_runs(60)")"
assert_eq '2. admin le as 3 execucoes do cron' '3' "$admin_rows"
super_rows="$(psql_val "$super_session SELECT count(*) FROM public.talkx_engine_cron_runs(60)")"
assert_eq '2. supervisor le as 3 execucoes do cron' '3' "$super_rows"

# ── 3) service_role le (chamador interno) ────────────────────────────────────
svc_rows="$(psql_val "$svc_session SELECT count(*) FROM public.talkx_engine_cron_runs(60)")"
assert_eq '3. service_role le as 3 execucoes do cron' '3' "$svc_rows"

# ── 4) anon nao tem EXECUTE (ACL) ────────────────────────────────────────────
anon_acl="$(psql_val "SELECT has_function_privilege('anon', 'public.talkx_engine_cron_runs(integer)', 'EXECUTE')::text")"
assert_eq '4. anon segue sem EXECUTE no helper' 'false' "$anon_acl"
anon_pub="$(psql_val "SELECT EXISTS (SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid='public.talkx_engine_cron_runs(integer)'::regprocedure), acldefault('f',(SELECT proowner FROM pg_proc WHERE oid='public.talkx_engine_cron_runs(integer)'::regprocedure)))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')::text")"
assert_eq '4. PUBLIC sem EXECUTE no helper' 'false' "$anon_pub"
anon_call="$(psql_val "$anon_session SELECT count(*) FROM public.talkx_engine_cron_runs(60)")"
assert_has '4. anon nao executa o helper' 'permission denied' "$anon_call"

# ── 5) a view talkx_engine_health segue de pe ────────────────────────────────
psql_val "INSERT INTO public.talkx_campaigns (id, name, message_template, status, started_at, updated_at) VALUES ('$c_stall', 'Travada', 'Oi', 'sending', now() - interval '20 minutes', now() - interval '20 minutes')" >/dev/null
psql_val "INSERT INTO public.talkx_recipients (id, campaign_id, status) VALUES ('e0000000-0000-0000-0000-000000000001', '$c_stall', 'pending')" >/dev/null
agent_view_all="$(psql_val "$agent_session SELECT count(*) FROM public.talkx_engine_health")"
assert_eq '5. agente le a view (sinais nao-cron) sem erro' '1' "$agent_view_all"
agent_view_cron="$(psql_val "$agent_session SELECT count(*) FROM public.talkx_engine_health WHERE kind='cron_run'")"
assert_eq '5. agente nao ve cron_run na view' '0' "$agent_view_cron"
agent_view_stall="$(psql_val "$agent_session SELECT count(*) FROM public.talkx_engine_health WHERE kind='stalled_campaign'")"
assert_eq '5. agente ve o sinal stalled_campaign' '1' "$agent_view_stall"
admin_view_cron="$(psql_val "$admin_session SELECT count(*) FROM public.talkx_engine_health WHERE kind='cron_run'")"
assert_eq '5. admin ve cron_run na view' '3' "$admin_view_cron"
svc_view_cron="$(psql_val "$svc_session SELECT count(*) FROM public.talkx_engine_health WHERE kind='cron_run'")"
assert_eq '5. service_role ve cron_run na view' '3' "$svc_view_cron"

# ── 6) o chamador interno (service_role) segue enxergando o cron ─────────────
alert_out="$(psql_val "$svc_session SELECT public.talkx_engine_alerts()")"
assert_has '6. talkx_engine_alerts abre cron_degraded (helper acessivel ao service_role)' 'cron_degraded' "$alert_out"

# ── 7) idempotencia ──────────────────────────────────────────────────────────
psql_exec < "$migration_gate" >/dev/null || fail 'migration do gate nao reaplicou (idempotencia)'
pass 'migration do gate reaplicada sem erro (idempotencia)'
agent_again="$(psql_val "$agent_session SELECT count(*) FROM public.talkx_engine_cron_runs(60)")"
assert_has '7. agente segue barrado apos reaplicar' 'talkx_admin_required' "$agent_again"

# ── 8) o Rollback do cabecalho roda e devolve o estado anterior ──────────────
rollback_sql="$(sed -n '2p' "$migration_gate" | sed 's/^-- Rollback: //')"
echo "$rollback_sql" | psql_exec >/dev/null || fail 'Rollback do cabecalho nao executou'
pass 'Rollback do cabecalho executou'
rolled_agent="$(psql_val "$agent_session SELECT count(*) FROM public.talkx_engine_cron_runs(60)")"
assert_eq '8. apos o Rollback o agente volta a ler (estado anterior restaurado)' '3' "$rolled_agent"

echo '[OK] R3-SEC-001: talkx_engine_cron_runs exige admin/supervisor ou service_role; a view talkx_engine_health e o chamador interno (service_role) seguem funcionando; Rollback devolve o estado anterior.'
