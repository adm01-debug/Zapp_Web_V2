#!/usr/bin/env bash
# Harness descartável: V21 — flags de lançamento persistidas.
# Prova: (1) colunas respect_suppression/confirm_consent/launched_by/launched_at;
#        (2) transition start grava launched_by/at; (3) respect_suppression=false
#        sem admin é recusado (42501).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }

test_password='talkx_v21_test_only'
cid="talkx-v21-$RANDOM$RANDOM"
cleanup() { if [[ "$cid" =~ ^talkx-v21-[0-9]+$ ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD="$test_password" postgres:17-alpine >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  is_active boolean NOT NULL DEFAULT true
);
CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_valid_talkx_schedule_timezone(p_tz text) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'connected',
  instance_id text
);

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  message_template text,
  description text,
  objective text,
  audience_source text,
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  segment_id uuid,
  template_id uuid,
  whatsapp_connection_id uuid,
  media_url text,
  media_type text,
  scheduled_at timestamptz,
  schedule_timezone text,
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  speed_profile text,
  typing_delay_min integer,
  typing_delay_max integer,
  send_interval_min integer,
  send_interval_max integer,
  status text NOT NULL DEFAULT 'draft',
  pause_reason text,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  total_recipients integer NOT NULL DEFAULT 0,
  created_by uuid,
  draft_creation_key uuid,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX talkx_campaigns_creator_draft_creation_key_uidx
  ON public.talkx_campaigns (created_by, draft_creation_key)
  WHERE draft_creation_key IS NOT NULL;

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid,
  status text NOT NULL DEFAULT 'pending'
);
CREATE TABLE public.talkx_campaign_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id uuid,
  event_type text,
  message text,
  actor_id uuid
);

INSERT INTO public.profiles (id, user_id, is_active)
VALUES ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', true);
SQL

# RED: colunas de flag ainda não existem
red_col="$(psql_test -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_name='talkx_campaigns' AND column_name='respect_suppression'" 2>&1 || true)"
[[ "$red_col" == '0' ]] || fail "RED: respect_suppression deveria nao existir antes da migration (got $red_col)"

# GREEN: aplica migration
psql_test < "$repo_root/supabase/migrations/20260930640000_talkx_v21_launch_flags.sql" >/dev/null \
  || fail 'migration V21 nao aplicou (GREEN)'

# (1) colunas existem com defaults corretos
colcount="$(psql_test -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_name='talkx_campaigns' AND column_name IN ('respect_suppression','confirm_consent','launched_by','launched_at')")"
[[ "$colcount" == '4' ]] || fail "GREEN: esperado 4 colunas de flag, got $colcount"

def_suppress="$(psql_test -Atqc "SELECT column_default FROM information_schema.columns WHERE table_name='talkx_campaigns' AND column_name='respect_suppression'")"
[[ "$def_suppress" == 'true' ]] || fail "GREEN: default respect_suppression deveria ser true (got $def_suppress)"
def_consent="$(psql_test -Atqc "SELECT column_default FROM information_schema.columns WHERE table_name='talkx_campaigns' AND column_name='confirm_consent'")"
[[ "$def_consent" == 'false' ]] || fail "GREEN: default confirm_consent deveria ser false (got $def_consent)"

# (2) transition start grava launched_by/at
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_campaigns (id, message_template, status, total_recipients)
VALUES ('10000000-0000-0000-0000-000000000001', 'Ola {{nome}}', 'draft', 1);
INSERT INTO public.talkx_recipients (campaign_id, status)
VALUES ('10000000-0000-0000-0000-000000000001', 'pending');
SQL
psql_test >/dev/null <<'SQL'
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
SELECT public.transition_talkx_campaign('10000000-0000-0000-0000-000000000001', 'start', NULL, '20000000-0000-0000-0000-000000000001');
COMMIT;
SQL
launched="$(psql_test -Atqc "SELECT launched_by::text || ':' || (launched_at IS NOT NULL)::text FROM public.talkx_campaigns WHERE id='10000000-0000-0000-0000-000000000001'")"
[[ "$launched" == '20000000-0000-0000-0000-000000000001:true' ]] || fail "GREEN: launched_by/at deveria ser gravado no start (got $launched)"

# (3) respect_suppression=false sem admin é recusado (42501)
guard_err="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='30000000-0000-0000-0000-000000000001'; SELECT public.save_talkx_campaign_draft(NULL, NULL, '40000000-0000-0000-0000-000000000001', '{\"name\":\"C\",\"message_template\":\"Oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"respect_suppression\":false}'); COMMIT;" 2>&1 || true)"
[[ "$guard_err" == *'talkx_respect_suppression_admin_only'* ]] || fail "GREEN: respect_suppression=false deveria exigir admin (got $guard_err)"

# (4) respect_suppression=true (default) salva o draft com flags
save_out="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='30000000-0000-0000-0000-000000000001'; SELECT public.save_talkx_campaign_draft(NULL, NULL, '40000000-0000-0000-0000-000000000001', '{\"name\":\"C\",\"message_template\":\"Oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"respect_suppression\":true,\"confirm_consent\":true}'); COMMIT;" 2>&1 || true)"
[[ "$save_out" == *'(1 row)'* || "$save_out" == *','* ]] || fail "GREEN: draft com flags deveria salvar (got $save_out)"
flags_saved="$(psql_test -Atqc "SELECT respect_suppression::text || ':' || confirm_consent::text FROM public.talkx_campaigns WHERE draft_creation_key='40000000-0000-0000-0000-000000000001'")"
[[ "$flags_saved" == 'true:true' ]] || fail "GREEN: flags deveriam persistir true:true (got $flags_saved)"

echo '[OK] Talk X V21: flags de lançamento persistidas; start grava launched_by/at; desmarcar respeito exige admin.'
