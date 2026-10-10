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
  LANGUAGE sql STABLE AS $$ SELECT COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' $$;
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
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  launch_confirmations jsonb,
  launch_confirmed_by uuid REFERENCES public.profiles(id),
  launch_confirmed_at timestamptz,
  launched_by uuid REFERENCES public.profiles(id),
  launched_at timestamptz
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

-- RPC de confirmacao de lancamento (N-099)
CREATE OR REPLACE FUNCTION public.confirm_talkx_campaign_launch(
  p_campaign_id       uuid,
  p_expected_revision bigint,
  p_confirmations     jsonb,
  p_mode              text
)
RETURNS TABLE(campaign_id uuid, revision bigint, launched_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
BEGIN
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_confirm_launch_unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;
  IF p_confirmations ? 'consent' IS NOT TRUE
     OR p_confirmations ? 'content' IS NOT TRUE
     OR p_confirmations ? 'suppression' IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_confirm_launch_missing_keys' USING ERRCODE = '22023';
  END IF;
  UPDATE public.talkx_campaigns
    SET launch_confirmations = p_confirmations,
        launch_confirmed_by  = auth.uid(),
        launch_confirmed_at  = statement_timestamp(),
        launched_by          = auth.uid(),
        launched_at          = statement_timestamp(),
        revision             = talkx_campaigns.revision + 1
  WHERE id = p_campaign_id
  RETURNING talkx_campaigns.id, talkx_campaigns.revision, talkx_campaigns.launch_confirmed_at INTO campaign_id, revision, launched_at;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_talkx_campaign_launch(uuid,bigint,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_talkx_campaign_launch(uuid,bigint,jsonb,text)
  TO service_role;

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

# --- N-099: confirm_talkx_campaign_launch ---

# (5) admin/supervisor obrigatorio (42501)
err_noadmin="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='30000000-0000-0000-0000-000000000001'; SELECT public.confirm_talkx_campaign_launch('10000000-0000-0000-0000-000000000001', 1, '{\"consent\":true,\"content\":true,\"suppression\":true}', 'full'); COMMIT;" 2>&1 || true)"
[[ "$err_noadmin" == *'talkx_confirm_launch_unauthorized'* ]] || fail "GREEN: confirm_launch sem admin deveria dar 42501 (got $err_noadmin)"

# (6) 3 chaves obrigatorias (22023)
err_keys="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.confirm_talkx_campaign_launch('10000000-0000-0000-0000-000000000001', 1, '{}', 'full'); COMMIT;" 2>&1 || true)"
[[ "$err_keys" == *'talkx_confirm_launch_missing_keys'* ]] || fail "GREEN: confirm_launch sem chaves deveria dar 22023 (got $err_keys)"

# (7) revisao atual obrigatoria (40001)
err_rev="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.confirm_talkx_campaign_launch('10000000-0000-0000-0000-000000000001', 999, '{\"consent\":true,\"content\":true,\"suppression\":true}', 'full'); COMMIT;" 2>&1 || true)"
[[ "$err_rev" == *'talkx_campaign_stale_revision'* ]] || fail "GREEN: confirm_launch revisao antiga deveria dar 40001 (got $err_rev)"

# (8) launch_confirmations/by/at gravados
psql_test >/dev/null <<'SQL'
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';
SELECT public.confirm_talkx_campaign_launch('10000000-0000-0000-0000-000000000001', 1, '{"consent":true,"content":true,"suppression":true}', 'full');
COMMIT;
SQL
confirmed="$(psql_test -Atqc "SELECT launch_confirmations::text || ':' || launch_confirmed_by::text || ':' || (launch_confirmed_at IS NOT NULL)::text FROM public.talkx_campaigns WHERE id='10000000-0000-0000-0000-000000000001'")"
[[ "$confirmed" == *'20000000-0000-0000-0000-000000000001:true'* ]] || fail "GREEN: launch_confirmations/by/at deveriam ser gravados (got $confirmed)"

# (9) launched_by/launched_at gravados
launched_by="$(psql_test -Atqc "SELECT launched_by::text || ':' || (launched_at IS NOT NULL)::text FROM public.talkx_campaigns WHERE id='10000000-0000-0000-0000-000000000001'")"
[[ "$launched_by" == '20000000-0000-0000-0000-000000000001:true' ]] || fail "GREEN: launched_by/launched_at deveriam ser gravados (got $launched_by)"

echo '[OK] Talk X N-099: confirm_talkx_campaign_launch protege por admin, exige 3 chaves, rejeita revisao antiga e grava confirmations/by/at + launched_by/at.'
