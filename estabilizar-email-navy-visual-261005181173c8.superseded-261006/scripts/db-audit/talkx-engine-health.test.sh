#!/usr/bin/env bash
# Harness descartavel (Docker postgres:17-alpine) — X033.
# Fecha CAP-100, CAP-101.
#
# Prova, em PostgreSQL 17, o delta de X033 (log por destinatario, saude do motor e alertas):
#   RED (antes da migration):
#     - public.talkx_delivery_log NAO existe;
#     - public.talkx_engine_alerts() NAO existe.
#   GREEN (depois):
#     1. objetos criados: tabela de log, tabela de alertas, view talkx_engine_health
#        (security_invoker), RPC talkx_campaign_logs e as funcoes de saude;
#     2. campanha 'sending' parada ha 20 min (janela aberta) -> 1 alerta 'stalled_campaign';
#     3. segunda chamada de talkx_engine_alerts() -> NAO duplica;
#     4. envio novo (destinatario com sent_at) -> 'resolved_at' preenchido;
#     5. cron com 3 'job startup timeout' seguidos -> alerta 'cron_degraded';
#     6. talkx_campaign_logs devolve o log da campanha; a tabela NAO tem telefone nem texto;
#     7. o expurgo apaga log com mais de 30 dias e preserva o recente;
#     8. RLS: agente NAO le o log; admin le; anon/authenticated NAO executam talkx_engine_alerts;
#     9. idempotencia: reaplicar a migration nao quebra.
#
# A migration e encontrada pelo marcador interno 'talkx_x033_objetos_ausentes'
# (sobrevive ao rename do hermes-db-migrar --nova); fallback para .tmp/x033.sql.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

migration="$(grep -rlF 'talkx_x033_objetos_ausentes' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
if [[ -z "$migration" ]]; then
  migration="$repo_root/.tmp/x033.sql"
fi
[[ -f "$migration" ]] || { printf '[FALHA] migration X033 nao encontrada (marcador talkx_x033_objetos_ausentes)\n' >&2; exit 1; }

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

cid="talkx-x033-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^talkx-x033-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_val()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1" 2>&1; }
psql_raw()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }

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
pg_image="${TALKX_X033_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=talkx_x033_test_only "$pg_image" >/dev/null

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
profile_admin='b0000000-0000-0000-0000-000000000001'
c_stall='d0000000-0000-0000-0000-000000000001'
r_stall='e0000000-0000-0000-0000-000000000001'

# ── fixtures (o suficiente para o delta de X033 rodar) ────────────────────────
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
-- is_admin_or_supervisor: so o perfil admin (user_admin) e privilegiado.
CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT _uid = 'a0000000-0000-0000-0000-000000000001'::uuid $$;

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

-- Stub do pg_cron: o cron do Talk X ('talkx-scheduler-1min') e as execucoes.
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
  ('$profile_admin', '$user_admin', true);
SQL

# ═════════════════════════════════════════════════════════════════════════════
# RED — o estado antes da migration reproduz as lacunas do X033
# ═════════════════════════════════════════════════════════════════════════════
red_tbl="$(psql_raw "SELECT count(*) FROM public.talkx_delivery_log")"
assert_has 'RED: talkx_delivery_log nao existe antes da X033' 'does not exist' "$red_tbl"
red_fn="$(psql_raw "SELECT public.talkx_engine_alerts()")"
assert_has 'RED: talkx_engine_alerts nao existe antes da X033' 'does not exist' "$red_fn"

# ═════════════════════════════════════════════════════════════════════════════
# GREEN — aplica a migration X033
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration" >/dev/null || fail 'migration X033 nao aplicou (GREEN)'
pass "migration X033 aplicada ($(basename "$migration"))"

service_session="SET ROLE service_role; SET request.jwt.claim.role = 'service_role'; SET request.jwt.claim.sub = '$user_admin';"
admin_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_admin';"
agent_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_agent';"

# ── 1) objetos criados ───────────────────────────────────────────────────────
objs="$(psql_val "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('talkx_delivery_log','talkx_alerts')")"
assert_eq '1. tabelas talkx_delivery_log e talkx_alerts existem' '2' "$objs"
view_inv="$(psql_val "SELECT (reloptions::text LIKE '%security_invoker=%')::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='talkx_engine_health' AND c.relkind='v'")"
assert_eq '1. talkx_engine_health e security_invoker' 'true' "$view_inv"
fn_count="$(psql_val "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('talkx_campaign_logs','talkx_engine_alerts','talkx_engine_window_open','talkx_engine_cron_runs')")"
assert_eq '1. RPC/funcoes novas existem (4)' '4' "$fn_count"

# ── 2) campanha parada ha 20 min -> 1 alerta stalled_campaign ────────────────
psql_val "INSERT INTO public.talkx_campaigns (id, name, message_template, status, started_at, updated_at) VALUES ('$c_stall', 'Travada', 'Oi', 'sending', now() - interval '20 minutes', now() - interval '20 minutes')" >/dev/null
psql_val "INSERT INTO public.talkx_recipients (id, campaign_id, status) VALUES ('$r_stall', '$c_stall', 'pending')" >/dev/null
first="$(psql_val "$service_session SELECT public.talkx_engine_alerts()")"
assert_has '2. primeira chamada abre 1 alerta' '"opened": 1' "$first"
open_stall="$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind='stalled_campaign' AND resolved_at IS NULL")"
assert_eq '2. exatamente 1 alerta stalled_campaign aberto' '1' "$open_stall"
view_stall="$(psql_val "SELECT count(*) FROM public.talkx_engine_health WHERE kind='stalled_campaign'")"
assert_eq '2. a view de saude sinaliza a campanha travada' '1' "$view_stall"

# ── 3) segunda chamada nao duplica ───────────────────────────────────────────
second="$(psql_val "$service_session SELECT public.talkx_engine_alerts()")"
assert_has '3. segunda chamada nao abre nada' '"opened": 0' "$second"
total_stall="$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind='stalled_campaign'")"
assert_eq '3. continua 1 alerta stalled_campaign (sem duplicata)' '1' "$total_stall"

# ── 4) envio novo -> resolved_at preenchido ──────────────────────────────────
psql_val "UPDATE public.talkx_recipients SET status='sent', sent_at=now(), updated_at=now() WHERE id='$r_stall'" >/dev/null
third="$(psql_val "$service_session SELECT public.talkx_engine_alerts()")"
assert_has '4. envio novo fecha o alerta' '"resolved": 1' "$third"
resolved_at="$(psql_val "SELECT (resolved_at IS NOT NULL)::text FROM public.talkx_alerts WHERE kind='stalled_campaign'")"
assert_eq '4. resolved_at preenchido' 'true' "$resolved_at"
open_after="$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind='stalled_campaign' AND resolved_at IS NULL")"
assert_eq '4. nenhum stalled_campaign aberto apos a resolucao' '0' "$open_after"

# ── 5) cron com 3 'job startup timeout' seguidos -> cron_degraded ────────────
for m in 3 2 1; do
  psql_val "INSERT INTO cron.job_run_details (jobid, status, return_message, start_time) SELECT jobid, 'failed', 'job startup timeout', now() - interval '$m minutes' FROM cron.job WHERE jobname='talkx-scheduler-1min'" >/dev/null
done
fourth="$(psql_val "$service_session SELECT public.talkx_engine_alerts()")"
assert_has '5. cron degradado abre alerta' '"opened": 1' "$fourth"
cron_alert="$(psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind='cron_degraded' AND resolved_at IS NULL")"
assert_eq '5. exatamente 1 alerta cron_degraded' '1' "$cron_alert"
cron_null="$(psql_val "SELECT (campaign_id IS NULL)::text FROM public.talkx_alerts WHERE kind='cron_degraded'")"
assert_eq '5. cron_degraded e global (campanha nula)' 'true' "$cron_null"
cron_view="$(psql_val "$service_session SELECT count(*) FROM public.talkx_engine_health WHERE kind='cron_run'")"
assert_eq '5. a view expoe as execucoes do cron' '3' "$cron_view"

# ── 6) RPC do log + ausencia de telefone/texto ───────────────────────────────
psql_val "INSERT INTO public.talkx_delivery_log (campaign_id, recipient_id, attempt, stage, outcome, http_status, worker_id, duration_ms) VALUES ('$c_stall', '$r_stall', 1, 'dispatch', 'sent', 200, 'w-1', 42)" >/dev/null
log_rows="$(psql_val "$service_session SELECT count(*) FROM public.talkx_campaign_logs('$c_stall', NULL, 100)")"
assert_eq '6. talkx_campaign_logs devolve o log da campanha' '1' "$log_rows"
forbidden_cols="$(psql_val "SELECT count(*) FROM information_schema.columns WHERE table_name='talkx_delivery_log' AND column_name IN ('phone','contact_phone','personalized_message','message','texto','body')")"
assert_eq '6. a tabela de log NAO tem telefone nem texto' '0' "$forbidden_cols"

# ── 7) expurgo de 30 dias do log ─────────────────────────────────────────────
psql_val "INSERT INTO public.talkx_delivery_log (campaign_id, attempt, stage, outcome, created_at) VALUES ('$c_stall', 1, 'dispatch', 'sent', now() - interval '31 days')" >/dev/null
psql_val "$service_session SELECT public.purge_talkx_expired_data(1000)" >/dev/null
old_log="$(psql_val "SELECT count(*) FROM public.talkx_delivery_log WHERE created_at < now() - interval '30 days'")"
assert_eq '7. log com mais de 30 dias foi expurgado' '0' "$old_log"
new_log="$(psql_val "SELECT count(*) FROM public.talkx_delivery_log WHERE created_at >= now() - interval '30 days'")"
assert_eq '7. log recente preservado' '1' "$new_log"

# ── 8) RLS/ACL ───────────────────────────────────────────────────────────────
agent_log="$(psql_val "$agent_session SELECT count(*) FROM public.talkx_delivery_log")"
assert_eq '8. agente nao le o log de entrega' '0' "$agent_log"
admin_log="$(psql_val "$admin_session SELECT count(*) FROM public.talkx_delivery_log")"
assert_eq '8. admin le o log de entrega' '1' "$admin_log"
agent_alert="$(psql_val "$agent_session SELECT count(*) FROM public.talkx_alerts")"
assert_eq '8. agente nao le os alertas' '0' "$agent_alert"
for fn in 'public.talkx_engine_alerts()' 'public.purge_talkx_expired_data(integer)' 'public.trigger_talkx_engine_tick()'; do
  assert_eq "8. authenticated sem EXECUTE em $fn" 'f' "$(psql_val "SELECT has_function_privilege('authenticated', '$fn', 'EXECUTE')")"
  assert_eq "8. anon sem EXECUTE em $fn" 'f' "$(psql_val "SELECT has_function_privilege('anon', '$fn', 'EXECUTE')")"
  assert_eq "8. service_role com EXECUTE em $fn" 't' "$(psql_val "SELECT has_function_privilege('service_role', '$fn', 'EXECUTE')")"
done

# ── 9) idempotencia: reaplicar a migration nao quebra ────────────────────────
psql_exec < "$migration" >/dev/null || fail 'migration X033 nao reaplicou (idempotencia)'
pass 'migration X033 reaplicada sem erro (idempotencia)'

echo '[OK] Talk X X033: log por destinatario (sem telefone/texto, expurgo 30d), view de saude security_invoker, alertas com deduplicacao por tipo/campanha e fechamento automatico (stalled_campaign, cron_degraded).'
