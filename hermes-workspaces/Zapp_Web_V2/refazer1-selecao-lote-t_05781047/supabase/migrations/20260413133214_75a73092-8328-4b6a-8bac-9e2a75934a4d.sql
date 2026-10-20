
-- =============================================
-- FIX: Contacts visibility (allow unassigned)
-- =============================================
DROP POLICY IF EXISTS "Agents can view assigned contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can view their assigned contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins and supervisors can view all contacts" ON public.contacts;
DROP POLICY IF EXISTS "contacts_select_policy" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can view contacts" ON public.contacts;

CREATE POLICY "contacts_select_policy" ON public.contacts
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    OR assigned_to = public.get_profile_id_for_user(auth.uid())
    OR assigned_to IS NULL
  );

-- =============================================
-- FIX: Messages visibility (follow contact)
-- =============================================
DROP POLICY IF EXISTS "Users can view messages for visible contacts" ON public.messages;
DROP POLICY IF EXISTS "messages_select_policy" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Agents can view messages" ON public.messages;

CREATE POLICY "messages_select_policy" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
        OR c.assigned_to IS NULL
      )
    )
  );

-- =============================================
-- FIX: Message reactions visibility + insert
-- =============================================
DROP POLICY IF EXISTS "Users can view reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "message_reactions_select_policy" ON public.message_reactions;
DROP POLICY IF EXISTS "Authenticated users can view reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can view reactions for visible messages" ON public.message_reactions;

CREATE POLICY "message_reactions_select_policy" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.contacts c ON c.id = m.contact_id
      WHERE m.id = message_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
        OR c.assigned_to IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "message_reactions_insert_policy" ON public.message_reactions;
DROP POLICY IF EXISTS "Agents can react to visible messages" ON public.message_reactions;

CREATE POLICY "message_reactions_insert_policy" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.contacts c ON c.id = m.contact_id
      WHERE m.id = message_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
        OR c.assigned_to IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "Users can update reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "message_reactions_update_policy" ON public.message_reactions;

CREATE POLICY "message_reactions_update_policy" ON public.message_reactions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.contacts c ON c.id = m.contact_id
      WHERE m.id = message_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
        OR c.assigned_to IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "message_reactions_delete_policy" ON public.message_reactions;

CREATE POLICY "message_reactions_delete_policy" ON public.message_reactions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.contacts c ON c.id = m.contact_id
      WHERE m.id = message_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
        OR c.assigned_to IS NULL
      )
    )
  );
