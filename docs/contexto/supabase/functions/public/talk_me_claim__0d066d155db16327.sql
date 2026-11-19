CREATE OR REPLACE FUNCTION public.talk_me_claim(p_contact_id uuid)
 RETURNS TABLE(contact_id uuid, queue_id uuid, assigned_to uuid, conversation_status text, claimed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_queue_id uuid;
  v_assigned_to uuid;
  v_status text;
  v_claimed_at timestamptz;
  v_last_sender text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT p.id
    INTO v_profile_id
  FROM public.profiles p
  WHERE p.user_id = v_user_id
    AND p.is_active IS TRUE
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'talk_me_unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT c.queue_id, c.assigned_to, c.conversation_status
    INTO v_queue_id, v_assigned_to, v_status
  FROM public.contacts c
  WHERE c.id = p_contact_id
  FOR UPDATE;

  IF NOT FOUND OR v_queue_id IS NULL THEN
    RAISE EXCEPTION 'talk_me_unavailable' USING ERRCODE = 'P0001';
  END IF;

  IF v_assigned_to = v_profile_id THEN
    SELECT al.created_at
      INTO v_claimed_at
    FROM public.audit_logs al
    WHERE al.user_id = v_user_id
      AND al.action = 'talk_me_claim'
      AND al.entity_type = 'contact'
      AND al.entity_id = p_contact_id
    ORDER BY al.created_at ASC, al.id ASC
    LIMIT 1;

    IF v_claimed_at IS NOT NULL THEN
      RETURN QUERY
      SELECT p_contact_id, v_queue_id, v_profile_id, v_status, v_claimed_at;
      RETURN;
    END IF;
  END IF;

  SELECT m.sender
    INTO v_last_sender
  FROM public.messages m
  WHERE m.contact_id = p_contact_id
    AND COALESCE(m.is_deleted, false) = false
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1;

  IF v_last_sender IS DISTINCT FROM 'contact' THEN
    RAISE EXCEPTION 'talk_me_unavailable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.contacts c
  SET assigned_to = v_profile_id,
      conversation_status = 'open'
  WHERE c.id = p_contact_id
    AND c.assigned_to IS NULL
    AND c.deleted_at IS NULL
    AND c.conversation_status IN ('open', 'waiting')
    AND c.channel_type = 'whatsapp'
    AND EXISTS (
      SELECT 1
      FROM public.talk_me_eligible_waiting_contacts(c.queue_id, c.id) eligible
      WHERE eligible.contact_id = c.id
    )
    AND EXISTS (
      SELECT 1
      FROM public.feature_flags f
      WHERE f.key = 'inbox.talk-me'
        AND f.enabled IS TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_profile_id
        AND p.user_id = v_user_id
        AND p.is_active IS TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.queues q
      WHERE q.id = c.queue_id
        AND q.is_active = true
        AND (
          public.is_admin_or_supervisor(v_user_id)
          OR EXISTS (
            SELECT 1
            FROM public.queue_members qm
            WHERE qm.queue_id = q.id
              AND qm.profile_id = v_profile_id
              AND qm.is_active = true
          )
        )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talk_me_unavailable' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_user_id,
    'talk_me_claim',
    'contact',
    p_contact_id,
    jsonb_build_object('queue_id', v_queue_id, 'source', 'talk_me')
  );

  RETURN QUERY
  SELECT p_contact_id, v_queue_id, v_profile_id, 'open'::text, v_now;
END;
$function$
