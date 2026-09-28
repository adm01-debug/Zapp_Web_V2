-- E46: RPC get_team_unread_counts - retorna unread counts por conversa para o usuario

CREATE OR REPLACE FUNCTION public.get_team_unread_counts()
RETURNS TABLE (
  conversation_id UUID,
  unread_count BIGINT
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
    tcm.conversation_id,
    COUNT(tm.id)::BIGINT AS unread_count
  FROM public.team_conversation_members tcm
  LEFT JOIN public.team_messages tm ON
    tm.conversation_id = tcm.conversation_id
    AND tm.sender_id != v_caller
    AND (tcm.last_read_at IS NULL OR tm.created_at > tcm.last_read_at)
  WHERE tcm.profile_id = v_caller
    AND tcm.is_archived = false
  GROUP BY tcm.conversation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_team_unread_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_unread_counts() TO authenticated;
