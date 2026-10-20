-- Fix remaining policies that weren't applied due to the error

-- 5b. whatsapp_groups - the view policy already exists, just add admin manage
DROP POLICY IF EXISTS "Admins can manage groups" ON public.whatsapp_groups;
CREATE POLICY "Admins can manage groups" ON public.whatsapp_groups
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- 6. whatsapp_connections
DROP POLICY IF EXISTS "Authenticated users can manage connections" ON public.whatsapp_connections;
DROP POLICY IF EXISTS "Users can insert connections" ON public.whatsapp_connections;
DROP POLICY IF EXISTS "Users can update connections" ON public.whatsapp_connections;
DROP POLICY IF EXISTS "Users can delete connections" ON public.whatsapp_connections;
DROP POLICY IF EXISTS "Admins can manage connections" ON public.whatsapp_connections;
CREATE POLICY "Admins can manage connections" ON public.whatsapp_connections
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view connections" ON public.whatsapp_connections;
CREATE POLICY "Authenticated users can view connections" ON public.whatsapp_connections
  FOR SELECT TO authenticated USING (true);

-- 7. contact_tags
DROP POLICY IF EXISTS "Authenticated users can view contact tags" ON public.contact_tags;
DROP POLICY IF EXISTS "Users can manage contact tags" ON public.contact_tags;
DROP POLICY IF EXISTS "Authenticated users can manage contact tags" ON public.contact_tags;
CREATE POLICY "Authenticated users can view contact tags" ON public.contact_tags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage contact tags" ON public.contact_tags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. conversation_sla
DROP POLICY IF EXISTS "Users can insert conversation SLA" ON public.conversation_sla;
DROP POLICY IF EXISTS "Users can update conversation SLA" ON public.conversation_sla;
DROP POLICY IF EXISTS "Users can view conversation SLA" ON public.conversation_sla;
DROP POLICY IF EXISTS "Authenticated users can view SLA" ON public.conversation_sla;
DROP POLICY IF EXISTS "Authenticated users can insert SLA" ON public.conversation_sla;
DROP POLICY IF EXISTS "Authenticated users can update SLA" ON public.conversation_sla;
CREATE POLICY "Authenticated users can view SLA" ON public.conversation_sla
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert SLA" ON public.conversation_sla
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update SLA" ON public.conversation_sla
  FOR UPDATE TO authenticated USING (true);

-- 9. conversation_analyses
DROP POLICY IF EXISTS "Users can insert analyses" ON public.conversation_analyses;
DROP POLICY IF EXISTS "Users can view analyses" ON public.conversation_analyses;
DROP POLICY IF EXISTS "Authenticated users can view analyses" ON public.conversation_analyses;
DROP POLICY IF EXISTS "Authenticated users can insert analyses" ON public.conversation_analyses;
CREATE POLICY "Authenticated users can view analyses" ON public.conversation_analyses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert analyses" ON public.conversation_analyses
  FOR INSERT TO authenticated WITH CHECK (true);

-- 10. security_alerts
DROP POLICY IF EXISTS "System can insert security alerts" ON public.security_alerts;
DROP POLICY IF EXISTS "Authenticated can insert security alerts" ON public.security_alerts;
CREATE POLICY "Authenticated can insert security alerts" ON public.security_alerts
  FOR INSERT TO authenticated WITH CHECK (true);

-- 11. rate_limit_configs
DROP POLICY IF EXISTS "Authenticated can view rate limit configs" ON public.rate_limit_configs;
CREATE POLICY "Authenticated can view rate limit configs" ON public.rate_limit_configs
  FOR SELECT TO authenticated USING (true);

-- 12. ip_whitelist
DROP POLICY IF EXISTS "Authenticated can view IP whitelist" ON public.ip_whitelist;
DROP POLICY IF EXISTS "Admins can view IP whitelist" ON public.ip_whitelist;
CREATE POLICY "Admins can view IP whitelist" ON public.ip_whitelist
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 13. agent_achievements
DROP POLICY IF EXISTS "System can insert achievements" ON public.agent_achievements;
DROP POLICY IF EXISTS "Anyone can view achievements" ON public.agent_achievements;
DROP POLICY IF EXISTS "Authenticated can view achievements" ON public.agent_achievements;
DROP POLICY IF EXISTS "Authenticated can insert achievements" ON public.agent_achievements;
CREATE POLICY "Authenticated can view achievements" ON public.agent_achievements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert achievements" ON public.agent_achievements
  FOR INSERT TO authenticated WITH CHECK (true);

-- 14. agent_stats
DROP POLICY IF EXISTS "System can insert stats" ON public.agent_stats;
DROP POLICY IF EXISTS "Anyone can view agent stats" ON public.agent_stats;
DROP POLICY IF EXISTS "Authenticated can view agent stats" ON public.agent_stats;
DROP POLICY IF EXISTS "Authenticated can insert stats" ON public.agent_stats;
CREATE POLICY "Authenticated can view agent stats" ON public.agent_stats
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert stats" ON public.agent_stats
  FOR INSERT TO authenticated WITH CHECK (true);

-- 15. tags
DROP POLICY IF EXISTS "Users can insert tags" ON public.tags;
DROP POLICY IF EXISTS "Authenticated users can insert tags" ON public.tags;
CREATE POLICY "Authenticated users can insert tags" ON public.tags
  FOR INSERT TO authenticated WITH CHECK (true);

-- 16. rate_limit_logs
DROP POLICY IF EXISTS "System can insert rate limit logs" ON public.rate_limit_logs;
DROP POLICY IF EXISTS "Authenticated can insert rate limit logs" ON public.rate_limit_logs;
CREATE POLICY "Authenticated can insert rate limit logs" ON public.rate_limit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- 17. message_reactions
DROP POLICY IF EXISTS "Users can add reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Authenticated users can add reactions" ON public.message_reactions;
CREATE POLICY "Authenticated users can add reactions" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
    OR contact_id IS NOT NULL
  )