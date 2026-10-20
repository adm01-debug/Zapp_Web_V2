
-- Fix: chatbot_executions SELECT - restrict to assigned contacts or admin
DROP POLICY IF EXISTS "Authenticated can view chatbot executions" ON public.chatbot_executions;
CREATE POLICY "Authenticated can view chatbot executions" ON public.chatbot_executions
  FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM contacts c 
      WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())
    )
    OR is_admin_or_supervisor(auth.uid())
  );

-- Fix: message_reactions SELECT - restrict to own messages' reactions or admin
DROP POLICY IF EXISTS "Users can view reactions on accessible messages" ON public.message_reactions;
CREATE POLICY "Users can view reactions on accessible messages" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (
    message_id IN (
      SELECT m.id FROM messages m 
      WHERE m.contact_id IN (
        SELECT c.id FROM contacts c 
        WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())
      )
    )
    OR is_admin_or_supervisor(auth.uid())
  );

-- Fix: ai_conversation_tags SELECT - restrict to assigned contacts or admin
DROP POLICY IF EXISTS "Authenticated can view ai tags" ON public.ai_conversation_tags;
CREATE POLICY "Authenticated can view ai tags" ON public.ai_conversation_tags
  FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM contacts c 
      WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())
    )
    OR is_admin_or_supervisor(auth.uid())
  );

-- Fix: deal_activities SELECT - restrict to admin/supervisor
DROP POLICY IF EXISTS "Authenticated can view deal activities" ON public.deal_activities;
CREATE POLICY "Admins can view deal activities" ON public.deal_activities
  FOR SELECT TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- Fix: meta_capi_events SELECT - restrict to admin/supervisor
DROP POLICY IF EXISTS "Authenticated can view capi events" ON public.meta_capi_events;
CREATE POLICY "Admins can view capi events" ON public.meta_capi_events
  FOR SELECT TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- Fix: campaign_contacts SELECT - restrict to admin/supervisor
DROP POLICY IF EXISTS "Authenticated can view campaign contacts" ON public.campaign_contacts;
CREATE POLICY "Admins can view campaign contacts" ON public.campaign_contacts
  FOR SELECT TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- Fix: followup_executions SELECT - restrict to assigned contacts or admin
DROP POLICY IF EXISTS "Authenticated can view followup executions" ON public.followup_executions;
CREATE POLICY "Authenticated can view followup executions" ON public.followup_executions
  FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM contacts c 
      WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())
    )
    OR is_admin_or_supervisor(auth.uid())
  );

-- Fix: scheduled_report_configs SELECT - restrict to admin/supervisor
DROP POLICY IF EXISTS "Authenticated users can read report configs" ON public.scheduled_report_configs;
CREATE POLICY "Admins can read report configs" ON public.scheduled_report_configs
  FOR SELECT TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
