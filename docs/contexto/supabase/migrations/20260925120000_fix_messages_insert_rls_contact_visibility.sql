DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;

CREATE POLICY "Users can insert messages" ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin_or_supervisor(auth.uid())
  OR (
    (agent_id IS NULL OR agent_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
    AND (
      contact_id IN (
        SELECT c.id FROM contacts c
        WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
      )
      OR EXISTS (
        SELECT 1 FROM contacts c
        JOIN queue_members qm ON qm.queue_id = c.queue_id
        WHERE c.id = messages.contact_id
          AND qm.profile_id = get_profile_id_for_user(auth.uid())
          AND qm.is_active = true
      )
    )
  )
);
