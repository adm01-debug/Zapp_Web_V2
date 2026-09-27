-- E17: RPC get_team_unread_counts() — unread count per conversation in one call
CREATE OR REPLACE FUNCTION public.get_team_unread_counts()
RETURNS TABLE (conversation_id uuid, unread_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    m.conversation_id,
    count(*) AS unread_count
  FROM public.team_messages m
  JOIN public.team_conversation_members mem
    ON mem.conversation_id = m.conversation_id
  WHERE
    mem.profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND (mem.last_read_at IS NULL OR m.created_at > mem.last_read_at)
    AND m.sender_id <> (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  GROUP BY m.conversation_id;
$$;
