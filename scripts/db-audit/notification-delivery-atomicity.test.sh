#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${NOTIFICATION_ATOMICITY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-notification-atomicity-$RANDOM-$$"
test_password="notification_atomicity_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-notification-atomicity-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
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
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid UNIQUE,
  name text,
  email text
);
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  name text,
  phone text,
  assigned_to uuid REFERENCES public.profiles(id),
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id)
);
CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id),
  agent_id uuid REFERENCES public.profiles(id),
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status text NOT NULL CHECK (status IN ('ringing', 'answered', 'ended', 'missed', 'busy', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  recording_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  is_read boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.profiles(id, user_id, name, email) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Agente', 'agent@example.test');
INSERT INTO public.whatsapp_connections(id) VALUES
  ('30000000-0000-0000-0000-000000000001');
INSERT INTO public.contacts(id, name, phone, assigned_to, whatsapp_connection_id) VALUES
  ('40000000-0000-0000-0000-000000000001', 'Cliente', '5511999999999',
   '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');
SQL

runtime_before="$(psql_test -At < "$repo_root/scripts/db-audit/notification-delivery-atomicity-runtime.sql")"
RUNTIME_JSON="$runtime_before" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RUNTIME_JSON);
const ok = proof.server_major === 17
  && proof.database === 'postgres'
  && proof.base_table_count === 3
  && proof.calls_table_count === 1
  && proof.provider_event_column_count === 0
  && proof.constraint_count === 0
  && proof.index_count === 0
  && proof.function_name_count === 0
  && proof.function_signature_count === 0
  && proof.public_execute_count === 0
  && proof.anon_execute_count === 0
  && proof.authenticated_execute_count === 0
  && proof.service_execute_count === 0
  && /^[a-f0-9]{64}$/.test(proof.runtime_sha256 || '')
  && /^[a-f0-9]{64}$/.test(proof.function_definition_sha256 || '');
if (!ok) throw new Error('invalid pre-migration runtime proof');
NODE

psql_test < "$repo_root/supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql" >/dev/null

runtime_after="$(psql_test -At < "$repo_root/scripts/db-audit/notification-delivery-atomicity-runtime.sql")"
RUNTIME_JSON="$runtime_after" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RUNTIME_JSON);
const ok = proof.server_major === 17
  && proof.database === 'postgres'
  && proof.base_table_count === 3
  && proof.calls_table_count === 1
  && proof.provider_event_column_count === 1
  && proof.constraint_count === 1
  && proof.validated_constraint_count === 1
  && proof.index_count === 1
  && proof.valid_unique_partial_index_count === 1
  && proof.function_name_count === 2
  && proof.function_signature_count === 2
  && proof.security_definer_count === 2
  && proof.safe_path_count === 2
  && proof.trusted_owner_count === 2
  && proof.public_execute_count === 0
  && proof.anon_execute_count === 0
  && proof.authenticated_execute_count === 0
  && proof.service_execute_count === 2
  && /^[a-f0-9]{64}$/.test(proof.runtime_sha256 || '')
  && /^[a-f0-9]{64}$/.test(proof.function_definition_sha256 || '');
if (!ok) throw new Error('invalid post-migration runtime proof');
NODE

psql_test >/dev/null <<'SQL'
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.record_incoming_call_event(uuid,uuid,text,boolean,text,boolean)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.record_incoming_call_event(uuid,uuid,text,boolean,text,boolean)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.record_incoming_call_event(uuid,uuid,text,boolean,text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'invalid incoming call RPC grants';
  END IF;
  IF has_function_privilege('anon', 'public.persist_sentiment_alert(uuid,uuid,uuid,text,text,jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.persist_sentiment_alert(uuid,uuid,uuid,text,text,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.persist_sentiment_alert(uuid,uuid,uuid,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'invalid sentiment RPC grants';
  END IF;
END $$;

SET ROLE service_role;
SELECT * FROM public.record_incoming_call_event(
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'ringing', false, 'provider-event-1', true
);
SELECT * FROM public.record_incoming_call_event(
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'ringing', false, 'provider-event-1', true
);
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.calls WHERE provider_event_id = 'provider-event-1') <> 1 THEN
    RAISE EXCEPTION 'provider retry duplicated call';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE type = 'incoming_call') <> 1 THEN
    RAISE EXCEPTION 'provider retry duplicated notification';
  END IF;
END $$;

SET ROLE service_role;
SELECT * FROM public.record_incoming_call_event(
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'ringing', false, NULL, true
);
SELECT * FROM public.record_incoming_call_event(
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'ringing', false, NULL, true
);
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.calls WHERE provider_event_id IS NULL) <> 2 THEN
    RAISE EXCEPTION 'distinct calls without provider identity were collapsed';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE type = 'incoming_call') <> 3 THEN
    RAISE EXCEPTION 'distinct notifications without provider identity were collapsed';
  END IF;
END $$;

CREATE FUNCTION public.reject_notification_write() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic notification failure'; END $$;
CREATE TRIGGER reject_notification_write
BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.reject_notification_write();
DO $$
DECLARE v_calls bigint;
BEGIN
  SELECT count(*) INTO v_calls FROM public.calls;
  BEGIN
    PERFORM * FROM public.record_incoming_call_event(
      '40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      'ringing', true, 'provider-event-rollback', true
    );
    RAISE EXCEPTION 'notification failure was not propagated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'notification failure was not propagated' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.calls) <> v_calls THEN
    RAISE EXCEPTION 'call insert survived notification rollback';
  END IF;
END $$;
DROP TRIGGER reject_notification_write ON public.notifications;

SET ROLE service_role;
SELECT * FROM public.persist_sentiment_alert(
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Alerta de sentimento', 'Sentimento negativo',
  '{"analysis_id":"50000000-0000-0000-0000-000000000001"}'::jsonb
);
SELECT * FROM public.persist_sentiment_alert(
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Alerta de sentimento', 'Sentimento negativo',
  '{"analysis_id":"50000000-0000-0000-0000-000000000001"}'::jsonb
);
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.audit_logs WHERE id = '50000000-0000-0000-0000-000000000001') <> 1
    OR (SELECT count(*) FROM public.notifications WHERE id = '50000000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'sentiment retry was not idempotent';
  END IF;
END $$;

INSERT INTO public.notifications(id, user_id, title, message, type, metadata) VALUES (
  '50000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001',
  'Alerta de sentimento', 'Sentimento negativo', 'sentiment_alert',
  '{"analysis_id":"50000000-0000-0000-0000-000000000002"}'::jsonb
);
SET ROLE service_role;
SELECT * FROM public.persist_sentiment_alert(
  '50000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Alerta de sentimento', 'Sentimento negativo',
  '{"analysis_id":"50000000-0000-0000-0000-000000000002"}'::jsonb
);
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.audit_logs WHERE id = '50000000-0000-0000-0000-000000000002') <> 1 THEN
    RAISE EXCEPTION 'legacy partial sentiment state was not repaired';
  END IF;
END $$;

CREATE TRIGGER reject_notification_write
BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.reject_notification_write();
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.persist_sentiment_alert(
      '50000000-0000-0000-0000-000000000003',
      '40000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      'Alerta de sentimento', 'Sentimento negativo',
      '{"analysis_id":"50000000-0000-0000-0000-000000000003"}'::jsonb
    );
    RAISE EXCEPTION 'sentiment notification failure was not propagated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'sentiment notification failure was not propagated' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.audit_logs WHERE id = '50000000-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'sentiment audit survived notification rollback';
  END IF;
END $$;
DROP TRIGGER reject_notification_write ON public.notifications;
DROP FUNCTION public.reject_notification_write();
SQL

printf '[PASS] incoming call and sentiment delivery are atomic, idempotent and service-role only\n'
