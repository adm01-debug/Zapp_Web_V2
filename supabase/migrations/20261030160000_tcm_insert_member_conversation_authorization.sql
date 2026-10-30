-- A2 (P1): direct membership INSERT previously treated any existing member as an
-- authority to invite arbitrary profiles. Keep bootstrap narrow and scope elevated
-- membership authority to the target conversation.
--
-- Assumptions from the canonical schema and create flow:
-- * member_role is the real role column; direct inserts may only create 'member'.
-- * group/department creation uses create_team_group_conversation(), a SECURITY
--   DEFINER RPC that atomically creates the conversation and its owner membership.
-- * admins/supervisors are determined by is_admin_or_supervisor(auth.uid())
--   (user_roles), and a conversation owner is a membership row with role 'owner'.
-- * the creator fallback only bootstraps the creator's own first membership while
--   the conversation has no members. It never authorizes adding another profile.
--
-- No tenant_id exists on this membership relation; conversation_id is the scope
-- boundary. A role held in a different conversation grants no authority here.

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
$function$;

REVOKE EXECUTE ON FUNCTION public.can_insert_team_conversation_member(uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_insert_team_conversation_member(uuid, uuid, text)
  TO authenticated, service_role;

DROP POLICY IF EXISTS tcm_insert_member ON public.team_conversation_members;
CREATE POLICY tcm_insert_member ON public.team_conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_insert_team_conversation_member(
      team_conversation_members.conversation_id,
      team_conversation_members.profile_id,
      team_conversation_members.member_role
    )
  );
