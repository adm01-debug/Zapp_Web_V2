#!/usr/bin/env bash
# Harness descartável: V17 — READ marca read_at e incrementa read_count.
# Prova: record_talkx_recipient_delivered(..., 'read') preenche read_at + read_count=1,
#        e uma segunda chamada 'read' é idempotente (não duplica read_count).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }

test_password='talkx_v17_test_only'
cid="talkx-v17-$RANDOM$RANDOM"
cleanup() { if [[ "$cid" =~ ^talkx-v17-[0-9]+$ ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; }
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

# ---- fixtures minimos ----
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_connection_id uuid,
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  external_id text,
  status text NOT NULL DEFAULT 'pending',
  delivered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.talkx_template_variants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), label text);
SQL

# ---- RED: RPC antiga (2 args) não tem p_event ----
psql_test >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.record_talkx_recipient_delivered(
  p_external_id text, p_connection_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $f$
DECLARE v_recipient_id uuid; v_campaign_id uuid; v_external_id text := NULLIF(btrim(p_external_id), '');
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_external_id, 0));
  SELECT recipient.id, recipient.campaign_id INTO STRICT v_recipient_id, v_campaign_id
    FROM public.talkx_recipients recipient JOIN public.talkx_campaigns campaign ON campaign.id = recipient.campaign_id
   WHERE recipient.external_id = v_external_id AND recipient.delivered_at IS NULL
     AND campaign.whatsapp_connection_id = p_connection_id FOR UPDATE OF recipient;
  UPDATE public.talkx_recipients SET status='delivered', delivered_at=statement_timestamp() WHERE id = v_recipient_id;
  UPDATE public.talkx_campaigns SET delivered_count = delivered_count + 1 WHERE id = v_campaign_id;
  RETURN true;
EXCEPTION WHEN NO_DATA_FOUND THEN RETURN false;
END;
$f$;

INSERT INTO public.talkx_campaigns (id, whatsapp_connection_id, status, total_recipients, sent_count, delivered_count)
  VALUES ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'sending', 1, 1, 0);
INSERT INTO public.talkx_recipients (campaign_id, external_id, status)
  VALUES ('20000000-0000-0000-0000-000000000001', 'WA-EXT-1', 'sent');
SQL

# RED: chamar com 3 args -> a assinatura antiga não aceita p_event
red_err="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.record_talkx_recipient_delivered('WA-EXT-1', '30000000-0000-0000-0000-000000000001', 'read'); COMMIT;" 2>&1 || true)"
[[ "$red_err" == *'does not exist'* || "$red_err" == *'function'* ]] \
  || fail "RED: assinatura de 3 args deveria nao existir antes da V17 (got $red_err)"

# ---- GREEN: migration V17 grava read_at + read_count ----
psql_test < "$repo_root/supabase/migrations/20260930680000_talkx_v17_read_at.sql" >/dev/null \
  || fail 'migration V17 nao aplicou (GREEN)'

# marca delivered primeiro (para o read depender de delivered_at)
psql_test >/dev/null <<'SQL'
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
SELECT public.record_talkx_recipient_delivered('WA-EXT-1', '30000000-0000-0000-0000-000000000001');
COMMIT;
SQL

read_ok="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.record_talkx_recipient_delivered('WA-EXT-1', '30000000-0000-0000-0000-000000000001', 'read'); COMMIT;")"
[[ "$read_ok" == 't' ]] || fail "GREEN: p_event='read' nao retornou true (got $read_ok)"

read_at="$(psql_test -Atqc "SELECT read_at IS NOT NULL FROM public.talkx_recipients WHERE external_id='WA-EXT-1'")"
[[ "$read_at" == 't' ]] || fail "GREEN: read_at nao foi preenchido"

read_count="$(psql_test -Atqc "SELECT read_count FROM public.talkx_campaigns WHERE id='20000000-0000-0000-0000-000000000001'")"
[[ "$read_count" == '1' ]] || fail "GREEN: read_count deveria ser 1 (got $read_count)"

# idempotência: segunda chamada 'read' não duplica
psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.record_talkx_recipient_delivered('WA-EXT-1', '30000000-0000-0000-0000-000000000001', 'read'); COMMIT;" >/dev/null
read_count2="$(psql_test -Atqc "SELECT read_count FROM public.talkx_campaigns WHERE id='20000000-0000-0000-0000-000000000001'")"
[[ "$read_count2" == '1' ]] || fail "GREEN: read duplicado (esperava 1, got $read_count2)"

echo '[OK] Talk X V17: READ marca read_at + read_count (idempotente).'
