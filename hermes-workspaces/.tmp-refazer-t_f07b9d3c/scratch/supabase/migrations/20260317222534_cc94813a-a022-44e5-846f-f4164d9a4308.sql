
-- =====================================================
-- PHASE 3: Fix remaining ALL policies and tighten INSERTs where possible
-- =====================================================

-- 1. ai_conversation_tags - restrict management to admin
DROP POLICY IF EXISTS "Authenticated users can manage ai_conversation_tags" ON public.ai_conversation_tags;
CREATE POLICY "Authenticated can insert ai tags" ON public.ai_conversation_tags
  FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "Authenticated can view ai tags" ON public.ai_conversation_tags
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Admins can update ai tags" ON public.ai_conversation_tags
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can delete ai tags" ON public.ai_conversation_tags
  FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 2. contact_tags - fix DELETE with true
DROP POLICY IF EXISTS "Authenticated can delete contact tags" ON public.contact_tags;
CREATE POLICY "Authenticated can delete contact tags" ON public.contact_tags
  FOR DELETE TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM contacts c
      WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    ) OR public.is_admin_or_supervisor(auth.uid())
  );

-- 3. campaigns - restrict INSERT to admin/supervisor
DROP POLICY IF EXISTS "Authenticated can insert campaigns" ON public.campaigns;
CREATE POLICY "Admins can insert campaigns" ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- 4. chatbot_flows - restrict INSERT to admin/supervisor
DROP POLICY IF EXISTS "Authenticated can insert chatbot flows" ON public.chatbot_flows;
CREATE POLICY "Admins can insert chatbot flows" ON public.chatbot_flows
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- 5. campaign_contacts - restrict to admin
DROP POLICY IF EXISTS "Authenticated can insert campaign contacts" ON public.campaign_contacts;
CREATE POLICY "Admins can insert campaign contacts" ON public.campaign_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- 6. whatsapp_templates - restrict to admin
DROP POLICY IF EXISTS "Authenticated can insert templates" ON public.whatsapp_templates;
CREATE POLICY "Admins can insert templates" ON public.whatsapp_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- 7. scheduled_reports - restrict to admin
DROP POLICY IF EXISTS "Authenticated can insert scheduled reports" ON public.scheduled_reports;
CREATE POLICY "Admins can insert scheduled reports" ON public.scheduled_reports
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- 8. warroom_alerts - restrict system insert to admin
DROP POLICY IF EXISTS "System can insert alerts" ON public.warroom_alerts;
CREATE POLICY "Admins can insert alerts" ON public.warroom_alerts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- 9. rate_limit_logs - restrict to admin
DROP POLICY IF EXISTS "Authenticated can insert rate limit logs" ON public.rate_limit_logs;
CREATE POLICY "Admins can insert rate limit logs" ON public.rate_limit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- 10. agent_achievements - restrict insert to profile owner or admin
DROP POLICY IF EXISTS "Authenticated can insert achievements" ON public.agent_achievements;
CREATE POLICY "Users can insert own achievements" ON public.agent_achievements
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- 11. agent_stats - restrict insert to profile owner or admin
DROP POLICY IF EXISTS "Authenticated can insert stats" ON public.agent_stats;
CREATE POLICY "Users can insert own stats" ON public.agent_stats
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- 12. calls - restrict to agent who made the call
DROP POLICY IF EXISTS "Users can insert calls" ON public.calls;
CREATE POLICY "Users can insert calls" ON public.calls
  FOR INSERT TO authenticated
  WITH CHECK (
    agent_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- 13. entity_versions - restrict to admin
DROP POLICY IF EXISTS "Authenticated can insert versions" ON public.entity_versions;
CREATE POLICY "Authenticated can insert versions" ON public.entity_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    changed_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );
