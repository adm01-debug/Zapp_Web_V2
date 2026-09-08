#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${CRM_OUTBOX_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="crm-outbox-test-$RANDOM-$$"
test_password="crm_outbox_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$container_name" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

psql_test >/dev/null <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;
CREATE TABLE public.profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, phone text,
  channel_type text, ai_sentiment text
);
CREATE FUNCTION public.is_contact_visible_to_user(uuid, uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_admin_or_supervisor(uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE public.conversation_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid NOT NULL REFERENCES public.contacts(id),
  closed_by uuid REFERENCES public.profiles(id), close_reason text NOT NULL, notes text,
  classification text, outcome text, created_at timestamptz NOT NULL DEFAULT now()
);
SQL

psql_test < "$repo_root/supabase/migrations/20260908180000_crm_contact_links_and_sync_outbox.sql" >/dev/null
psql_test < "$repo_root/supabase/migrations/20260908220000_harden_crm_sync_outbox_leases.sql" >/dev/null

output="$(psql_test -At <<'SQL'
INSERT INTO contacts(id,name,phone) VALUES
  ('00000000-0000-0000-0000-000000000001','Lease','5511999990001'),
  ('00000000-0000-0000-0000-000000000002','Invalid','123'),
  ('00000000-0000-0000-0000-000000000003','Delete','5511999990003');
INSERT INTO conversation_closures(id,contact_id,close_reason) VALUES
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','done'),
  ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','done'),
  ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','done');
CREATE TEMP TABLE lease_a AS SELECT id, lease_token FROM claim_crm_sync_outbox_by_id(
  (SELECT id FROM crm_sync_outbox WHERE closure_id='10000000-0000-0000-0000-000000000001'), 'worker-a');
UPDATE crm_sync_outbox SET locked_at=now()-interval '6 minutes'
WHERE closure_id='10000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE lease_b AS SELECT id, lease_token FROM claim_crm_sync_outbox_by_id(
  (SELECT id FROM crm_sync_outbox WHERE closure_id='10000000-0000-0000-0000-000000000001'), 'worker-b');
DO $$
BEGIN
  BEGIN
    PERFORM complete_crm_sync_outbox((SELECT id FROM lease_a), (SELECT lease_token FROM lease_a), 'old', 'contact', NULL);
    RAISE EXCEPTION 'stale lease was accepted';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
END $$;
SELECT complete_crm_sync_outbox((SELECT id FROM lease_b), (SELECT lease_token FROM lease_b), 'interaction-ok', 'contact-ok', NULL);
SELECT 'fencing=' || CASE WHEN status='succeeded' AND external_interaction_id='interaction-ok' THEN 'ok' ELSE 'fail' END
FROM crm_sync_outbox WHERE closure_id='10000000-0000-0000-0000-000000000001';
UPDATE crm_sync_outbox SET status='processing', attempt_count=max_attempts,
  locked_at=now()-interval '6 minutes', locked_by='dead-worker', lease_token=gen_random_uuid()
WHERE closure_id='10000000-0000-0000-0000-000000000003';
SELECT count(*) FROM claim_crm_sync_outbox_by_id(
  (SELECT id FROM crm_sync_outbox WHERE closure_id='10000000-0000-0000-0000-000000000003'), 'worker-c');
SELECT 'max_attempts=' || CASE WHEN status='dead_letter' AND attempt_count=max_attempts
  AND last_error_code='LEASE_EXPIRED_MAX_ATTEMPTS' THEN 'ok' ELSE 'fail' END
FROM crm_sync_outbox WHERE closure_id='10000000-0000-0000-0000-000000000003';
SELECT 'invalid_phone=' || CASE WHEN status='dead_letter' AND normalized_phone IS NULL
  AND last_error_code='INVALID_PHONE' THEN 'ok' ELSE 'fail' END
FROM crm_sync_outbox WHERE closure_id='10000000-0000-0000-0000-000000000002';
DELETE FROM conversation_closures WHERE id='10000000-0000-0000-0000-000000000003';
DELETE FROM contacts WHERE id='00000000-0000-0000-0000-000000000003';
SELECT 'audit_survives_delete=' || CASE WHEN contact_id IS NULL THEN 'ok' ELSE 'fail' END
FROM crm_sync_outbox WHERE id NOT IN (SELECT id FROM lease_a UNION SELECT id FROM lease_b)
  AND last_error_code='LEASE_EXPIRED_MAX_ATTEMPTS';
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM get_crm_sync_health();
    RAISE EXCEPTION 'health authorization failed open';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT 'health_null_claims=ok';
SQL
)"

for proof in fencing=ok max_attempts=ok invalid_phone=ok audit_survives_delete=ok health_null_claims=ok; do
  grep -Fx "$proof" <<<"$output" >/dev/null || { echo "Missing proof: $proof" >&2; echo "$output" >&2; exit 1; }
done
echo "CRM outbox PostgreSQL 17 behavioral contract: PASS"
