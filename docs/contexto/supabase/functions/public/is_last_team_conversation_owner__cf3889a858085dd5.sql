CREATE OR REPLACE FUNCTION public.is_last_team_conversation_owner(_conversation_id uuid, _profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
           SELECT 1
             FROM public.team_conversations tc
             JOIN public.team_conversation_members tcm ON tcm.conversation_id = tc.id
            WHERE tc.id = _conversation_id
              AND tc.type IN ('group', 'department')
              AND tcm.profile_id = _profile_id
              AND tcm.member_role = 'owner'
         )
     AND NOT EXISTS (
           SELECT 1
             FROM public.team_conversation_members tcm2
            WHERE tcm2.conversation_id = _conversation_id
              AND tcm2.member_role = 'owner'
              AND tcm2.profile_id <> _profile_id
         );
$function$
