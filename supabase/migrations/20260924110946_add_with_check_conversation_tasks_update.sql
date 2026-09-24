DROP POLICY IF EXISTS "Agents can update own or assigned tasks" ON public.conversation_tasks;

CREATE POLICY "Agents can update own or assigned tasks" ON public.conversation_tasks
  FOR UPDATE TO authenticated
  USING (
    assigned_to = get_profile_id_for_user(auth.uid())
    OR created_by = get_profile_id_for_user(auth.uid())
    OR is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    (
      assigned_to = get_profile_id_for_user(auth.uid())
      OR created_by = get_profile_id_for_user(auth.uid())
      OR is_admin_or_supervisor(auth.uid())
    )
    AND (
      contact_id IS NULL
      OR is_contact_visible_to_user(contact_id, auth.uid())
    )
  );
