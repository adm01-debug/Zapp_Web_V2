-- Objetivo: Restringir UPDATE em team_conversations — revogar colunas imutáveis, policy com current_profile_id()
-- Estado ao vivo antes: authenticated podia alterar type/created_by/department_id
-- Rollback: GRANT UPDATE (type, created_by, department_id) ON public.team_conversations TO authenticated; DROP POLICY team_conversations_update_own

REVOKE UPDATE (type, created_by, department_id) ON public.team_conversations FROM authenticated;

DROP POLICY IF EXISTS "Creator can update conversation" ON public.team_conversations;

CREATE POLICY team_conversations_update_own ON public.team_conversations
  FOR UPDATE TO authenticated
  USING (created_by = public.current_profile_id())
  WITH CHECK (created_by = public.current_profile_id());
