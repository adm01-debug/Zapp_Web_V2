-- tcm_insert_owner_only
-- Rollback: restaura a policy tcm_insert_member anterior que permitia qualquer membro adicionar membros; remove a função is_team_conversation_owner criada.
-- Rollback (SQL executável, na ordem):
--   DROP POLICY IF EXISTS tcm_insert_member ON public.team_conversation_members;
--   CREATE POLICY tcm_insert_member ON public.team_conversation_members FOR INSERT TO authenticated WITH CHECK (member_role = 'member' AND (EXISTS (SELECT 1 FROM public.team_conversation_members m2 JOIN public.profiles p ON p.id = m2.profile_id WHERE m2.conversation_id = team_conversation_members.conversation_id AND p.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor'))));
--   DROP FUNCTION IF EXISTS public.is_team_conversation_owner(uuid, uuid);

SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_team_conversation_owner(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.team_conversation_members tcm
      JOIN public.profiles p ON p.id = tcm.profile_id
     WHERE tcm.conversation_id = _conversation_id
       AND p.user_id = _user_id
       AND tcm.member_role = 'owner'
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_team_conversation_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_conversation_owner(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS tcm_insert_member ON public.team_conversation_members;
CREATE POLICY tcm_insert_member ON public.team_conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    member_role = 'member'
    AND (
      public.is_team_conversation_owner(auth.uid(), team_conversation_members.conversation_id)
      OR public.is_admin_or_supervisor(auth.uid())
      OR public.is_team_conversation_creator(auth.uid(), team_conversation_members.conversation_id)
    )
  );
