#!/usr/bin/env bash
set -Eeuo pipefail

# V12 do PLANO_TALKX_V3_100_ETAPAS_2026-09-29: o SERVIDOR grava os eventos do ciclo
# de vida (started/resumed/paused/cancelled/completed) dentro de
# transition_talkx_campaign / complete_talkx_campaign_if_drained, em vez do cliente.
#
# Prova, em PostgreSQL 17 descartável:
#   RED   — transition_talkx_campaign ANTIGA (sem INSERT de evento) faz a sequência
#           start→pause→resume→cancel e deixa 0 eventos;
#   GREEN — a migration V12 grava os 4 eventos com o tipo e o ator corretos, e
#           complete_talkx_campaign_if_drained grava 'completed'.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_V12_LIFECYCLE_EVENTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-v12-events-$RANDOM-$$"
test_password="talkx_v12_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-v12-events-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$container_name" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- fixtures minimos: auth, profiles, campanhas, destinatarios, eventos ----
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY
);
INSERT INTO public.profiles(id) VALUES ('10000000-0000-0000-0000-000000000001');

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'draft',
  message_template text,
  total_recipients integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  pause_reason text,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT talkx_recipients_status_check
    CHECK (status = ANY (ARRAY['pending','sending','sent','delivered','failed','skipped','outcome_unknown'])),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  entity_type text,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
SQL

migration="$repo_root/supabase/migrations/20260930650000_talkx_v12_server_lifecycle_events.sql"
[[ -f "$migration" ]] || fail 'migration V12 nao existe'

# ---- RED: transição ANTIGA (sem INSERT de evento) deixa 0 eventos ----
psql_test >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.transition_talkx_campaign(
  p_campaign_id uuid, p_action text, p_pause_reason text DEFAULT NULL
)
RETURNS TABLE(campaign_id uuid, previous_status text, current_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_campaign public.talkx_campaigns%ROWTYPE; v_next_status text;
BEGIN
  SELECT * INTO v_campaign FROM public.talkx_campaigns c WHERE c.id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  CASE p_action
    WHEN 'start' THEN v_next_status := 'sending';
    WHEN 'pause' THEN v_next_status := 'paused';
    WHEN 'cancel' THEN v_next_status := 'cancelled';
  END CASE;
  UPDATE public.talkx_campaigns SET status = v_next_status, updated_at = statement_timestamp()
    WHERE id = p_campaign_id;
  RETURN QUERY SELECT p_campaign_id, v_campaign.status, v_next_status;
END;
$$;
SQL

# seed: campanha + 5 destinatários pendentes
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_campaigns (id, status, message_template, total_recipients)
  VALUES ('20000000-0000-0000-0000-000000000001', 'draft', 'ola', 5);
INSERT INTO public.talkx_recipients (campaign_id, status)
  VALUES
    ('20000000-0000-0000-0000-000000000001', 'pending'),
    ('20000000-0000-0000-0000-000000000001', 'pending'),
    ('20000000-0000-0000-0000-000000000001', 'pending'),
    ('20000000-0000-0000-0000-000000000001', 'pending'),
    ('20000000-0000-0000-0000-000000000001', 'pending');
SQL

run_seq() {
  psql_test >/dev/null <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
SELECT public.transition_talkx_campaign('20000000-0000-0000-0000-000000000001', 'start');
SELECT public.transition_talkx_campaign('20000000-0000-0000-0000-000000000001', 'pause', 'motivo x');
SELECT public.transition_talkx_campaign('20000000-0000-0000-0000-000000000001', 'start');
SELECT public.transition_talkx_campaign('20000000-0000-0000-0000-000000000001', 'cancel');
COMMIT;
SQL
}

run_seq
red_count="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_campaign_events")"
[[ "$red_count" == '0' ]] || fail "RED: transição antiga gravou eventos (esperava 0, got $red_count)"

# ---- GREEN: migration V12 grava os 4 eventos ----
# reset entre RED e GREEN (a sequência RED deixou a campanha em 'cancelled')
psql_test >/dev/null <<'SQL'
DELETE FROM public.talkx_campaign_events;
UPDATE public.talkx_campaigns SET status = 'draft', started_at = NULL, paused_at = NULL, pause_reason = NULL
  WHERE id = '20000000-0000-0000-0000-000000000001';
UPDATE public.talkx_recipients SET status = 'pending'
  WHERE campaign_id = '20000000-0000-0000-0000-000000000001';
SQL
psql_test < "$migration" >/dev/null || fail 'migration V12 nao aplicou (GREEN)'

run_seq
green_count="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_campaign_events")"
[[ "$green_count" == '4' ]] || fail "GREEN: esperava 4 eventos, got $green_count"

types="$(psql_test -Atqc "SELECT string_agg(event_type, ',' ORDER BY created_at) FROM public.talkx_campaign_events")"
[[ "$types" == 'started,paused,resumed,cancelled' ]] \
  || fail "GREEN: tipos de evento errados (esperava started,paused,resumed,cancelled, got $types)"

pause_msg="$(psql_test -Atqc "SELECT message FROM public.talkx_campaign_events WHERE event_type='paused'")"
[[ "$pause_msg" == 'motivo x' ]] || fail "GREEN: mensagem da pausa nao foi gravada (got $pause_msg)"

# ---- GREEN (V14): cancel marca os 5 pendentes como 'cancelled' ----
cancel_count="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='20000000-0000-0000-0000-000000000001' AND status='cancelled'")"
[[ "$cancel_count" == '5' ]] || fail "V14: cancel nao marcou os 5 pendentes como cancelled (got $cancel_count)"

# ---- GREEN (V14): campanha cancelada nao vira 'completed' ----
psql_test >/dev/null <<'SQL'
UPDATE public.talkx_recipients SET status = 'delivered'
  WHERE campaign_id = '20000000-0000-0000-0000-000000000001';
SQL
completed_cancelled="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.complete_talkx_campaign_if_drained('20000000-0000-0000-0000-000000000001'); COMMIT;")"
[[ "$completed_cancelled" == 'f' ]] || fail "V14: campanha cancelada virou completed (esperava f, got $completed_cancelled)"

# ---- GREEN (V13): start em 'sending' é no-op (retomada dupla não erra, não duplica evento) ----
psql_test >/dev/null <<'SQL'
UPDATE public.talkx_campaigns SET status = 'sending'
  WHERE id = '20000000-0000-0000-0000-000000000001';
SQL
noop_status="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role = 'service_role'; SELECT current_status FROM public.transition_talkx_campaign('20000000-0000-0000-0000-000000000001', 'start'); COMMIT;")"
[[ "$noop_status" == 'sending' ]] || fail "V13: start em sending nao foi no-op (got $noop_status)"
noop_events="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_campaign_events")"
[[ "$noop_events" == '4' ]] || fail "V13: start em sending duplicou evento (esperava 4, got $noop_events)"

# ---- GREEN: complete_talkx_campaign_if_drained grava 'completed' ----
psql_test >/dev/null <<'SQL'
UPDATE public.talkx_campaigns SET status = 'sending'
  WHERE id = '20000000-0000-0000-0000-000000000001';
UPDATE public.talkx_recipients SET status = 'delivered'
  WHERE campaign_id = '20000000-0000-0000-0000-000000000001';
SQL
completed="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role = 'service_role'; SELECT public.complete_talkx_campaign_if_drained('20000000-0000-0000-0000-000000000001'); COMMIT;")"
[[ "$completed" == 't' ]] || fail "GREEN: complete_if_drained nao retornou true (got $completed)"
done_evt="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_campaign_events WHERE event_type='completed'")"
[[ "$done_evt" == '1' ]] || fail "GREEN: evento completed nao gravado (got $done_evt)"

printf '[OK] Talk X V12: eventos do ciclo de vida gravados no servidor (4 tipos + completed).\n'
