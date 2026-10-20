#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${CRM_OUTBOX_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="crm-outbox-test-$RANDOM-$$"
test_password="crm_outbox_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null
postgres_ready=false
for _ in $(seq 1 90); do
  # The official image briefly exposes a temporary bootstrap server before
  # restarting PostgreSQL. A single pg_isready can therefore race with that
  # shutdown. Require the final (second) readiness marker and a live query.
  ready_markers="$(docker logs "$container_name" 2>&1 \
    | grep -c 'database system is ready to accept connections' || true)"
  if [ "$ready_markers" -ge 2 ] \
    && docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' \
      >/dev/null 2>&1; then
    postgres_ready=true
    break
  fi
  sleep 1
done

if [ "$postgres_ready" != true ]; then
  echo "PostgreSQL test container did not reach final readiness." >&2
  docker logs --tail 100 "$container_name" >&2 || true
  exit 1
fi

psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

psql_test >/dev/null <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE public.feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;
CREATE TABLE public.profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, phone text,
  surname text, nickname text, email text, company text, job_title text,
  contact_type text, avatar_url text, tags text[] NOT NULL DEFAULT '{}',
  channel_type text, ai_sentiment text, updated_at timestamptz NOT NULL DEFAULT now()
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
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE
);
CREATE TABLE public.contact_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE
);
SQL

psql_test < "$repo_root/supabase/migrations/20260908180000_crm_contact_links_and_sync_outbox.sql" >/dev/null

# Produz estado legado antes do hardening: payload excessivo e falso sucesso.
psql_test >/dev/null <<'SQL'
INSERT INTO contacts(id,name,phone) VALUES
  ('00000000-0000-0000-0000-000000000010','Legacy poison','5511999990010'),
  ('00000000-0000-0000-0000-000000000011','Legacy success','5511999990011');
INSERT INTO crm_sync_outbox(contact_id,idempotency_key,normalized_phone,payload)
VALUES ('00000000-0000-0000-0000-000000000010','legacy:oversized','5511999990010',
  jsonb_build_object('resumo', repeat('x', 30000)));
INSERT INTO crm_sync_outbox(contact_id,idempotency_key,normalized_phone,payload,status)
VALUES ('00000000-0000-0000-0000-000000000011','legacy:false-success','5511999990011',
  '{}'::jsonb,'succeeded');
SQL
psql_test < "$repo_root/supabase/migrations/20260908220000_harden_crm_sync_outbox_leases.sql" >/dev/null
psql_test < "$repo_root/supabase/migrations/20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql" >/dev/null

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
INSERT INTO crm_sync_outbox(contact_id,idempotency_key,normalized_phone,payload)
VALUES ('00000000-0000-0000-0000-000000000001','backoff:first','5511999990001','{}');
CREATE TEMP TABLE backoff_lease AS SELECT id, lease_token FROM claim_crm_sync_outbox_by_id(
  (SELECT id FROM crm_sync_outbox WHERE idempotency_key='backoff:first'), 'worker-backoff');
SELECT fail_crm_sync_outbox((SELECT id FROM backoff_lease), (SELECT lease_token FROM backoff_lease), 'TRANSIENT');
SELECT 'first_backoff=' || CASE WHEN status='failed' AND attempt_count=1
  AND available_at BETWEEN now()+interval '25 seconds' AND now()+interval '35 seconds'
  THEN 'ok' ELSE 'fail' END
FROM crm_sync_outbox WHERE idempotency_key='backoff:first';
INSERT INTO crm_sync_outbox(contact_id,idempotency_key,normalized_phone,payload)
VALUES ('00000000-0000-0000-0000-000000000001','terminal:identity','5511999990001','{}');
CREATE TEMP TABLE terminal_lease AS SELECT id, lease_token FROM claim_crm_sync_outbox_by_id(
  (SELECT id FROM crm_sync_outbox WHERE idempotency_key='terminal:identity'), 'worker-terminal');
SELECT fail_crm_sync_outbox(
  (SELECT id FROM terminal_lease), (SELECT lease_token FROM terminal_lease), 'CRM_IDENTITY_MISMATCH'
);
SELECT 'terminal_error=' || CASE WHEN status='dead_letter'
  AND last_error_code='CRM_IDENTITY_MISMATCH' THEN 'ok' ELSE 'fail' END
FROM crm_sync_outbox WHERE idempotency_key='terminal:identity';
SELECT 'invalid_phone=' || CASE WHEN status='dead_letter' AND normalized_phone IS NULL
  AND last_error_code='INVALID_PHONE' THEN 'ok' ELSE 'fail' END
FROM crm_sync_outbox WHERE closure_id='10000000-0000-0000-0000-000000000002';
DELETE FROM conversation_closures WHERE id='10000000-0000-0000-0000-000000000003';
DELETE FROM contacts WHERE id='00000000-0000-0000-0000-000000000003';
SELECT 'audit_survives_delete=' || CASE WHEN contact_id IS NULL
  AND status='dead_letter' AND last_error_code='CONTACT_DELETED'
  AND payload->>'redacted'='true' AND normalized_phone IS NULL
  THEN 'ok' ELSE 'fail' END
FROM crm_sync_outbox WHERE id NOT IN (SELECT id FROM lease_a UNION SELECT id FROM lease_b)
  AND last_error_code='CONTACT_DELETED';
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
SELECT 'constraints_validated=' || CASE WHEN count(*) = 5 THEN 'ok' ELSE 'fail' END
FROM pg_constraint
WHERE conrelid = 'public.crm_sync_outbox'::regclass
  AND conname IN (
    'crm_sync_outbox_payload_size', 'crm_sync_outbox_external_ids_bounded',
    'crm_sync_outbox_lease_state', 'crm_sync_outbox_success_state',
    'crm_sync_outbox_phone_state'
  ) AND convalidated;
SELECT 'legacy_quarantined=' || CASE WHEN count(*) = 2 THEN 'ok' ELSE 'fail' END
FROM crm_sync_outbox
WHERE idempotency_key IN ('legacy:oversized','legacy:false-success')
  AND status = 'dead_letter' AND octet_length(payload::text) <= 20000;
SELECT 'links_acl=' || CASE WHEN
  NOT has_table_privilege('anon', 'public.crm_contact_links', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.crm_contact_links', 'TRUNCATE')
  AND NOT has_table_privilege('anon', 'public.crm_contact_links', 'SELECT')
  AND has_table_privilege('authenticated', 'public.crm_contact_links', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.crm_contact_links', 'INSERT')
THEN 'ok' ELSE 'fail' END;

INSERT INTO contacts(id,name,phone) VALUES
  ('00000000-0000-0000-0000-000000000020','Primary','5511999990020'),
  ('00000000-0000-0000-0000-000000000021','Secondary','5511999990021');
INSERT INTO messages(contact_id) VALUES ('00000000-0000-0000-0000-000000000021');
INSERT INTO contact_notes(contact_id) VALUES ('00000000-0000-0000-0000-000000000021');
INSERT INTO crm_contact_links(zapp_contact_id,external_contact_id)
VALUES ('00000000-0000-0000-0000-000000000021','external-21');
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT merge_contacts_atomic(
  '00000000-0000-0000-0000-000000000020',
  ARRAY['00000000-0000-0000-0000-000000000021']::uuid[],
  '{"name":"Merged","tags":["vip","crm"]}'::jsonb
);
SELECT 'atomic_merge=' || CASE WHEN
  (SELECT count(*) FROM contacts WHERE id='00000000-0000-0000-0000-000000000021') = 0
  AND (SELECT count(*) FROM messages WHERE contact_id='00000000-0000-0000-0000-000000000020') = 1
  AND (SELECT count(*) FROM contact_notes WHERE contact_id='00000000-0000-0000-0000-000000000020') = 1
  AND (SELECT count(*) FROM crm_contact_links WHERE zapp_contact_id='00000000-0000-0000-0000-000000000020') = 1
THEN 'ok' ELSE 'fail' END;
SELECT upsert_crm_contact_link_guarded(
  '00000000-0000-0000-0000-000000000020', 'external-21', NULL, '5511999990020'
);
DO $$
BEGIN
  BEGIN
    PERFORM upsert_crm_contact_link_guarded(
      '00000000-0000-0000-0000-000000000020', 'different-external', NULL, '5511999990020'
    );
    RAISE EXCEPTION 'guarded CRM link accepted identity replacement';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
SELECT 'guarded_link=ok';
INSERT INTO contacts(id,name,phone) VALUES
  ('00000000-0000-0000-0000-000000000030','Conflict primary','5511999990030'),
  ('00000000-0000-0000-0000-000000000031','Conflict secondary','5511999990031');
INSERT INTO messages(contact_id) VALUES ('00000000-0000-0000-0000-000000000031');
INSERT INTO crm_contact_links(zapp_contact_id,external_contact_id) VALUES
  ('00000000-0000-0000-0000-000000000030','external-30'),
  ('00000000-0000-0000-0000-000000000031','external-31');
DO $$
BEGIN
  BEGIN
    PERFORM merge_contacts_atomic(
      '00000000-0000-0000-0000-000000000030',
      ARRAY['00000000-0000-0000-0000-000000000031']::uuid[],
      '{"name":"must rollback"}'::jsonb
    );
    RAISE EXCEPTION 'conflicting CRM links were merged';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
SELECT 'merge_conflict_rollback=' || CASE WHEN
  (SELECT name FROM contacts WHERE id='00000000-0000-0000-0000-000000000030')='Conflict primary'
  AND (SELECT count(*) FROM contacts WHERE id='00000000-0000-0000-0000-000000000031')=1
  AND (SELECT count(*) FROM messages WHERE contact_id='00000000-0000-0000-0000-000000000031')=1
THEN 'ok' ELSE 'fail' END;

INSERT INTO crm_sync_outbox(
  contact_id,idempotency_key,normalized_phone,payload,status,
  external_interaction_id,external_contact_id,completed_at,updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000001','cleanup:old-success','5511999990001','{}',
   'succeeded','old-interaction','old-contact',now()-interval '31 days',now()-interval '31 days'),
  ('00000000-0000-0000-0000-000000000001','cleanup:recent-success','5511999990001','{}',
   'succeeded','recent-interaction','recent-contact',now()-interval '29 days',now()-interval '29 days');
CREATE TEMP TABLE cleanup_result AS SELECT cleanup_crm_sync_outbox(0,100000,1) AS deleted;
SELECT 'cleanup_bounded=' || CASE WHEN (SELECT deleted FROM cleanup_result)=1
  AND NOT EXISTS (SELECT 1 FROM crm_sync_outbox WHERE idempotency_key='cleanup:old-success')
  AND EXISTS (SELECT 1 FROM crm_sync_outbox WHERE idempotency_key='cleanup:recent-success')
  THEN 'ok' ELSE 'fail' END;
SQL
)"

for proof in fencing=ok max_attempts=ok first_backoff=ok terminal_error=ok invalid_phone=ok audit_survives_delete=ok health_null_claims=ok constraints_validated=ok legacy_quarantined=ok links_acl=ok atomic_merge=ok guarded_link=ok merge_conflict_rollback=ok cleanup_bounded=ok; do
  grep -Fx "$proof" <<<"$output" >/dev/null || { echo "Missing proof: $proof" >&2; echo "$output" >&2; exit 1; }
done
echo "CRM outbox PostgreSQL 17 behavioral contract: PASS"
