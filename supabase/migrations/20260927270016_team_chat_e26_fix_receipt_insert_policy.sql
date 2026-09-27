-- E26: Security fix -- receipt INSERT must verify conversation membership
-- Prevents inserting a receipt for a message in a conversation the user isn't a member of.
DROP POLICY IF EXISTS "Members can insert own receipts" ON public.team_message_receipts;

CREATE POLICY "Members can insert own receipts"
  ON public.team_message_receipts FOR INSERT
  WITH CHECK (
    profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.team_conversation_members mem
      JOIN public.team_messages tm ON tm.id = team_message_receipts.message_id
      WHERE mem.conversation_id = tm.conversation_id
        AND mem.profile_id = team_message_receipts.profile_id
    )
  );
