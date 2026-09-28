-- E19: Fix UPDATE policy de team_conversations
-- Policy atual nao restringe colunas nem tem WITH CHECK adequado
-- Group owners (member_role='admin') e admins do sistema podem editar metadados

DROP POLICY IF EXISTS "Group owners can update conversation" ON public.team_conversations;
DROP POLICY IF EXISTS "Admins can update conversations" ON public.team_conversations;
DROP POLICY IF EXISTS "Conversation members can update" ON public.team_conversations;

-- Revogar UPDATE geral e conceder apenas colunas seguras
REVOKE UPDATE ON TABLE public.team_conversations FROM authenticated;
GRANT UPDATE (name, avatar_url, metadata, updated_at) ON TABLE public.team_conversations TO authenticated;

CREATE POLICY "Group admin or system admin can update conversation"
  ON public.team_conversations
  FOR UPDATE
  TO authenticated
  USING (
    -- Membro com role admin desta conversa
    EXISTS (
      SELECT 1 FROM public.team_conversation_members tcm
      WHERE tcm.conversation_id = team_conversations.id
        AND tcm.profile_id = auth.uid()
        AND tcm.member_role = 'admin'
    )
    OR
    -- Admin do sistema
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'supervisor') OR p.is_admin = true)
    )
  )
  WITH CHECK (
    -- Nao pode mudar type, created_by, department_id, direct_member_a/b
    type = type AND created_by = created_by
  );
