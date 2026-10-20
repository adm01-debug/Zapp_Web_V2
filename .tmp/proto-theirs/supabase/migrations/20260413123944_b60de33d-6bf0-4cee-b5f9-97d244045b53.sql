DROP POLICY IF EXISTS "Users can view reactions on accessible messages" ON public.message_reactions;

CREATE POLICY "Users can view reactions on accessible messages"
ON public.message_reactions
FOR SELECT
TO authenticated
USING (
  message_id IN (
    SELECT m.id FROM messages m
    WHERE m.contact_id IN (
      SELECT c.id FROM contacts c
      WHERE c.assigned_to IN (
        SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()
      )
      OR c.assigned_to IS NULL
    )
  )
  OR is_admin_or_supervisor(auth.uid())
);