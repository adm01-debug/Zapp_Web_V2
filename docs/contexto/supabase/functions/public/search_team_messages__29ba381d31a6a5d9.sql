CREATE OR REPLACE FUNCTION public.search_team_messages(p_conversation_id uuid, p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, sender_id uuid, content text, created_at timestamp with time zone, sender_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.team_conversation_members
     WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id
  ) THEN RAISE EXCEPTION 'not_member'; END IF;

  RETURN QUERY
  SELECT m.id, m.sender_id, m.content, m.created_at, p.name
    FROM public.team_messages m
    LEFT JOIN public.profiles p ON p.id = m.sender_id
   WHERE m.conversation_id = p_conversation_id
     AND m.content ILIKE '%' || p_query || '%'
   ORDER BY m.created_at DESC
   LIMIT LEAST(p_limit, 100);
END;
$function$
