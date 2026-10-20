-- ============================================
-- 1. contact_purchases — scope to assigned agents + admins
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can manage purchases" ON public.contact_purchases;

CREATE POLICY "Agents can view purchases for assigned contacts"
ON public.contact_purchases FOR SELECT TO authenticated
USING (
  is_contact_visible_to_user(contact_id, auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

CREATE POLICY "Agents can insert purchases for assigned contacts"
ON public.contact_purchases FOR INSERT TO authenticated
WITH CHECK (
  is_contact_visible_to_user(contact_id, auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

CREATE POLICY "Agents can update purchases for assigned contacts"
ON public.contact_purchases FOR UPDATE TO authenticated
USING (
  is_contact_visible_to_user(contact_id, auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

CREATE POLICY "Agents can delete purchases for assigned contacts"
ON public.contact_purchases FOR DELETE TO authenticated
USING (
  is_contact_visible_to_user(contact_id, auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

-- ============================================
-- 2. training_sessions — scope to own sessions + admins
-- ============================================
DROP POLICY IF EXISTS "Users can manage own training" ON public.training_sessions;

CREATE POLICY "Users can view own training sessions"
ON public.training_sessions FOR SELECT TO authenticated
USING (
  profile_id = get_profile_id_for_user(auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

CREATE POLICY "Users can insert own training sessions"
ON public.training_sessions FOR INSERT TO authenticated
WITH CHECK (
  profile_id = get_profile_id_for_user(auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

CREATE POLICY "Users can update own training sessions"
ON public.training_sessions FOR UPDATE TO authenticated
USING (
  profile_id = get_profile_id_for_user(auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

CREATE POLICY "Users can delete own training sessions"
ON public.training_sessions FOR DELETE TO authenticated
USING (
  profile_id = get_profile_id_for_user(auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

-- ============================================
-- 3. crisis_room_alerts — read all, write admin only
-- ============================================
DROP POLICY IF EXISTS "Authenticated can manage crisis alerts" ON public.crisis_room_alerts;
DROP POLICY IF EXISTS "Authenticated can view crisis alerts" ON public.crisis_room_alerts;

CREATE POLICY "Authenticated can view crisis alerts"
ON public.crisis_room_alerts FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert crisis alerts"
ON public.crisis_room_alerts FOR INSERT TO authenticated
WITH CHECK (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admins can update crisis alerts"
ON public.crisis_room_alerts FOR UPDATE TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admins can delete crisis alerts"
ON public.crisis_room_alerts FOR DELETE TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

-- ============================================
-- 4. campaign_ab_variants — scope to campaign owners + admins
-- ============================================
DROP POLICY IF EXISTS "Authenticated can manage AB variants" ON public.campaign_ab_variants;

CREATE POLICY "Authenticated can view AB variants"
ON public.campaign_ab_variants FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Campaign owners or admins can insert AB variants"
ON public.campaign_ab_variants FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_id
    AND (c.created_by = get_profile_id_for_user(auth.uid()) OR is_admin_or_supervisor(auth.uid()))
  )
);

CREATE POLICY "Campaign owners or admins can update AB variants"
ON public.campaign_ab_variants FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_id
    AND (c.created_by = get_profile_id_for_user(auth.uid()) OR is_admin_or_supervisor(auth.uid()))
  )
);

CREATE POLICY "Campaign owners or admins can delete AB variants"
ON public.campaign_ab_variants FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_id
    AND (c.created_by = get_profile_id_for_user(auth.uid()) OR is_admin_or_supervisor(auth.uid()))
  )
);

-- ============================================
-- 5. conversation_memory — restrict SELECT
-- ============================================
DROP POLICY IF EXISTS "Authenticated can view memory" ON public.conversation_memory;

CREATE POLICY "Agents or admins can view memory"
ON public.conversation_memory FOR SELECT TO authenticated
USING (
  is_contact_visible_to_user(contact_id, auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

-- ============================================
-- 6. conversation_closures — restrict SELECT
-- ============================================
DROP POLICY IF EXISTS "Authenticated can view closures" ON public.conversation_closures;

CREATE POLICY "Agents or admins can view closures"
ON public.conversation_closures FOR SELECT TO authenticated
USING (
  is_contact_visible_to_user(contact_id, auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

-- ============================================
-- 7. conversation_tasks — restrict SELECT
-- ============================================
DROP POLICY IF EXISTS "Authenticated can view tasks" ON public.conversation_tasks;

CREATE POLICY "Agents or admins can view tasks"
ON public.conversation_tasks FOR SELECT TO authenticated
USING (
  is_contact_visible_to_user(contact_id, auth.uid())
  OR assigned_to = get_profile_id_for_user(auth.uid())
  OR created_by = get_profile_id_for_user(auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

-- ============================================
-- 8. conversation_events — restrict SELECT
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view conversation events" ON public.conversation_events;

CREATE POLICY "Agents or admins can view conversation events"
ON public.conversation_events FOR SELECT TO authenticated
USING (
  is_contact_visible_to_user(contact_id, auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

-- ============================================
-- 9. followup_sequences — restrict SELECT to admins
-- ============================================
DROP POLICY IF EXISTS "Authenticated can view followup sequences" ON public.followup_sequences;

CREATE POLICY "Admins can view followup sequences"
ON public.followup_sequences FOR SELECT TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

-- ============================================
-- 10. followup_steps — restrict SELECT to admins
-- ============================================
DROP POLICY IF EXISTS "Authenticated can view followup steps" ON public.followup_steps;

CREATE POLICY "Admins can view followup steps"
ON public.followup_steps FOR SELECT TO authenticated
USING (is_admin_or_supervisor(auth.uid()));