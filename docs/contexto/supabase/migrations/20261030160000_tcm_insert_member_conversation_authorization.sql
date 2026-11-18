CREATE OR REPLACE FUNCTION public.can_insert_team_conversation_member(
  _conversation_id uuid,
  _profile_id uuid,
  _member_role text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

REVOKE EXECUTE ON FUNCTION public.can_insert_team_conversation_member(uuid, uuid, text) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.can_insert_team_conversation_member(uuid, uuid, text) TO authenticated, service_role

DROP POLICY IF EXISTS tcm_insert_member ON public.team_conversation_members

CREATE POLICY tcm_insert_member ON public.team_conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_insert_team_conversation_member(
      team_conversation_members.conversation_id,
      team_conversation_members.profile_id,
      team_conversation_members.member_role
    )
  )
