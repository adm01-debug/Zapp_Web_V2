-- ============================================================
-- BLOCO 14 — POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- Gerado em: 2026-05-12 11:08:24.993105+00
-- Schema: public
-- Aplicar: psql "$DESTINO_URL" -f BLOCO_14_rls_policies.sql
-- ============================================================
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'automations' 
        AND policyname = 'Admin/supervisor can create automations'
    ) THEN
        CREATE POLICY "Admin/supervisor can create automations" ON public.automations
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'automations' 
        AND policyname = 'Admin/supervisor can delete automations'
    ) THEN
        CREATE POLICY "Admin/supervisor can delete automations" ON public.automations
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'automations' 
        AND policyname = 'Admin/supervisor can update automations'
    ) THEN
        CREATE POLICY "Admin/supervisor can update automations" ON public.automations
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'automations' 
        AND policyname = 'Automations visible to admins only'
    ) THEN
        CREATE POLICY "Automations visible to admins only" ON public.automations
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'reminders' 
        AND policyname = 'Users can manage own reminders'
    ) THEN
        CREATE POLICY "Users can manage own reminders" ON public.reminders
        FOR ALL
        TO authenticated
        USING ((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'role_permissions' 
        AND policyname = 'Admins can manage role permissions'
    ) THEN
        CREATE POLICY "Admins can manage role permissions" ON public.role_permissions
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'role_permissions' 
        AND policyname = 'Authenticated can view role permissions'
    ) THEN
        CREATE POLICY "Authenticated can view role permissions" ON public.role_permissions
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_roles' 
        AND policyname = 'Only admins can manage roles'
    ) THEN
        CREATE POLICY "Only admins can manage roles" ON public.user_roles
        FOR ALL
        TO authenticated
        USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_roles' 
        AND policyname = 'Users view own roles, admins view all'
    ) THEN
        CREATE POLICY "Users view own roles, admins view all" ON public.user_roles
        FOR SELECT
        TO authenticated
        USING (((user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_service_accounts' 
        AND policyname = 'Admins can view all service accounts'
    ) THEN
        CREATE POLICY "Admins can view all service accounts" ON public.user_service_accounts
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_service_accounts' 
        AND policyname = 'Only admins can delete service accounts'
    ) THEN
        CREATE POLICY "Only admins can delete service accounts" ON public.user_service_accounts
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_service_accounts' 
        AND policyname = 'Only admins can insert service accounts'
    ) THEN
        CREATE POLICY "Only admins can insert service accounts" ON public.user_service_accounts
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_service_accounts' 
        AND policyname = 'Only admins can update service accounts'
    ) THEN
        CREATE POLICY "Only admins can update service accounts" ON public.user_service_accounts
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_service_accounts' 
        AND policyname = 'Users can view own service accounts'
    ) THEN
        CREATE POLICY "Users can view own service accounts" ON public.user_service_accounts
        FOR SELECT
        TO authenticated
        USING ((auth.uid() = user_id));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'warroom_alerts' 
        AND policyname = 'Admins can delete warroom alerts'
    ) THEN
        CREATE POLICY "Admins can delete warroom alerts" ON public.warroom_alerts
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'warroom_alerts' 
        AND policyname = 'Admins can insert alerts'
    ) THEN
        CREATE POLICY "Admins can insert alerts" ON public.warroom_alerts
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'warroom_alerts' 
        AND policyname = 'Admins can update alerts'
    ) THEN
        CREATE POLICY "Admins can update alerts" ON public.warroom_alerts
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'warroom_alerts' 
        AND policyname = 'Admins can view warroom alerts'
    ) THEN
        CREATE POLICY "Admins can view warroom alerts" ON public.warroom_alerts
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'deal_activities' 
        AND policyname = 'Admins can view deal activities'
    ) THEN
        CREATE POLICY "Admins can view deal activities" ON public.deal_activities
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'deal_activities' 
        AND policyname = 'Agents can view activities on their deals'
    ) THEN
        CREATE POLICY "Agents can view activities on their deals" ON public.deal_activities
        FOR SELECT
        TO authenticated
        USING ((is_admin_or_supervisor(auth.uid()) OR (performed_by = get_profile_id_for_user(auth.uid())) OR (deal_id IN ( SELECT sd.id
   FROM sales_deals sd
  WHERE (sd.assigned_to = get_profile_id_for_user(auth.uid()))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'deal_activities' 
        AND policyname = 'Authenticated can insert deal activities'
    ) THEN
        CREATE POLICY "Authenticated can insert deal activities" ON public.deal_activities
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((performed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'email_labels' 
        AND policyname = 'Users can manage labels of own accounts'
    ) THEN
        CREATE POLICY "Users can manage labels of own accounts" ON public.email_labels
        FOR ALL
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_labels.gmail_account_id) AND (ga.user_id = auth.uid())))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'email_labels' 
        AND policyname = 'Users can view labels of own accounts'
    ) THEN
        CREATE POLICY "Users can view labels of own accounts" ON public.email_labels
        FOR SELECT
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_labels.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whatsapp_connection_queues' 
        AND policyname = 'Admins can manage connection queues'
    ) THEN
        CREATE POLICY "Admins can manage connection queues" ON public.whatsapp_connection_queues
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whatsapp_connection_queues' 
        AND policyname = 'Authenticated can view connection queues'
    ) THEN
        CREATE POLICY "Authenticated can view connection queues" ON public.whatsapp_connection_queues
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'login_attempts' 
        AND policyname = 'Block authenticated inserts on login_attempts'
    ) THEN
        CREATE POLICY "Block authenticated inserts on login_attempts" ON public.login_attempts
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (false);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'login_attempts' 
        AND policyname = 'Block authenticated updates on login_attempts'
    ) THEN
        CREATE POLICY "Block authenticated updates on login_attempts" ON public.login_attempts
        FOR UPDATE
        TO authenticated
        USING (false);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'login_attempts' 
        AND policyname = 'Only admins can delete login attempts'
    ) THEN
        CREATE POLICY "Only admins can delete login attempts" ON public.login_attempts
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'login_attempts' 
        AND policyname = 'Only admins can view login attempts'
    ) THEN
        CREATE POLICY "Only admins can view login attempts" ON public.login_attempts
        FOR SELECT
        TO authenticated
        USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_snoozes' 
        AND policyname = 'Users can create own snoozes'
    ) THEN
        CREATE POLICY "Users can create own snoozes" ON public.conversation_snoozes
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((snoozed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_snoozes' 
        AND policyname = 'Users can delete own snoozes'
    ) THEN
        CREATE POLICY "Users can delete own snoozes" ON public.conversation_snoozes
        FOR DELETE
        TO authenticated
        USING ((snoozed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_snoozes' 
        AND policyname = 'Users can view own snoozes'
    ) THEN
        CREATE POLICY "Users can view own snoozes" ON public.conversation_snoozes
        FOR SELECT
        TO authenticated
        USING ((snoozed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'messages' 
        AND policyname = 'Users can insert messages'
    ) THEN
        CREATE POLICY "Users can insert messages" ON public.messages
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((agent_id IS NULL) OR (agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'messages' 
        AND policyname = 'Users can update messages from their assigned contacts'
    ) THEN
        CREATE POLICY "Users can update messages from their assigned contacts" ON public.messages
        FOR UPDATE
        TO authenticated
        USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'messages' 
        AND policyname = 'Users can view messages from their assigned contacts'
    ) THEN
        CREATE POLICY "Users can view messages from their assigned contacts" ON public.messages
        FOR SELECT
        TO authenticated
        USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'messages' 
        AND policyname = 'messages_select_policy'
    ) THEN
        CREATE POLICY messages_select_policy ON public.messages
        FOR SELECT
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM contacts c
  WHERE ((c.id = messages.contact_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_memory' 
        AND policyname = 'Agents can insert memory for their contacts'
    ) THEN
        CREATE POLICY "Agents can insert memory for their contacts" ON public.conversation_memory
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_contact_visible_to_user(contact_id, auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_memory' 
        AND policyname = 'Agents can update memory for their contacts'
    ) THEN
        CREATE POLICY "Agents can update memory for their contacts" ON public.conversation_memory
        FOR UPDATE
        TO authenticated
        USING (is_contact_visible_to_user(contact_id, auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_memory' 
        AND policyname = 'Agents or admins can view memory'
    ) THEN
        CREATE POLICY "Agents or admins can view memory" ON public.conversation_memory
        FOR SELECT
        TO authenticated
        USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_sla' 
        AND policyname = 'Admins can insert SLA'
    ) THEN
        CREATE POLICY "Admins can insert SLA" ON public.conversation_sla
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_sla' 
        AND policyname = 'Admins can update SLA'
    ) THEN
        CREATE POLICY "Admins can update SLA" ON public.conversation_sla
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_sla' 
        AND policyname = 'Authenticated users can view SLA data'
    ) THEN
        CREATE POLICY "Authenticated users can view SLA data" ON public.conversation_sla
        FOR SELECT
        TO authenticated
        USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'performance_snapshots' 
        AND policyname = 'Admins can delete performance snapshots'
    ) THEN
        CREATE POLICY "Admins can delete performance snapshots" ON public.performance_snapshots
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'performance_snapshots' 
        AND policyname = 'Admins can view all performance snapshots'
    ) THEN
        CREATE POLICY "Admins can view all performance snapshots" ON public.performance_snapshots
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'performance_snapshots' 
        AND policyname = 'Users can insert own performance snapshots'
    ) THEN
        CREATE POLICY "Users can insert own performance snapshots" ON public.performance_snapshots
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((profile_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'performance_snapshots' 
        AND policyname = 'Users can view own performance snapshots'
    ) THEN
        CREATE POLICY "Users can view own performance snapshots" ON public.performance_snapshots
        FOR SELECT
        TO authenticated
        USING ((profile_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'permissions' 
        AND policyname = 'Admins can manage permissions'
    ) THEN
        CREATE POLICY "Admins can manage permissions" ON public.permissions
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'permissions' 
        AND policyname = 'Authenticated can view permissions'
    ) THEN
        CREATE POLICY "Authenticated can view permissions" ON public.permissions
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'nps_surveys' 
        AND policyname = 'Admins and own agents can view NPS surveys'
    ) THEN
        CREATE POLICY "Admins and own agents can view NPS surveys" ON public.nps_surveys
        FOR SELECT
        TO authenticated
        USING ((is_admin_or_supervisor(auth.uid()) OR (agent_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'nps_surveys' 
        AND policyname = 'Admins can delete NPS surveys'
    ) THEN
        CREATE POLICY "Admins can delete NPS surveys" ON public.nps_surveys
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'nps_surveys' 
        AND policyname = 'Admins can update NPS surveys'
    ) THEN
        CREATE POLICY "Admins can update NPS surveys" ON public.nps_surveys
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'nps_surveys' 
        AND policyname = 'Users can create own NPS surveys'
    ) THEN
        CREATE POLICY "Users can create own NPS surveys" ON public.nps_surveys
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((agent_id IS NOT NULL) AND (agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'csat_surveys' 
        AND policyname = 'Users can insert CSAT surveys'
    ) THEN
        CREATE POLICY "Users can insert CSAT surveys" ON public.csat_surveys
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((agent_id IS NULL) OR (agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'csat_surveys' 
        AND policyname = 'Users can view own CSAT surveys'
    ) THEN
        CREATE POLICY "Users can view own CSAT surveys" ON public.csat_surveys
        FOR SELECT
        TO authenticated
        USING (((agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'talkx_blacklist' 
        AND policyname = 'Admins can add to blacklist'
    ) THEN
        CREATE POLICY "Admins can add to blacklist" ON public.talkx_blacklist
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'talkx_blacklist' 
        AND policyname = 'Admins can remove from blacklist'
    ) THEN
        CREATE POLICY "Admins can remove from blacklist" ON public.talkx_blacklist
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'talkx_blacklist' 
        AND policyname = 'Only admins can view blacklist'
    ) THEN
        CREATE POLICY "Only admins can view blacklist" ON public.talkx_blacklist
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'agent_skills' 
        AND policyname = 'Admins can manage skills'
    ) THEN
        CREATE POLICY "Admins can manage skills" ON public.agent_skills
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'agent_skills' 
        AND policyname = 'Users can view own or admin all skills'
    ) THEN
        CREATE POLICY "Users can view own or admin all skills" ON public.agent_skills
        FOR SELECT
        TO authenticated
        USING (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whatsapp_connections' 
        AND policyname = 'Admin supervisor view connections'
    ) THEN
        CREATE POLICY "Admin supervisor view connections" ON public.whatsapp_connections
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whatsapp_connections' 
        AND policyname = 'Admins can delete connections'
    ) THEN
        CREATE POLICY "Admins can delete connections" ON public.whatsapp_connections
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whatsapp_connections' 
        AND policyname = 'Admins can insert connections'
    ) THEN
        CREATE POLICY "Admins can insert connections" ON public.whatsapp_connections
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whatsapp_connections' 
        AND policyname = 'Admins can update connections'
    ) THEN
        CREATE POLICY "Admins can update connections" ON public.whatsapp_connections
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'scheduled_reports' 
        AND policyname = 'Admins can insert scheduled reports'
    ) THEN
        CREATE POLICY "Admins can insert scheduled reports" ON public.scheduled_reports
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'scheduled_reports' 
        AND policyname = 'Admins can manage scheduled reports'
    ) THEN
        CREATE POLICY "Admins can manage scheduled reports" ON public.scheduled_reports
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'scheduled_reports' 
        AND policyname = 'Admins can view scheduled reports'
    ) THEN
        CREATE POLICY "Admins can view scheduled reports" ON public.scheduled_reports
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'crisis_room_alerts' 
        AND policyname = 'Admins can delete crisis alerts'
    ) THEN
        CREATE POLICY "Admins can delete crisis alerts" ON public.crisis_room_alerts
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'crisis_room_alerts' 
        AND policyname = 'Admins can insert crisis alerts'
    ) THEN
        CREATE POLICY "Admins can insert crisis alerts" ON public.crisis_room_alerts
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'crisis_room_alerts' 
        AND policyname = 'Admins can update crisis alerts'
    ) THEN
        CREATE POLICY "Admins can update crisis alerts" ON public.crisis_room_alerts
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'crisis_room_alerts' 
        AND policyname = 'Authenticated can view crisis alerts'
    ) THEN
        CREATE POLICY "Authenticated can view crisis alerts" ON public.crisis_room_alerts
        FOR SELECT
        TO authenticated
        USING ((auth.uid() IS NOT NULL));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whisper_messages' 
        AND policyname = 'Users can delete own whisper messages'
    ) THEN
        CREATE POLICY "Users can delete own whisper messages" ON public.whisper_messages
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whisper_messages' 
        AND policyname = 'Users can insert own whisper messages'
    ) THEN
        CREATE POLICY "Users can insert own whisper messages" ON public.whisper_messages
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((sender_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whisper_messages' 
        AND policyname = 'Users can view own whisper messages'
    ) THEN
        CREATE POLICY "Users can view own whisper messages" ON public.whisper_messages
        FOR SELECT
        TO authenticated
        USING (((sender_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR (target_agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_purchases' 
        AND policyname = 'Agents can delete purchases for assigned contacts'
    ) THEN
        CREATE POLICY "Agents can delete purchases for assigned contacts" ON public.contact_purchases
        FOR DELETE
        TO authenticated
        USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_purchases' 
        AND policyname = 'Agents can insert purchases for assigned contacts'
    ) THEN
        CREATE POLICY "Agents can insert purchases for assigned contacts" ON public.contact_purchases
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_purchases' 
        AND policyname = 'Agents can update purchases for assigned contacts'
    ) THEN
        CREATE POLICY "Agents can update purchases for assigned contacts" ON public.contact_purchases
        FOR UPDATE
        TO authenticated
        USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_purchases' 
        AND policyname = 'Agents can view purchases for assigned contacts'
    ) THEN
        CREATE POLICY "Agents can view purchases for assigned contacts" ON public.contact_purchases
        FOR SELECT
        TO authenticated
        USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_tags' 
        AND policyname = 'Authenticated can delete contact tags'
    ) THEN
        CREATE POLICY "Authenticated can delete contact tags" ON public.contact_tags
        FOR DELETE
        TO authenticated
        USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_tags' 
        AND policyname = 'Users can insert tags for assigned contacts'
    ) THEN
        CREATE POLICY "Users can insert tags for assigned contacts" ON public.contact_tags
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_tags' 
        AND policyname = 'Users can view contact tags'
    ) THEN
        CREATE POLICY "Users can view contact tags" ON public.contact_tags
        FOR SELECT
        TO authenticated
        USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whatsapp_flows' 
        AND policyname = 'Admins can manage whatsapp flows'
    ) THEN
        CREATE POLICY "Admins can manage whatsapp flows" ON public.whatsapp_flows
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whatsapp_flows' 
        AND policyname = 'Authenticated can view whatsapp flows'
    ) THEN
        CREATE POLICY "Authenticated can view whatsapp flows" ON public.whatsapp_flows
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'meta_capi_events' 
        AND policyname = 'Admins can manage capi events'
    ) THEN
        CREATE POLICY "Admins can manage capi events" ON public.meta_capi_events
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'meta_capi_events' 
        AND policyname = 'Admins can view capi events'
    ) THEN
        CREATE POLICY "Admins can view capi events" ON public.meta_capi_events
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'custom_emojis' 
        AND policyname = 'Authenticated users can insert custom emojis'
    ) THEN
        CREATE POLICY "Authenticated users can insert custom emojis" ON public.custom_emojis
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((uploaded_by = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'custom_emojis' 
        AND policyname = 'Authenticated users can update custom emojis'
    ) THEN
        CREATE POLICY "Authenticated users can update custom emojis" ON public.custom_emojis
        FOR UPDATE
        TO authenticated
        USING (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()))) WITH CHECK (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'custom_emojis' 
        AND policyname = 'Authenticated users can view custom emojis'
    ) THEN
        CREATE POLICY "Authenticated users can view custom emojis" ON public.custom_emojis
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'custom_emojis' 
        AND policyname = 'Users can delete own or admin custom emojis'
    ) THEN
        CREATE POLICY "Users can delete own or admin custom emojis" ON public.custom_emojis
        FOR DELETE
        TO authenticated
        USING (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'calls' 
        AND policyname = 'Users can insert calls'
    ) THEN
        CREATE POLICY "Users can insert calls" ON public.calls
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'calls' 
        AND policyname = 'Users can update their calls'
    ) THEN
        CREATE POLICY "Users can update their calls" ON public.calls
        FOR UPDATE
        TO authenticated
        USING ((agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'calls' 
        AND policyname = 'Users can view own calls'
    ) THEN
        CREATE POLICY "Users can view own calls" ON public.calls
        FOR SELECT
        TO authenticated
        USING (((agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'favorite_contacts' 
        AND policyname = 'Users can manage own favorites'
    ) THEN
        CREATE POLICY "Users can manage own favorites" ON public.favorite_contacts
        FOR ALL
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'followup_steps' 
        AND policyname = 'Admins can manage followup steps'
    ) THEN
        CREATE POLICY "Admins can manage followup steps" ON public.followup_steps
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'followup_steps' 
        AND policyname = 'Admins can view followup steps'
    ) THEN
        CREATE POLICY "Admins can view followup steps" ON public.followup_steps
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'geo_blocking_settings' 
        AND policyname = 'Admins can manage geo settings'
    ) THEN
        CREATE POLICY "Admins can manage geo settings" ON public.geo_blocking_settings
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'geo_blocking_settings' 
        AND policyname = 'Geo blocking visible to admins only'
    ) THEN
        CREATE POLICY "Geo blocking visible to admins only" ON public.geo_blocking_settings
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'mfa_sessions' 
        AND policyname = 'Users can manage own MFA sessions'
    ) THEN
        CREATE POLICY "Users can manage own MFA sessions" ON public.mfa_sessions
        FOR ALL
        TO authenticated
        USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'pinned_conversations' 
        AND policyname = 'Users can manage own pins'
    ) THEN
        CREATE POLICY "Users can manage own pins" ON public.pinned_conversations
        FOR ALL
        TO authenticated
        USING ((pinned_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'playbooks' 
        AND policyname = 'Admins can delete playbooks'
    ) THEN
        CREATE POLICY "Admins can delete playbooks" ON public.playbooks
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'playbooks' 
        AND policyname = 'Admins can manage playbooks'
    ) THEN
        CREATE POLICY "Admins can manage playbooks" ON public.playbooks
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'playbooks' 
        AND policyname = 'Admins can update playbooks'
    ) THEN
        CREATE POLICY "Admins can update playbooks" ON public.playbooks
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'playbooks' 
        AND policyname = 'Authenticated can view playbooks'
    ) THEN
        CREATE POLICY "Authenticated can view playbooks" ON public.playbooks
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'email_threads' 
        AND policyname = 'Users can delete threads of own accounts'
    ) THEN
        CREATE POLICY "Users can delete threads of own accounts" ON public.email_threads
        FOR DELETE
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND (ga.user_id = auth.uid())))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'email_threads' 
        AND policyname = 'Users can insert threads for own accounts'
    ) THEN
        CREATE POLICY "Users can insert threads for own accounts" ON public.email_threads
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND (ga.user_id = auth.uid())))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'email_threads' 
        AND policyname = 'Users can update threads of own accounts'
    ) THEN
        CREATE POLICY "Users can update threads of own accounts" ON public.email_threads
        FOR UPDATE
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'email_threads' 
        AND policyname = 'Users can view threads of own accounts'
    ) THEN
        CREATE POLICY "Users can view threads of own accounts" ON public.email_threads
        FOR SELECT
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'entity_versions' 
        AND policyname = 'Admins can view entity versions'
    ) THEN
        CREATE POLICY "Admins can view entity versions" ON public.entity_versions
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'entity_versions' 
        AND policyname = 'Block authenticated version inserts'
    ) THEN
        CREATE POLICY "Block authenticated version inserts" ON public.entity_versions
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (false);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'global_settings' 
        AND policyname = 'Admins can manage global settings'
    ) THEN
        CREATE POLICY "Admins can manage global settings" ON public.global_settings
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'global_settings' 
        AND policyname = 'Admins can view global settings'
    ) THEN
        CREATE POLICY "Admins can view global settings" ON public.global_settings
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_events' 
        AND policyname = 'Agents or admins can view conversation events'
    ) THEN
        CREATE POLICY "Agents or admins can view conversation events" ON public.conversation_events
        FOR SELECT
        TO authenticated
        USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_events' 
        AND policyname = 'Authorized users can insert events'
    ) THEN
        CREATE POLICY "Authorized users can insert events" ON public.conversation_events
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((((performed_by IS NULL) OR (performed_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1))) AND (is_admin_or_supervisor(auth.uid()) OR (contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to = ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid())
         LIMIT 1)))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'scheduled_messages' 
        AND policyname = 'Users can create scheduled messages'
    ) THEN
        CREATE POLICY "Users can create scheduled messages" ON public.scheduled_messages
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'scheduled_messages' 
        AND policyname = 'Users can delete their scheduled messages'
    ) THEN
        CREATE POLICY "Users can delete their scheduled messages" ON public.scheduled_messages
        FOR DELETE
        TO authenticated
        USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'scheduled_messages' 
        AND policyname = 'Users can update their scheduled messages'
    ) THEN
        CREATE POLICY "Users can update their scheduled messages" ON public.scheduled_messages
        FOR UPDATE
        TO authenticated
        USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'scheduled_messages' 
        AND policyname = 'Users can view their scheduled messages'
    ) THEN
        CREATE POLICY "Users can view their scheduled messages" ON public.scheduled_messages
        FOR SELECT
        TO authenticated
        USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'scheduled_report_configs' 
        AND policyname = 'Admin/supervisor can delete report configs'
    ) THEN
        CREATE POLICY "Admin/supervisor can delete report configs" ON public.scheduled_report_configs
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'scheduled_report_configs' 
        AND policyname = 'Admin/supervisor can insert report configs'
    ) THEN
        CREATE POLICY "Admin/supervisor can insert report configs" ON public.scheduled_report_configs
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'scheduled_report_configs' 
        AND policyname = 'Admin/supervisor can update report configs'
    ) THEN
        CREATE POLICY "Admin/supervisor can update report configs" ON public.scheduled_report_configs
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'scheduled_report_configs' 
        AND policyname = 'Admins can read report configs'
    ) THEN
        CREATE POLICY "Admins can read report configs" ON public.scheduled_report_configs
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'webauthn_challenges' 
        AND policyname = 'Block anon access to webauthn challenges'
    ) THEN
        CREATE POLICY "Block anon access to webauthn challenges" ON public.webauthn_challenges
        FOR ALL
        TO anon
        USING (false) WITH CHECK (false);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'webauthn_challenges' 
        AND policyname = 'Users can manage own challenges'
    ) THEN
        CREATE POLICY "Users can manage own challenges" ON public.webauthn_challenges
        FOR ALL
        TO authenticated
        USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'webhook_rate_limits' 
        AND policyname = 'Admins can delete rate limits'
    ) THEN
        CREATE POLICY "Admins can delete rate limits" ON public.webhook_rate_limits
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'webhook_rate_limits' 
        AND policyname = 'Admins can insert rate limits'
    ) THEN
        CREATE POLICY "Admins can insert rate limits" ON public.webhook_rate_limits
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'webhook_rate_limits' 
        AND policyname = 'Admins can update rate limits'
    ) THEN
        CREATE POLICY "Admins can update rate limits" ON public.webhook_rate_limits
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'webhook_rate_limits' 
        AND policyname = 'Admins can view rate limits'
    ) THEN
        CREATE POLICY "Admins can view rate limits" ON public.webhook_rate_limits
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sales_pipeline_stages' 
        AND policyname = 'Admins can manage pipeline stages'
    ) THEN
        CREATE POLICY "Admins can manage pipeline stages" ON public.sales_pipeline_stages
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sales_pipeline_stages' 
        AND policyname = 'Authenticated can view pipeline stages'
    ) THEN
        CREATE POLICY "Authenticated can view pipeline stages" ON public.sales_pipeline_stages
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_custom_fields' 
        AND policyname = 'Authenticated can delete own custom fields'
    ) THEN
        CREATE POLICY "Authenticated can delete own custom fields" ON public.contact_custom_fields
        FOR DELETE
        TO authenticated
        USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_custom_fields' 
        AND policyname = 'Authenticated can update own custom fields'
    ) THEN
        CREATE POLICY "Authenticated can update own custom fields" ON public.contact_custom_fields
        FOR UPDATE
        TO authenticated
        USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_custom_fields' 
        AND policyname = 'Authenticated can view custom fields'
    ) THEN
        CREATE POLICY "Authenticated can view custom fields" ON public.contact_custom_fields
        FOR SELECT
        TO authenticated
        USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_custom_fields' 
        AND policyname = 'Users can insert custom fields for assigned contacts'
    ) THEN
        CREATE POLICY "Users can insert custom fields for assigned contacts" ON public.contact_custom_fields
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'campaign_contacts' 
        AND policyname = 'Admins can insert campaign contacts'
    ) THEN
        CREATE POLICY "Admins can insert campaign contacts" ON public.campaign_contacts
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'campaign_contacts' 
        AND policyname = 'Admins can manage campaign contacts'
    ) THEN
        CREATE POLICY "Admins can manage campaign contacts" ON public.campaign_contacts
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'campaign_contacts' 
        AND policyname = 'Admins can view campaign contacts'
    ) THEN
        CREATE POLICY "Admins can view campaign contacts" ON public.campaign_contacts
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'campaigns' 
        AND policyname = 'Admins can insert campaigns'
    ) THEN
        CREATE POLICY "Admins can insert campaigns" ON public.campaigns
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'campaigns' 
        AND policyname = 'Admins can manage campaigns'
    ) THEN
        CREATE POLICY "Admins can manage campaigns" ON public.campaigns
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'campaigns' 
        AND policyname = 'Campaigns visible to admins or creator'
    ) THEN
        CREATE POLICY "Campaigns visible to admins or creator" ON public.campaigns
        FOR SELECT
        TO authenticated
        USING ((is_admin_or_supervisor(auth.uid()) OR (created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_notes' 
        AND policyname = 'Authenticated users can insert notes'
    ) THEN
        CREATE POLICY "Authenticated users can insert notes" ON public.contact_notes
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((author_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_notes' 
        AND policyname = 'Users can delete their own notes'
    ) THEN
        CREATE POLICY "Users can delete their own notes" ON public.contact_notes
        FOR DELETE
        TO authenticated
        USING ((author_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_notes' 
        AND policyname = 'Users can update their own notes'
    ) THEN
        CREATE POLICY "Users can update their own notes" ON public.contact_notes
        FOR UPDATE
        TO authenticated
        USING ((author_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contact_notes' 
        AND policyname = 'Users can view notes on accessible contacts'
    ) THEN
        CREATE POLICY "Users can view notes on accessible contacts" ON public.contact_notes
        FOR SELECT
        TO authenticated
        USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'agent_achievements' 
        AND policyname = 'Users can insert own achievements'
    ) THEN
        CREATE POLICY "Users can insert own achievements" ON public.agent_achievements
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'agent_achievements' 
        AND policyname = 'Users can view own or admin all achievements'
    ) THEN
        CREATE POLICY "Users can view own or admin all achievements" ON public.agent_achievements
        FOR SELECT
        TO authenticated
        USING (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'team_conversation_members' 
        AND policyname = 'Admins can update conversation members'
    ) THEN
        CREATE POLICY "Admins can update conversation members" ON public.team_conversation_members
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'team_conversation_members' 
        AND policyname = 'Members and admins can add conversation members'
    ) THEN
        CREATE POLICY "Members and admins can add conversation members" ON public.team_conversation_members
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((is_team_conversation_member(auth.uid(), conversation_id) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'team_conversation_members' 
        AND policyname = 'Members and admins can view conversation members'
    ) THEN
        CREATE POLICY "Members and admins can view conversation members" ON public.team_conversation_members
        FOR SELECT
        TO authenticated
        USING ((is_team_conversation_member(auth.uid(), conversation_id) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'team_conversation_members' 
        AND policyname = 'Members can leave or admins can remove'
    ) THEN
        CREATE POLICY "Members can leave or admins can remove" ON public.team_conversation_members
        FOR DELETE
        TO authenticated
        USING (((profile_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_reactions' 
        AND policyname = 'Users can delete their own reactions'
    ) THEN
        CREATE POLICY "Users can delete their own reactions" ON public.message_reactions
        FOR DELETE
        TO authenticated
        USING ((user_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_reactions' 
        AND policyname = 'Users can insert reactions for assigned contacts'
    ) THEN
        CREATE POLICY "Users can insert reactions for assigned contacts" ON public.message_reactions
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_reactions' 
        AND policyname = 'Users can view reactions on accessible messages'
    ) THEN
        CREATE POLICY "Users can view reactions on accessible messages" ON public.message_reactions
        FOR SELECT
        TO authenticated
        USING (((message_id IN ( SELECT m.id
   FROM messages m
  WHERE (m.contact_id IN ( SELECT c.id
           FROM contacts c
          WHERE ((c.assigned_to IN ( SELECT p.id
                   FROM profiles p
                  WHERE (p.user_id = auth.uid()))) OR (c.assigned_to IS NULL)))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_reactions' 
        AND policyname = 'message_reactions_delete_policy'
    ) THEN
        CREATE POLICY message_reactions_delete_policy ON public.message_reactions
        FOR DELETE
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_reactions' 
        AND policyname = 'message_reactions_insert_policy'
    ) THEN
        CREATE POLICY message_reactions_insert_policy ON public.message_reactions
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_reactions' 
        AND policyname = 'message_reactions_select_policy'
    ) THEN
        CREATE POLICY message_reactions_select_policy ON public.message_reactions
        FOR SELECT
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_reactions' 
        AND policyname = 'message_reactions_update_policy'
    ) THEN
        CREATE POLICY message_reactions_update_policy ON public.message_reactions
        FOR UPDATE
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_templates' 
        AND policyname = 'Users can create their own templates'
    ) THEN
        CREATE POLICY "Users can create their own templates" ON public.message_templates
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_templates' 
        AND policyname = 'Users can delete their own templates'
    ) THEN
        CREATE POLICY "Users can delete their own templates" ON public.message_templates
        FOR DELETE
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_templates' 
        AND policyname = 'Users can update their own templates'
    ) THEN
        CREATE POLICY "Users can update their own templates" ON public.message_templates
        FOR UPDATE
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_templates' 
        AND policyname = 'Users can view their templates and global ones'
    ) THEN
        CREATE POLICY "Users can view their templates and global ones" ON public.message_templates
        FOR SELECT
        TO authenticated
        USING (((user_id = auth.uid()) OR (is_global = true)));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'ai_conversation_tags' 
        AND policyname = 'Admins can delete ai tags'
    ) THEN
        CREATE POLICY "Admins can delete ai tags" ON public.ai_conversation_tags
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'ai_conversation_tags' 
        AND policyname = 'Admins can update ai tags'
    ) THEN
        CREATE POLICY "Admins can update ai tags" ON public.ai_conversation_tags
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'ai_conversation_tags' 
        AND policyname = 'Agents can delete tags on assigned contacts'
    ) THEN
        CREATE POLICY "Agents can delete tags on assigned contacts" ON public.ai_conversation_tags
        FOR DELETE
        TO authenticated
        USING (((EXISTS ( SELECT 1
   FROM (contacts c
     JOIN profiles p ON ((p.id = c.assigned_to)))
  WHERE ((c.id = ai_conversation_tags.contact_id) AND (p.user_id = auth.uid())))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'ai_conversation_tags' 
        AND policyname = 'Authenticated can view ai tags'
    ) THEN
        CREATE POLICY "Authenticated can view ai tags" ON public.ai_conversation_tags
        FOR SELECT
        TO authenticated
        USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'ai_conversation_tags' 
        AND policyname = 'Users can insert ai tags for assigned contacts'
    ) THEN
        CREATE POLICY "Users can insert ai tags for assigned contacts" ON public.ai_conversation_tags
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'goals_configurations' 
        AND policyname = 'Users can manage their own goals'
    ) THEN
        CREATE POLICY "Users can manage their own goals" ON public.goals_configurations
        FOR ALL
        TO authenticated
        USING (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))) WITH CHECK (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'goals_configurations' 
        AND policyname = 'Users can view their own goals'
    ) THEN
        CREATE POLICY "Users can view their own goals" ON public.goals_configurations
        FOR SELECT
        TO authenticated
        USING (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'ip_whitelist' 
        AND policyname = 'Admins can manage IP whitelist'
    ) THEN
        CREATE POLICY "Admins can manage IP whitelist" ON public.ip_whitelist
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'ip_whitelist' 
        AND policyname = 'Admins can view IP whitelist'
    ) THEN
        CREATE POLICY "Admins can view IP whitelist" ON public.ip_whitelist
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'knowledge_base_articles' 
        AND policyname = 'Admins can manage knowledge base'
    ) THEN
        CREATE POLICY "Admins can manage knowledge base" ON public.knowledge_base_articles
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'knowledge_base_articles' 
        AND policyname = 'Authenticated can view knowledge base'
    ) THEN
        CREATE POLICY "Authenticated can view knowledge base" ON public.knowledge_base_articles
        FOR SELECT
        TO authenticated
        USING (((is_published = true) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'notifications' 
        AND policyname = 'Block authenticated notification inserts'
    ) THEN
        CREATE POLICY "Block authenticated notification inserts" ON public.notifications
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (false);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'notifications' 
        AND policyname = 'Users can delete own notifications'
    ) THEN
        CREATE POLICY "Users can delete own notifications" ON public.notifications
        FOR DELETE
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'notifications' 
        AND policyname = 'Users can update own notifications'
    ) THEN
        CREATE POLICY "Users can update own notifications" ON public.notifications
        FOR UPDATE
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'notifications' 
        AND policyname = 'Users can view own notifications'
    ) THEN
        CREATE POLICY "Users can view own notifications" ON public.notifications
        FOR SELECT
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'queue_goals' 
        AND policyname = 'Admins can manage queue goals'
    ) THEN
        CREATE POLICY "Admins can manage queue goals" ON public.queue_goals
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'queue_goals' 
        AND policyname = 'Authenticated users can view queue goals'
    ) THEN
        CREATE POLICY "Authenticated users can view queue goals" ON public.queue_goals
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'queue_members' 
        AND policyname = 'Admins can manage queue members'
    ) THEN
        CREATE POLICY "Admins can manage queue members" ON public.queue_members
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'queue_members' 
        AND policyname = 'Queue members visible to admins or self'
    ) THEN
        CREATE POLICY "Queue members visible to admins or self" ON public.queue_members
        FOR SELECT
        TO authenticated
        USING ((is_admin_or_supervisor(auth.uid()) OR (profile_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'queue_positions' 
        AND policyname = 'Admins can manage queue positions'
    ) THEN
        CREATE POLICY "Admins can manage queue positions" ON public.queue_positions
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'queue_positions' 
        AND policyname = 'Users can view queue positions'
    ) THEN
        CREATE POLICY "Users can view queue positions" ON public.queue_positions
        FOR SELECT
        TO authenticated
        USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'queue_skill_requirements' 
        AND policyname = 'Admins can manage queue skills'
    ) THEN
        CREATE POLICY "Admins can manage queue skills" ON public.queue_skill_requirements
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'queue_skill_requirements' 
        AND policyname = 'Authenticated can view queue skills'
    ) THEN
        CREATE POLICY "Authenticated can view queue skills" ON public.queue_skill_requirements
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_closures' 
        AND policyname = 'Agents can create closures for their contacts'
    ) THEN
        CREATE POLICY "Agents can create closures for their contacts" ON public.conversation_closures
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_contact_visible_to_user(contact_id, auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_closures' 
        AND policyname = 'Agents or admins can view closures'
    ) THEN
        CREATE POLICY "Agents or admins can view closures" ON public.conversation_closures
        FOR SELECT
        TO authenticated
        USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'voice_command_logs' 
        AND policyname = 'Users can insert own voice logs'
    ) THEN
        CREATE POLICY "Users can insert own voice logs" ON public.voice_command_logs
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((auth.uid() = user_id));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'voice_command_logs' 
        AND policyname = 'Users can read own voice logs'
    ) THEN
        CREATE POLICY "Users can read own voice logs" ON public.voice_command_logs
        FOR SELECT
        TO authenticated
        USING ((auth.uid() = user_id));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'campaign_ab_variants' 
        AND policyname = 'Authenticated can view AB variants'
    ) THEN
        CREATE POLICY "Authenticated can view AB variants" ON public.campaign_ab_variants
        FOR SELECT
        TO authenticated
        USING ((auth.uid() IS NOT NULL));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'campaign_ab_variants' 
        AND policyname = 'Campaign owners or admins can delete AB variants'
    ) THEN
        CREATE POLICY "Campaign owners or admins can delete AB variants" ON public.campaign_ab_variants
        FOR DELETE
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM campaigns c
  WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'campaign_ab_variants' 
        AND policyname = 'Campaign owners or admins can insert AB variants'
    ) THEN
        CREATE POLICY "Campaign owners or admins can insert AB variants" ON public.campaign_ab_variants
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM campaigns c
  WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'campaign_ab_variants' 
        AND policyname = 'Campaign owners or admins can update AB variants'
    ) THEN
        CREATE POLICY "Campaign owners or admins can update AB variants" ON public.campaign_ab_variants
        FOR UPDATE
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM campaigns c
  WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_tasks' 
        AND policyname = 'Agents can create tasks for their contacts'
    ) THEN
        CREATE POLICY "Agents can create tasks for their contacts" ON public.conversation_tasks
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_contact_visible_to_user(contact_id, auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_tasks' 
        AND policyname = 'Agents can update own or assigned tasks'
    ) THEN
        CREATE POLICY "Agents can update own or assigned tasks" ON public.conversation_tasks
        FOR UPDATE
        TO authenticated
        USING (((assigned_to = get_profile_id_for_user(auth.uid())) OR (created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_tasks' 
        AND policyname = 'Agents or admins can view tasks'
    ) THEN
        CREATE POLICY "Agents or admins can view tasks" ON public.conversation_tasks
        FOR SELECT
        TO authenticated
        USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR (assigned_to = get_profile_id_for_user(auth.uid())) OR (created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_tasks' 
        AND policyname = 'Creators or admins can delete tasks'
    ) THEN
        CREATE POLICY "Creators or admins can delete tasks" ON public.conversation_tasks
        FOR DELETE
        TO authenticated
        USING (((created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'channel_connections' 
        AND policyname = 'Admins full access to channels'
    ) THEN
        CREATE POLICY "Admins full access to channels" ON public.channel_connections
        FOR ALL
        TO authenticated
        USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'csat_auto_config' 
        AND policyname = 'Admins can manage csat config'
    ) THEN
        CREATE POLICY "Admins can manage csat config" ON public.csat_auto_config
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'csat_auto_config' 
        AND policyname = 'Authenticated can view csat config'
    ) THEN
        CREATE POLICY "Authenticated can view csat config" ON public.csat_auto_config
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'followup_executions' 
        AND policyname = 'Admins can manage followup executions'
    ) THEN
        CREATE POLICY "Admins can manage followup executions" ON public.followup_executions
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'followup_executions' 
        AND policyname = 'Authenticated can view followup executions'
    ) THEN
        CREATE POLICY "Authenticated can view followup executions" ON public.followup_executions
        FOR SELECT
        TO authenticated
        USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'followup_sequences' 
        AND policyname = 'Admins can manage followup sequences'
    ) THEN
        CREATE POLICY "Admins can manage followup sequences" ON public.followup_sequences
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'followup_sequences' 
        AND policyname = 'Admins can view followup sequences'
    ) THEN
        CREATE POLICY "Admins can view followup sequences" ON public.followup_sequences
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whatsapp_templates' 
        AND policyname = 'Admins can insert templates'
    ) THEN
        CREATE POLICY "Admins can insert templates" ON public.whatsapp_templates
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whatsapp_templates' 
        AND policyname = 'Admins can manage templates'
    ) THEN
        CREATE POLICY "Admins can manage templates" ON public.whatsapp_templates
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whatsapp_templates' 
        AND policyname = 'Authenticated users can view templates'
    ) THEN
        CREATE POLICY "Authenticated users can view templates" ON public.whatsapp_templates
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'knowledge_base_files' 
        AND policyname = 'Admins can manage kb files'
    ) THEN
        CREATE POLICY "Admins can manage kb files" ON public.knowledge_base_files
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'knowledge_base_files' 
        AND policyname = 'Users can view knowledge base files'
    ) THEN
        CREATE POLICY "Users can view knowledge base files" ON public.knowledge_base_files
        FOR SELECT
        TO authenticated
        USING (((article_id IN ( SELECT a.id
   FROM knowledge_base_articles a
  WHERE (a.is_published = true))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'rate_limit_configs' 
        AND policyname = 'Admins can manage rate limit configs'
    ) THEN
        CREATE POLICY "Admins can manage rate limit configs" ON public.rate_limit_configs
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'rate_limit_configs' 
        AND policyname = 'Admins can read rate limit configs'
    ) THEN
        CREATE POLICY "Admins can read rate limit configs" ON public.rate_limit_configs
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'chatbot_executions' 
        AND policyname = 'Admins can manage chatbot executions'
    ) THEN
        CREATE POLICY "Admins can manage chatbot executions" ON public.chatbot_executions
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'chatbot_executions' 
        AND policyname = 'Authenticated can view chatbot executions'
    ) THEN
        CREATE POLICY "Authenticated can view chatbot executions" ON public.chatbot_executions
        FOR SELECT
        TO authenticated
        USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sales_deals' 
        AND policyname = 'Admins can delete deals'
    ) THEN
        CREATE POLICY "Admins can delete deals" ON public.sales_deals
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sales_deals' 
        AND policyname = 'Users can insert deals'
    ) THEN
        CREATE POLICY "Users can insert deals" ON public.sales_deals
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((assigned_to IS NULL) OR (assigned_to IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sales_deals' 
        AND policyname = 'Users can update assigned deals'
    ) THEN
        CREATE POLICY "Users can update assigned deals" ON public.sales_deals
        FOR UPDATE
        TO authenticated
        USING (((assigned_to IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sales_deals' 
        AND policyname = 'Users can view assigned or admin deals'
    ) THEN
        CREATE POLICY "Users can view assigned or admin deals" ON public.sales_deals
        FOR SELECT
        TO authenticated
        USING ((is_admin_or_supervisor(auth.uid()) OR (assigned_to IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'agent_stats' 
        AND policyname = 'Only admins can update agent stats'
    ) THEN
        CREATE POLICY "Only admins can update agent stats" ON public.agent_stats
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'agent_stats' 
        AND policyname = 'Users can insert own stats'
    ) THEN
        CREATE POLICY "Users can insert own stats" ON public.agent_stats
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'agent_stats' 
        AND policyname = 'Users can view agent stats'
    ) THEN
        CREATE POLICY "Users can view agent stats" ON public.agent_stats
        FOR SELECT
        TO authenticated
        USING (((profile_id IN ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sicoob_contact_mapping' 
        AND policyname = 'Authenticated users can insert sicoob mappings'
    ) THEN
        CREATE POLICY "Authenticated users can insert sicoob mappings" ON public.sicoob_contact_mapping
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sicoob_contact_mapping' 
        AND policyname = 'Only admins can view sicoob mappings'
    ) THEN
        CREATE POLICY "Only admins can view sicoob mappings" ON public.sicoob_contact_mapping
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sicoob_contact_mapping' 
        AND policyname = 'Service role can manage sicoob mappings'
    ) THEN
        CREATE POLICY "Service role can manage sicoob mappings" ON public.sicoob_contact_mapping
        FOR ALL
        TO service_role
        USING (true) WITH CHECK (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sla_configurations' 
        AND policyname = 'Admins can manage SLA configurations'
    ) THEN
        CREATE POLICY "Admins can manage SLA configurations" ON public.sla_configurations
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sla_configurations' 
        AND policyname = 'Authenticated users can view SLA configurations'
    ) THEN
        CREATE POLICY "Authenticated users can view SLA configurations" ON public.sla_configurations
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sla_rules' 
        AND policyname = 'Admins and supervisors can delete SLA rules'
    ) THEN
        CREATE POLICY "Admins and supervisors can delete SLA rules" ON public.sla_rules
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sla_rules' 
        AND policyname = 'Admins and supervisors can insert SLA rules'
    ) THEN
        CREATE POLICY "Admins and supervisors can insert SLA rules" ON public.sla_rules
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sla_rules' 
        AND policyname = 'Admins and supervisors can update SLA rules'
    ) THEN
        CREATE POLICY "Admins and supervisors can update SLA rules" ON public.sla_rules
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sla_rules' 
        AND policyname = 'SLA rules visible to admins only'
    ) THEN
        CREATE POLICY "SLA rules visible to admins only" ON public.sla_rules
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'stickers' 
        AND policyname = 'Authenticated users can view stickers'
    ) THEN
        CREATE POLICY "Authenticated users can view stickers" ON public.stickers
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'stickers' 
        AND policyname = 'Sticker delete with ownership'
    ) THEN
        CREATE POLICY "Sticker delete with ownership" ON public.stickers
        FOR DELETE
        TO authenticated
        USING (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'stickers' 
        AND policyname = 'Sticker insert with ownership'
    ) THEN
        CREATE POLICY "Sticker insert with ownership" ON public.stickers
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'stickers' 
        AND policyname = 'Sticker update with ownership'
    ) THEN
        CREATE POLICY "Sticker update with ownership" ON public.stickers
        FOR UPDATE
        TO authenticated
        USING (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid()))) WITH CHECK (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'away_messages' 
        AND policyname = 'Admins can manage away messages'
    ) THEN
        CREATE POLICY "Admins can manage away messages" ON public.away_messages
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'away_messages' 
        AND policyname = 'Authenticated users can view away messages'
    ) THEN
        CREATE POLICY "Authenticated users can view away messages" ON public.away_messages
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'blocked_countries' 
        AND policyname = 'Admins can delete blocked countries'
    ) THEN
        CREATE POLICY "Admins can delete blocked countries" ON public.blocked_countries
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'blocked_countries' 
        AND policyname = 'Admins can insert blocked countries'
    ) THEN
        CREATE POLICY "Admins can insert blocked countries" ON public.blocked_countries
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'blocked_countries' 
        AND policyname = 'Admins can view blocked countries'
    ) THEN
        CREATE POLICY "Admins can view blocked countries" ON public.blocked_countries
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'blocked_ips' 
        AND policyname = 'Admins can delete blocked IPs'
    ) THEN
        CREATE POLICY "Admins can delete blocked IPs" ON public.blocked_ips
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'blocked_ips' 
        AND policyname = 'Admins can insert blocked IPs'
    ) THEN
        CREATE POLICY "Admins can insert blocked IPs" ON public.blocked_ips
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'blocked_ips' 
        AND policyname = 'Admins can update blocked IPs'
    ) THEN
        CREATE POLICY "Admins can update blocked IPs" ON public.blocked_ips
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'blocked_ips' 
        AND policyname = 'Only admins can view blocked IPs'
    ) THEN
        CREATE POLICY "Only admins can view blocked IPs" ON public.blocked_ips
        FOR SELECT
        TO authenticated
        USING (((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'business_hours' 
        AND policyname = 'Admins can manage business hours'
    ) THEN
        CREATE POLICY "Admins can manage business hours" ON public.business_hours
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'business_hours' 
        AND policyname = 'Authenticated users can view business hours'
    ) THEN
        CREATE POLICY "Authenticated users can view business hours" ON public.business_hours
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'team_messages' 
        AND policyname = 'Members can send messages'
    ) THEN
        CREATE POLICY "Members can send messages" ON public.team_messages
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((is_team_conversation_member(auth.uid(), conversation_id) AND (sender_id = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'team_messages' 
        AND policyname = 'Members can view conversation messages'
    ) THEN
        CREATE POLICY "Members can view conversation messages" ON public.team_messages
        FOR SELECT
        TO authenticated
        USING (is_team_conversation_member(auth.uid(), conversation_id));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'team_messages' 
        AND policyname = 'Senders can delete own messages'
    ) THEN
        CREATE POLICY "Senders can delete own messages" ON public.team_messages
        FOR DELETE
        TO authenticated
        USING ((sender_id = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'team_messages' 
        AND policyname = 'Senders can edit own messages'
    ) THEN
        CREATE POLICY "Senders can edit own messages" ON public.team_messages
        FOR UPDATE
        TO authenticated
        USING ((sender_id = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'training_sessions' 
        AND policyname = 'Users can delete own training sessions'
    ) THEN
        CREATE POLICY "Users can delete own training sessions" ON public.training_sessions
        FOR DELETE
        TO authenticated
        USING (((profile_id = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'training_sessions' 
        AND policyname = 'Users can insert own training sessions'
    ) THEN
        CREATE POLICY "Users can insert own training sessions" ON public.training_sessions
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((profile_id = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'training_sessions' 
        AND policyname = 'Users can update own training sessions'
    ) THEN
        CREATE POLICY "Users can update own training sessions" ON public.training_sessions
        FOR UPDATE
        TO authenticated
        USING (((profile_id = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'training_sessions' 
        AND policyname = 'Users can view own training sessions'
    ) THEN
        CREATE POLICY "Users can view own training sessions" ON public.training_sessions
        FOR SELECT
        TO authenticated
        USING (((profile_id = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'auto_close_config' 
        AND policyname = 'Admins can manage auto-close config'
    ) THEN
        CREATE POLICY "Admins can manage auto-close config" ON public.auto_close_config
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'auto_close_config' 
        AND policyname = 'Authenticated users can view auto-close config'
    ) THEN
        CREATE POLICY "Authenticated users can view auto-close config" ON public.auto_close_config
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'email_messages' 
        AND policyname = 'Users can insert messages for own accounts'
    ) THEN
        CREATE POLICY "Users can insert messages for own accounts" ON public.email_messages
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND (ga.user_id = auth.uid())))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'email_messages' 
        AND policyname = 'Users can update messages of own accounts'
    ) THEN
        CREATE POLICY "Users can update messages of own accounts" ON public.email_messages
        FOR UPDATE
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'email_messages' 
        AND policyname = 'Users can view messages of own accounts'
    ) THEN
        CREATE POLICY "Users can view messages of own accounts" ON public.email_messages
        FOR SELECT
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_devices' 
        AND policyname = 'Admins can view all user devices'
    ) THEN
        CREATE POLICY "Admins can view all user devices" ON public.user_devices
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_devices' 
        AND policyname = 'Users can delete their own devices'
    ) THEN
        CREATE POLICY "Users can delete their own devices" ON public.user_devices
        FOR DELETE
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_devices' 
        AND policyname = 'Users can insert their own devices'
    ) THEN
        CREATE POLICY "Users can insert their own devices" ON public.user_devices
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_devices' 
        AND policyname = 'Users can update their own devices'
    ) THEN
        CREATE POLICY "Users can update their own devices" ON public.user_devices
        FOR UPDATE
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_devices' 
        AND policyname = 'Users can view their own devices'
    ) THEN
        CREATE POLICY "Users can view their own devices" ON public.user_devices
        FOR SELECT
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_settings' 
        AND policyname = 'Users can insert their own settings'
    ) THEN
        CREATE POLICY "Users can insert their own settings" ON public.user_settings
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_settings' 
        AND policyname = 'Users can update their own settings'
    ) THEN
        CREATE POLICY "Users can update their own settings" ON public.user_settings
        FOR UPDATE
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_settings' 
        AND policyname = 'Users can view their own settings'
    ) THEN
        CREATE POLICY "Users can view their own settings" ON public.user_settings
        FOR SELECT
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_sessions' 
        AND policyname = 'Authenticated can insert own sessions'
    ) THEN
        CREATE POLICY "Authenticated can insert own sessions" ON public.user_sessions
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_sessions' 
        AND policyname = 'Users can delete their own sessions'
    ) THEN
        CREATE POLICY "Users can delete their own sessions" ON public.user_sessions
        FOR DELETE
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_sessions' 
        AND policyname = 'Users can update their own sessions'
    ) THEN
        CREATE POLICY "Users can update their own sessions" ON public.user_sessions
        FOR UPDATE
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_sessions' 
        AND policyname = 'Users can view their own sessions'
    ) THEN
        CREATE POLICY "Users can view their own sessions" ON public.user_sessions
        FOR SELECT
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'connection_health_logs' 
        AND policyname = 'Admins can delete health logs'
    ) THEN
        CREATE POLICY "Admins can delete health logs" ON public.connection_health_logs
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'connection_health_logs' 
        AND policyname = 'Admins can insert health logs'
    ) THEN
        CREATE POLICY "Admins can insert health logs" ON public.connection_health_logs
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'connection_health_logs' 
        AND policyname = 'Admins can view health logs'
    ) THEN
        CREATE POLICY "Admins can view health logs" ON public.connection_health_logs
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'allowed_countries' 
        AND policyname = 'Admins can delete allowed countries'
    ) THEN
        CREATE POLICY "Admins can delete allowed countries" ON public.allowed_countries
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'allowed_countries' 
        AND policyname = 'Admins can insert allowed countries'
    ) THEN
        CREATE POLICY "Admins can insert allowed countries" ON public.allowed_countries
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'allowed_countries' 
        AND policyname = 'Admins can view allowed countries'
    ) THEN
        CREATE POLICY "Admins can view allowed countries" ON public.allowed_countries
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'audio_memes' 
        AND policyname = 'Authenticated users can insert audio memes'
    ) THEN
        CREATE POLICY "Authenticated users can insert audio memes" ON public.audio_memes
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((uploaded_by = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'audio_memes' 
        AND policyname = 'Authenticated users can read audio memes'
    ) THEN
        CREATE POLICY "Authenticated users can read audio memes" ON public.audio_memes
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'audio_memes' 
        AND policyname = 'Authenticated users can update audio memes'
    ) THEN
        CREATE POLICY "Authenticated users can update audio memes" ON public.audio_memes
        FOR UPDATE
        TO authenticated
        USING (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()))) WITH CHECK (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'audio_memes' 
        AND policyname = 'Users can delete own audio memes'
    ) THEN
        CREATE POLICY "Users can delete own audio memes" ON public.audio_memes
        FOR DELETE
        TO authenticated
        USING (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'audit_logs' 
        AND policyname = 'Block authenticated deletes on audit_logs'
    ) THEN
        CREATE POLICY "Block authenticated deletes on audit_logs" ON public.audit_logs
        FOR DELETE
        TO authenticated
        USING (false);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'audit_logs' 
        AND policyname = 'Block authenticated updates on audit_logs'
    ) THEN
        CREATE POLICY "Block authenticated updates on audit_logs" ON public.audit_logs
        FOR UPDATE
        TO authenticated
        USING (false);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'audit_logs' 
        AND policyname = 'Block direct audit log inserts'
    ) THEN
        CREATE POLICY "Block direct audit log inserts" ON public.audit_logs
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (false);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'audit_logs' 
        AND policyname = 'Only admins can view audit logs'
    ) THEN
        CREATE POLICY "Only admins can view audit logs" ON public.audit_logs
        FOR SELECT
        TO authenticated
        USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'chatbot_flows' 
        AND policyname = 'Admins can insert chatbot flows'
    ) THEN
        CREATE POLICY "Admins can insert chatbot flows" ON public.chatbot_flows
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'chatbot_flows' 
        AND policyname = 'Admins can manage chatbot flows'
    ) THEN
        CREATE POLICY "Admins can manage chatbot flows" ON public.chatbot_flows
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'chatbot_flows' 
        AND policyname = 'Authenticated can view chatbot flows'
    ) THEN
        CREATE POLICY "Authenticated can view chatbot flows" ON public.chatbot_flows
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'client_wallet_rules' 
        AND policyname = 'Admins can manage wallet rules'
    ) THEN
        CREATE POLICY "Admins can manage wallet rules" ON public.client_wallet_rules
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'client_wallet_rules' 
        AND policyname = 'Wallet rules visible to admins only'
    ) THEN
        CREATE POLICY "Wallet rules visible to admins only" ON public.client_wallet_rules
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whatsapp_groups' 
        AND policyname = 'Admins can manage whatsapp groups'
    ) THEN
        CREATE POLICY "Admins can manage whatsapp groups" ON public.whatsapp_groups
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'whatsapp_groups' 
        AND policyname = 'Authenticated users can view whatsapp groups'
    ) THEN
        CREATE POLICY "Authenticated users can view whatsapp groups" ON public.whatsapp_groups
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'queues' 
        AND policyname = 'Admins can manage queues'
    ) THEN
        CREATE POLICY "Admins can manage queues" ON public.queues
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'queues' 
        AND policyname = 'Authenticated users can view queues'
    ) THEN
        CREATE POLICY "Authenticated users can view queues" ON public.queues
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'payment_links' 
        AND policyname = 'Admins can delete payment links'
    ) THEN
        CREATE POLICY "Admins can delete payment links" ON public.payment_links
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'payment_links' 
        AND policyname = 'Authenticated can insert payment links'
    ) THEN
        CREATE POLICY "Authenticated can insert payment links" ON public.payment_links
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'payment_links' 
        AND policyname = 'Users can update own payment links'
    ) THEN
        CREATE POLICY "Users can update own payment links" ON public.payment_links
        FOR UPDATE
        TO authenticated
        USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'payment_links' 
        AND policyname = 'Users can view own payment links'
    ) THEN
        CREATE POLICY "Users can view own payment links" ON public.payment_links
        FOR SELECT
        TO authenticated
        USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'products' 
        AND policyname = 'Admins can insert products'
    ) THEN
        CREATE POLICY "Admins can insert products" ON public.products
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'products' 
        AND policyname = 'Admins can manage products'
    ) THEN
        CREATE POLICY "Admins can manage products" ON public.products
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'products' 
        AND policyname = 'Authenticated users can view products'
    ) THEN
        CREATE POLICY "Authenticated users can view products" ON public.products
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'Admin supervisor can view all profiles'
    ) THEN
        CREATE POLICY "Admin supervisor can view all profiles" ON public.profiles
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'Admins can update any profile'
    ) THEN
        CREATE POLICY "Admins can update any profile" ON public.profiles
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'Block sensitive field changes by non-admins'
    ) THEN
        CREATE POLICY "Block sensitive field changes by non-admins" ON public.profiles
        FOR UPDATE
        TO authenticated
        USING (true) WITH CHECK ((is_admin_or_supervisor(auth.uid()) OR ((role = ( SELECT p.role
   FROM profiles p
  WHERE (p.user_id = auth.uid()))) AND (access_level = ( SELECT p.access_level
   FROM profiles p
  WHERE (p.user_id = auth.uid()))) AND (permissions = ( SELECT p.permissions
   FROM profiles p
  WHERE (p.user_id = auth.uid()))) AND (is_active = ( SELECT p.is_active
   FROM profiles p
  WHERE (p.user_id = auth.uid()))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'Users can insert their own profile safely'
    ) THEN
        CREATE POLICY "Users can insert their own profile safely" ON public.profiles
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((auth.uid() = user_id) AND ((role IS NULL) OR (role = 'agent'::text)) AND ((access_level IS NULL) OR (access_level = 'basic'::text)) AND ((permissions IS NULL) OR (permissions = '{}'::jsonb))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'Users can update own profile'
    ) THEN
        CREATE POLICY "Users can update own profile" ON public.profiles
        FOR UPDATE
        TO authenticated
        USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'Users can view own profile'
    ) THEN
        CREATE POLICY "Users can view own profile" ON public.profiles
        FOR SELECT
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'query_telemetry' 
        AND policyname = 'Admins can delete telemetry'
    ) THEN
        CREATE POLICY "Admins can delete telemetry" ON public.query_telemetry
        FOR DELETE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'query_telemetry' 
        AND policyname = 'Users can insert own telemetry'
    ) THEN
        CREATE POLICY "Users can insert own telemetry" ON public.query_telemetry
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'query_telemetry' 
        AND policyname = 'Users can view own telemetry'
    ) THEN
        CREATE POLICY "Users can view own telemetry" ON public.query_telemetry
        FOR SELECT
        TO authenticated
        USING (((user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'agent_visibility_grants' 
        AND policyname = 'Admins and supervisors can manage visibility grants'
    ) THEN
        CREATE POLICY "Admins and supervisors can manage visibility grants" ON public.agent_visibility_grants
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'agent_visibility_grants' 
        AND policyname = 'Special agents can view own grants'
    ) THEN
        CREATE POLICY "Special agents can view own grants" ON public.agent_visibility_grants
        FOR SELECT
        TO authenticated
        USING ((agent_id IN ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contacts' 
        AND policyname = 'Admins can view all contacts including unassigned'
    ) THEN
        CREATE POLICY "Admins can view all contacts including unassigned" ON public.contacts
        FOR SELECT
        TO authenticated
        USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contacts' 
        AND policyname = 'Users can insert contacts'
    ) THEN
        CREATE POLICY "Users can insert contacts" ON public.contacts
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((is_admin_or_supervisor(auth.uid()) OR ((assigned_to IS NOT NULL) AND (assigned_to IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contacts' 
        AND policyname = 'Users can update their assigned contacts'
    ) THEN
        CREATE POLICY "Users can update their assigned contacts" ON public.contacts
        FOR UPDATE
        TO authenticated
        USING (((assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'contacts' 
        AND policyname = 'contacts_select_policy'
    ) THEN
        CREATE POLICY contacts_select_policy ON public.contacts
        FOR SELECT
        TO authenticated
        USING ((is_admin_or_supervisor(auth.uid()) OR (assigned_to = get_profile_id_for_user(auth.uid())) OR (assigned_to IS NULL)));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_analyses' 
        AND policyname = 'Authenticated users can view analyses'
    ) THEN
        CREATE POLICY "Authenticated users can view analyses" ON public.conversation_analyses
        FOR SELECT
        TO authenticated
        USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'conversation_analyses' 
        AND policyname = 'Users can insert own analyses'
    ) THEN
        CREATE POLICY "Users can insert own analyses" ON public.conversation_analyses
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((analyzed_by IS NULL) OR (analyzed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'tags' 
        AND policyname = 'Admins can manage tags'
    ) THEN
        CREATE POLICY "Admins can manage tags" ON public.tags
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'tags' 
        AND policyname = 'Authenticated users can view tags'
    ) THEN
        CREATE POLICY "Authenticated users can view tags" ON public.tags
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'tags' 
        AND policyname = 'Users can insert tags'
    ) THEN
        CREATE POLICY "Users can insert tags" ON public.tags
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (((created_by IS NULL) OR (created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'talkx_campaigns' 
        AND policyname = 'Admins can view all campaigns'
    ) THEN
        CREATE POLICY "Admins can view all campaigns" ON public.talkx_campaigns
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'talkx_campaigns' 
        AND policyname = 'Users can create campaigns'
    ) THEN
        CREATE POLICY "Users can create campaigns" ON public.talkx_campaigns
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'talkx_campaigns' 
        AND policyname = 'Users can delete own draft campaigns'
    ) THEN
        CREATE POLICY "Users can delete own draft campaigns" ON public.talkx_campaigns
        FOR DELETE
        TO authenticated
        USING (((created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)) AND (status = 'draft'::text)));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'talkx_campaigns' 
        AND policyname = 'Users can update own campaigns'
    ) THEN
        CREATE POLICY "Users can update own campaigns" ON public.talkx_campaigns
        FOR UPDATE
        TO authenticated
        USING ((created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'talkx_campaigns' 
        AND policyname = 'Users can view own campaigns'
    ) THEN
        CREATE POLICY "Users can view own campaigns" ON public.talkx_campaigns
        FOR SELECT
        TO authenticated
        USING ((created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'talkx_recipients' 
        AND policyname = 'Users can delete recipients of own campaigns'
    ) THEN
        CREATE POLICY "Users can delete recipients of own campaigns" ON public.talkx_recipients
        FOR DELETE
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1)) AND (tc.status = 'draft'::text)))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'talkx_recipients' 
        AND policyname = 'Users can insert recipients to own campaigns'
    ) THEN
        CREATE POLICY "Users can insert recipients to own campaigns" ON public.talkx_recipients
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'talkx_recipients' 
        AND policyname = 'Users can update recipients of own campaigns'
    ) THEN
        CREATE POLICY "Users can update recipients of own campaigns" ON public.talkx_recipients
        FOR UPDATE
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'talkx_recipients' 
        AND policyname = 'Users can view recipients of own campaigns'
    ) THEN
        CREATE POLICY "Users can view recipients of own campaigns" ON public.talkx_recipients
        FOR SELECT
        TO authenticated
        USING ((EXISTS ( SELECT 1
   FROM talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND ((tc.created_by = ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1)) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'team_conversations' 
        AND policyname = 'Authenticated users can create conversations'
    ) THEN
        CREATE POLICY "Authenticated users can create conversations" ON public.team_conversations
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((created_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'team_conversations' 
        AND policyname = 'Creator can update conversation'
    ) THEN
        CREATE POLICY "Creator can update conversation" ON public.team_conversations
        FOR UPDATE
        TO authenticated
        USING ((created_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'team_conversations' 
        AND policyname = 'Members can view their conversations'
    ) THEN
        CREATE POLICY "Members can view their conversations" ON public.team_conversations
        FOR SELECT
        TO authenticated
        USING ((is_team_conversation_member(auth.uid(), id) OR (created_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1))));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'number_reputation' 
        AND policyname = 'Admins can insert reputation'
    ) THEN
        CREATE POLICY "Admins can insert reputation" ON public.number_reputation
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'number_reputation' 
        AND policyname = 'Admins can update reputation'
    ) THEN
        CREATE POLICY "Admins can update reputation" ON public.number_reputation
        FOR UPDATE
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'number_reputation' 
        AND policyname = 'Authenticated can view reputation'
    ) THEN
        CREATE POLICY "Authenticated can view reputation" ON public.number_reputation
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'passkey_credentials' 
        AND policyname = 'Users can delete own passkeys'
    ) THEN
        CREATE POLICY "Users can delete own passkeys" ON public.passkey_credentials
        FOR DELETE
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'passkey_credentials' 
        AND policyname = 'Users can insert own passkeys'
    ) THEN
        CREATE POLICY "Users can insert own passkeys" ON public.passkey_credentials
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'passkey_credentials' 
        AND policyname = 'Users can update own passkeys'
    ) THEN
        CREATE POLICY "Users can update own passkeys" ON public.passkey_credentials
        FOR UPDATE
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'passkey_credentials' 
        AND policyname = 'Users can view own passkeys'
    ) THEN
        CREATE POLICY "Users can view own passkeys" ON public.passkey_credentials
        FOR SELECT
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'password_reset_requests' 
        AND policyname = 'Admins can delete password reset requests'
    ) THEN
        CREATE POLICY "Admins can delete password reset requests" ON public.password_reset_requests
        FOR DELETE
        TO authenticated
        USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'password_reset_requests' 
        AND policyname = 'Admins can update reset requests without token access'
    ) THEN
        CREATE POLICY "Admins can update reset requests without token access" ON public.password_reset_requests
        FOR UPDATE
        TO authenticated
        USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'password_reset_requests' 
        AND policyname = 'Admins can view reset requests'
    ) THEN
        CREATE POLICY "Admins can view reset requests" ON public.password_reset_requests
        FOR SELECT
        TO authenticated
        USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'password_reset_requests' 
        AND policyname = 'Users can request own password reset'
    ) THEN
        CREATE POLICY "Users can request own password reset" ON public.password_reset_requests
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'rate_limit_logs' 
        AND policyname = 'Admins can insert rate limit logs'
    ) THEN
        CREATE POLICY "Admins can insert rate limit logs" ON public.rate_limit_logs
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'rate_limit_logs' 
        AND policyname = 'Admins can view rate limit logs'
    ) THEN
        CREATE POLICY "Admins can view rate limit logs" ON public.rate_limit_logs
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'ai_providers' 
        AND policyname = 'Admins can delete AI providers'
    ) THEN
        CREATE POLICY "Admins can delete AI providers" ON public.ai_providers
        FOR DELETE
        TO authenticated
        USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'ai_providers' 
        AND policyname = 'Admins can insert AI providers'
    ) THEN
        CREATE POLICY "Admins can insert AI providers" ON public.ai_providers
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'ai_providers' 
        AND policyname = 'Admins can update AI providers'
    ) THEN
        CREATE POLICY "Admins can update AI providers" ON public.ai_providers
        FOR UPDATE
        TO authenticated
        USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'ai_providers' 
        AND policyname = 'Admins can view AI providers'
    ) THEN
        CREATE POLICY "Admins can view AI providers" ON public.ai_providers
        FOR SELECT
        TO authenticated
        USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'ai_usage_logs' 
        AND policyname = 'Admins can view all AI usage logs'
    ) THEN
        CREATE POLICY "Admins can view all AI usage logs" ON public.ai_usage_logs
        FOR SELECT
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'ai_usage_logs' 
        AND policyname = 'Service role can insert AI usage logs'
    ) THEN
        CREATE POLICY "Service role can insert AI usage logs" ON public.ai_usage_logs
        FOR INSERT
        TO service_role
        USING (true) WITH CHECK (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'ai_usage_logs' 
        AND policyname = 'Users can view own AI usage logs'
    ) THEN
        CREATE POLICY "Users can view own AI usage logs" ON public.ai_usage_logs
        FOR SELECT
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'security_alerts' 
        AND policyname = 'Admins can insert security alerts'
    ) THEN
        CREATE POLICY "Admins can insert security alerts" ON public.security_alerts
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'security_alerts' 
        AND policyname = 'Admins can manage security alerts'
    ) THEN
        CREATE POLICY "Admins can manage security alerts" ON public.security_alerts
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'channel_routing_rules' 
        AND policyname = 'Admins can manage routing rules'
    ) THEN
        CREATE POLICY "Admins can manage routing rules" ON public.channel_routing_rules
        FOR ALL
        TO authenticated
        USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'channel_routing_rules' 
        AND policyname = 'Authenticated can view routing rules'
    ) THEN
        CREATE POLICY "Authenticated can view routing rules" ON public.channel_routing_rules
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'gmail_accounts' 
        AND policyname = 'Block authenticated gmail deletes'
    ) THEN
        CREATE POLICY "Block authenticated gmail deletes" ON public.gmail_accounts
        FOR DELETE
        TO authenticated
        USING (false);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'gmail_accounts' 
        AND policyname = 'Block authenticated gmail inserts'
    ) THEN
        CREATE POLICY "Block authenticated gmail inserts" ON public.gmail_accounts
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK (false);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'gmail_accounts' 
        AND policyname = 'Block authenticated gmail updates'
    ) THEN
        CREATE POLICY "Block authenticated gmail updates" ON public.gmail_accounts
        FOR UPDATE
        TO authenticated
        USING (false);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'gmail_accounts' 
        AND policyname = 'Service role only for gmail accounts'
    ) THEN
        CREATE POLICY "Service role only for gmail accounts" ON public.gmail_accounts
        FOR ALL
        TO service_role
        USING (true) WITH CHECK (true);
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'gmail_accounts' 
        AND policyname = 'Users can view their own gmail accounts'
    ) THEN
        CREATE POLICY "Users can view their own gmail accounts" ON public.gmail_accounts
        FOR SELECT
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'saved_filters' 
        AND policyname = 'Users can delete own saved filters'
    ) THEN
        CREATE POLICY "Users can delete own saved filters" ON public.saved_filters
        FOR DELETE
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'saved_filters' 
        AND policyname = 'Users can insert own saved filters'
    ) THEN
        CREATE POLICY "Users can insert own saved filters" ON public.saved_filters
        FOR INSERT
        TO authenticated
        USING (true) WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'saved_filters' 
        AND policyname = 'Users can update own saved filters'
    ) THEN
        CREATE POLICY "Users can update own saved filters" ON public.saved_filters
        FOR UPDATE
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'saved_filters' 
        AND policyname = 'Users can view own saved filters'
    ) THEN
        CREATE POLICY "Users can view own saved filters" ON public.saved_filters
        FOR SELECT
        TO authenticated
        USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'saved_filters' 
        AND policyname = 'Users can view shared filters'
    ) THEN
        CREATE POLICY "Users can view shared filters" ON public.saved_filters
        FOR SELECT
        TO authenticated
        USING ((is_shared = true));
    END IF;
END $$;
