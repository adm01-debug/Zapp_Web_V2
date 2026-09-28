-- E38: RPC get_team_messages - busca mensagens paginadas de uma conversa

CREATE OR REPLACE FUNCTION public.get_team_messages(
  p_conversation_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_before_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  sender_id UUID,
  content TEXT,
  message_type TEXT,
  reply_to_id UUID,
  is_edited BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  media_url TEXT,
  media_type TEXT,
  status TEXT,
  reactions JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_before_ts TIMESTAMPTZ;
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;

  -- Verificar se o caller e membro da conversa
  IF NOT EXISTS (
    SELECT 1 FROM public.team_conversation_members
    WHERE conversation_id = p_conversation_id AND profile_id = v_caller
  ) THEN
    RETURN;
  END IF;

  -- Cursor por ID (pagination por ID + timestamp)
  IF p_before_id IS NOT NULL THEN
    SELECT created_at INTO v_before_ts
    FROM public.team_messages WHERE id = p_before_id;
  END IF;

  RETURN QUERY
  SELECT
    tm.id,
    tm.conversation_id,
    tm.sender_id,
    tm.content,
    tm.message_type,
    tm.reply_to_id,
    tm.is_edited,
    tm.created_at,
    tm.updated_at,
    tm.media_url,
    tm.media_type,
    tm.status,
    -- Reactions agrupadas por emoji
    COALESCE((
      SELECT jsonb_object_agg(
        r.emoji,
        jsonb_build_object(
          'count', r.cnt,
          'users', r.users
        )
      )
      FROM (
        SELECT
          emoji,
          COUNT(*) as cnt,
          array_agg(profile_id) as users
        FROM public.team_message_reactions
        WHERE message_id = tm.id
        GROUP BY emoji
      ) r
    ), '{}'::jsonb) AS reactions
  FROM public.team_messages tm
  WHERE tm.conversation_id = p_conversation_id
    AND (v_before_ts IS NULL OR tm.created_at < v_before_ts)
  ORDER BY tm.created_at DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_team_messages(UUID, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_messages(UUID, INTEGER, UUID) TO authenticated;
