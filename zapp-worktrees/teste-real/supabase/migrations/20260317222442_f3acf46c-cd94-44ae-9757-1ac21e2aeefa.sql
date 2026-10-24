
-- =====================================================
-- PHASE 2: Harden remaining permissive RLS policies
-- Restrict management tables to admin/supervisor
-- =====================================================

-- 1. sales_pipeline_stages - config table, admin only for writes
DROP POLICY IF EXISTS "Authenticated users can manage pipeline stages" ON public.sales_pipeline_stages;
CREATE POLICY "Admins can manage pipeline stages" ON public.sales_pipeline_stages
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- Keep read access for all authenticated
CREATE POLICY "Authenticated can view pipeline stages" ON public.sales_pipeline_stages
  FOR SELECT TO authenticated
  USING (true);

-- 2. knowledge_base_articles - admin/supervisor manage
DROP POLICY IF EXISTS "Authenticated users can manage knowledge base" ON public.knowledge_base_articles;
CREATE POLICY "Admins can manage knowledge base" ON public.knowledge_base_articles
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated can view knowledge base" ON public.knowledge_base_articles
  FOR SELECT TO authenticated
  USING (is_published = true OR public.is_admin_or_supervisor(auth.uid()));

-- 3. knowledge_base_files
DROP POLICY IF EXISTS "Authenticated users can manage kb files" ON public.knowledge_base_files;
CREATE POLICY "Admins can manage kb files" ON public.knowledge_base_files
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated can view kb files" ON public.knowledge_base_files
  FOR SELECT TO authenticated
  USING (true);

-- 4. followup_sequences - automation config, admin only
DROP POLICY IF EXISTS "Authenticated users can manage followup_sequences" ON public.followup_sequences;
CREATE POLICY "Admins can manage followup sequences" ON public.followup_sequences
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated can view followup sequences" ON public.followup_sequences
  FOR SELECT TO authenticated
  USING (true);

-- 5. followup_steps
DROP POLICY IF EXISTS "Authenticated users can manage followup_steps" ON public.followup_steps;
CREATE POLICY "Admins can manage followup steps" ON public.followup_steps
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated can view followup steps" ON public.followup_steps
  FOR SELECT TO authenticated
  USING (true);

-- 6. whatsapp_flows - config table
DROP POLICY IF EXISTS "Authenticated users can manage whatsapp flows" ON public.whatsapp_flows;
CREATE POLICY "Admins can manage whatsapp flows" ON public.whatsapp_flows
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated can view whatsapp flows" ON public.whatsapp_flows
  FOR SELECT TO authenticated
  USING (true);

-- 7. chatbot_executions - system managed, restrict writes
DROP POLICY IF EXISTS "System can manage chatbot executions" ON public.chatbot_executions;
CREATE POLICY "Admins can manage chatbot executions" ON public.chatbot_executions
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- 8. meta_capi_events - restrict management
DROP POLICY IF EXISTS "Authenticated users can manage capi events" ON public.meta_capi_events;
CREATE POLICY "Admins can manage capi events" ON public.meta_capi_events
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated can view capi events" ON public.meta_capi_events
  FOR SELECT TO authenticated
  USING (true);

-- 9. contact_custom_fields - restrict UPDATE/DELETE but keep INSERT open
DROP POLICY IF EXISTS "Authenticated can update custom fields" ON public.contact_custom_fields;
CREATE POLICY "Authenticated can update own custom fields" ON public.contact_custom_fields
  FOR UPDATE TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM contacts c
      WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    ) OR public.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated can delete custom fields" ON public.contact_custom_fields;
CREATE POLICY "Authenticated can delete own custom fields" ON public.contact_custom_fields
  FOR DELETE TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM contacts c
      WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    ) OR public.is_admin_or_supervisor(auth.uid())
  );

-- 10. contact_tags - restrict ALL to specific operations
DROP POLICY IF EXISTS "Authenticated users can manage contact tags" ON public.contact_tags;
CREATE POLICY "Authenticated can insert contact tags" ON public.contact_tags
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete contact tags" ON public.contact_tags
  FOR DELETE TO authenticated
  USING (true);

-- 11. deal_activities - restrict to own deals or admin
DROP POLICY IF EXISTS "Authenticated users can manage deal activities" ON public.deal_activities;
CREATE POLICY "Authenticated can insert deal activities" ON public.deal_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    performed_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

CREATE POLICY "Authenticated can view deal activities" ON public.deal_activities
  FOR SELECT TO authenticated
  USING (true);

-- 12. warroom_alerts - system table, restrict updates to admin
DROP POLICY IF EXISTS "Authenticated can update alerts" ON public.warroom_alerts;
CREATE POLICY "Admins can update alerts" ON public.warroom_alerts
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 13. conversation_sla - restrict updates to admin
DROP POLICY IF EXISTS "Authenticated users can update SLA" ON public.conversation_sla;
CREATE POLICY "Admins can update SLA" ON public.conversation_sla
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 14. whisper_messages - restrict to own messages or admin
DROP POLICY IF EXISTS "Authenticated users can manage whisper_messages" ON public.whisper_messages;
CREATE POLICY "Authenticated can insert whisper messages" ON public.whisper_messages
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can view whisper messages" ON public.whisper_messages
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can delete own whisper messages" ON public.whisper_messages
  FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 15. payment_links - restrict management
DROP POLICY IF EXISTS "Authenticated users can manage payment links" ON public.payment_links;
CREATE POLICY "Authenticated can insert payment links" ON public.payment_links
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

CREATE POLICY "Authenticated can view payment links" ON public.payment_links
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can update own payment links" ON public.payment_links
  FOR UPDATE TO authenticated
  USING (
    created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

CREATE POLICY "Admins can delete payment links" ON public.payment_links
  FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 16. queue_positions - system managed
DROP POLICY IF EXISTS "Authenticated users can manage queue_positions" ON public.queue_positions;
CREATE POLICY "Admins can manage queue positions" ON public.queue_positions
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated can view queue positions" ON public.queue_positions
  FOR SELECT TO authenticated
  USING (true);

-- 17. sales_deals - restrict writes, keep reads open
DROP POLICY IF EXISTS "Authenticated users can manage deals" ON public.sales_deals;
CREATE POLICY "Authenticated can insert deals" ON public.sales_deals
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update assigned deals" ON public.sales_deals
  FOR UPDATE TO authenticated
  USING (
    assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

CREATE POLICY "Admins can delete deals" ON public.sales_deals
  FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 18. followup_executions - system managed
DROP POLICY IF EXISTS "Authenticated users can manage followup_executions" ON public.followup_executions;
CREATE POLICY "Admins can manage followup executions" ON public.followup_executions
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated can view followup executions" ON public.followup_executions
  FOR SELECT TO authenticated
  USING (true);
