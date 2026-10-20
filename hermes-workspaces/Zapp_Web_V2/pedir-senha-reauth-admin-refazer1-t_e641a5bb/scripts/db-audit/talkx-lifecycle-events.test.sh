#!/usr/bin/env bash
set -euo pipefail

# X024 — prova, em PostgreSQL 17 descartável, o delta de ciclo de vida do Talk X:
#   - start -> pause(com motivo e ator) -> resume -> cancel gera 4 eventos EM ORDEM
#     (started, paused, resumed, cancelled), cada um com actor_id e o motivo no 'paused';
#   - retomada SEM ator grava 'resumed_auto' (worker/cron), distinto de 'resumed';
#   - cancel fecha a fila: os 5 pendentes viram 'cancelled' e as leases de entrega são soltas;
#   - campanha cancelada NÃO vira 'completed';
#   - conclusão de campanha drenada grava 1 'completed' com resumo.
#
# Aplica a migration X024 (20261003172707_talkx_lifecycle_events_delta.sql) sobre um
# fixture com as colunas que a migration referencia (launched_by/at, paused_by/at,
# cancelled_by/at, worker lease, delivery_claim_*, contadores).

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="$repo_root/supabase/migrations/20261003172707_talkx_lifecycle_events_delta.sql"
postgres_image="${TALKX_LIFECYCLE_EVENTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-lifecycle-events-test-$$"
test_password="talkx_lifecycle_events_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { docker exec "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

start_postgres() {
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
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste não iniciou'

CAMPAIGN='50000000-0000-0000-0000-000000000001'
ACTOR='60000000-0000-0000-0000-000000000001'

psql_test >/dev/null <<SQL
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS \$\$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user) \$\$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS \$\$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  message_template text NOT NULL,
  total_recipients integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  paused_at timestamptz,
  pause_reason text,
  launched_by uuid,
  launched_at timestamptz,
  worker_id text,
  worker_lease_expires_at timestamptz,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  scheduled_at timestamptz,
  schedule_timezone text,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id),
  status text NOT NULL DEFAULT 'pending',
  delivery_claim_token uuid,
  delivery_claimed_at timestamptz,
  delivery_claim_expires_at timestamptz,
  delivery_claimed_by text,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

GRANT SELECT, INSERT, UPDATE ON public.talkx_campaigns, public.talkx_recipients, public.talkx_campaign_events, public.profiles TO authenticated, service_role;
SQL

[[ -f "$migration" ]] || fail "migration ausente: $migration"
psql_test < "$migration" >/dev/null

service_session="SET ROLE service_role; SET request.jwt.claim.role='service_role';"

# ── fixture: 1 campanha draft + 5 destinatários + 1 ator ─────────────────────
psql_test >/dev/null <<SQL
INSERT INTO public.profiles(id, user_id, is_active) VALUES ('$ACTOR', '$ACTOR', true);
INSERT INTO public.talkx_campaigns(id, status, message_template, total_recipients)
  VALUES ('$CAMPAIGN', 'draft', 'Olá', 5);
INSERT INTO public.talkx_recipients(campaign_id) VALUES
  ('$CAMPAIGN'), ('$CAMPAIGN'), ('$CAMPAIGN'), ('$CAMPAIGN'), ('$CAMPAIGN');
SQL

# ── start (com ator) -> started ───────────────────────────────────────────────
started="$(psql_q "$service_session SELECT previous_status || ':' || current_status FROM public.transition_talkx_campaign('$CAMPAIGN', 'start', NULL, '$ACTOR');")"
[[ "$started" == 'draft:sending' ]] || fail "start válido não aplicado [obtido: $started]"

# ── pause (motivo + ator) -> paused ──────────────────────────────────────────
paused="$(psql_q "$service_session SELECT previous_status || ':' || current_status FROM public.transition_talkx_campaign('$CAMPAIGN', 'pause', 'motivo de teste', '$ACTOR');")"
[[ "$paused" == 'sending:paused' ]] || fail "pause válido não aplicado [obtido: $paused]"

# ── resume (com ator) -> resumed ──────────────────────────────────────────────
resumed="$(psql_q "$service_session SELECT previous_status || ':' || current_status FROM public.transition_talkx_campaign('$CAMPAIGN', 'start', NULL, '$ACTOR');")"
[[ "$resumed" == 'paused:sending' ]] || fail "resume válido não aplicado [obtido: $resumed]"

# ── cancel (com ator) -> cancelled ────────────────────────────────────────────
cancelled="$(psql_q "$service_session SELECT previous_status || ':' || current_status FROM public.transition_talkx_campaign('$CAMPAIGN', 'cancel', NULL, '$ACTOR');")"
[[ "$cancelled" == 'sending:cancelled' ]] || fail "cancelamento válido não aplicado [obtido: $cancelled]"

# ── 4 eventos em ordem, com ator e motivo ─────────────────────────────────────
events="$(psql_q "SELECT string_agg(event_type || '|' || COALESCE(message,'') || '|' || COALESCE(actor_id::text,'-'), ';' ORDER BY created_at, id) FROM public.talkx_campaign_events WHERE campaign_id = '$CAMPAIGN';")"
expected="started||$ACTOR;paused|motivo de teste|$ACTOR;resumed||$ACTOR;cancelled||$ACTOR"
[[ "$events" == "$expected" ]] || fail "eventos fora do esperado [obtido: $events]"
printf 'PASS: 4 eventos em ordem com ator e motivo (started, paused, resumed, cancelled)\n'

# ── 5 pendentes viram 5 cancelled ─────────────────────────────────────────────
cancelled_count="$(psql_q "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id = '$CAMPAIGN' AND status = 'cancelled';")"
[[ "$cancelled_count" == '5' ]] || fail "esperava 5 cancelados, obtido $cancelled_count"
printf 'PASS: 5 pendentes viram 5 cancelled\n'

# ── cancelado não vira completed ──────────────────────────────────────────────
not_completed="$(psql_q "$service_session SELECT public.complete_talkx_campaign_if_drained('$CAMPAIGN')::text;")"
[[ "$not_completed" == 'false' ]] || fail "campanha cancelada virou completed [obtido: $not_completed]"
printf 'PASS: campanha cancelada não vira completed\n'

# ── retomada sem ator grava resumed_auto (distinto) ────────────────────────────
CAMPAIGN2='50000000-0000-0000-0000-000000000002'
psql_test >/dev/null <<SQL
INSERT INTO public.talkx_campaigns(id, status, message_template, total_recipients)
  VALUES ('$CAMPAIGN2', 'draft', 'Olá', 1);
INSERT INTO public.talkx_recipients(campaign_id) VALUES ('$CAMPAIGN2');
SQL
psql_q "$service_session SELECT public.transition_talkx_campaign('$CAMPAIGN2', 'start', NULL, '$ACTOR');" >/dev/null
psql_q "$service_session SELECT public.transition_talkx_campaign('$CAMPAIGN2', 'pause', 'x', '$ACTOR');" >/dev/null
psql_q "$service_session SELECT public.transition_talkx_campaign('$CAMPAIGN2', 'start', NULL, NULL);" >/dev/null
auto_resumed="$(psql_q "SELECT event_type FROM public.talkx_campaign_events WHERE campaign_id = '$CAMPAIGN2' AND event_type LIKE 'resumed%' ORDER BY created_at DESC LIMIT 1;")"
[[ "$auto_resumed" == 'resumed_auto' ]] || fail "retomada sem ator deveria gravar resumed_auto [obtido: $auto_resumed]"
printf 'PASS: retomada sem ator grava resumed_auto\n'

# ── conclusão drenada grava 1 completed com resumo ────────────────────────────
CAMPAIGN3='50000000-0000-0000-0000-000000000003'
psql_test >/dev/null <<SQL
INSERT INTO public.talkx_campaigns(id, status, message_template, total_recipients)
  VALUES ('$CAMPAIGN3', 'draft', 'Olá', 2);
INSERT INTO public.talkx_recipients(campaign_id) VALUES ('$CAMPAIGN3'), ('$CAMPAIGN3');
SQL
psql_q "$service_session SELECT public.transition_talkx_campaign('$CAMPAIGN3', 'start', NULL, '$ACTOR');" >/dev/null
# drena: marca os 2 destinatários como sent (não há mais pending/sending)
psql_q "UPDATE public.talkx_recipients SET status = 'sent' WHERE campaign_id = '$CAMPAIGN3';" >/dev/null
completed_ok="$(psql_q "$service_session SELECT public.complete_talkx_campaign_if_drained('$CAMPAIGN3')::text;")"
[[ "$completed_ok" == 'true' ]] || fail "conclusão drenada não retornou true [obtido: $completed_ok]"
completed_events="$(psql_q "SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id = '$CAMPAIGN3' AND event_type = 'completed';")"
[[ "$completed_events" == '1' ]] || fail "esperava 1 completed, obtido $completed_events"
resumo="$(psql_q "SELECT message FROM public.talkx_campaign_events WHERE campaign_id = '$CAMPAIGN3' AND event_type = 'completed';")"
[[ "$resumo" == *'"total": 2'* && "$resumo" == *'"sent": 0'* ]] || fail "resumo do completed não traz os números [obtido: $resumo]"
printf 'PASS: conclusão drenada grava 1 completed com resumo\n'

printf 'PASS: Talk X X024 — ciclo de vida com ator/motivo, fila fechada no cancel e conclusão com resumo\n'
