CREATE OR REPLACE FUNCTION public.record_incoming_call_event(p_contact_id uuid, p_whatsapp_connection_id uuid, p_status text, p_is_video boolean, p_provider_event_id text DEFAULT NULL::text, p_should_notify boolean DEFAULT false, p_direction text DEFAULT NULL::text)
 RETURNS TABLE(call_id uuid, notification_id uuid, notification_created boolean, duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      started_at, answered_at, ended_at, notes, provider_event_id,
      channel, provider_call_id, peer_number, peer_name
    ) VALUES (
      p_contact_id, p_whatsapp_connection_id, v_agent_id, coalesce(p_direction, 'inbound'), p_status,
      now(),
      CASE WHEN p_status = 'answered' THEN now() ELSE NULL END,
      CASE WHEN p_status IN ('ended', 'missed', 'busy', 'failed') THEN now() ELSE NULL END,
      CASE WHEN p_is_video THEN 'Chamada de vídeo' ELSE 'Chamada de voz' END,
      v_event_id,
      'whatsapp', v_event_id, v_contact_phone, v_contact_name
    )
    ON CONFLICT (whatsapp_connection_id, provider_event_id)
      WHERE provider_event_id IS NOT NULL
    DO UPDATE SET
      contact_id = EXCLUDED.contact_id,
      -- preserva a atribuição histórica: o primeiro agente visto fica
      agent_id = COALESCE(public.calls.agent_id, EXCLUDED.agent_id),
      status = CASE
        WHEN public.calls.status IN ('ended', 'missed', 'busy', 'failed')
          THEN public.calls.status
        WHEN public.calls.status = 'answered' AND EXCLUDED.status = 'ringing'
          THEN public.calls.status
        ELSE EXCLUDED.status
      END,
      answered_at = COALESCE(public.calls.answered_at, EXCLUDED.answered_at),
      ended_at = COALESCE(public.calls.ended_at, EXCLUDED.ended_at),
      -- `notes` é metadado do provedor: o primeiro valor vence, nunca é reescrito
      notes = COALESCE(public.calls.notes, EXCLUDED.notes),
      channel = COALESCE(public.calls.channel, EXCLUDED.channel),
      provider_call_id = COALESCE(public.calls.provider_call_id, EXCLUDED.provider_call_id),
      peer_number = COALESCE(public.calls.peer_number, EXCLUDED.peer_number),
      peer_name = COALESCE(public.calls.peer_name, EXCLUDED.peer_name),
      talk_seconds = COALESCE(
        public.calls.talk_seconds,
        CASE
          WHEN COALESCE(public.calls.ended_at, EXCLUDED.ended_at) IS NOT NULL
           AND COALESCE(public.calls.answered_at, EXCLUDED.answered_at) IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (
                 COALESCE(public.calls.ended_at, EXCLUDED.ended_at)
                 - COALESCE(public.calls.answered_at, EXCLUDED.answered_at)
               ))::int)
          ELSE NULL
        END
      )
    RETURNING id, status INTO v_call_id, v_persisted_status;
  ELSE
    INSERT INTO public.calls (
      contact_id, whatsapp_connection_id, agent_id, direction, status,
      started_at, answered_at, ended_at, notes,
      channel, peer_number, peer_name
    ) VALUES (
      p_contact_id, p_whatsapp_connection_id, v_agent_id, coalesce(p_direction, 'inbound'), p_status,
      now(),
      CASE WHEN p_status = 'answered' THEN now() ELSE NULL END,
      CASE WHEN p_status IN ('ended', 'missed', 'busy', 'failed') THEN now() ELSE NULL END,
      CASE WHEN p_is_video THEN 'Chamada de vídeo' ELSE 'Chamada de voz' END,
      'whatsapp', v_contact_phone, v_contact_name
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
$function$
