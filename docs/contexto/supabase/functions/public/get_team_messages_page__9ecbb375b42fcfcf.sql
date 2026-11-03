CREATE OR REPLACE FUNCTION public.get_team_messages_page(p_conversation_id uuid, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, content text, message_type text, reply_to_id uuid, media_url text, media_type text, media_bucket text, media_path text, is_edited boolean, created_at timestamp with time zone, updated_at timestamp with time zone, sender_name text, sender_avatar text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_before_at  timestamptz;
  v_before_id  uuid;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
     WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  IF p_before_id IS NOT NULL THEN
    -- Alias `tm`: created_at e id também são colunas de saída (42702, ver #1266).
    SELECT tm.created_at, tm.id INTO v_before_at, v_before_id
      FROM public.team_messages tm WHERE tm.id = p_before_id;
  END IF;

  RETURN QUERY
  SELECT
    m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
    m.reply_to_id, m.media_url, m.media_type, m.media_bucket, m.media_path,
    m.is_edited, m.created_at, m.updated_at,
    p.name, p.avatar_url
  FROM public.team_messages m
  LEFT JOIN public.profiles p ON p.id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
    AND (
      v_before_at IS NULL
      OR m.created_at < v_before_at
      OR (m.created_at = v_before_at AND m.id < v_before_id)
    )
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT LEAST(p_limit, 200);
END;
$function$
