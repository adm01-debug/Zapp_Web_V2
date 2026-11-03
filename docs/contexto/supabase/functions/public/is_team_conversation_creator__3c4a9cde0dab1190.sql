CREATE OR REPLACE FUNCTION public.is_team_conversation_creator(_user_id uuid, _conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.team_conversations tc
      JOIN public.profiles p ON p.id = tc.created_by
     WHERE tc.id = _conversation_id
       AND p.user_id = _user_id
  );
$function$
