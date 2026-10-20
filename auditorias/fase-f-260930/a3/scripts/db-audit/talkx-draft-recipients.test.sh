#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="$repo_root/supabase/migrations/20260911140000_harden_talkx_campaign_state_transitions.sql"
postgres_image="${TALKX_DRAFT_RECIPIENTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-draft-recipients-test-$$"
test_password="talkx_draft_recipients_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

start_postgres() {
  # Require stable readiness and retry only this disposable container startup.
  # SQL and assertion failures below remain fail-fast and are never retried.
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
    docker ps -a --filter "name=^/${container_name}$" --format 'talkx-test-container {{.Status}}' >&2 || true
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste não iniciou'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  created_by uuid,
  status text NOT NULL,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, visible boolean NOT NULL DEFAULT true);
CREATE TABLE public.talkx_recipients (
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  UNIQUE (campaign_id, contact_id)
);
CREATE FUNCTION public.is_admin_or_supervisor(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_contact_visible_to_user(uuid, uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT visible FROM public.contacts WHERE id = $1
$$;

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002');
INSERT INTO public.contacts (id, visible) VALUES
  ('30000000-0000-0000-0000-000000000001', true),
  ('30000000-0000-0000-0000-000000000002', true),
  ('30000000-0000-0000-0000-000000000003', false);
INSERT INTO public.talkx_campaigns (id, created_by, status) VALUES
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'draft'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'sending');
SQL

psql_test < "$migration" >/dev/null

owner_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';"
other_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000002';"

first="$(psql_test -Atqc "$owner_session SELECT public.replace_talkx_draft_recipients('40000000-0000-0000-0000-000000000001', ARRAY['30000000-0000-0000-0000-000000000001'::uuid]);")"
[[ "$first" == '1' ]] || fail 'primeiro snapshot não retornou 1'
[[ "$(psql_test -Atqc "SELECT total_recipients FROM public.talkx_campaigns WHERE id='40000000-0000-0000-0000-000000000001'")" == '1' ]] || fail 'contador não sincronizado'

second="$(psql_test -Atqc "$owner_session SELECT public.replace_talkx_draft_recipients('40000000-0000-0000-0000-000000000001', ARRAY['30000000-0000-0000-0000-000000000002'::uuid]);")"
[[ "$second" == '1' ]] || fail 'segundo snapshot não retornou 1'
[[ "$(psql_test -Atqc "SELECT string_agg(contact_id::text, ',') FROM public.talkx_recipients WHERE campaign_id='40000000-0000-0000-0000-000000000001'")" == '30000000-0000-0000-0000-000000000002' ]] || fail 'snapshot anterior não foi substituído'

locked_output="$(psql_test -v VERBOSITY=verbose -c "$owner_session SELECT public.replace_talkx_draft_recipients('40000000-0000-0000-0000-000000000002', ARRAY['30000000-0000-0000-0000-000000000001'::uuid]);" 2>&1 || true)"
[[ "$locked_output" == *talkx_recipients_locked* ]] || fail 'campanha em envio aceitou troca de destinatário'

forbidden_output="$(psql_test -v VERBOSITY=verbose -c "$other_session SELECT public.replace_talkx_draft_recipients('40000000-0000-0000-0000-000000000001', ARRAY['30000000-0000-0000-0000-000000000001'::uuid]);" 2>&1 || true)"
[[ "$forbidden_output" == *talkx_campaign_not_authorized* ]] || fail 'usuário não proprietário alterou audiência'

hidden_output="$(psql_test -v VERBOSITY=verbose -c "$owner_session SELECT public.replace_talkx_draft_recipients('40000000-0000-0000-0000-000000000001', ARRAY['30000000-0000-0000-0000-000000000003'::uuid]);" 2>&1 || true)"
[[ "$hidden_output" == *talkx_recipient_not_authorized* ]] || fail 'contato invisível entrou na audiência'

printf 'PASS: talkx draft recipients atomic replacement, authorization and lifecycle locks\n'
