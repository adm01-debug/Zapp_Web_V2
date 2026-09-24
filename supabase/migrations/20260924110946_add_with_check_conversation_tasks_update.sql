DROP POLICY IF EXISTS "Agents can update own or assigned tasks" ON public.conversation_tasks;

CREATE POLICY "Agents can update own or assigned tasks" ON public.conversation_tasks
  FOR UPDATE TO authenticated
  USING (
    assigned_to = get_profile_id_for_user(auth.uid())
    OR created_by = get_profile_id_for_user(auth.uid())
    OR is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    is_contact_visible_to_user(contact_id, auth.uid())
    OR (contact_id IS NULL AND created_by = get_profile_id_for_user(auth.uid()))
  );
