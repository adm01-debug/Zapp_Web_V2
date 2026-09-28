-- E10: Reescrever policy 'Senders can edit own messages' com WITH CHECK e TO authenticated
-- A policy atual nao tem WITH CHECK, permitindo que um sender altere o sender_id apos criar

DROP POLICY IF EXISTS "Senders can edit own messages" ON public.team_messages;

CREATE POLICY "Senders can edit own messages"
  ON public.team_messages
  FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.team_conversation_members tcm
      WHERE tcm.conversation_id = team_messages.conversation_id
        AND tcm.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id = conversation_id
  );
