#!/usr/bin/env bash
# Harness descartavel (Docker postgres:17-alpine) — X032.
# Fecha CAP-104, CAP-105, CAP-106.
#
# Prova, em PostgreSQL 17, o delta de X032 (LGPD no motor):
#   RED (antes da migration):
#     - talkx_campaigns.consent_confirmed_at NAO existe;
#     - public.purge_talkx_expired_data NAO existe.
#   GREEN (depois):
#     1. contato 'revoked' NUNCA entra na audiencia (talkx_audience_query);
#     2. com require_granted_consent=true, so 'granted' entra;
#     3. 'start' sem consent_confirmed_at -> erro talkx_campaign_consent_required;
#        com a confirmacao gravada -> start OK;
#     4. agendar (status=scheduled) sem confirmacao -> erro
#        talkx_schedule_requires_consent_confirmation;
#     5. opt-out automatico (talkx_suppress_contact, origem auto_optout) deixa o
#        contato com consent_status='revoked';
#     6. destinatario de campanha concluida ha 181 dias -> personalized_message e
#        snapshots de midia nulos, contadores intactos;
#     7. segunda execucao no mesmo dia -> 0 linhas afetadas (last_purge_at);
#     8. talkx_blacklist intacta apos o expurgo.
#
# A migration e encontrada pelo marcador interno 'talkx_x032_objetos_ausentes'
# (sobrevive ao rename do hermes-db-migrar --nova); fallback para .tmp/x032.sql.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

migration="$(grep -rlF 'talkx_x032_objetos_ausentes' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
if [[ -z "$migration" ]]; then
  migration="$repo_root/.tmp/x032.sql"
fi
[[ -f "$migration" ]] || { printf '[FALHA] migration X032 nao encontrada (marcador talkx_x032_objetos_ausentes)\n' >&2; exit 1; }

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

cid="talkx-x032-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^talkx-x032-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_val()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1" 2>&1; }
psql_raw()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }
psql_script() { docker exec -i "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres 2>&1 || true; }

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
pg_image="${TALKX_X032_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=talkx_x032_test_only "$pg_image" >/dev/null

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
profile_agent='b0000000-0000-0000-0000-000000000002'
contact_ok='c0000000-0000-0000-0000-000000000001'
contact_granted='c0000000-0000-0000-0000-000000000002'
contact_revoked='c0000000-0000-0000-0000-000000000003'
contact_optout='c0000000-0000-0000-0000-000000000004'
c_draft='d0000000-0000-0000-0000-000000000001'
c_expire='d0000000-0000-0000-0000-000000000002'
c_recent='d0000000-0000-0000-0000-000000000003'
r_draft='e0000000-0000-0000-0000-000000000001'
r_expire='e0000000-0000-0000-0000-000000000002'
r_recent='e0000000-0000-0000-0000-000000000003'
r_late='e0000000-0000-0000-0000-000000000004'

# ── fixtures (o suficiente para o delta de X032 rodar) ────────────────────────
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

CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT _uid = 'a0000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION public.is_valid_talkx_schedule_timezone(_tz text) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$ SELECT _tz IN ('America/Sao_Paulo', 'UTC') $$;
CREATE FUNCTION public.is_contact_visible_to_user(_contact uuid, _uid uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT true $$;

-- stub do resolvedor de ritmo (corpo real coberto pelos testes de X018)
CREATE FUNCTION public.talkx_resolve_speed_pace(
  p_profile text, p_smin integer, p_smax integer, p_tmin integer, p_tmax integer
) RETURNS TABLE(speed_profile text, send_interval_min integer, send_interval_max integer,
                typing_delay_min integer, typing_delay_max integer)
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(p_profile, 'moderate'), COALESCE(p_smin, 20), COALESCE(p_smax, 40),
         COALESCE(p_tmin, 1000), COALESCE(p_tmax, 2500) $$;

CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'connected',
  instance_id text
);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'contato',
  phone text,
  consent_status text,
  is_lid_legacy boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TYPE public.talkx_blacklist_reason AS ENUM (
  'opt_out', 'invalid_number', 'manual', 'lgpd', 'no_commercial_permission', 'bounce'
);

CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  phone text,
  reason text,
  reason_code public.talkx_blacklist_reason,
  origin text NOT NULL DEFAULT 'manual',
  source_message_id uuid,
  campaign_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  removed_at timestamptz
);
CREATE UNIQUE INDEX talkx_blacklist_phone_active_unique
  ON public.talkx_blacklist (phone) WHERE phone IS NOT NULL AND removed_at IS NULL;
CREATE UNIQUE INDEX talkx_blacklist_contact_active_unique
  ON public.talkx_blacklist (contact_id) WHERE contact_id IS NOT NULL AND removed_at IS NULL;

-- talkx_campaigns com as colunas vivas exigidas pelos corpos copiados (X018/X024/X031).
-- consent_confirmed_* / legal_basis entram pela migration (RED prova que faltam).
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'campanha',
  message_template text NOT NULL DEFAULT 'Oi',
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
  typing_delay_min integer NOT NULL DEFAULT 1000,
  typing_delay_max integer NOT NULL DEFAULT 2500,
  send_interval_min integer NOT NULL DEFAULT 20,
  send_interval_max integer NOT NULL DEFAULT 40,
  max_per_minute smallint,
  respect_suppression boolean NOT NULL DEFAULT true,
  confirm_consent boolean NOT NULL DEFAULT false,
  draft_step smallint DEFAULT 1,
  owner uuid,
  template_version_id uuid,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  draft_creation_key uuid,
  revision bigint NOT NULL DEFAULT 1,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  paused_at timestamptz,
  paused_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  launched_by uuid,
  launched_at timestamptz,
  pause_reason text,
  worker_id text,
  worker_lease_expires_at timestamptz,
  investment numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE UNIQUE INDEX talkx_campaigns_created_by_draft_creation_key
  ON public.talkx_campaigns (created_by, draft_creation_key) WHERE draft_creation_key IS NOT NULL;

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','sent','delivered','failed','skipped','outcome_unknown','cancelled')),
  personalized_message text,
  media_url_snapshot text,
  media_type_snapshot text,
  sent_at timestamptz,
  delivery_claim_token uuid,
  delivery_claimed_at timestamptz,
  delivery_claim_expires_at timestamptz,
  delivery_claimed_by text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT talkx_recipients_media_snapshot_shape CHECK (
    (media_url_snapshot IS NULL AND media_type_snapshot IS NULL)
    OR (length(btrim(media_url_snapshot)) BETWEEN 1 AND 8192
        AND media_type_snapshot IN ('image','video','document','audio'))
  ),
  CONSTRAINT talkx_recipients_delivery_claim_state CHECK (
    (status = 'sending' AND delivery_claim_token IS NOT NULL AND delivery_claimed_at IS NOT NULL
       AND delivery_claim_expires_at IS NOT NULL AND delivery_claimed_by IS NOT NULL)
    OR (status <> 'sending' AND delivery_claim_token IS NULL AND delivery_claimed_at IS NULL
       AND delivery_claim_expires_at IS NULL AND delivery_claimed_by IS NULL)
  )
);

CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid,
  entity_type text,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_campaign_events_type_check CHECK (event_type IN
    ('created','updated','scheduled','started','paused','resumed','cancelled','completed','note')),
  CONSTRAINT talkx_campaign_events_target_check CHECK (
    (campaign_id IS NOT NULL) <> (entity_type IS NOT NULL AND entity_id IS NOT NULL)
  )
);

CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('max_per_minute_per_connection', '6'::jsonb, 'fixture');

CREATE TABLE public.talkx_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid,
  recipient_id uuid,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  ua text,
  ip_hash text
);

CREATE TABLE public.talkx_test_send_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key text NOT NULL UNIQUE,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE public.ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
SQL

psql_exec >/dev/null <<SQL
INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('$profile_admin', '$user_admin', true),
  ('$profile_agent', '$user_agent', true);

INSERT INTO public.contacts (id, name, phone, consent_status) VALUES
  ('$contact_ok',      'OK',      '5511900000001', 'unknown'),
  ('$contact_granted', 'Granted', '5511900000002', 'granted'),
  ('$contact_revoked', 'Revoked', '5511900000003', 'revoked'),
  ('$contact_optout',  'OptOut',  '5511900000004', 'unknown');

INSERT INTO public.talkx_campaigns
  (id, name, message_template, status, created_by, total_recipients, sent_count, failed_count, completed_at, updated_at)
  VALUES
  ('$c_draft',  'Rascunho',  'Oi', 'draft',     '$profile_admin', 1, 0, 0, NULL, now()),
  ('$c_expire', 'Vencida',   'Oi', 'completed', '$profile_admin', 1, 1, 0, now() - interval '181 days', now() - interval '181 days'),
  ('$c_recent', 'Recente',   'Oi', 'completed', '$profile_admin', 1, 1, 0, now() - interval '10 days',  now() - interval '10 days');

INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status, personalized_message, media_url_snapshot, media_type_snapshot) VALUES
  ('$r_draft',  '$c_draft',  '$contact_ok',      'pending', NULL, NULL, NULL),
  ('$r_expire', '$c_expire', '$contact_ok',      'sent',    'Ola Ana, tudo bem?', 'https://x/a.png', 'image'),
  ('$r_recent', '$c_recent', '$contact_granted', 'sent',    'Ola Bia', NULL, NULL);

INSERT INTO public.talkx_link_clicks (id, link_id, clicked_at, ua, ip_hash) VALUES
  ('f0000000-0000-0000-0000-000000000001', gen_random_uuid(), now() - interval '400 days', 'OldUA', 'deadbeef'),
  ('f0000000-0000-0000-0000-000000000002', gen_random_uuid(), now() - interval '10 days',  'NewUA', 'cafebabe');

INSERT INTO public.talkx_test_send_claims (request_key, created_at) VALUES
  ('velho', now() - interval '100 days'),
  ('novo',  now() - interval '5 days');

INSERT INTO public.ai_jobs (status, created_at, finished_at) VALUES
  ('succeeded', now() - interval '100 days', now() - interval '100 days'),
  ('succeeded', now() - interval '5 days',   now() - interval '5 days'),
  ('running',   now() - interval '100 days', NULL);

INSERT INTO public.talkx_blacklist (contact_id, phone, reason, reason_code, origin) VALUES
  ('$contact_optout', '5511900000004', 'opt-out', 'opt_out', 'manual');
SQL

# ═════════════════════════════════════════════════════════════════════════════
# RED — o estado antes da migration reproduz as lacunas do X032
# ═════════════════════════════════════════════════════════════════════════════
red_col="$(psql_raw "SELECT consent_confirmed_at FROM public.talkx_campaigns LIMIT 1")"
assert_has 'RED: consent_confirmed_at nao existe antes da X032' 'does not exist' "$red_col"

red_fn="$(psql_raw "SELECT public.purge_talkx_expired_data(10)")"
assert_has 'RED: purge_talkx_expired_data nao existe antes da X032' 'does not exist' "$red_fn"

# ═════════════════════════════════════════════════════════════════════════════
# GREEN — aplica a migration X032
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration" >/dev/null || fail 'migration X032 nao aplicou (GREEN)'
pass "migration X032 aplicada ($(basename "$migration"))"

col_ok="$(psql_val "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_campaigns' AND column_name IN ('consent_confirmed_by','consent_confirmed_at','legal_basis')")"
assert_eq 'GREEN: 3 colunas de consentimento existem' '3' "$col_ok"

# sessao privilegiada (service_role via GUC) e sessao admin (authenticated)
service_session="SET request.jwt.claim.role = 'service_role'; SET request.jwt.claim.sub = '$user_admin';"
admin_session="SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_admin';"

# ── 1) contato 'revoked' fora da audiencia ───────────────────────────────────
aud_default="$(psql_val "$service_session SELECT count(*) FROM public.talkx_audience_query('{}'::jsonb) WHERE id = '$contact_revoked'")"
assert_eq '1. revoked fora da audiencia (padrao)' '0' "$aud_default"
aud_ok="$(psql_val "$service_session SELECT count(*) FROM public.talkx_audience_query('{}'::jsonb) WHERE id = '$contact_ok'")"
assert_eq '1. contato normal continua na audiencia' '1' "$aud_ok"
aud_gr="$(psql_val "$service_session SELECT count(*) FROM public.talkx_audience_query('{}'::jsonb) WHERE id = '$contact_granted'")"
assert_eq '1. granted continua na audiencia (padrao)' '1' "$aud_gr"

# ── 2) require_granted_consent ligado -> exige 'granted' ─────────────────────
psql_val "UPDATE public.talkx_settings SET value = 'true'::jsonb WHERE key = 'require_granted_consent'" >/dev/null
aud_strict_unknown="$(psql_val "$service_session SELECT count(*) FROM public.talkx_audience_query('{}'::jsonb) WHERE id = '$contact_ok'")"
assert_eq '2. strict: unknown sai da audiencia' '0' "$aud_strict_unknown"
aud_strict_granted="$(psql_val "$service_session SELECT count(*) FROM public.talkx_audience_query('{}'::jsonb) WHERE id = '$contact_granted'")"
assert_eq '2. strict: granted permanece' '1' "$aud_strict_granted"
psql_val "UPDATE public.talkx_settings SET value = 'false'::jsonb WHERE key = 'require_granted_consent'" >/dev/null

# ── 3) 'start' sem consent_confirmed_at -> erro; com confirmacao -> OK ───────
start_sem="$(psql_raw "$service_session SELECT * FROM public.transition_talkx_campaign('$c_draft', 'start');")"
assert_has '3. start sem consent_confirmed_at -> erro' 'talkx_campaign_consent_required' "$start_sem"

psql_val "UPDATE public.talkx_campaigns SET consent_confirmed_at = now(), consent_confirmed_by = '$profile_admin', legal_basis = 'consent' WHERE id = '$c_draft'" >/dev/null
start_com="$(psql_val "$service_session SELECT previous_status || ':' || current_status FROM public.transition_talkx_campaign('$c_draft', 'start');")"
assert_eq '3. start com confirmacao -> draft:sending' 'draft:sending' "$start_com"

# ── 4) agendar sem confirmacao -> erro (gatilho de tabela) ───────────────────
# campanha nova para o gatilho: rascunho sem consentimento, mensagem e publico validos
c_sched='d0000000-0000-0000-0000-000000000009'
psql_val "INSERT INTO public.talkx_campaigns (id, name, message_template, status, created_by, total_recipients) VALUES ('$c_sched', 'Agendar', 'Oi', 'draft', '$profile_admin', 1)" >/dev/null
sched_err="$(psql_script <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_admin';
UPDATE public.talkx_campaigns SET status='scheduled', scheduled_at = now() + interval '2 days' WHERE id='$c_sched';
COMMIT;
SQL
)"
assert_has '4. agendar sem confirmacao -> erro' 'talkx_schedule_requires_consent_confirmation' "$sched_err"

psql_val "UPDATE public.talkx_campaigns SET consent_confirmed_at = now() WHERE id = '$c_sched'" >/dev/null
sched_ok="$(psql_script <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_admin';
UPDATE public.talkx_campaigns SET status='scheduled', scheduled_at = now() + interval '2 days' WHERE id='$c_sched';
COMMIT;
SELECT 'OK';
SQL
)"
assert_has '4. agendar com confirmacao -> OK' 'OK' "$sched_ok"

# ── 5) opt-out automatico marca consent_status='revoked' ─────────────────────
psql_val "$service_session SELECT public.talkx_suppress_contact('$contact_optout', '5511900000004', 'Opt-out: PARE', 'opt_out', 'auto_optout', NULL);" >/dev/null
optout_status="$(psql_val "SELECT consent_status FROM public.contacts WHERE id = '$contact_optout'")"
assert_eq '5. opt-out automatico -> consent_status revoked' 'revoked' "$optout_status"

# ── 6) expurgo: vencido some, recente fica, contadores intactos ──────────────
bl_before="$(psql_val "SELECT count(*) FROM public.talkx_blacklist")"
psql_val "$service_session SELECT public.purge_talkx_expired_data(1000);" >/dev/null
exp_msg="$(psql_val "SELECT COALESCE(personalized_message,'<nulo>') FROM public.talkx_recipients WHERE id='$r_expire'")"
assert_eq '6. destinatario vencido (181d) -> personalized_message nulo' '<nulo>' "$exp_msg"
exp_media="$(psql_val "SELECT (media_url_snapshot IS NULL AND media_type_snapshot IS NULL)::text FROM public.talkx_recipients WHERE id='$r_expire'")"
assert_eq '6. snapshots de midia anulados' 'true' "$exp_media"
rec_msg="$(psql_val "SELECT COALESCE(personalized_message,'<nulo>') FROM public.talkx_recipients WHERE id='$r_recent'")"
assert_eq '6. destinatario recente (10d) intacto' 'Ola Bia' "$rec_msg"
c_expire_counters="$(psql_val "SELECT sent_count || '/' || failed_count || '/' || total_recipients FROM public.talkx_campaigns WHERE id='$c_expire'")"
assert_eq '6. contadores da campanha intactos (1/0/1)' '1/0/1' "$c_expire_counters"
clicks_old="$(psql_val "SELECT (ua IS NULL AND ip_hash IS NULL)::text FROM public.talkx_link_clicks WHERE id='f0000000-0000-0000-0000-000000000001'")"
assert_eq '6. clique vencido (400d) -> ua/ip_hash limpos' 'true' "$clicks_old"
clicks_new="$(psql_val "SELECT ua FROM public.talkx_link_clicks WHERE id='f0000000-0000-0000-0000-000000000002'")"
assert_eq '6. clique recente (10d) intacto' 'NewUA' "$clicks_new"
test_old="$(psql_val "SELECT count(*) FROM public.talkx_test_send_claims WHERE request_key='velho'")"
assert_eq '6. envio de teste vencido (100d) apagado' '0' "$test_old"
test_new="$(psql_val "SELECT count(*) FROM public.talkx_test_send_claims WHERE request_key='novo'")"
assert_eq '6. envio de teste recente (5d) intacto' '1' "$test_new"
ai_old="$(psql_val "SELECT count(*) FROM public.ai_jobs WHERE status='succeeded' AND (finished_at IS NULL OR finished_at < now() - interval '90 days')")"
assert_eq '6. job de IA terminal vencido apagado' '0' "$ai_old"
ai_run="$(psql_val "SELECT count(*) FROM public.ai_jobs WHERE status='running'")"
assert_eq '6. job de IA nao-terminal intacto' '1' "$ai_run"
ev_purge="$(psql_val "SELECT count(*) FROM public.talkx_campaign_events WHERE entity_type='talkx_lgpd_purge'")"
assert_eq '6. evento do expurgo gravado' '1' "$ev_purge"

# ── 7) segunda execucao no mesmo dia -> 0 linhas afetadas ────────────────────
# cria OUTRO vencido ANTES da 2a execucao: o gate diario deve ignora-lo
psql_val "INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status, personalized_message) VALUES ('$r_late', '$c_expire', '$contact_granted', 'sent', 'Nao deveria sumir hoje')" >/dev/null
second="$(psql_val "$service_session SELECT public.purge_talkx_expired_data(1000);")"
assert_has '7. 2a execucao no mesmo dia -> skipped=true' '"skipped": true' "$second"
assert_has '7. 2a execucao -> messages=0' '"messages": 0' "$second"
late_msg="$(psql_val "SELECT COALESCE(personalized_message,'<nulo>') FROM public.talkx_recipients WHERE id='$r_late'")"
assert_eq '7. vencido criado depois NAO foi tocado hoje' 'Nao deveria sumir hoje' "$late_msg"

# ── 8) blacklist intacta ─────────────────────────────────────────────────────
bl_count="$(psql_val "SELECT count(*) FROM public.talkx_blacklist")"
assert_eq '8. talkx_blacklist intacta apos o expurgo' "$bl_before" "$bl_count"
bl_revoked="$(psql_val "SELECT count(*) FROM public.talkx_blacklist WHERE contact_id = '$contact_optout' AND removed_at IS NULL")"
assert_eq '8. supressao do contato revogado continua ativa' '1' "$bl_revoked"

# ── 9) o tick chama o expurgo ────────────────────────────────────────────────
tick_def="$(psql_val "SELECT pg_get_functiondef('public.trigger_talkx_engine_tick()'::regprocedure)")"
assert_has '9. trigger_talkx_engine_tick chama purge_talkx_expired_data' 'purge_talkx_expired_data' "$tick_def"

# ── 9b) save_talkx_campaign_draft grava a confirmacao ────────────────────────
k1='11110000-0000-0000-0000-000000000001'
k2='11110000-0000-0000-0000-000000000002'
psql_raw "$admin_session SELECT campaign_id FROM public.save_talkx_campaign_draft(NULL, NULL, '$k1', '{\"name\":\"LGPD\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"message_template\":\"Oi\",\"confirm_consent\":true,\"legal_basis\":\"consent\"}'::jsonb)" >/dev/null
saved_consent="$(psql_val "SELECT (consent_confirmed_at IS NOT NULL)::text || '|' || (consent_confirmed_by = '$profile_admin')::text || '|' || legal_basis FROM public.talkx_campaigns WHERE draft_creation_key = '$k1'")"
assert_eq '9b. save com confirmacao grava at/by e legal_basis' 'true|true|consent' "$saved_consent"

psql_raw "$admin_session SELECT campaign_id FROM public.save_talkx_campaign_draft(NULL, NULL, '$k2', '{\"name\":\"Sem\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"message_template\":\"Oi\",\"confirm_consent\":false}'::jsonb)" >/dev/null
saved_nocon="$(psql_val "SELECT (consent_confirmed_at IS NULL)::text FROM public.talkx_campaigns WHERE draft_creation_key = '$k2'")"
assert_eq '9b. save sem confirmacao -> consent_confirmed_at nulo' 'true' "$saved_nocon"

# ── 10) idempotencia: reaplicar a migration nao quebra ───────────────────────
psql_exec < "$migration" >/dev/null || fail 'migration X032 nao reaplicou (idempotencia)'
pass 'migration X032 reaplicada sem erro (idempotencia)'

echo '[OK] Talk X X032: consentimento no lancamento (revoked fora da audiencia, strict opcional, start/agendar recusam sem confirmacao, opt-out automatico revoga) e expurgo por prazo 1x/dia (texto/midia, ua/ip_hash, teste, IA) sem tocar blacklist, contadores ou eventos.'
