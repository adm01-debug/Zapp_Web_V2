CREATE OR REPLACE FUNCTION public.enqueue_group_outbound_message(p_group_id uuid, p_client_message_id uuid, p_content text, p_message_type text DEFAULT 'text'::text, p_media_url text DEFAULT NULL::text, p_reply_to_id uuid DEFAULT NULL::uuid, p_whatsapp_connection_id uuid DEFAULT NULL::uuid, p_caption text DEFAULT NULL::text)
 RETURNS messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_connection_id uuid;
  v_assigned_connection_id uuid;
  v_group_jid text;
  v_reply_group_id uuid;
  v_message public.messages%ROWTYPE;
  v_message_type text := COALESCE(NULLIF(p_message_type, ''), 'text');
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF public.user_has_permission(auth.uid(), 'send_messages') IS NOT TRUE THEN
    RAISE EXCEPTION 'send_messages_permission_required' USING ERRCODE = '42501';
  END IF;
  IF p_group_id IS NULL OR p_client_message_id IS NULL
     OR p_content IS NULL OR length(p_content) > 65536
     OR v_message_type NOT IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location')
     OR length(COALESCE(p_media_url, '')) > 4096
     OR length(COALESCE(p_caption, '')) > 65536
     OR (p_media_url IS NOT NULL AND p_media_url !~ '^https://')
     OR (v_message_type NOT IN ('text', 'location') AND p_media_url IS NULL)
     OR (v_message_type = 'location' AND p_media_url IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_outbound_message' USING ERRCODE = '22023';
  END IF;
  SELECT grp.whatsapp_connection_id, grp.group_id
    INTO v_assigned_connection_id, v_group_jid
  FROM public.whatsapp_groups AS grp
  WHERE grp.id = p_group_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_group_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF v_group_jid IS NULL OR v_group_jid !~ '^[0-9][0-9-]*@g[.]us$' THEN
    RAISE EXCEPTION 'message_group_not_deliverable' USING ERRCODE = '22023';
  END IF;
  v_connection_id := public.resolve_outbound_whatsapp_connection(
    p_whatsapp_connection_id, v_assigned_connection_id
  );
  IF public.is_admin_or_supervisor(auth.uid()) IS NOT TRUE
     AND EXISTS (
       SELECT 1
       FROM public.whatsapp_connection_queues AS link
       WHERE link.whatsapp_connection_id = COALESCE(v_assigned_connection_id, v_connection_id)
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.whatsapp_connection_queues AS link
       JOIN public.queue_members AS member ON member.queue_id = link.queue_id
       JOIN public.profiles AS caller_profile ON caller_profile.id = member.profile_id
       WHERE link.whatsapp_connection_id = COALESCE(v_assigned_connection_id, v_connection_id)
         AND caller_profile.user_id = auth.uid()
         AND caller_profile.is_active
         AND COALESCE(member.is_active, true)
     ) THEN
    RAISE EXCEPTION 'message_group_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF public.is_admin_or_supervisor(auth.uid()) IS NOT TRUE
     AND v_connection_id IS DISTINCT FROM v_assigned_connection_id
     AND EXISTS (
       SELECT 1 FROM public.whatsapp_connection_queues AS link
       WHERE link.whatsapp_connection_id = v_connection_id
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.whatsapp_connection_queues AS link
       JOIN public.queue_members AS member ON member.queue_id = link.queue_id
       JOIN public.profiles AS caller_profile ON caller_profile.id = member.profile_id
       WHERE link.whatsapp_connection_id = v_connection_id
         AND caller_profile.user_id = auth.uid()
         AND caller_profile.is_active
         AND COALESCE(member.is_active, true)
     ) THEN
    RAISE EXCEPTION 'whatsapp_connection_out_of_scope' USING ERRCODE = '42501';
  END IF;
  SELECT profile.id INTO v_profile_id
  FROM public.profiles AS profile
  WHERE profile.user_id = auth.uid() AND profile.is_active = true
  LIMIT 1
  FOR SHARE;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;
  IF p_reply_to_id IS NOT NULL THEN
    SELECT reply.whatsapp_group_id INTO v_reply_group_id
    FROM public.messages AS reply WHERE reply.id = p_reply_to_id;
    IF NOT FOUND OR v_reply_group_id IS DISTINCT FROM p_group_id THEN
      RAISE EXCEPTION 'reply_message_group_mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('group:' || p_group_id::text || ':' || p_client_message_id::text, 0)
  );
  INSERT INTO public.messages (
    contact_id, whatsapp_group_id, client_message_id, whatsapp_connection_id, agent_id,
    sender, content, message_type, media_url, caption, reply_to_id,
    is_read, status, external_id, status_updated_at
  ) VALUES (
    NULL, p_group_id, p_client_message_id, v_connection_id, v_profile_id,
    'agent', p_content, v_message_type, p_media_url, p_caption, p_reply_to_id,
    true, 'sending', NULL, statement_timestamp()
  )
  ON CONFLICT (whatsapp_group_id, client_message_id)
    WHERE client_message_id IS NOT NULL AND whatsapp_group_id IS NOT NULL
  DO NOTHING RETURNING * INTO v_message;
  IF v_message.id IS NULL THEN
    SELECT * INTO v_message
    FROM public.messages AS message
    WHERE message.whatsapp_group_id = p_group_id
      AND message.client_message_id = p_client_message_id;
    IF v_message.id IS NULL
       OR v_message.agent_id IS DISTINCT FROM v_profile_id
       OR v_message.sender IS DISTINCT FROM 'agent'
       OR v_message.content IS DISTINCT FROM p_content
       OR v_message.message_type IS DISTINCT FROM v_message_type
       OR v_message.media_url IS DISTINCT FROM p_media_url
       OR v_message.caption IS DISTINCT FROM p_caption
       OR v_message.reply_to_id IS DISTINCT FROM p_reply_to_id
       OR v_message.whatsapp_connection_id IS DISTINCT FROM v_connection_id THEN
      RAISE EXCEPTION 'client_message_id_reused_with_different_payload'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN v_message;
END;
$function$
