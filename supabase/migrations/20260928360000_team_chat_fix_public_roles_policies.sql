-- E21: Fix das 6 policies com roles={public} que devem ser TO authenticated
-- + fix policies de team_conversation_members UPDATE sem WITH CHECK

-- 1. team_conversation_members: "Admins can update any member row" (UPDATE)
DROP POLICY IF EXISTS "Admins can update any member row" ON public.team_conversation_members;
CREATE POLICY "Admins can update any member row"
  ON public.team_conversation_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'supervisor') OR p.is_admin = true)
    )
    OR EXISTS (
      SELECT 1 FROM public.team_conversation_members tcm2
      WHERE tcm2.conversation_id = team_conversation_members.conversation_id
        AND tcm2.profile_id = auth.uid()
        AND tcm2.member_role = 'admin'
    )
  )
  WITH CHECK (
    -- Nao pode mudar conversation_id ou profile_id
    conversation_id = conversation_id AND profile_id = profile_id
  );

-- 2. team_conversation_members: "Members can update own preferences" (UPDATE)
DROP POLICY IF EXISTS "Members can update own preferences" ON public.team_conversation_members;
CREATE POLICY "Members can update own preferences"
  ON public.team_conversation_members
  FOR UPDATE
  TO authenticated
  USING (
    profile_id = auth.uid()
  )
  WITH CHECK (
    profile_id = auth.uid()
    AND conversation_id = conversation_id
    AND member_role = member_role
  );

-- 3. team_conversations: "Conversation creator or admin can delete" (DELETE)
DROP POLICY IF EXISTS "Conversation creator or admin can delete" ON public.team_conversations;
CREATE POLICY "Conversation creator or admin can delete"
  ON public.team_conversations
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_conversation_members tcm
      WHERE tcm.conversation_id = team_conversations.id
        AND tcm.profile_id = auth.uid()
        AND tcm.member_role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'supervisor') OR p.is_admin = true)
    )
  );

-- 4. team_message_receipts: "Conversation members can read receipts" (SELECT)
DROP POLICY IF EXISTS "Conversation members can read receipts" ON public.team_message_receipts;
CREATE POLICY "Conversation members can read receipts"
  ON public.team_message_receipts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_messages tm
      JOIN public.team_conversation_members tcm ON tcm.conversation_id = tm.conversation_id
      WHERE tm.id = team_message_receipts.message_id
        AND tcm.profile_id = auth.uid()
    )
  );

-- 5. team_message_receipts: "Members can insert own receipts" (INSERT)
DROP POLICY IF EXISTS "Members can insert own receipts" ON public.team_message_receipts;
CREATE POLICY "Members can insert own receipts"
  ON public.team_message_receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.team_messages tm
      JOIN public.team_conversation_members tcm ON tcm.conversation_id = tm.conversation_id
      WHERE tm.id = message_id
        AND tcm.profile_id = auth.uid()
    )
  );

-- 6. team_message_receipts: "Members can update own receipts" (UPDATE)
DROP POLICY IF EXISTS "Members can update own receipts" ON public.team_message_receipts;
CREATE POLICY "Members can update own receipts"
  ON public.team_message_receipts
  FOR UPDATE
  TO authenticated
  USING (
    profile_id = auth.uid()
  )
  WITH CHECK (
    profile_id = auth.uid()
    AND message_id = message_id
  );
