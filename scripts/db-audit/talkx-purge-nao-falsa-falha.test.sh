#!/usr/bin/env bash
# Harness descartavel (Docker postgres:17-alpine) — #126 / achado R3-DELTA-009.
#
# Defeito: a purga LGPD (public.purge_talkx_expired_data) grava updated_at = now() nos
# destinatarios de campanhas TERMINAIS que ela expurga. A view de saude
# public.talkx_engine_health media "falha recente" (failure_rate_15m, 15 min) e
# outcome_unknown_24h (24 h) por r.updated_at; a purga do dia, entao, faz destinatarios
# antigos e ja terminais aparecerem como se tivessem acabado de mudar de estado, e
# talkx_engine_alerts() abre alertas FALSOS (high_failure_rate / outcome_unknown) numa
# campanha completed/cancelled.
#
# Estado "antes" = as migrations reais ja aplicadas em producao:
#   20261003242707_talkx_log_saude_alertas.sql (X033: log, saude, alertas, expurgo)
#   20261004173439_talkx_tick_nao_aborta_no_expurgo.sql (M-DB-01: expurgo isolado no tick)
# Correcao = a migration nova (marcador 'talkx_status_changed_at_na_saude').
#
# Bloco A (RED, antes da correcao):
#   A0/A1  baseline: a campanha terminal NAO aparece na saude antes da purga;
#   A2     a purga roda e anula a PII (prova de que o expurgo continua expurgando);
#   A3/A4  DEFEITO: depois da purga, failure_rate_15m e outcome_unknown_24h aparecem
#          para a campanha terminal -> "falha recente" falsa;
#   A5/A6  DANO: talkx_engine_alerts() abre 'high_failure_rate' e 'outcome_unknown' FALSOS.
# Bloco B (GREEN, depois da correcao):
#   B0     coluna/trava novas existem; a view segue security_invoker e com os grants; o backfill
#          NAO regravou updated_at (digest antes/depois identico em c_green e c_live) e o gatilho
#          publico do status nao tem EXECUTE para cliente nenhum — com controle (funcao sonda
#          criada sob o mesmo default privilege do Supabase) provando que o harness concede
#          EXECUTE por padrao, senao a afirmacao seria sobre o harness e nao sobre o banco;
#   B1/B2  o expurgo continua anulando a PII, mas agora NAO cria sinal falso
#          (a view le status_changed_at, que o expurgo nao move, e updated_at segue sendo
#          empurrado — prova de que o defeito do updated_at continua e nao e ele que cura);
#   B3     falha REAL preservada: destinatario que muda de status para 'failed' AGORA
#          aparece em failure_rate_15m e talkx_engine_alerts() abre high_failure_rate;
#   B4     o gatilho novo so move status_changed_at em troca REAL de status;
#   B5     idempotencia: reaplicar a migration nao quebra.
# Bloco C (ROLLBACK): o SQL extraido verbatim do cabecalho da migration (entre os marcadores
#   BEGIN-ROLLBACK-SQL / END-ROLLBACK-SQL) roda e devolve o comportamento anterior — depois
#   dele, a purga volta a criar o sinal falso.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

x033="$(grep -rlF 'talkx_x033_objetos_ausentes' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
mdb01="$(ls "$repo_root"/supabase/migrations/20261004173439_*.sql 2>/dev/null | head -1 || true)"
fix="$(grep -rlF 'talkx_status_changed_at_na_saude' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"

[[ -f "$x033"  ]] || { printf '[FALHA] migration X033 nao encontrada (marcador talkx_x033_objetos_ausentes)\n' >&2; exit 1; }
[[ -f "$mdb01" ]] || { printf '[FALHA] migration M-DB-01 (20261004173439_*.sql) nao encontrada\n' >&2; exit 1; }
[[ -f "$fix"   ]] || { printf '[FALHA] migration da correcao nao encontrada (marcador talkx_status_changed_at_na_saude)\n' >&2; exit 1; }

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

cid="talkx-x126-$RANDOM$RANDOM"
rb="${TMPDIR:-/tmp}/rollback-x126-$RANDOM.sql"
cleanup() {
  if [[ "$cid" =~ ^talkx-x126-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
  rm -f "$rb" 2>/dev/null || true
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
pg_image="${TALKX_X126_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=talkx_x126_test_only "$pg_image" >/dev/null

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
profile_admin='b0000000-0000-0000-0000-000000000001'
c_red='d0000000-0000-0000-0000-000000000001'    # campanha terminal purgada ANTES da correcao (RED)
c_green='d0000000-0000-0000-0000-000000000002'  # campanha terminal purgada DEPOIS da correcao (GREEN)
c_live='d0000000-0000-0000-0000-000000000003'   # campanha com transicao de status REAL (GREEN)

# ── fixtures: superficie minima do Supabase ───────────────────────────────────
psql_exec >/dev/null <<'SQL'
CREATE SCHEMA auth;
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
  media_url text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

-- SEM status_changed_at de proposito: e a coluna que a correcao cria.
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

-- Gatilho generico que existe no banco de producao: QUALQUER update empurra updated_at.
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER update_talkx_recipients_updated_at
  BEFORE UPDATE ON public.talkx_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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

-- Stub do pg_cron (o cron do Talk X e as execucoes).
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
INSERT INTO public.profiles (id, user_id, is_active) VALUES ('$profile_admin', '$user_admin', true);
SQL

# ── fixtures de dados: campanhas terminais vencidas com PII e updated_at ANTIGO ─
# (INSERT, nao UPDATE: o gatilho generico so age em UPDATE, entao o carimbo antigo entra.)
psql_exec >/dev/null <<SQL
INSERT INTO public.talkx_campaigns (id, name, message_template, status, completed_at, updated_at, total_recipients) VALUES
  ('$c_red',   'Purga vermelha', 'Oi', 'completed', now() - interval '200 days', now() - interval '200 days', 6),
  ('$c_green', 'Purga verde',    'Oi', 'completed', now() - interval '200 days', now() - interval '200 days', 5),
  ('$c_live',  'Falha real',     'Oi', 'completed', now() - interval '200 days', now() - interval '200 days', 6);

INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status, personalized_message, sent_at, created_at, updated_at) VALUES
  ('e0000000-0000-0000-0000-000000000001', '$c_red',   'f0000000-0000-0000-0000-000000000001', 'failed',         'PII vermelha', now() - interval '200 days', now() - interval '200 days', now() - interval '2 hours'),
  ('e0000000-0000-0000-0000-000000000002', '$c_red',   'f0000000-0000-0000-0000-000000000002', 'failed',         'PII vermelha', now() - interval '200 days', now() - interval '200 days', now() - interval '2 hours'),
  ('e0000000-0000-0000-0000-000000000003', '$c_red',   'f0000000-0000-0000-0000-000000000003', 'failed',         'PII vermelha', now() - interval '200 days', now() - interval '200 days', now() - interval '2 hours'),
  ('e0000000-0000-0000-0000-000000000004', '$c_red',   'f0000000-0000-0000-0000-000000000004', 'failed',         'PII vermelha', now() - interval '200 days', now() - interval '200 days', now() - interval '2 hours'),
  ('e0000000-0000-0000-0000-000000000005', '$c_red',   'f0000000-0000-0000-0000-000000000005', 'failed',         'PII vermelha', now() - interval '200 days', now() - interval '200 days', now() - interval '2 hours'),
  ('e0000000-0000-0000-0000-000000000006', '$c_red',   'f0000000-0000-0000-0000-000000000006', 'outcome_unknown','PII vermelha', now() - interval '200 days', now() - interval '200 days', now() - interval '3 days'),
  ('e0000000-0000-0000-0000-000000000011', '$c_green', 'f0000000-0000-0000-0000-000000000011', 'failed',         NULL,           now() - interval '200 days', now() - interval '200 days', now() - interval '3 hours'),
  ('e0000000-0000-0000-0000-000000000012', '$c_green', 'f0000000-0000-0000-0000-000000000012', 'failed',         NULL,           now() - interval '200 days', now() - interval '200 days', now() - interval '3 hours'),
  ('e0000000-0000-0000-0000-000000000013', '$c_green', 'f0000000-0000-0000-0000-000000000013', 'failed',         NULL,           now() - interval '200 days', now() - interval '200 days', now() - interval '3 hours'),
  ('e0000000-0000-0000-0000-000000000014', '$c_green', 'f0000000-0000-0000-0000-000000000014', 'failed',         NULL,           now() - interval '200 days', now() - interval '200 days', now() - interval '3 hours'),
  ('e0000000-0000-0000-0000-000000000015', '$c_green', 'f0000000-0000-0000-0000-000000000015', 'outcome_unknown',NULL,           now() - interval '200 days', now() - interval '200 days', now() - interval '3 days'),
  ('e0000000-0000-0000-0000-000000000021', '$c_live',  'f0000000-0000-0000-0000-000000000021', 'sent',           NULL,           now() - interval '200 days', now() - interval '200 days', now() - interval '2 hours'),
  ('e0000000-0000-0000-0000-000000000022', '$c_live',  'f0000000-0000-0000-0000-000000000022', 'sent',           NULL,           now() - interval '200 days', now() - interval '200 days', now() - interval '2 hours'),
  ('e0000000-0000-0000-0000-000000000023', '$c_live',  'f0000000-0000-0000-0000-000000000023', 'sent',           NULL,           now() - interval '200 days', now() - interval '200 days', now() - interval '2 hours'),
  ('e0000000-0000-0000-0000-000000000024', '$c_live',  'f0000000-0000-0000-0000-000000000024', 'sent',           NULL,           now() - interval '200 days', now() - interval '200 days', now() - interval '2 hours'),
  ('e0000000-0000-0000-0000-000000000025', '$c_live',  'f0000000-0000-0000-0000-000000000025', 'sent',           NULL,           now() - interval '200 days', now() - interval '200 days', now() - interval '2 hours'),
  ('e0000000-0000-0000-0000-000000000026', '$c_live',  'f0000000-0000-0000-0000-000000000026', 'sent',           NULL,           now() - interval '200 days', now() - interval '200 days', now() - interval '2 hours');
SQL

service_session="SET ROLE service_role; SET request.jwt.claim.role = 'service_role'; SET request.jwt.claim.sub = '$user_admin';"
agent_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_admin';"

view_count()  { psql_val "SELECT count(*) FROM public.talkx_engine_health WHERE kind='$1' AND campaign_id='$2'"; }
view_metric() { psql_val "SELECT COALESCE(metric_count,-1)::text || '/' || COALESCE(metric_rate,-1)::text FROM public.talkx_engine_health WHERE kind='$1' AND campaign_id='$2'"; }
alerts_open() { psql_val "SELECT count(*) FROM public.talkx_alerts WHERE kind='$1' AND campaign_id='$2' AND resolved_at IS NULL"; }
reset_purge_gate() { psql_val "UPDATE public.talkx_settings SET value='null'::jsonb WHERE key='last_purge_at'"; }

# ═════════════════════════════════════════════════════════════════════════════
# ESTADO "ANTES" (producao): X033 + M-DB-01 aplicadas
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$x033"  >/dev/null || fail 'migration X033 nao aplicou'
psql_exec < "$mdb01" >/dev/null || fail 'migration M-DB-01 nao aplicou'
pass "estado anterior aplicado ($(basename "$x033") + $(basename "$mdb01"))"

# ═════════════════════════════════════════════════════════════════════════════
# BLOCO A — RED: a purga cria "falha recente" falsa
# ═════════════════════════════════════════════════════════════════════════════
assert_eq 'A0. baseline: campanha terminal NAO aparece em failure_rate_15m' '0' "$(view_count failure_rate_15m "$c_red")"
assert_eq 'A1. baseline: campanha terminal NAO aparece em outcome_unknown_24h' '0' "$(view_count outcome_unknown_24h "$c_red")"

purge_a="$(psql_val "$service_session SELECT public.purge_talkx_expired_data(1000)")"
assert_has 'A2. a purga roda e anula a PII dos vencidos' '"messages": 6' "$purge_a"
assert_eq 'A2. a PII da campanha terminal foi realmente anulada' '0' "$(psql_val "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$c_red' AND personalized_message IS NOT NULL")"

assert_eq 'A3. DEFEITO: falha recente FALSA na campanha terminal (contagem de falhas)' '5' "$(psql_val "SELECT COALESCE(metric_count,-1) FROM public.talkx_engine_health WHERE kind='failure_rate_15m' AND campaign_id='$c_red'")"
assert_eq 'A3. DEFEITO: taxa de falha falsa (5/6)' '0.8333' "$(psql_val "SELECT COALESCE(metric_rate,-1) FROM public.talkx_engine_health WHERE kind='failure_rate_15m' AND campaign_id='$c_red'")"
assert_eq 'A4. DEFEITO: outcome_unknown_24h FALSO na campanha terminal' '1' "$(view_count outcome_unknown_24h "$c_red")"

alerts_a="$(psql_val "$service_session SELECT public.talkx_engine_alerts()")"
assert_has 'A5. DANO: alerta high_failure_rate falso disparado' '"high_failure_rate"' "$alerts_a"
assert_eq 'A5. alerta high_failure_rate falso aberto na campanha terminal' '1' "$(alerts_open high_failure_rate "$c_red")"
assert_eq 'A6. alerta outcome_unknown falso aberto na campanha terminal' '1' "$(alerts_open outcome_unknown "$c_red")"

# ═════════════════════════════════════════════════════════════════════════════
# ACL DE PARTIDA DO SUPABASE (default privileges) + SONDA DE CONTROLE
# ═════════════════════════════════════════════════════════════════════════════
# No banco real, funcao nova em public nasce com EXECUTE para anon, authenticated e service_role
# (default privileges do Supabase). Sem reproduzir isso, "authenticated sem EXECUTE" passaria
# porque o harness nunca concedeu nada a ninguem — afirmacao sobre o harness, nao sobre o banco.
# Aplicado aqui (logo antes da correcao) para valer exatamente sobre a funcao que a correcao cria.
# A sonda e criada no mesmo regime e NAO e revogada: ela e o controle que prova que o harness
# concede EXECUTE por padrao (se ela viesse sem EXECUTE, o teste tem de parar).
psql_exec >/dev/null <<'SQL'
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
CREATE FUNCTION public.talkx_x126_acl_probe() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
SQL
assert_eq 'B0-controle. harness concede EXECUTE a authenticated por padrao (sonda)' 't' \
  "$(psql_val "SELECT has_function_privilege('authenticated','public.talkx_x126_acl_probe()','EXECUTE')")"

# Digest do carimbo real (id | updated_at) por campanha, lido ANTES da correcao: e o que o
# backfill da coluna nova nao pode tocar.
upd_digest() {
  psql_val "SELECT md5(string_agg(id::text || '|' || updated_at::text, ',' ORDER BY id)) FROM public.talkx_recipients WHERE campaign_id='$1'"
}
upd_before_green="$(upd_digest "$c_green")"
upd_before_live="$(upd_digest "$c_live")"
[[ -n "$upd_before_green" && -n "$upd_before_live" ]] || fail 'nao consegui ler o digest de updated_at antes da correcao'

# ═════════════════════════════════════════════════════════════════════════════
# CORRECAO
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$fix" >/dev/null || fail 'migration da correcao nao aplicou'
pass "correcao aplicada ($(basename "$fix"))"

# ═════════════════════════════════════════════════════════════════════════════
# BLOCO B — GREEN: o expurgo continua expurgando e NAO cria sinal falso
# ═════════════════════════════════════════════════════════════════════════════
assert_eq 'B0. coluna status_changed_at criada' '1' "$(psql_val "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_recipients' AND column_name='status_changed_at'")"
assert_eq 'B0. gatilho do status criado (BEFORE UPDATE OF status)' '1' "$(psql_val "SELECT count(*) FROM pg_trigger WHERE tgname='trg_talkx_recipients_status_changed_at' AND NOT tgisinternal")"
assert_eq 'B0. backfill herdou o updated_at antigo (nada de now())' 'true' "$(psql_val "SELECT (max(status_changed_at) < now() - interval '1 hour')::text FROM public.talkx_recipients WHERE campaign_id='$c_green'")"
assert_eq 'B0. o backfill NAO regravou updated_at em c_green' "$upd_before_green" "$(upd_digest "$c_green")"
assert_eq 'B0. o backfill NAO regravou updated_at em c_live' "$upd_before_live" "$(upd_digest "$c_live")"
assert_eq 'B0. o backfill de c_green usou o updated_at que ja existia (nao now())' "$upd_before_green" "$(psql_val "SELECT md5(string_agg(id::text || '|' || status_changed_at::text, ',' ORDER BY id)) FROM public.talkx_recipients WHERE campaign_id='$c_green'")"
assert_eq 'B0. a view segue security_invoker' 'true' "$(psql_val "SELECT (reloptions::text LIKE '%security_invoker=true%')::text FROM pg_class WHERE oid='public.talkx_engine_health'::regclass")"
assert_eq 'B0. authenticated continua lendo a view' 't' "$(psql_val "SELECT has_table_privilege('authenticated','public.talkx_engine_health','SELECT')")"
assert_eq 'B0. anon NAO le a view' 'f' "$(psql_val "SELECT has_table_privilege('anon','public.talkx_engine_health','SELECT')")"

# o gatilho publico do status nao e chamavel por cliente nenhum
assert_eq 'B0. authenticated sem EXECUTE no gatilho do status' 'f' "$(psql_val "SELECT has_function_privilege('authenticated','public.set_talkx_recipient_status_changed_at()','EXECUTE')")"
assert_eq 'B0. anon sem EXECUTE no gatilho do status' 'f' "$(psql_val "SELECT has_function_privilege('anon','public.set_talkx_recipient_status_changed_at()','EXECUTE')")"
assert_eq 'B0. service_role sem EXECUTE no gatilho do status (so o gatilho o chama)' 'f' "$(psql_val "SELECT has_function_privilege('service_role','public.set_talkx_recipient_status_changed_at()','EXECUTE')")"

# rearma PII na campanha verde e libera o gate diario do expurgo (bookkeeping do teste)
reset_purge_gate >/dev/null
psql_val "UPDATE public.talkx_recipients SET personalized_message='PII verde 2' WHERE campaign_id='$c_green'" >/dev/null

assert_eq 'B1. antes da 2a purga, a campanha verde NAO aparece na saude' '0' "$(view_count failure_rate_15m "$c_green")"

purge_b="$(psql_val "$service_session SELECT public.purge_talkx_expired_data(1000)")"
assert_has 'B1. a 2a purga roda e anula a PII' '"messages": 5' "$purge_b"
assert_eq 'B1. a PII da campanha verde foi anulada' '0' "$(psql_val "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$c_green' AND personalized_message IS NOT NULL")"
assert_eq 'B1. updated_at FOI empurrado pela purga (o defeito de origem continua)' 'true' "$(psql_val "SELECT (min(updated_at) > now() - interval '1 minute')::text FROM public.talkx_recipients WHERE campaign_id='$c_green'")"
assert_eq 'B1. status_changed_at NAO foi movido pela purga' 'true' "$(psql_val "SELECT (max(status_changed_at) < now() - interval '1 hour')::text FROM public.talkx_recipients WHERE campaign_id='$c_green'")"

assert_eq 'B2. CORRIGIDO: a purga NAO cria falha recente' '0' "$(view_count failure_rate_15m "$c_green")"
assert_eq 'B2. CORRIGIDO: a purga NAO cria outcome_unknown_24h' '0' "$(view_count outcome_unknown_24h "$c_green")"
alerts_b="$(psql_val "$service_session SELECT public.talkx_engine_alerts()")"
assert_eq 'B2. nenhum alerta falso aberto para a campanha verde' '0' "$(alerts_open high_failure_rate "$c_green")"

# sinal REAL preservado: a campanha c_live passa a falhar AGORA
assert_eq 'B3. antes da transicao, c_live NAO aparece na saude' '0' "$(view_count failure_rate_15m "$c_live")"
psql_val "UPDATE public.talkx_recipients SET status='failed' WHERE campaign_id='$c_live'" >/dev/null
assert_eq 'B3. falha REAL detectada (contagem)' '6' "$(psql_val "SELECT COALESCE(metric_count,-1) FROM public.talkx_engine_health WHERE kind='failure_rate_15m' AND campaign_id='$c_live'")"
assert_eq 'B3. falha REAL detectada (taxa 6/6)' '1.0000' "$(psql_val "SELECT COALESCE(metric_rate,-1) FROM public.talkx_engine_health WHERE kind='failure_rate_15m' AND campaign_id='$c_live'")"
alerts_b2="$(psql_val "$service_session SELECT public.talkx_engine_alerts()")"
assert_has 'B3. talkx_engine_alerts abre high_failure_rate para a falha real' '"high_failure_rate"' "$alerts_b2"
assert_eq 'B3. alerta high_failure_rate real aberto' '1' "$(alerts_open high_failure_rate "$c_live")"

# o gatilho novo so mexe status_changed_at em troca REAL de status
before_stamp="$(psql_val "SELECT status_changed_at FROM public.talkx_recipients WHERE id='e0000000-0000-0000-0000-000000000021'")"
psql_val "UPDATE public.talkx_recipients SET personalized_message='sem troca de status' WHERE id='e0000000-0000-0000-0000-000000000021'" >/dev/null
assert_eq 'B4. update sem trocar status NAO move status_changed_at' "$before_stamp" "$(psql_val "SELECT status_changed_at FROM public.talkx_recipients WHERE id='e0000000-0000-0000-0000-000000000021'")"
psql_val "UPDATE public.talkx_recipients SET status='delivered' WHERE id='e0000000-0000-0000-0000-000000000021'" >/dev/null
assert_eq 'B4. troca real de status MOVE status_changed_at' 'true' "$(psql_val "SELECT (status_changed_at > '$before_stamp'::timestamptz)::text FROM public.talkx_recipients WHERE id='e0000000-0000-0000-0000-000000000021'")"

psql_exec < "$fix" >/dev/null || fail 'a correcao nao reaplicou (idempotencia)'
pass 'B5. migration da correcao reaplicada sem erro (idempotencia)'

# ═════════════════════════════════════════════════════════════════════════════
# BLOCO C — ROLLBACK: o SQL do cabecalho restaura o comportamento anterior
# ═════════════════════════════════════════════════════════════════════════════
sed -n '/^-- BEGIN-ROLLBACK-SQL$/,/^-- END-ROLLBACK-SQL$/p' "$fix" | sed '1d;$d' | sed 's/^-- //' > "$rb"
[[ -s "$rb" ]] || fail 'nao consegui extrair o SQL do rollback da migration'
upd_rollback_green="$(upd_digest "$c_green")"
upd_rollback_live="$(upd_digest "$c_live")"
psql_exec < "$rb" >/dev/null || fail 'o SQL do rollback nao rodou'
rm -f "$rb"
pass 'C0. o SQL do rollback (extraido verbatim do cabecalho) rodou'
assert_eq 'C0. o rollback NAO regrava updated_at em massa (c_green)' "$upd_rollback_green" "$(upd_digest "$c_green")"
assert_eq 'C0. o rollback NAO regrava updated_at em massa (c_live)' "$upd_rollback_live" "$(upd_digest "$c_live")"

assert_eq 'C1. rollback removeu a coluna nova' '0' "$(psql_val "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_recipients' AND column_name='status_changed_at'")"
assert_eq 'C1. rollback removeu o gatilho novo' '0' "$(psql_val "SELECT count(*) FROM pg_trigger WHERE tgname='trg_talkx_recipients_status_changed_at' AND NOT tgisinternal")"
assert_eq 'C1. rollback removeu a funcao do gatilho' '0' "$(psql_val "SELECT count(*) FROM pg_proc WHERE proname='set_talkx_recipient_status_changed_at'")"
assert_eq 'C1. rollback devolveu a view security_invoker' 'true' "$(psql_val "SELECT (reloptions::text LIKE '%security_invoker=true%')::text FROM pg_class WHERE oid='public.talkx_engine_health'::regclass")"

# a purga volta a criar o sinal falso (comportamento anterior restaurado)
reset_purge_gate >/dev/null
psql_val "UPDATE public.talkx_recipients SET personalized_message='PII verde 3' WHERE campaign_id='$c_green'" >/dev/null
purge_c="$(psql_val "$service_session SELECT public.purge_talkx_expired_data(1000)")"
assert_has 'C2. a purga roda de novo' '"skipped": false' "$purge_c"
assert_eq 'C2. a PII da campanha verde foi anulada de novo' '0' "$(psql_val "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$c_green' AND personalized_message IS NOT NULL")"
assert_eq 'C2. ROLLBACK: a purga volta a criar falha recente FALSA' '1' "$(view_count failure_rate_15m "$c_green")"
assert_eq 'C2. ROLLBACK: taxa falsa (4/5)' '0.8000' "$(psql_val "SELECT COALESCE(metric_rate,-1) FROM public.talkx_engine_health WHERE kind='failure_rate_15m' AND campaign_id='$c_green'")"

echo '[OK] Talk X #126 / R3-DELTA-009: a purga LGPD nao transforma expurgo de PII em "falha recente".'
echo '     ANTES: a purga empurrava updated_at e a view lia updated_at -> failure_rate_15m/outcome_unknown_24h falsos e alertas high_failure_rate/outcome_unknown falsos.'
echo '     DEPOIS: a view le status_changed_at (so troca REAL de status), o expurgo segue anulando a PII e a falha real continua sendo detectada e alertada.'
echo '     BACKFILL: o gatilho generico fica desligado SO durante o backfill (updated_at identico antes/depois em c_green e c_live).'
echo '     ROLLBACK: extraido do cabecalho, roda, nao regrava updated_at em massa e devolve o comportamento anterior.'
