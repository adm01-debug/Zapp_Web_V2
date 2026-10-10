-- ============================================================
-- Harden permissive RLS policies: scope write access properly
-- ============================================================

-- Helper: check if user is assigned to a contact
CREATE OR REPLACE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contacts c
    JOIN public.profiles p ON p.id = c.assigned_to
    WHERE c.id = _contact_id AND p.user_id = _user_id
  ) OR public.is_admin_or_supervisor(_user_id);
$$;

-- ===================== conversation_memory =====================
-- Replace INSERT (true → contact visible to user)
DROP POLICY IF EXISTS "Authenticated can upsert memory" ON public.conversation_memory;
CREATE POLICY "Agents can insert memory for their contacts"
ON public.conversation_memory FOR INSERT TO authenticated
WITH CHECK (public.is_contact_visible_to_user(contact_id, auth.uid()));

-- Replace UPDATE (true → contact visible to user)
DROP POLICY IF EXISTS "Authenticated can update memory" ON public.conversation_memory;
CREATE POLICY "Agents can update memory for their contacts"
ON public.conversation_memory FOR UPDATE TO authenticated
USING (public.is_contact_visible_to_user(contact_id, auth.uid()));

-- ===================== conversation_tasks =====================
-- Replace INSERT (true → contact visible or assigned to self)
DROP POLICY IF EXISTS "Authenticated can create tasks" ON public.conversation_tasks;
CREATE POLICY "Agents can create tasks for their contacts"
ON public.conversation_tasks FOR INSERT TO authenticated
WITH CHECK (
  public.is_contact_visible_to_user(contact_id, auth.uid())
);

-- Replace UPDATE (true → assigned_to self or admin)
DROP POLICY IF EXISTS "Authenticated can update tasks" ON public.conversation_tasks;
CREATE POLICY "Agents can update own or assigned tasks"
ON public.conversation_tasks FOR UPDATE TO authenticated
USING (
  assigned_to = public.get_profile_id_for_user(auth.uid())
  OR created_by = public.get_profile_id_for_user(auth.uid())
  OR public.is_admin_or_supervisor(auth.uid())
);

-- Replace DELETE (true → creator or admin)
DROP POLICY IF EXISTS "Authenticated can delete tasks" ON public.conversation_tasks;
CREATE POLICY "Creators or admins can delete tasks"
ON public.conversation_tasks FOR DELETE TO authenticated
USING (
  created_by = public.get_profile_id_for_user(auth.uid())
  OR public.is_admin_or_supervisor(auth.uid())
);

-- ===================== conversation_closures =====================
DROP POLICY IF EXISTS "Authenticated can create closures" ON public.conversation_closures;
CREATE POLICY "Agents can create closures for their contacts"
ON public.conversation_closures FOR INSERT TO authenticated
WITH CHECK (public.is_contact_visible_to_user(contact_id, auth.uid()));

-- ===================== number_reputation =====================
-- Restrict INSERT/UPDATE to admins/supervisors only
DROP POLICY IF EXISTS "Authenticated can upsert reputation" ON public.number_reputation;
CREATE POLICY "Admins can insert reputation"
ON public.number_reputation FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can update reputation" ON public.number_reputation;
CREATE POLICY "Admins can update reputation"
ON public.number_reputation FOR UPDATE TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- ===================== talkx_blacklist =====================
-- Restrict INSERT/DELETE to admins/supervisors
DROP POLICY IF EXISTS "Authenticated users can add to blacklist" ON public.talkx_blacklist;
CREATE POLICY "Admins can add to blacklist"
ON public.talkx_blacklist FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can remove from blacklist" ON public.talkx_blacklist;
CREATE POLICY "Admins can remove from blacklist"
ON public.talkx_blacklist FOR DELETE TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- ===================== conversation_events =====================
-- Restrict INSERT to service/admin (events are system-generated)
DROP POLICY IF EXISTS "Server can insert conversation events" ON public.conversation_events;
CREATE POLICY "Admins can insert conversation events"
ON public.conversation_events FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_supervisor(auth.uid()));