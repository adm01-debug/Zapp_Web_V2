DROP POLICY IF EXISTS "Agents can create tasks for their contacts" ON public.conversation_tasks;

CREATE POLICY "Agents can create tasks for their contacts" ON public.conversation_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    is_contact_visible_to_user(contact_id, auth.uid())
    OR (contact_id IS NULL AND created_by = get_profile_id_for_user(auth.uid()))
  );
