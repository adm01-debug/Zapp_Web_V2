DROP POLICY IF EXISTS "Users can view messages from their assigned contacts" ON public.messages

DROP POLICY IF EXISTS "messages_select_policy" ON public.messages

CREATE POLICY "messages_select_policy" ON public.messages
  FOR SELECT TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    OR contact_id IN (
        SELECT c.id FROM public.contacts c
        WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
      )
    OR EXISTS (
        SELECT 1 FROM public.contacts c
        JOIN public.queue_members qm ON qm.queue_id = c.queue_id
        WHERE c.id = messages.contact_id
          AND qm.profile_id = get_profile_id_for_user(auth.uid())
          AND qm.is_active = true
      )
  )

DROP POLICY IF EXISTS "Admins can view all contacts including unassigned" ON public.contacts
