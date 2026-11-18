DROP POLICY IF EXISTS "Users can update their assigned contacts" ON contacts

CREATE POLICY "Users can update their assigned contacts" ON contacts FOR UPDATE USING ((assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)) OR is_admin_or_supervisor(auth.uid()) OR ((queue_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM queue_members qm WHERE ((qm.queue_id = contacts.queue_id) AND (qm.profile_id = get_profile_id_for_user(auth.uid())) AND (qm.is_active = true))))))
