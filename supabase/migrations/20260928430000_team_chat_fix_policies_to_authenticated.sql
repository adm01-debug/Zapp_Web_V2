-- E09: Corrige policies com TO public -> TO authenticated
-- Anon users nao devem ter acesso a dados do Team Chat

-- team_conversation_members
DROP POLICY IF EXISTS "Admins can update any member row" ON public.team_conversation_members;
CREATE POLICY "Admins can update any member row"
  ON public.team_conversation_members FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Members can update own preferences" ON public.team_conversation_members;
CREATE POLICY "Members can update own preferences"
  ON public.team_conversation_members FOR UPDATE
  TO authenticated
  USING (profile_id = current_profile_id());

-- team_conversations
DROP POLICY IF EXISTS "Conversation creator or admin can delete" ON public.team_conversations;
CREATE POLICY "Conversation creator or admin can delete"
  ON public.team_conversations FOR DELETE
  TO authenticated
  USING (
    created_by = current_profile_id()
    OR is_admin_or_supervisor(auth.uid())
  );

-- team_message_receipts
DROP POLICY IF EXISTS "Conversation members can read receipts" ON public.team_message_receipts;
CREATE POLICY "Conversation members can read receipts"
  ON public.team_message_receipts FOR SELECT
  TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.team_conversation_members mem
      JOIN public.team_messages tm ON tm.id = team_message_receipts.message_id
      WHERE mem.conversation_id = tm.conversation_id
        AND mem.profile_id = current_profile_id()
    )
  );

DROP POLICY IF EXISTS "Members can insert own receipts" ON public.team_message_receipts;
CREATE POLICY "Members can insert own receipts"
  ON public.team_message_receipts FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id = current_profile_id()
    AND EXISTS (
      SELECT 1
      FROM public.team_conversation_members mem
      JOIN public.team_messages tm ON tm.id = team_message_receipts.message_id
      WHERE mem.conversation_id = tm.conversation_id
        AND mem.profile_id = team_message_receipts.profile_id
    )
  );

DROP POLICY IF EXISTS "Members can update own receipts" ON public.team_message_receipts;
CREATE POLICY "Members can update own receipts"
  ON public.team_message_receipts FOR UPDATE
  TO authenticated
  USING (profile_id = current_profile_id());
