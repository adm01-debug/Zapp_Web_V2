CREATE OR REPLACE FUNCTION public.can_insert_team_conversation_member(_conversation_id uuid, _profile_id uuid, _member_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    _member_role = 'member'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.profiles actor
       WHERE actor.user_id = auth.uid()
         AND (
           public.is_admin_or_supervisor(auth.uid())
           OR EXISTS (
             SELECT 1
               FROM public.team_conversation_members owner_membership
              WHERE owner_membership.conversation_id = _conversation_id
                AND owner_membership.profile_id = actor.id
                AND owner_membership.member_role = 'owner'
           )
           OR (
             _profile_id = actor.id
             AND public.is_team_conversation_creator(auth.uid(), _conversation_id)
             AND NOT EXISTS (
               SELECT 1
                 FROM public.team_conversation_members existing_membership
                WHERE existing_membership.conversation_id = _conversation_id
             )
           )
         )
    ),
    false
  );
$function$
