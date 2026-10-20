-- Atomic, idempotent notification delivery for Evolution calls and sentiment.
-- Both functions are internal service-role primitives: authorization is proven
-- by the Edge Function before the service client invokes them.

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS provider_event_id text;

ALTER TABLE public.calls
  DROP CONSTRAINT IF EXISTS calls_provider_event_id_length;
ALTER TABLE public.calls
  ADD CONSTRAINT calls_provider_event_id_length
  CHECK (provider_event_id IS NULL OR char_length(provider_event_id) BETWEEN 1 AND 200)
  NOT VALID;
ALTER TABLE public.calls VALIDATE CONSTRAINT calls_provider_event_id_length;

CREATE UNIQUE INDEX IF NOT EXISTS calls_connection_provider_event_unique
  ON public.calls (whatsapp_connection_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_incoming_call_event(
  p_contact_id uuid,
  p_whatsapp_connection_id uuid,
  p_status text,
  p_is_video boolean,
  p_provider_event_id text DEFAULT NULL,
  p_should_notify boolean DEFAULT false
)
RETURNS TABLE (
  call_id uuid,
  notification_id uuid,
  notification_created boolean,
  duplicate boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agent_id uuid;
  v_agent_user_id uuid;
  v_contact_name text;
  v_contact_phone text;
  v_contact_connection_id uuid;
  v_event_id text := nullif(btrim(p_provider_event_id), '');
  v_call_id uuid;
  v_persisted_status text;
  v_notification_id uuid;
  v_notification_candidate uuid;
  v_notification_created boolean := false;
  v_call_duplicate boolean := false;
  v_row_count integer := 0;
  v_existing_notification record;
BEGIN
  IF p_status NOT IN ('ringing', 'answered', 'ended', 'missed', 'busy', 'failed') THEN
    RAISE EXCEPTION 'invalid incoming call status' USING ERRCODE = '22023';
  END IF;
  IF v_event_id IS NOT NULL AND char_length(v_event_id) > 200 THEN
    RAISE EXCEPTION 'provider event id exceeds 200 characters' USING ERRCODE = '22023';
  END IF;
  IF p_should_notify AND p_status <> 'ringing' THEN
    RAISE EXCEPTION 'only ringing calls can create notifications' USING ERRCODE = '22023';
  END IF;

  SELECT c.assigned_to, c.name, c.phone, c.whatsapp_connection_id
    INTO v_agent_id, v_contact_name, v_contact_phone, v_contact_connection_id
  FROM public.contacts AS c
  WHERE c.id = p_contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'incoming call contact not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_contact_connection_id IS DISTINCT FROM p_whatsapp_connection_id THEN
    RAISE EXCEPTION 'incoming call connection does not match contact' USING ERRCODE = '23514';
  END IF;

  IF v_agent_id IS NOT NULL THEN
    SELECT p.user_id INTO v_agent_user_id
    FROM public.profiles AS p
    WHERE p.id = v_agent_id;
  END IF;

  IF v_event_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.calls AS existing
      WHERE existing.whatsapp_connection_id = p_whatsapp_connection_id
        AND existing.provider_event_id = v_event_id
    ) INTO v_call_duplicate;

    INSERT INTO public.calls (
      contact_id, whatsapp_connection_id, agent_id, direction, status,
      started_at, answered_at, ended_at, notes, provider_event_id
    ) VALUES (
      p_contact_id, p_whatsapp_connection_id, v_agent_id, 'inbound', p_status,
      now(),
      CASE WHEN p_status = 'answered' THEN now() ELSE NULL END,
      CASE WHEN p_status IN ('ended', 'missed', 'busy', 'failed') THEN now() ELSE NULL END,
      CASE WHEN p_is_video THEN 'Chamada de vídeo' ELSE 'Chamada de voz' END,
      v_event_id
    )
    ON CONFLICT (whatsapp_connection_id, provider_event_id)
      WHERE provider_event_id IS NOT NULL
    DO UPDATE SET
      contact_id = EXCLUDED.contact_id,
      agent_id = EXCLUDED.agent_id,
      status = CASE
        WHEN public.calls.status IN ('ended', 'missed', 'busy', 'failed')
          THEN public.calls.status
        WHEN public.calls.status = 'answered' AND EXCLUDED.status = 'ringing'
          THEN public.calls.status
        ELSE EXCLUDED.status
      END,
      answered_at = COALESCE(public.calls.answered_at, EXCLUDED.answered_at),
      ended_at = COALESCE(public.calls.ended_at, EXCLUDED.ended_at),
      notes = EXCLUDED.notes
    RETURNING id, status INTO v_call_id, v_persisted_status;
  ELSE
    INSERT INTO public.calls (
      contact_id, whatsapp_connection_id, agent_id, direction, status,
      started_at, answered_at, ended_at, notes
    ) VALUES (
      p_contact_id, p_whatsapp_connection_id, v_agent_id, 'inbound', p_status,
      now(),
      CASE WHEN p_status = 'answered' THEN now() ELSE NULL END,
      CASE WHEN p_status IN ('ended', 'missed', 'busy', 'failed') THEN now() ELSE NULL END,
      CASE WHEN p_is_video THEN 'Chamada de vídeo' ELSE 'Chamada de voz' END
    ) RETURNING id, status INTO v_call_id, v_persisted_status;
  END IF;

  IF p_should_notify AND v_persisted_status = 'ringing' AND v_agent_user_id IS NOT NULL THEN
    v_notification_candidate := CASE
      WHEN v_event_id IS NULL THEN gen_random_uuid()
      ELSE md5(
        'zapp:incoming-call:v1:' || p_whatsapp_connection_id::text || ':' || v_event_id
      )::uuid
    END;

    INSERT INTO public.notifications (id, user_id, type, title, message, metadata)
    VALUES (
      v_notification_candidate,
      v_agent_user_id,
      'incoming_call',
      CASE WHEN p_is_video THEN '📹 Chamada de vídeo recebida' ELSE '📞 Chamada de voz recebida' END,
      COALESCE(NULLIF(v_contact_name, ''), v_contact_phone, 'Contato') || ' está ligando para você',
      jsonb_strip_nulls(jsonb_build_object(
        'contact_id', p_contact_id,
        'contact_name', COALESCE(NULLIF(v_contact_name, ''), v_contact_phone, 'Contato'),
        'phone', v_contact_phone,
        'is_video', p_is_video,
        'call_status', v_persisted_status,
        'whatsapp_connection_id', p_whatsapp_connection_id,
        'call_id', v_call_id,
        'event_id', v_event_id
      ))
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_notification_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_notification_created := v_row_count = 1;
    IF NOT v_notification_created THEN
      v_notification_id := v_notification_candidate;
      SELECT n.user_id, n.type, n.metadata INTO v_existing_notification
      FROM public.notifications AS n
      WHERE n.id = v_notification_candidate;
      IF NOT FOUND
        OR v_existing_notification.user_id IS DISTINCT FROM v_agent_user_id
        OR v_existing_notification.type IS DISTINCT FROM 'incoming_call'
        OR v_existing_notification.metadata->>'event_id' IS DISTINCT FROM v_event_id THEN
        RAISE EXCEPTION 'incoming call notification identity conflict' USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_call_id,
    v_notification_id,
    v_notification_created,
    v_call_duplicate OR (
      p_should_notify AND v_agent_user_id IS NOT NULL
      AND v_event_id IS NOT NULL AND NOT v_notification_created
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_incoming_call_event(
  uuid, uuid, text, boolean, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_incoming_call_event(
  uuid, uuid, text, boolean, text, boolean
) TO service_role;

CREATE OR REPLACE FUNCTION public.persist_sentiment_alert(
  p_analysis_id uuid,
  p_contact_id uuid,
  p_recipient_user_id uuid,
  p_notification_title text,
  p_notification_message text,
  p_details jsonb
)
RETURNS TABLE (
  notification_created boolean,
  audit_created boolean,
  duplicate boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notification_created boolean := false;
  v_audit_created boolean := false;
  v_row_count integer := 0;
  v_existing_notification record;
  v_existing_audit record;
BEGIN
  IF p_details IS NULL OR p_details->>'analysis_id' IS DISTINCT FROM p_analysis_id::text THEN
    RAISE EXCEPTION 'sentiment alert details do not match analysis' USING ERRCODE = '22023';
  END IF;
  IF p_recipient_user_id IS NOT NULL
    AND (nullif(btrim(p_notification_title), '') IS NULL
      OR nullif(btrim(p_notification_message), '') IS NULL) THEN
    RAISE EXCEPTION 'sentiment notification title and message are required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_logs (
    id, action, entity_type, entity_id, user_id, details
  ) VALUES (
    p_analysis_id, 'sentiment_alert', 'contact', p_contact_id,
    p_recipient_user_id, p_details
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING true INTO v_audit_created;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_audit_created := v_row_count = 1;

  IF NOT v_audit_created THEN
    SELECT a.action, a.entity_type, a.entity_id, a.user_id, a.details
      INTO v_existing_audit
    FROM public.audit_logs AS a
    WHERE a.id = p_analysis_id;
    IF NOT FOUND
      OR v_existing_audit.action IS DISTINCT FROM 'sentiment_alert'
      OR v_existing_audit.entity_type IS DISTINCT FROM 'contact'
      OR v_existing_audit.entity_id IS DISTINCT FROM p_contact_id
      OR v_existing_audit.user_id IS DISTINCT FROM p_recipient_user_id
      OR v_existing_audit.details->>'analysis_id' IS DISTINCT FROM p_analysis_id::text THEN
      RAISE EXCEPTION 'sentiment audit identity conflict' USING ERRCODE = '23505';
    END IF;
  END IF;

  IF p_recipient_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (id, user_id, title, message, type, metadata)
    VALUES (
      p_analysis_id, p_recipient_user_id, p_notification_title,
      p_notification_message, 'sentiment_alert', p_details
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING true INTO v_notification_created;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_notification_created := v_row_count = 1;

    IF NOT v_notification_created THEN
      SELECT n.user_id, n.type, n.metadata INTO v_existing_notification
      FROM public.notifications AS n
      WHERE n.id = p_analysis_id;
      IF NOT FOUND
        OR v_existing_notification.user_id IS DISTINCT FROM p_recipient_user_id
        OR v_existing_notification.type IS DISTINCT FROM 'sentiment_alert'
        OR v_existing_notification.metadata->>'analysis_id' IS DISTINCT FROM p_analysis_id::text THEN
        RAISE EXCEPTION 'sentiment notification identity conflict' USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_notification_created,
    v_audit_created,
    NOT v_audit_created OR (p_recipient_user_id IS NOT NULL AND NOT v_notification_created);
END;
$$;

REVOKE ALL ON FUNCTION public.persist_sentiment_alert(
  uuid, uuid, uuid, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_sentiment_alert(
  uuid, uuid, uuid, text, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.record_incoming_call_event(uuid, uuid, text, boolean, text, boolean)
  IS 'Atomically persists an Evolution call event and its targeted notification; service_role only.';
COMMENT ON FUNCTION public.persist_sentiment_alert(uuid, uuid, uuid, text, text, jsonb)
  IS 'Atomically persists a sentiment notification and audit record; service_role only.';
