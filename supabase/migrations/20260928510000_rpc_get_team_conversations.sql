-- E37: RPC get_team_conversations - lista conversas do usuario autenticado

CREATE OR REPLACE FUNCTION public.get_team_conversations(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_include_archived BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  name TEXT,
  avatar_url TEXT,
  department_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  member_role TEXT,
  last_read_at TIMESTAMPTZ,
  is_muted BOOLEAN,
  is_pinned BOOLEAN,
  is_archived BOOLEAN,
  unread_count BIGINT,
  last_message JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    tc.id,
    tc.type,
    tc.name,
    tc.avatar_url,
    tc.department_id,
    tc.created_by,
    tc.created_at,
    tc.updated_at,
    tcm.member_role,
    tcm.last_read_at,
    tcm.is_muted,
    tcm.is_pinned,
    tcm.is_archived,
    -- Unread count: mensagens apos last_read_at
    COALESCE((
      SELECT COUNT(*)
      FROM public.team_messages tm
      WHERE tm.conversation_id = tc.id
        AND tm.sender_id != v_caller
        AND (tcm.last_read_at IS NULL OR tm.created_at > tcm.last_read_at)
    ), 0)::BIGINT AS unread_count,
    -- Ultima mensagem
    (
      SELECT jsonb_build_object(
        'id', lm.id,
        'content', lm.content,
        'message_type', lm.message_type,
        'sender_id', lm.sender_id,
        'created_at', lm.created_at
      )
      FROM public.team_messages lm
      WHERE lm.conversation_id = tc.id
      ORDER BY lm.created_at DESC
      LIMIT 1
    ) AS last_message
  FROM public.team_conversations tc
  JOIN public.team_conversation_members tcm ON tcm.conversation_id = tc.id
  WHERE tcm.profile_id = v_caller
    AND (p_include_archived OR tcm.is_archived = false)
  ORDER BY tc.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_team_conversations(INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_conversations(INTEGER, INTEGER, BOOLEAN) TO authenticated;
