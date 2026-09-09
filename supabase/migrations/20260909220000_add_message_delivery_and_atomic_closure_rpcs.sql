-- Phase 1, forward-only: add atomic primitives without removing legacy paths.
-- Rollout: database primitives -> callers -> enforcement migration.
-- Legacy writes remain available, but new internal idempotency/lease fields are
-- protected immediately so an authenticated table write cannot forge state.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.messages
  ADD COLUMN client_message_id uuid,
  ADD COLUMN delivery_claim_token uuid,
  ADD COLUMN delivery_claimed_at timestamptz,
  ADD COLUMN delivery_claim_expires_at timestamptz,
  ADD COLUMN delivery_claimed_by text,
  ADD COLUMN delivery_last_claim_token uuid,
  ADD COLUMN delivery_attempt_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_delivery_attempt_count_nonnegative
    CHECK (delivery_attempt_count >= 0) NOT VALID,
  ADD CONSTRAINT messages_delivery_claim_state
    CHECK (
      (delivery_claim_token IS NULL
        AND delivery_claimed_at IS NULL
        AND delivery_claim_expires_at IS NULL
        AND delivery_claimed_by IS NULL)
      OR
      (delivery_claim_token IS NOT NULL
        AND delivery_claimed_at IS NOT NULL
        AND delivery_claim_expires_at IS NOT NULL
        AND delivery_claim_expires_at > delivery_claimed_at
        AND length(delivery_claimed_by) BETWEEN 1 AND 100)
    ) NOT VALID;

ALTER TABLE public.messages
  VALIDATE CONSTRAINT messages_delivery_attempt_count_nonnegative;
ALTER TABLE public.messages
  VALIDATE CONSTRAINT messages_delivery_claim_state;

CREATE UNIQUE INDEX ux_messages_contact_client_message_id
  ON public.messages(contact_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
CREATE INDEX idx_messages_delivery_claimable
  ON public.messages(created_at, id)
  WHERE sender = 'agent' AND status = 'sending' AND external_id IS NULL;

ALTER TABLE public.conversation_closures
  ADD COLUMN client_request_id uuid;
CREATE UNIQUE INDEX ux_conversation_closures_contact_request
  ON public.conversation_closures(contact_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

ALTER TABLE public.conversation_events
  ADD COLUMN closure_id uuid;
ALTER TABLE public.conversation_events
  ADD CONSTRAINT conversation_events_closure_id_fkey
    FOREIGN KEY (closure_id) REFERENCES public.conversation_closures(id)
    ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT conversation_events_closure_type_check
    CHECK (closure_id IS NULL OR event_type = 'close') NOT VALID;
ALTER TABLE public.conversation_events
  VALIDATE CONSTRAINT conversation_events_closure_id_fkey;
ALTER TABLE public.conversation_events
  VALIDATE CONSTRAINT conversation_events_closure_type_check;
CREATE UNIQUE INDEX ux_conversation_events_closure_id
  ON public.conversation_events(closure_id)
  WHERE closure_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_message_delivery_internal_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT' AND (
        NEW.client_message_id IS NOT NULL
        OR NEW.delivery_claim_token IS NOT NULL
        OR NEW.delivery_claimed_at IS NOT NULL
        OR NEW.delivery_claim_expires_at IS NOT NULL
        OR NEW.delivery_claimed_by IS NOT NULL
        OR NEW.delivery_last_claim_token IS NOT NULL
        OR NEW.delivery_attempt_count <> 0
      ))
     OR (TG_OP = 'UPDATE' AND (
        NEW.client_message_id IS DISTINCT FROM OLD.client_message_id
        OR NEW.delivery_claim_token IS DISTINCT FROM OLD.delivery_claim_token
        OR NEW.delivery_claimed_at IS DISTINCT FROM OLD.delivery_claimed_at
        OR NEW.delivery_claim_expires_at IS DISTINCT FROM OLD.delivery_claim_expires_at
        OR NEW.delivery_claimed_by IS DISTINCT FROM OLD.delivery_claimed_by
        OR NEW.delivery_last_claim_token IS DISTINCT FROM OLD.delivery_last_claim_token
        OR NEW.delivery_attempt_count IS DISTINCT FROM OLD.delivery_attempt_count
      )) THEN
    RAISE EXCEPTION 'message_delivery_internal_fields_forbidden'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_message_delivery_internal_fields()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_message_delivery_internal_fields
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_delivery_internal_fields();

CREATE OR REPLACE FUNCTION public.guard_conversation_closure_request_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role')
     AND (
       (TG_OP = 'INSERT' AND NEW.client_request_id IS NOT NULL)
       OR (TG_OP = 'UPDATE'
           AND NEW.client_request_id IS DISTINCT FROM OLD.client_request_id)
     ) THEN
    RAISE EXCEPTION 'closure_request_id_internal_field_forbidden'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_conversation_closure_request_id()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_conversation_closure_request_id
BEFORE INSERT OR UPDATE ON public.conversation_closures
FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_closure_request_id();

CREATE OR REPLACE FUNCTION public.guard_conversation_event_closure_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role')
     AND (
       (TG_OP = 'INSERT' AND NEW.closure_id IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND NEW.closure_id IS DISTINCT FROM OLD.closure_id)
     ) THEN
    RAISE EXCEPTION 'event_closure_id_internal_field_forbidden'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_conversation_event_closure_id()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_conversation_event_closure_id
BEFORE INSERT OR UPDATE ON public.conversation_events
FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_event_closure_id();

CREATE OR REPLACE FUNCTION public.enqueue_outbound_message(
  p_contact_id uuid,
  p_client_message_id uuid,
  p_content text,
  p_message_type text DEFAULT 'text',
  p_media_url text DEFAULT NULL,
  p_reply_to_id uuid DEFAULT NULL,
  p_whatsapp_connection_id uuid DEFAULT NULL
) RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_profile_id uuid;
  v_connection_id uuid;
  v_reply_contact_id uuid;
  v_message public.messages%ROWTYPE;
  v_message_type text := COALESCE(NULLIF(p_message_type, ''), 'text');
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_profile_id
  FROM public.profiles AS profile
  WHERE profile.user_id = auth.uid() AND profile.is_active = true
  LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  IF p_contact_id IS NULL OR p_client_message_id IS NULL
     OR p_content IS NULL OR length(p_content) > 65536
     OR v_message_type NOT IN ('text', 'image', 'audio', 'video', 'document', 'sticker')
     OR length(COALESCE(p_media_url, '')) > 4096
     OR (p_media_url IS NOT NULL AND p_media_url !~ '^https://')
     OR (v_message_type <> 'text' AND p_media_url IS NULL) THEN
    RAISE EXCEPTION 'invalid_outbound_message' USING ERRCODE = '22023';
  END IF;
  IF public.is_contact_visible_to_user(p_contact_id, auth.uid()) IS NOT TRUE THEN
    RAISE EXCEPTION 'message_contact_not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT contact.whatsapp_connection_id INTO v_connection_id
  FROM public.contacts AS contact
  WHERE contact.id = p_contact_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_whatsapp_connection_id IS NOT NULL
     AND p_whatsapp_connection_id IS DISTINCT FROM v_connection_id THEN
    RAISE EXCEPTION 'message_whatsapp_connection_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_reply_to_id IS NOT NULL THEN
    SELECT reply.contact_id INTO v_reply_contact_id
    FROM public.messages AS reply WHERE reply.id = p_reply_to_id;
    IF NOT FOUND OR v_reply_contact_id IS DISTINCT FROM p_contact_id THEN
      RAISE EXCEPTION 'reply_message_contact_mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.messages (
    contact_id, client_message_id, whatsapp_connection_id, agent_id,
    sender, content, message_type, media_url, reply_to_id,
    is_read, status, external_id, status_updated_at
  ) VALUES (
    p_contact_id, p_client_message_id, v_connection_id, v_profile_id,
    'agent', p_content, v_message_type, p_media_url, p_reply_to_id,
    true, 'sending', NULL, statement_timestamp()
  )
  ON CONFLICT (contact_id, client_message_id)
    WHERE client_message_id IS NOT NULL
  DO NOTHING RETURNING * INTO v_message;

  IF v_message.id IS NULL THEN
    SELECT * INTO v_message
    FROM public.messages AS message
    WHERE message.contact_id = p_contact_id
      AND message.client_message_id = p_client_message_id;
    IF v_message.id IS NULL
       OR v_message.agent_id IS DISTINCT FROM v_profile_id
       OR v_message.sender IS DISTINCT FROM 'agent'
       OR v_message.content IS DISTINCT FROM p_content
       OR v_message.message_type IS DISTINCT FROM v_message_type
       OR v_message.media_url IS DISTINCT FROM p_media_url
       OR v_message.reply_to_id IS DISTINCT FROM p_reply_to_id
       OR v_message.whatsapp_connection_id IS DISTINCT FROM v_connection_id THEN
      RAISE EXCEPTION 'client_message_id_reused_with_different_payload'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN v_message;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_outbound_message(
  uuid, uuid, text, text, text, uuid, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_outbound_message(
  uuid, uuid, text, text, text, uuid, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_outbound_message(
  p_message_id uuid,
  p_agent_id uuid,
  p_worker text,
  p_lease_seconds integer DEFAULT 90
) RETURNS TABLE(
  message_id uuid,
  client_message_id uuid,
  contact_id uuid,
  agent_id uuid,
  content text,
  message_type text,
  media_url text,
  caption text,
  media_filename text,
  media_mimetype text,
  reply_to_id uuid,
  reply_external_id text,
  whatsapp_connection_id uuid,
  whatsapp_instance_name text,
  contact_phone text,
  claim_token uuid,
  claim_expires_at timestamptz,
  delivery_attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_message_id IS NULL OR p_agent_id IS NULL
     OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_delivery_claim' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT message.id, connection.id AS resolved_connection_id
    FROM public.messages AS message
    JOIN public.contacts AS contact ON contact.id = message.contact_id
    JOIN public.whatsapp_connections AS connection
      ON connection.id = COALESCE(
        message.whatsapp_connection_id, contact.whatsapp_connection_id
      )
     AND connection.status = 'connected'
     AND NULLIF(connection.instance_id, '') IS NOT NULL
    WHERE message.id = p_message_id
      AND message.agent_id = p_agent_id
      AND message.sender = 'agent'
      AND message.status = 'sending'
      AND message.external_id IS NULL
      AND message.client_message_id IS NOT NULL
      AND contact.phone ~ '^[0-9]{8,15}$'
      AND (message.delivery_claim_token IS NULL
        OR message.delivery_claim_expires_at <= statement_timestamp())
    FOR UPDATE OF message SKIP LOCKED
  ), claimed AS (
    UPDATE public.messages AS message
    SET delivery_claim_token = gen_random_uuid(),
        delivery_claimed_at = statement_timestamp(),
        delivery_claim_expires_at = statement_timestamp()
          + make_interval(secs => p_lease_seconds),
        delivery_claimed_by = p_worker,
        delivery_attempt_count = message.delivery_attempt_count + 1,
        whatsapp_connection_id = candidate.resolved_connection_id,
        updated_at = statement_timestamp()
    FROM candidate
    WHERE message.id = candidate.id
    RETURNING message.*
  )
  SELECT claimed.id, claimed.client_message_id, claimed.contact_id,
         claimed.agent_id, claimed.content, claimed.message_type,
         claimed.media_url, claimed.caption, claimed.media_filename,
         claimed.media_mimetype, claimed.reply_to_id, reply.external_id,
         claimed.whatsapp_connection_id, connection.instance_id,
         contact.phone, claimed.delivery_claim_token,
         claimed.delivery_claim_expires_at, claimed.delivery_attempt_count
  FROM claimed
  JOIN public.contacts AS contact ON contact.id = claimed.contact_id
  JOIN public.whatsapp_connections AS connection
    ON connection.id = claimed.whatsapp_connection_id
  LEFT JOIN public.messages AS reply ON reply.id = claimed.reply_to_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_outbound_message(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_message(uuid, uuid, text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_outbound_message(
  p_message_id uuid,
  p_claim_token uuid,
  p_external_id text,
  p_delivery_status text DEFAULT 'sent'
) RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_message public.messages%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_message_id IS NULL OR p_claim_token IS NULL
     OR length(btrim(COALESCE(p_external_id, ''))) NOT BETWEEN 1 AND 512
     OR p_delivery_status IS NULL
     OR p_delivery_status NOT IN ('sent', 'delivered', 'read') THEN
    RAISE EXCEPTION 'invalid_delivery_completion' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_message
  FROM public.messages AS message
  WHERE message.id = p_message_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbound_message_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_message.external_id = btrim(p_external_id)
     AND v_message.status IN ('sent', 'delivered', 'read')
     AND v_message.delivery_claim_token IS NULL
     AND v_message.delivery_last_claim_token = p_claim_token THEN
    RETURN v_message;
  END IF;

  IF v_message.delivery_claim_token IS DISTINCT FROM p_claim_token
     OR v_message.status IS DISTINCT FROM 'sending'
     OR v_message.external_id IS NOT NULL THEN
    RAISE EXCEPTION 'outbound_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.messages
  SET external_id = btrim(p_external_id), status = p_delivery_status,
      status_updated_at = statement_timestamp(), delivery_claim_token = NULL,
      delivery_claimed_at = NULL, delivery_claim_expires_at = NULL,
      delivery_claimed_by = NULL, delivery_last_claim_token = p_claim_token,
      updated_at = statement_timestamp()
  WHERE id = p_message_id RETURNING * INTO v_message;
  RETURN v_message;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_outbound_message(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_outbound_message(uuid, uuid, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.fail_outbound_message(
  p_message_id uuid,
  p_claim_token uuid,
  p_retryable boolean DEFAULT false
) RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_message public.messages%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_message_id IS NULL OR p_claim_token IS NULL OR p_retryable IS NULL THEN
    RAISE EXCEPTION 'invalid_delivery_failure' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_message
  FROM public.messages AS message
  WHERE message.id = p_message_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbound_message_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_message.delivery_claim_token IS NULL
     AND v_message.delivery_last_claim_token = p_claim_token
     AND (
       (p_retryable AND v_message.status = 'sending')
       OR (NOT p_retryable AND v_message.status = 'failed')
     ) THEN
    RETURN v_message;
  END IF;

  IF v_message.sender IS DISTINCT FROM 'agent'
     OR v_message.status IS DISTINCT FROM 'sending'
     OR v_message.external_id IS NOT NULL
     OR v_message.delivery_claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'outbound_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.messages
  SET status = CASE WHEN p_retryable THEN 'sending' ELSE 'failed' END,
      status_updated_at = CASE WHEN p_retryable THEN status_updated_at
        ELSE statement_timestamp() END,
      delivery_claim_token = NULL, delivery_claimed_at = NULL,
      delivery_claim_expires_at = NULL, delivery_claimed_by = NULL,
      delivery_last_claim_token = p_claim_token, updated_at = statement_timestamp()
  WHERE id = p_message_id
  RETURNING * INTO v_message;
  RETURN v_message;
END;
$function$;

REVOKE ALL ON FUNCTION public.fail_outbound_message(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_outbound_message(uuid, uuid, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.close_conversation_atomic(
  p_contact_id uuid,
  p_client_request_id uuid,
  p_close_reason text,
  p_outcome text DEFAULT NULL,
  p_classification text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS TABLE(
  closure_id uuid,
  event_id uuid,
  contact_id uuid,
  conversation_status text,
  conversation_status_changed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_role text := COALESCE(auth.role(), '');
  v_profile_id uuid;
  v_current_status text;
  v_existing public.conversation_closures%ROWTYPE;
  v_closure_id uuid;
  v_event_id uuid;
  v_changed_at timestamptz;
BEGIN
  IF v_role NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_contact_id IS NULL OR p_client_request_id IS NULL
     OR p_close_reason IS NULL OR p_close_reason NOT IN (
       'resolved', 'no_response', 'transferred', 'spam', 'duplicate',
       'self_resolved', 'other', 'inactivity'
     )
     OR (p_outcome IS NOT NULL AND p_outcome NOT IN (
       'sale', 'lead_qualified', 'support_resolved', 'follow_up', 'lost',
       'no_outcome', 'auto_closed'
     ))
     OR (p_classification IS NOT NULL AND p_classification NOT IN (
       'sales', 'support', 'billing', 'complaint', 'information', 'feedback'
     ))
     OR length(COALESCE(p_notes, '')) > 4000 THEN
    RAISE EXCEPTION 'invalid_conversation_closure' USING ERRCODE = '22023';
  END IF;

  IF v_role = 'authenticated' THEN
    IF auth.uid() IS NULL
       OR public.is_contact_visible_to_user(p_contact_id, auth.uid()) IS NOT TRUE THEN
      RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';
    END IF;
    SELECT profile.id INTO v_profile_id
    FROM public.profiles AS profile
    WHERE profile.user_id = auth.uid() AND profile.is_active = true
    LIMIT 1;
    IF v_profile_id IS NULL THEN
      RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT contact.conversation_status INTO v_current_status
  FROM public.contacts AS contact
  WHERE contact.id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
  FROM public.conversation_closures AS closure
  WHERE closure.contact_id = p_contact_id
    AND closure.client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.closed_by IS DISTINCT FROM v_profile_id
       OR v_existing.close_reason IS DISTINCT FROM p_close_reason
       OR v_existing.outcome IS DISTINCT FROM p_outcome
       OR v_existing.classification IS DISTINCT FROM p_classification
       OR v_existing.notes IS DISTINCT FROM p_notes THEN
      RAISE EXCEPTION 'closure_request_id_reused_with_different_payload'
        USING ERRCODE = '23505';
    END IF;
    SELECT event.id INTO v_event_id
    FROM public.conversation_events AS event
    WHERE event.closure_id = v_existing.id;
    IF v_event_id IS NULL THEN
      RAISE EXCEPTION 'closure_event_invariant_broken' USING ERRCODE = '23514';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_event_id, p_contact_id,
      'resolved'::text, v_existing.created_at;
    RETURN;
  END IF;

  IF v_current_status NOT IN ('open', 'waiting') THEN
    RAISE EXCEPTION 'invalid_transition % -> resolved', v_current_status
      USING ERRCODE = '23514';
  END IF;

  v_changed_at := statement_timestamp();

  INSERT INTO public.conversation_closures (
    contact_id, closed_by, close_reason, outcome, classification, notes,
    client_request_id, created_at
  ) VALUES (
    p_contact_id, v_profile_id, p_close_reason, p_outcome, p_classification,
    p_notes, p_client_request_id, v_changed_at
  ) RETURNING id INTO v_closure_id;

  UPDATE public.contacts
  SET conversation_status = 'resolved',
      conversation_status_changed_at = v_changed_at
  WHERE id = p_contact_id
  RETURNING contacts.conversation_status_changed_at INTO v_changed_at;

  INSERT INTO public.conversation_events (
    contact_id, event_type, performed_by, closure_id, metadata
  ) VALUES (
    p_contact_id, 'close', v_profile_id, v_closure_id,
    jsonb_strip_nulls(jsonb_build_object(
      'close_reason', p_close_reason,
      'outcome', p_outcome,
      'classification', p_classification
    ))
  ) RETURNING id INTO v_event_id;

  RETURN QUERY SELECT v_closure_id, v_event_id, p_contact_id,
    'resolved'::text, v_changed_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.close_conversation_atomic(
  uuid, uuid, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_conversation_atomic(
  uuid, uuid, text, text, text, text
) TO authenticated, service_role;

COMMENT ON COLUMN public.messages.client_message_id IS
  'Idempotency key supplied by the client; unique within contact_id.';
COMMENT ON COLUMN public.conversation_events.closure_id IS
  'FK for the single close event produced by an atomic closure.';
COMMENT ON FUNCTION public.claim_outbound_message(uuid, uuid, text, integer) IS
  'service_role-only atomic lease; transport reuses a stable provider id.';
COMMENT ON FUNCTION public.close_conversation_atomic(
  uuid, uuid, text, text, text, text
) IS 'Authorized, idempotent, transactional closure, FSM update, and event.';

COMMIT;
