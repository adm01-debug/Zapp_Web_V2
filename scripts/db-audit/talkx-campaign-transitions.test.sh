#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="$repo_root/supabase/migrations/20260911150000_add_talkx_campaign_transition_rpc.sql"
postgres_image="${TALKX_CAMPAIGN_TRANSITIONS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-campaign-transitions-test-$$"
test_password="talkx_campaign_transitions_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null
for _ in $(seq 1 30); do
  if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1 || fail 'PostgreSQL de teste não iniciou'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user) $$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO authenticated, service_role;
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY, status text NOT NULL, message_template text NOT NULL,
  total_recipients integer NOT NULL DEFAULT 0, started_at timestamptz,
  paused_at timestamptz, updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.talkx_recipients (campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id));
GRANT SELECT, UPDATE ON public.talkx_campaigns TO authenticated, service_role;
GRANT SELECT ON public.talkx_recipients TO authenticated, service_role;
INSERT INTO public.talkx_campaigns(id, status, message_template, total_recipients) VALUES
  ('40000000-0000-0000-0000-000000000001', 'draft', 'Olá', 1),
  ('40000000-0000-0000-0000-000000000002', 'draft', ' ', 1),
  ('40000000-0000-0000-0000-000000000003', 'draft', 'Olá', 0),
  ('40000000-0000-0000-0000-000000000004', 'completed', 'Olá', 1);
INSERT INTO public.talkx_recipients(campaign_id) VALUES ('40000000-0000-0000-0000-000000000001');
SQL

psql_test < "$migration" >/dev/null
service_session="SET ROLE service_role; SET request.jwt.claim.role='service_role';"
user_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated';"

unauthorized="$(psql_test -v VERBOSITY=verbose -c "$user_session SELECT * FROM public.transition_talkx_campaign('40000000-0000-0000-0000-000000000001', 'start');" 2>&1 || true)"
[[ "$unauthorized" == *permission*denied* || "$unauthorized" == *service_role_required* ]] || fail 'authenticated executou transição de worker'

started="$(psql_test -Atqc "$service_session SELECT previous_status || ':' || current_status FROM public.transition_talkx_campaign('40000000-0000-0000-0000-000000000001', 'start');")"
[[ "$started" == 'draft:sending' ]] || fail 'start válido não foi aplicado'

duplicate_start="$(psql_test -v VERBOSITY=verbose -c "$service_session SELECT * FROM public.transition_talkx_campaign('40000000-0000-0000-0000-000000000001', 'start');" 2>&1 || true)"
[[ "$duplicate_start" == *talkx_campaign_start_denied_from_sending* ]] || fail 'início concorrente/repetido foi aceito'

paused="$(psql_test -Atqc "$service_session SELECT previous_status || ':' || current_status FROM public.transition_talkx_campaign('40000000-0000-0000-0000-000000000001', 'pause');")"
[[ "$paused" == 'sending:paused' ]] || fail 'pause válido não foi aplicado'

cancelled="$(psql_test -Atqc "$service_session SELECT previous_status || ':' || current_status FROM public.transition_talkx_campaign('40000000-0000-0000-0000-000000000001', 'cancel');")"
[[ "$cancelled" == 'paused:cancelled' ]] || fail 'cancelamento válido não foi aplicado'

missing_message="$(psql_test -v VERBOSITY=verbose -c "$service_session SELECT * FROM public.transition_talkx_campaign('40000000-0000-0000-0000-000000000002', 'start');" 2>&1 || true)"
[[ "$missing_message" == *talkx_campaign_message_required* ]] || fail 'campanha sem mensagem iniciou'

missing_recipients="$(psql_test -v VERBOSITY=verbose -c "$service_session SELECT * FROM public.transition_talkx_campaign('40000000-0000-0000-0000-000000000003', 'start');" 2>&1 || true)"
[[ "$missing_recipients" == *talkx_campaign_recipients_required* ]] || fail 'campanha sem audiência iniciou'

completed_cancel="$(psql_test -v VERBOSITY=verbose -c "$service_session SELECT * FROM public.transition_talkx_campaign('40000000-0000-0000-0000-000000000004', 'cancel');" 2>&1 || true)"
[[ "$completed_cancel" == *talkx_campaign_cancel_denied_from_completed* ]] || fail 'campanha concluída foi cancelada'

printf 'PASS: Talk X transition RPC serializes start/pause/cancel and rejects invalid delivery state\n'
