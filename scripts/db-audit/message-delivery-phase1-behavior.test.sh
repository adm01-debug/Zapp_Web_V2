#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${MESSAGE_DELIVERY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-message-phase1-$RANDOM-$$"
test_password="message_phase1_test_only"
concurrency_dir=""

cleanup() {
  if [[ "$container_name" =~ ^zapp-message-phase1-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  if [[ "$concurrency_dir" == /tmp/zapp-message-phase1.* ]]; then
    rm -rf -- "$concurrency_dir"
  fi
}
trap cleanup EXIT INT TERM
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null
ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [ "$markers" -ge 2 ] && docker exec "$container_name" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[ "$ready" = true ] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

psql_test >/dev/null <<'SQL'
CREATE EXTENSION pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO PUBLIC;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, user_id uuid UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'agent', is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.queue_members (
  queue_id uuid REFERENCES public.queues(id),
  profile_id uuid REFERENCES public.profiles(id), is_active boolean NOT NULL,
  PRIMARY KEY(queue_id, profile_id)
);
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY, instance_id text, status text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY, phone text NOT NULL,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id),
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  conversation_status text NOT NULL DEFAULT 'open',
  conversation_status_changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  sender text NOT NULL, content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text', media_url text,
  caption text, media_filename text, media_mimetype text,
  is_read boolean DEFAULT false, agent_id uuid REFERENCES public.profiles(id),
  external_id text, status text DEFAULT 'sent',
  status_updated_at timestamptz DEFAULT now(),
  reply_to_id uuid REFERENCES public.messages(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender IN ('agent','contact')),
  CHECK (message_type IN ('text','image','audio','video','document','sticker'))
);
CREATE TABLE public.conversation_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  closed_by uuid REFERENCES public.profiles(id), close_reason text NOT NULL,
  outcome text, classification text, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  event_type text NOT NULL, performed_by uuid REFERENCES public.profiles(id),
  metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles
    WHERE user_id=p_user_id AND is_active AND role IN ('admin','supervisor'))
$$;
CREATE FUNCTION public.get_profile_id_for_user(p_user_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
  SELECT id FROM public.profiles WHERE user_id=p_user_id LIMIT 1
$$;
CREATE FUNCTION public.is_contact_visible_to_user(p_contact_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
  SELECT p_user_id=auth.uid() AND EXISTS(
    SELECT 1 FROM public.contacts c WHERE c.id=p_contact_id AND (
      public.is_admin_or_supervisor(p_user_id)
      OR c.assigned_to=public.get_profile_id_for_user(p_user_id)
      OR EXISTS(SELECT 1 FROM public.queue_members qm
        WHERE qm.queue_id=c.queue_id
          AND qm.profile_id=public.get_profile_id_for_user(p_user_id)
          AND qm.is_active)
    )
  )
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages,
  public.conversation_closures, public.conversation_events TO authenticated;
GRANT SELECT, UPDATE ON public.contacts TO authenticated;
GRANT SELECT ON public.profiles, public.queue_members,
  public.whatsapp_connections TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

INSERT INTO public.profiles(id,user_id,role,is_active) VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','agent',true),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','agent',true),
 ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','admin',true),
 ('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','agent',false);
INSERT INTO public.queues VALUES ('30000000-0000-0000-0000-000000000001');
INSERT INTO public.queue_members VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true);
INSERT INTO public.whatsapp_connections(id,instance_id,status) VALUES
 ('40000000-0000-0000-0000-000000000001','canonical-one','connected'),
 ('40000000-0000-0000-0000-000000000002','disconnected','disconnected');
INSERT INTO public.contacts(id,phone,assigned_to,queue_id,whatsapp_connection_id) VALUES
 ('50000000-0000-0000-0000-000000000001','5511999990001','10000000-0000-0000-0000-000000000001',NULL,'40000000-0000-0000-0000-000000000001'),
 ('50000000-0000-0000-0000-000000000002','5511999990002','10000000-0000-0000-0000-000000000002',NULL,'40000000-0000-0000-0000-000000000001'),
 ('50000000-0000-0000-0000-000000000003','5511999990003',NULL,'30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001'),
 ('50000000-0000-0000-0000-000000000004','5511999990004',NULL,NULL,'40000000-0000-0000-0000-000000000002');
SQL

psql_test < "$repo_root/supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql" >/dev/null

expect_failure() {
  local expected="$1" sql="$2" output status
  set +e
  output="$(psql_test -v VERBOSITY=verbose -c "$sql" 2>&1)"
  status=$?
  set -e
  [ "$status" -ne 0 ] || fail "$expected deveria falhar"
  grep -q "$expected" <<<"$output" || fail "erro esperado ausente: $expected"
}
agent_one="BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.role','authenticated',true); SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);"
agent_two="BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.role','authenticated',true); SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);"
inactive="BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.role','authenticated',true); SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);"
service_role="BEGIN; SET LOCAL ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',true);"

expect_failure 'message_delivery_internal_fields_forbidden' "$agent_one INSERT INTO public.messages(contact_id,client_message_id,agent_id,sender,content,message_type,status) VALUES ('50000000-0000-0000-0000-000000000001',gen_random_uuid(),'10000000-0000-0000-0000-000000000001','agent','forged','text','sending'); COMMIT;"
expect_failure 'closure_request_id_internal_field_forbidden' "$agent_one INSERT INTO public.conversation_closures(contact_id,closed_by,close_reason,client_request_id) VALUES ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','resolved',gen_random_uuid()); COMMIT;"
expect_failure 'event_closure_id_internal_field_forbidden' "$agent_one INSERT INTO public.conversation_events(contact_id,event_type,performed_by,closure_id) VALUES ('50000000-0000-0000-0000-000000000001','close','10000000-0000-0000-0000-000000000001',gen_random_uuid()); COMMIT;"

enqueue_output="$(psql_test -At <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
CREATE TEMP TABLE first_enqueue AS SELECT (public.enqueue_outbound_message(
  '50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',
  'hello','text',NULL,NULL,NULL
)).id AS id;
CREATE TEMP TABLE retry_enqueue AS SELECT (public.enqueue_outbound_message(
  '50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',
  'hello','text',NULL,NULL,NULL
)).id AS id;
RESET ROLE;
SELECT CASE WHEN (SELECT id FROM first_enqueue)=(SELECT id FROM retry_enqueue)
  AND (SELECT count(*) FROM public.messages
    WHERE client_message_id='60000000-0000-0000-0000-000000000001')=1
  AND (SELECT agent_id='10000000-0000-0000-0000-000000000001'
    AND whatsapp_connection_id='40000000-0000-0000-0000-000000000001'
    AND status='sending' AND external_id IS NULL FROM public.messages
    WHERE client_message_id='60000000-0000-0000-0000-000000000001')
THEN 'enqueue=ok' ELSE 'enqueue=fail' END;
COMMIT;
SQL
)"
grep -Fx 'enqueue=ok' <<<"$enqueue_output" >/dev/null || fail 'enqueue/idempotencia/derivacao'

expect_failure 'message_delivery_internal_fields_forbidden' "$agent_one UPDATE public.messages SET delivery_claim_token=gen_random_uuid() WHERE client_message_id='60000000-0000-0000-0000-000000000001'; COMMIT;"

expect_failure 'message_contact_not_authorized' "$agent_one SELECT public.enqueue_outbound_message('50000000-0000-0000-0000-000000000002',gen_random_uuid(),'idor','text',NULL,NULL,NULL); COMMIT;"
expect_failure 'active_profile_not_found' "$inactive SELECT public.enqueue_outbound_message('50000000-0000-0000-0000-000000000004',gen_random_uuid(),'inactive','text',NULL,NULL,NULL); COMMIT;"
expect_failure 'client_message_id_reused_with_different_payload' "$agent_one SELECT public.enqueue_outbound_message('50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','different','text',NULL,NULL,NULL); COMMIT;"
expect_failure 'invalid_outbound_message' "$agent_one SELECT public.enqueue_outbound_message('50000000-0000-0000-0000-000000000001',gen_random_uuid(),'bad','image','http://127.0.0.1/x',NULL,NULL); COMMIT;"
expect_failure 'message_whatsapp_connection_mismatch' "$agent_one SELECT public.enqueue_outbound_message('50000000-0000-0000-0000-000000000001',gen_random_uuid(),'bad-route','text',NULL,NULL,'40000000-0000-0000-0000-000000000002'); COMMIT;"
expect_failure 'invalid_conversation_closure' "$agent_one SELECT * FROM public.close_conversation_atomic('50000000-0000-0000-0000-000000000001',gen_random_uuid(),NULL,NULL,NULL,NULL); COMMIT;"

claim_output="$(psql_test -At <<'SQL'
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
CREATE TEMP TABLE lease AS SELECT * FROM public.claim_outbound_message(
  (SELECT id FROM public.messages WHERE client_message_id='60000000-0000-0000-0000-000000000001'),
  '10000000-0000-0000-0000-000000000001','edge-a',90
);
SELECT CASE WHEN (SELECT count(*) FROM lease)=1
  AND (SELECT whatsapp_instance_name='canonical-one'
    AND contact_phone='5511999990001' AND delivery_attempt_count=1 FROM lease)
  AND (SELECT count(*) FROM public.claim_outbound_message(
    (SELECT message_id FROM lease),'10000000-0000-0000-0000-000000000001','edge-b',90))=0
THEN 'claim=ok' ELSE 'claim=fail' END;
DO $$ BEGIN
  BEGIN
    PERFORM public.complete_outbound_message(
      (SELECT message_id FROM lease),gen_random_uuid(),'provider-1','sent');
    RAISE EXCEPTION 'wrong token accepted';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
END $$;
CREATE TEMP TABLE completed AS SELECT (public.complete_outbound_message(
  (SELECT message_id FROM lease),(SELECT claim_token FROM lease),'provider-1','sent'
)).*;
CREATE TEMP TABLE retried AS SELECT (public.complete_outbound_message(
  (SELECT message_id FROM lease),(SELECT claim_token FROM lease),'provider-1','sent'
)).*;
SELECT CASE WHEN (SELECT status='sent' AND external_id='provider-1'
    AND delivery_claim_token IS NULL
    AND delivery_last_claim_token=(SELECT claim_token FROM lease) FROM completed)
  AND (SELECT status='sent' AND external_id='provider-1'
    AND updated_at=(SELECT updated_at FROM completed) FROM retried)
THEN 'complete=ok' ELSE 'complete=fail' END;
COMMIT;
SQL
)"
for proof in claim=ok complete=ok; do
  grep -Fx "$proof" <<<"$claim_output" >/dev/null || fail "$proof"
done
expect_failure 'permission denied' "$agent_one SELECT * FROM public.claim_outbound_message(gen_random_uuid(),'10000000-0000-0000-0000-000000000001','browser',90); COMMIT;"
expect_failure 'invalid_delivery_claim' "$service_role SELECT * FROM public.claim_outbound_message(gen_random_uuid(),'10000000-0000-0000-0000-000000000001','edge-null',NULL); COMMIT;"
expect_failure 'invalid_delivery_completion' "$service_role SELECT public.complete_outbound_message(gen_random_uuid(),gen_random_uuid(),'provider-null',NULL); COMMIT;"
expect_failure 'outbound_delivery_claim_conflict' "$service_role SELECT public.complete_outbound_message((SELECT id FROM public.messages WHERE client_message_id='60000000-0000-0000-0000-000000000001'),gen_random_uuid(),'provider-1','sent'); COMMIT;"

# Failure CAS is idempotent for the same lease and rejects a stale lease after
# the message has been reclaimed.
psql_test -At >/dev/null <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT public.enqueue_outbound_message(
  '50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002',
  'retry-me','text',NULL,NULL,NULL
);
COMMIT;
SQL
failure_output="$(psql_test -At <<'SQL'
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
CREATE TEMP TABLE first_lease AS SELECT * FROM public.claim_outbound_message(
  (SELECT id FROM public.messages WHERE client_message_id='60000000-0000-0000-0000-000000000002'),
  '10000000-0000-0000-0000-000000000001','edge-retry-1',90
);
CREATE TEMP TABLE retryable_failure AS SELECT (public.fail_outbound_message(
  (SELECT message_id FROM first_lease),(SELECT claim_token FROM first_lease),true
)).*;
CREATE TEMP TABLE retryable_replay AS SELECT (public.fail_outbound_message(
  (SELECT message_id FROM first_lease),(SELECT claim_token FROM first_lease),true
)).*;
CREATE TEMP TABLE second_lease AS SELECT * FROM public.claim_outbound_message(
  (SELECT message_id FROM first_lease),
  '10000000-0000-0000-0000-000000000001','edge-retry-2',90
);
DO $$ BEGIN
  BEGIN
    PERFORM public.fail_outbound_message(
      (SELECT message_id FROM first_lease),(SELECT claim_token FROM first_lease),true);
    RAISE EXCEPTION 'stale failure token accepted';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
END $$;
CREATE TEMP TABLE terminal_failure AS SELECT (public.fail_outbound_message(
  (SELECT message_id FROM second_lease),(SELECT claim_token FROM second_lease),false
)).*;
CREATE TEMP TABLE terminal_replay AS SELECT (public.fail_outbound_message(
  (SELECT message_id FROM second_lease),(SELECT claim_token FROM second_lease),false
)).*;
SELECT CASE WHEN
  (SELECT status='sending' AND delivery_claim_token IS NULL
    AND delivery_last_claim_token=(SELECT claim_token FROM first_lease)
    FROM retryable_failure)
  AND (SELECT updated_at=(SELECT updated_at FROM retryable_failure)
    FROM retryable_replay)
  AND (SELECT delivery_attempt_count=2
    AND claim_token IS DISTINCT FROM (SELECT claim_token FROM first_lease)
    FROM second_lease)
  AND (SELECT status='failed' AND delivery_claim_token IS NULL
    AND delivery_last_claim_token=(SELECT claim_token FROM second_lease)
    FROM terminal_failure)
  AND (SELECT updated_at=(SELECT updated_at FROM terminal_failure)
    FROM terminal_replay)
THEN 'failure-cas=ok' ELSE 'failure-cas=fail' END;
COMMIT;
SQL
)"
grep -Fx 'failure-cas=ok' <<<"$failure_output" >/dev/null || fail 'failure CAS/idempotencia'

# An expired but structurally valid lease can be recovered by one new worker.
psql_test -At >/dev/null <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT public.enqueue_outbound_message(
  '50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000003',
  'recover-lease','text',NULL,NULL,NULL
);
COMMIT;
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
CREATE TEMP TABLE expired_first AS SELECT * FROM public.claim_outbound_message(
  (SELECT id FROM public.messages WHERE client_message_id='60000000-0000-0000-0000-000000000003'),
  '10000000-0000-0000-0000-000000000001','edge-expired-1',30
);
UPDATE public.messages
SET delivery_claimed_at=statement_timestamp()-interval '60 seconds',
    delivery_claim_expires_at=statement_timestamp()-interval '30 seconds'
WHERE id=(SELECT message_id FROM expired_first);
CREATE TEMP TABLE expired_second AS SELECT * FROM public.claim_outbound_message(
  (SELECT message_id FROM expired_first),
  '10000000-0000-0000-0000-000000000001','edge-expired-2',30
);
SELECT CASE WHEN (SELECT count(*) FROM expired_second)=1
  AND (SELECT delivery_attempt_count=2
    AND claim_token IS DISTINCT FROM (SELECT claim_token FROM expired_first)
    FROM expired_second)
THEN 'expired-lease=ok' ELSE 'expired-lease=fail' END;
COMMIT;
SQL
expired_proof="$(psql_test -Atqc "SELECT CASE WHEN delivery_attempt_count=2 AND delivery_claimed_by='edge-expired-2' THEN 'expired-lease=ok' ELSE 'expired-lease=fail' END FROM public.messages WHERE client_message_id='60000000-0000-0000-0000-000000000003'")"
[ "$expired_proof" = 'expired-lease=ok' ] || fail 'recuperacao de lease expirado'

close_output="$(psql_test -At <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
CREATE TEMP TABLE first_close AS SELECT * FROM public.close_conversation_atomic(
  '50000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000001',
  'resolved','sale','sales','done');
CREATE TEMP TABLE retry_close AS SELECT * FROM public.close_conversation_atomic(
  '50000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000001',
  'resolved','sale','sales','done');
RESET ROLE;
SELECT CASE WHEN (SELECT closure_id FROM first_close)=(SELECT closure_id FROM retry_close)
  AND (SELECT event_id FROM first_close)=(SELECT event_id FROM retry_close)
  AND (SELECT conversation_status_changed_at FROM first_close)=
      (SELECT conversation_status_changed_at FROM retry_close)
  AND (SELECT count(*) FROM public.conversation_closures
    WHERE contact_id='50000000-0000-0000-0000-000000000003')=1
  AND (SELECT count(*) FROM public.conversation_events
    WHERE contact_id='50000000-0000-0000-0000-000000000003' AND event_type='close')=1
  AND (SELECT conversation_status='resolved' FROM public.contacts
    WHERE id='50000000-0000-0000-0000-000000000003')
  AND (SELECT conversation_status_changed_at=(SELECT conversation_status_changed_at FROM first_close)
    FROM public.contacts WHERE id='50000000-0000-0000-0000-000000000003')
  AND (SELECT closed_by='10000000-0000-0000-0000-000000000001'
    FROM public.conversation_closures
    WHERE contact_id='50000000-0000-0000-0000-000000000003')
THEN 'close=ok' ELSE 'close=fail' END;
COMMIT;
SQL
)"
grep -Fx 'close=ok' <<<"$close_output" >/dev/null || fail 'close atomico/idempotente'
expect_failure 'contact_not_authorized' "$agent_one SELECT * FROM public.close_conversation_atomic('50000000-0000-0000-0000-000000000002',gen_random_uuid(),'resolved',NULL,NULL,NULL); COMMIT;"
expect_failure 'closure_request_id_reused_with_different_payload' "$agent_one SELECT * FROM public.close_conversation_atomic('50000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000001','other',NULL,NULL,NULL); COMMIT;"

# A failure in the event leg must roll back closure and status together.
psql_test >/dev/null <<'SQL'
CREATE FUNCTION public.reject_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.metadata->>'close_reason'='spam' THEN RAISE EXCEPTION 'forced event failure'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reject_event BEFORE INSERT ON public.conversation_events
FOR EACH ROW EXECUTE FUNCTION public.reject_event();
SQL
expect_failure 'forced event failure' "$agent_two SELECT * FROM public.close_conversation_atomic('50000000-0000-0000-0000-000000000002',gen_random_uuid(),'spam',NULL,NULL,NULL); COMMIT;"
rollback_proof="$(psql_test -Atqc "SELECT CASE WHEN conversation_status='open' AND NOT EXISTS(SELECT 1 FROM public.conversation_closures cc WHERE cc.contact_id=contacts.id) THEN 'rollback=ok' ELSE 'rollback=fail' END FROM public.contacts WHERE id='50000000-0000-0000-0000-000000000002'")"
[ "$rollback_proof" = 'rollback=ok' ] || fail 'rollback do fechamento'

# Phase 1 compatibility invariant: legacy grants and direct writes still exist.
psql_test >/dev/null <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
INSERT INTO public.messages(contact_id,agent_id,sender,content,message_type,status)
VALUES (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'agent','legacy-compatible','text','sending'
);
INSERT INTO public.conversation_closures(contact_id,closed_by,close_reason)
VALUES (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001','resolved'
);
INSERT INTO public.conversation_events(contact_id,event_type,performed_by)
VALUES (
  '50000000-0000-0000-0000-000000000001','close',
  '10000000-0000-0000-0000-000000000001'
);
ROLLBACK;
SQL
compatibility="$(psql_test -At <<'SQL'
SELECT CASE WHEN has_table_privilege('authenticated','public.messages','INSERT')
  AND has_table_privilege('authenticated','public.conversation_closures','INSERT')
  AND has_table_privilege('authenticated','public.conversation_events','INSERT')
THEN 'compatibility=ok' ELSE 'compatibility=fail' END;
SQL
)"
grep -Fx 'compatibility=ok' <<<"$compatibility" >/dev/null || fail 'compatibilidade da fase 1'

# Real concurrency in independent sessions: enqueue converges to one row, only
# one worker gets the lease, and duplicate closes converge to one closure/event.
concurrency_dir="$(mktemp -d /tmp/zapp-message-phase1.XXXXXX)"
enqueue_sql="BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.role','authenticated',true); SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true); SELECT (public.enqueue_outbound_message('50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000099','concurrent','text',NULL,NULL,NULL)).id; COMMIT;"
set +e
psql_test -qAtc "$enqueue_sql" >"$concurrency_dir/enqueue-1" 2>"$concurrency_dir/enqueue-1.err" & pid_1=$!
psql_test -qAtc "$enqueue_sql" >"$concurrency_dir/enqueue-2" 2>"$concurrency_dir/enqueue-2.err" & pid_2=$!
wait "$pid_1"; status_1=$?
wait "$pid_2"; status_2=$?
set -e
[ "$status_1" -eq 0 ] && [ "$status_2" -eq 0 ] || fail 'enqueue concorrente falhou'
message_1="$(grep -E '^[0-9a-f-]{36}$' "$concurrency_dir/enqueue-1" | tail -1)"
message_2="$(grep -E '^[0-9a-f-]{36}$' "$concurrency_dir/enqueue-2" | tail -1)"
[ -n "$message_1" ] && [ "$message_1" = "$message_2" ] \
  || fail 'enqueue concorrente nao convergiu'

claim_sql="SELECT set_config('request.jwt.claim.role','service_role',false); SELECT count(*) FROM public.claim_outbound_message('$message_1','10000000-0000-0000-0000-000000000001','edge-concurrent',90);"
set +e
psql_test -qAtc "$claim_sql" >"$concurrency_dir/claim-1" 2>"$concurrency_dir/claim-1.err" & pid_1=$!
psql_test -qAtc "$claim_sql" >"$concurrency_dir/claim-2" 2>"$concurrency_dir/claim-2.err" & pid_2=$!
wait "$pid_1"; status_1=$?
wait "$pid_2"; status_2=$?
set -e
[ "$status_1" -eq 0 ] && [ "$status_2" -eq 0 ] || fail 'claim concorrente falhou'
claim_1="$(tail -1 "$concurrency_dir/claim-1")"
claim_2="$(tail -1 "$concurrency_dir/claim-2")"
[ $((claim_1 + claim_2)) -eq 1 ] || fail 'claim concorrente entregou mais de um lease'

close_sql="BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.role','authenticated',true); SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true); SELECT closure_id || ':' || event_id FROM public.close_conversation_atomic('50000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000099','resolved',NULL,NULL,'concurrent'); COMMIT;"
set +e
psql_test -qAtc "$close_sql" >"$concurrency_dir/close-1" 2>"$concurrency_dir/close-1.err" & pid_1=$!
psql_test -qAtc "$close_sql" >"$concurrency_dir/close-2" 2>"$concurrency_dir/close-2.err" & pid_2=$!
wait "$pid_1"; status_1=$?
wait "$pid_2"; status_2=$?
set -e
[ "$status_1" -eq 0 ] && [ "$status_2" -eq 0 ] || fail 'close concorrente falhou'
close_1="$(grep -E '^[0-9a-f-]{36}:[0-9a-f-]{36}$' "$concurrency_dir/close-1" | tail -1)"
close_2="$(grep -E '^[0-9a-f-]{36}:[0-9a-f-]{36}$' "$concurrency_dir/close-2" | tail -1)"
[ -n "$close_1" ] && [ "$close_1" = "$close_2" ] \
  || fail 'close concorrente nao convergiu'

runtime_proof="$(psql_test -At < "$repo_root/scripts/db-audit/message-delivery-phase1-runtime.sql")"
RUNTIME_PROOF="$runtime_proof" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RUNTIME_PROOF);
const ok = proof.server_major === 17
  && proof.database === 'postgres'
  && proof.message_column_count === 7
  && proof.closure_column_count === 1
  && proof.event_column_count === 1
  && proof.column_contract_count === 9
  && proof.validated_constraint_count === 4
  && proof.index_count === 4
  && proof.function_count === 8
  && proof.safe_api_function_count === 5
  && proof.internal_guard_function_count === 3
  && proof.internal_guard_trigger_count === 3
  && proof.trusted_owner_function_count === 8
  && proof.function_name_collision_count === 0
  && proof.trigger_name_collision_count === 0
  && proof.constraint_name_collision_count === 0
  && proof.authenticated_enqueue === true
  && proof.authenticated_close === true
  && proof.service_enqueue === false
  && proof.service_close === true
  && proof.authenticated_privileged_delivery === false
  && proof.authenticated_internal_guard_execute === false
  && proof.anon_any_execute === false
  && proof.service_delivery_count === 3
  && proof.custom_guc_reference_count === 0
  && proof.definition_sha256 === '3891f505b00daf3049d9de0753f4201f95d739f2fcdfb6354ed26bb67d3122a9'
  && proof.constraint_definition_sha256 === 'e0d16c992513b40596c32e39cc9be2515a1e67ce8a316d1c5a5cc47716952486'
  && proof.index_definition_sha256 === '1df306fd2981d1ee83aab373764a87cefdcfd474ac0e3b2023bedd9be046e976'
  && proof.trigger_definition_sha256 === '66ea750c2101611aac2a3eaf9de8e08ef01df4fe9fc1975791f35dafe1c83498'
  && /^[a-f0-9]{64}$/.test(proof.runtime_sha256 ?? '');
if (!ok) {
  console.error(`runtime proof inesperado: ${JSON.stringify(proof)}`);
  process.exit(1);
}
console.log(`definition_sha256=${proof.definition_sha256}`);
NODE

printf '[OK] Message delivery phase 1: authz, structural contracts, token-bound replay, expired leases, concurrency, rollback and compatibility validated on PostgreSQL 17.\n'
