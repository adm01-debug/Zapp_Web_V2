#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
snapshot_migration="$repo_root/supabase/migrations/20260911120000_replace_talkx_draft_recipients.sql"
migration="$repo_root/supabase/migrations/20260911140000_harden_talkx_campaign_state_transitions.sql"
forward_hardening_migration="$repo_root/supabase/migrations/20260911160000_harden_talkx_campaign_insert_and_draft_delete.sql"
outcome_counter_migration="$repo_root/supabase/migrations/20260911190000_account_for_talkx_unknown_provider_outcomes.sql"
postgres_image="${TALKX_CAMPAIGN_STATE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-campaign-state-test-$$"
test_password="talkx_campaign_state_test_only"

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
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user) $$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO authenticated, service_role;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY, created_by uuid, status text NOT NULL DEFAULT 'draft', scheduled_at timestamptz,
  total_recipients integer NOT NULL DEFAULT 0, sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0, delivered_count integer NOT NULL DEFAULT 0,
  started_at timestamptz, completed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, visible boolean NOT NULL DEFAULT true);
CREATE TABLE public.talkx_recipients (campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE, contact_id uuid NOT NULL REFERENCES public.contacts(id), status text NOT NULL DEFAULT 'pending', UNIQUE (campaign_id, contact_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talkx_campaigns, public.talkx_recipients TO authenticated, service_role;
CREATE FUNCTION public.is_admin_or_supervisor(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_contact_visible_to_user(uuid, uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT visible FROM public.contacts WHERE id = $1 $$;

INSERT INTO public.profiles (id, user_id) VALUES ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
INSERT INTO public.contacts (id) VALUES ('30000000-0000-0000-0000-000000000001');
INSERT INTO public.talkx_campaigns (id, created_by, status) VALUES ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'draft');
SQL

psql_test < "$snapshot_migration" >/dev/null
psql_test < "$migration" >/dev/null
psql_test < "$forward_hardening_migration" >/dev/null
psql_test < "$outcome_counter_migration" >/dev/null

owner_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';"
service_session="SET ROLE service_role; SET request.jwt.claim.role='service_role';"
campaign_id="40000000-0000-0000-0000-000000000001"
contact_id="30000000-0000-0000-0000-000000000001"

direct_recipient="$(psql_test -v VERBOSITY=verbose -c "$owner_session INSERT INTO public.talkx_recipients(campaign_id, contact_id) VALUES ('$campaign_id', '$contact_id');" 2>&1 || true)"
[[ "$direct_recipient" == *talkx_recipient_snapshot_required* ]] || fail 'insert direto de destinatário foi aceito'

direct_count="$(psql_test -v VERBOSITY=verbose -c "$owner_session UPDATE public.talkx_campaigns SET total_recipients=99 WHERE id='$campaign_id';" 2>&1 || true)"
[[ "$direct_count" == *talkx_recipient_count_managed* ]] || fail 'contador de audiência foi alterado diretamente'

direct_unknown_count="$(psql_test -v VERBOSITY=verbose -c "$owner_session UPDATE public.talkx_campaigns SET outcome_unknown_count=99 WHERE id='$campaign_id';" 2>&1 || true)"
[[ "$direct_unknown_count" == *talkx_delivery_state_managed_by_worker* ]] || fail 'contador de resultado ambíguo foi alterado diretamente'

sending="$(psql_test -v VERBOSITY=verbose -c "$owner_session UPDATE public.talkx_campaigns SET status='sending' WHERE id='$campaign_id';" 2>&1 || true)"
[[ "$sending" == *talkx_campaign_transition_denied* ]] || fail 'navegador conseguiu iniciar campanha diretamente'

fabricated_insert="$(psql_test -v VERBOSITY=verbose -c "$owner_session INSERT INTO public.talkx_campaigns (id, created_by, status, total_recipients, sent_count) VALUES ('40000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000001', 'sending', 99, 99);" 2>&1 || true)"
[[ "$fabricated_insert" == *talkx_campaign_insert_must_be_draft* ]] || fail 'insert autenticado fabricou estado de entrega'

unscheduled="$(psql_test -v VERBOSITY=verbose -c "$owner_session UPDATE public.talkx_campaigns SET status='scheduled' WHERE id='$campaign_id';" 2>&1 || true)"
[[ "$unscheduled" == *talkx_schedule_requires_audience_and_timestamp* ]] || fail 'agendamento sem instante/audiência foi aceito'

psql_test >/dev/null <<SQL
$owner_session
SELECT public.replace_talkx_draft_recipients('$campaign_id', ARRAY['$contact_id'::uuid]);
SELECT public.replace_talkx_draft_recipients('$campaign_id', ARRAY['$contact_id'::uuid]);
UPDATE public.talkx_campaigns SET status='scheduled', scheduled_at='2026-10-01T12:00:00Z' WHERE id='$campaign_id';
SQL
[[ "$(psql_test -Atqc "SELECT c.status || ':' || c.total_recipients || ':' || count(r.contact_id) FROM public.talkx_campaigns c LEFT JOIN public.talkx_recipients r ON r.campaign_id=c.id WHERE c.id='$campaign_id' GROUP BY c.id")" == 'scheduled:1:1' ]] || fail 'RPC não atualizou snapshot agendado de forma atômica'

psql_test >/dev/null <<SQL
$owner_session
UPDATE public.talkx_campaigns SET status='draft' WHERE id='$campaign_id';
DELETE FROM public.talkx_campaigns WHERE id='$campaign_id';
SQL
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$campaign_id'")" == '0' ]] || fail 'delete autorizado de draft não fez cascade de recipients'

psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_campaigns (id, created_by, status) VALUES
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'draft');
SQL

psql_test >/dev/null <<SQL
$service_session
UPDATE public.talkx_campaigns SET status='sending', started_at=statement_timestamp(), sent_count=1 WHERE id='40000000-0000-0000-0000-000000000002';
SQL
[[ "$(psql_test -Atqc "SELECT status || ':' || sent_count FROM public.talkx_campaigns WHERE id='40000000-0000-0000-0000-000000000002'")" == 'sending:1' ]] || fail 'worker service_role não conseguiu atualizar entrega'

printf 'PASS: Talk X blocks browser-managed delivery state and requires atomic recipient snapshots\n'
