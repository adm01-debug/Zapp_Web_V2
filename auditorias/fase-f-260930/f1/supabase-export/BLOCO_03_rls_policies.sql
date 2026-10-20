-- ============================================================
-- BLOCO 03 — RLS POLICIES (idempotente)
-- Total policies: 391 (public + storage.objects)
-- Estrategia: ALTER TABLE ... ENABLE RLS; DROP POLICY IF EXISTS; CREATE POLICY.
-- Aplicar:  psql "$DESTINO_URL" -f BLOCO_03_rls_policies.sql
-- ============================================================

-- Garantir RLS habilitado em todas as tabelas com policies (public)
ALTER TABLE IF EXISTS public."agent_achievements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."agent_skills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."agent_stats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."agent_visibility_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ai_conversation_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ai_providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ai_usage_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."allowed_countries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."audio_memes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."auto_close_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."automations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."away_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."blocked_countries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."blocked_ips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."business_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."calls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."campaign_ab_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."campaign_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."channel_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."channel_routing_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."chatbot_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."chatbot_flows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."client_wallet_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."connection_health_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."contact_custom_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."contact_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."contact_purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."contact_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."conversation_analyses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."conversation_closures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."conversation_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."conversation_memory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."conversation_sla" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."conversation_snoozes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."conversation_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."crisis_room_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."csat_auto_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."csat_surveys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."custom_emojis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."deal_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."email_labels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."email_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."email_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."entity_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."favorite_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."followup_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."followup_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."followup_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."geo_blocking_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."global_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."gmail_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."goals_configurations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ip_whitelist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."knowledge_base_articles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."knowledge_base_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."login_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."message_reactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."message_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."meta_capi_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."mfa_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."nps_surveys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."number_reputation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."passkey_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."password_reset_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."payment_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."performance_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."pinned_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."playbooks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."query_telemetry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."queue_goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."queue_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."queue_positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."queue_skill_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."queues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."rate_limit_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."rate_limit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."sales_deals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."sales_pipeline_stages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."saved_filters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."scheduled_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."scheduled_report_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."scheduled_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."security_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."sicoob_contact_mapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."sla_configurations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."sla_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."stickers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."talkx_blacklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."talkx_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."talkx_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."team_conversation_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."team_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."team_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."training_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."user_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."user_service_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."user_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."user_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."voice_command_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."warroom_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."webauthn_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."webhook_rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."whatsapp_connection_queues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."whatsapp_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."whatsapp_flows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."whatsapp_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."whatsapp_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."whisper_messages" ENABLE ROW LEVEL SECURITY;

-- storage.objects ja tem RLS habilitado pelo Supabase (nao alterar)


-- --------------------------------------------------------
-- public.agent_achievements
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own achievements" ON public."agent_achievements";
CREATE POLICY "Users can insert own achievements" ON public."agent_achievements"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can view own or admin all achievements" ON public."agent_achievements";
CREATE POLICY "Users can view own or admin all achievements" ON public."agent_achievements"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.agent_skills
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage skills" ON public."agent_skills";
CREATE POLICY "Admins can manage skills" ON public."agent_skills"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Users can view own or admin all skills" ON public."agent_skills";
CREATE POLICY "Users can view own or admin all skills" ON public."agent_skills"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.agent_stats
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Only admins can update agent stats" ON public."agent_stats";
CREATE POLICY "Only admins can update agent stats" ON public."agent_stats"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Users can insert own stats" ON public."agent_stats";
CREATE POLICY "Users can insert own stats" ON public."agent_stats"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can view agent stats" ON public."agent_stats";
CREATE POLICY "Users can view agent stats" ON public."agent_stats"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((profile_id IN ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.agent_visibility_grants
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins and supervisors can manage visibility grants" ON public."agent_visibility_grants";
CREATE POLICY "Admins and supervisors can manage visibility grants" ON public."agent_visibility_grants"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Special agents can view own grants" ON public."agent_visibility_grants";
CREATE POLICY "Special agents can view own grants" ON public."agent_visibility_grants"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((agent_id IN ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))));

-- --------------------------------------------------------
-- public.ai_conversation_tags
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete ai tags" ON public."ai_conversation_tags";
CREATE POLICY "Admins can delete ai tags" ON public."ai_conversation_tags"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can update ai tags" ON public."ai_conversation_tags";
CREATE POLICY "Admins can update ai tags" ON public."ai_conversation_tags"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Agents can delete tags on assigned contacts" ON public."ai_conversation_tags";
CREATE POLICY "Agents can delete tags on assigned contacts" ON public."ai_conversation_tags"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (contacts c
     JOIN profiles p ON ((p.id = c.assigned_to)))
  WHERE ((c.id = ai_conversation_tags.contact_id) AND (p.user_id = auth.uid())))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Authenticated can view ai tags" ON public."ai_conversation_tags";
CREATE POLICY "Authenticated can view ai tags" ON public."ai_conversation_tags"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can insert ai tags for assigned contacts" ON public."ai_conversation_tags";
CREATE POLICY "Users can insert ai tags for assigned contacts" ON public."ai_conversation_tags"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.ai_providers
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete AI providers" ON public."ai_providers";
CREATE POLICY "Admins can delete AI providers" ON public."ai_providers"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can insert AI providers" ON public."ai_providers";
CREATE POLICY "Admins can insert AI providers" ON public."ai_providers"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can update AI providers" ON public."ai_providers";
CREATE POLICY "Admins can update AI providers" ON public."ai_providers"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can view AI providers" ON public."ai_providers";
CREATE POLICY "Admins can view AI providers" ON public."ai_providers"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- --------------------------------------------------------
-- public.ai_usage_logs
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all AI usage logs" ON public."ai_usage_logs";
CREATE POLICY "Admins can view all AI usage logs" ON public."ai_usage_logs"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Service role can insert AI usage logs" ON public."ai_usage_logs";
CREATE POLICY "Service role can insert AI usage logs" ON public."ai_usage_logs"
  AS PERMISSIVE
  FOR INSERT
  TO service_role
  WITH CHECK (true);
DROP POLICY IF EXISTS "Users can view own AI usage logs" ON public."ai_usage_logs";
CREATE POLICY "Users can view own AI usage logs" ON public."ai_usage_logs"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

-- --------------------------------------------------------
-- public.allowed_countries
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete allowed countries" ON public."allowed_countries";
CREATE POLICY "Admins can delete allowed countries" ON public."allowed_countries"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can insert allowed countries" ON public."allowed_countries";
CREATE POLICY "Admins can insert allowed countries" ON public."allowed_countries"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can view allowed countries" ON public."allowed_countries";
CREATE POLICY "Admins can view allowed countries" ON public."allowed_countries"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.audio_memes
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can insert audio memes" ON public."audio_memes";
CREATE POLICY "Authenticated users can insert audio memes" ON public."audio_memes"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((uploaded_by = auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can read audio memes" ON public."audio_memes";
CREATE POLICY "Authenticated users can read audio memes" ON public."audio_memes"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Authenticated users can update audio memes" ON public."audio_memes";
CREATE POLICY "Authenticated users can update audio memes" ON public."audio_memes"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())))
  WITH CHECK (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can delete own audio memes" ON public."audio_memes";
CREATE POLICY "Users can delete own audio memes" ON public."audio_memes"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.audit_logs
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Block authenticated deletes on audit_logs" ON public."audit_logs";
CREATE POLICY "Block authenticated deletes on audit_logs" ON public."audit_logs"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (false);
DROP POLICY IF EXISTS "Block authenticated updates on audit_logs" ON public."audit_logs";
CREATE POLICY "Block authenticated updates on audit_logs" ON public."audit_logs"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (false);
DROP POLICY IF EXISTS "Block direct audit log inserts" ON public."audit_logs";
CREATE POLICY "Block direct audit log inserts" ON public."audit_logs"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS "Only admins can view audit logs" ON public."audit_logs";
CREATE POLICY "Only admins can view audit logs" ON public."audit_logs"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- --------------------------------------------------------
-- public.auto_close_config
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage auto-close config" ON public."auto_close_config";
CREATE POLICY "Admins can manage auto-close config" ON public."auto_close_config"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view auto-close config" ON public."auto_close_config";
CREATE POLICY "Authenticated users can view auto-close config" ON public."auto_close_config"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.automations
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admin/supervisor can create automations" ON public."automations";
CREATE POLICY "Admin/supervisor can create automations" ON public."automations"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admin/supervisor can delete automations" ON public."automations";
CREATE POLICY "Admin/supervisor can delete automations" ON public."automations"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admin/supervisor can update automations" ON public."automations";
CREATE POLICY "Admin/supervisor can update automations" ON public."automations"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Automations visible to admins only" ON public."automations";
CREATE POLICY "Automations visible to admins only" ON public."automations"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.away_messages
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage away messages" ON public."away_messages";
CREATE POLICY "Admins can manage away messages" ON public."away_messages"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view away messages" ON public."away_messages";
CREATE POLICY "Authenticated users can view away messages" ON public."away_messages"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.blocked_countries
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete blocked countries" ON public."blocked_countries";
CREATE POLICY "Admins can delete blocked countries" ON public."blocked_countries"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can insert blocked countries" ON public."blocked_countries";
CREATE POLICY "Admins can insert blocked countries" ON public."blocked_countries"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can view blocked countries" ON public."blocked_countries";
CREATE POLICY "Admins can view blocked countries" ON public."blocked_countries"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.blocked_ips
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete blocked IPs" ON public."blocked_ips";
CREATE POLICY "Admins can delete blocked IPs" ON public."blocked_ips"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can insert blocked IPs" ON public."blocked_ips";
CREATE POLICY "Admins can insert blocked IPs" ON public."blocked_ips"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can update blocked IPs" ON public."blocked_ips";
CREATE POLICY "Admins can update blocked IPs" ON public."blocked_ips"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Only admins can view blocked IPs" ON public."blocked_ips";
CREATE POLICY "Only admins can view blocked IPs" ON public."blocked_ips"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.business_hours
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage business hours" ON public."business_hours";
CREATE POLICY "Admins can manage business hours" ON public."business_hours"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view business hours" ON public."business_hours";
CREATE POLICY "Authenticated users can view business hours" ON public."business_hours"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.calls
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert calls" ON public."calls";
CREATE POLICY "Users can insert calls" ON public."calls"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can update their calls" ON public."calls";
CREATE POLICY "Users can update their calls" ON public."calls"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Users can view own calls" ON public."calls";
CREATE POLICY "Users can view own calls" ON public."calls"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.campaign_ab_variants
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view AB variants" ON public."campaign_ab_variants";
CREATE POLICY "Authenticated can view AB variants" ON public."campaign_ab_variants"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "Campaign owners or admins can delete AB variants" ON public."campaign_ab_variants";
CREATE POLICY "Campaign owners or admins can delete AB variants" ON public."campaign_ab_variants"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM campaigns c
  WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid()))))));
DROP POLICY IF EXISTS "Campaign owners or admins can insert AB variants" ON public."campaign_ab_variants";
CREATE POLICY "Campaign owners or admins can insert AB variants" ON public."campaign_ab_variants"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM campaigns c
  WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid()))))));
DROP POLICY IF EXISTS "Campaign owners or admins can update AB variants" ON public."campaign_ab_variants";
CREATE POLICY "Campaign owners or admins can update AB variants" ON public."campaign_ab_variants"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM campaigns c
  WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid()))))));

-- --------------------------------------------------------
-- public.campaign_contacts
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert campaign contacts" ON public."campaign_contacts";
CREATE POLICY "Admins can insert campaign contacts" ON public."campaign_contacts"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can manage campaign contacts" ON public."campaign_contacts";
CREATE POLICY "Admins can manage campaign contacts" ON public."campaign_contacts"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can view campaign contacts" ON public."campaign_contacts";
CREATE POLICY "Admins can view campaign contacts" ON public."campaign_contacts"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.campaigns
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert campaigns" ON public."campaigns";
CREATE POLICY "Admins can insert campaigns" ON public."campaigns"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can manage campaigns" ON public."campaigns";
CREATE POLICY "Admins can manage campaigns" ON public."campaigns"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Campaigns visible to admins or creator" ON public."campaigns";
CREATE POLICY "Campaigns visible to admins or creator" ON public."campaigns"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_admin_or_supervisor(auth.uid()) OR (created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));

-- --------------------------------------------------------
-- public.channel_connections
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins full access to channels" ON public."channel_connections";
CREATE POLICY "Admins full access to channels" ON public."channel_connections"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- --------------------------------------------------------
-- public.channel_routing_rules
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage routing rules" ON public."channel_routing_rules";
CREATE POLICY "Admins can manage routing rules" ON public."channel_routing_rules"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view routing rules" ON public."channel_routing_rules";
CREATE POLICY "Authenticated can view routing rules" ON public."channel_routing_rules"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.chatbot_executions
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage chatbot executions" ON public."chatbot_executions";
CREATE POLICY "Admins can manage chatbot executions" ON public."chatbot_executions"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view chatbot executions" ON public."chatbot_executions";
CREATE POLICY "Authenticated can view chatbot executions" ON public."chatbot_executions"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.chatbot_flows
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert chatbot flows" ON public."chatbot_flows";
CREATE POLICY "Admins can insert chatbot flows" ON public."chatbot_flows"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can manage chatbot flows" ON public."chatbot_flows";
CREATE POLICY "Admins can manage chatbot flows" ON public."chatbot_flows"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view chatbot flows" ON public."chatbot_flows";
CREATE POLICY "Authenticated can view chatbot flows" ON public."chatbot_flows"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.client_wallet_rules
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage wallet rules" ON public."client_wallet_rules";
CREATE POLICY "Admins can manage wallet rules" ON public."client_wallet_rules"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Wallet rules visible to admins only" ON public."client_wallet_rules";
CREATE POLICY "Wallet rules visible to admins only" ON public."client_wallet_rules"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.connection_health_logs
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete health logs" ON public."connection_health_logs";
CREATE POLICY "Admins can delete health logs" ON public."connection_health_logs"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can insert health logs" ON public."connection_health_logs";
CREATE POLICY "Admins can insert health logs" ON public."connection_health_logs"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can view health logs" ON public."connection_health_logs";
CREATE POLICY "Admins can view health logs" ON public."connection_health_logs"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.contact_custom_fields
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can delete own custom fields" ON public."contact_custom_fields";
CREATE POLICY "Authenticated can delete own custom fields" ON public."contact_custom_fields"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Authenticated can update own custom fields" ON public."contact_custom_fields";
CREATE POLICY "Authenticated can update own custom fields" ON public."contact_custom_fields"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Authenticated can view custom fields" ON public."contact_custom_fields";
CREATE POLICY "Authenticated can view custom fields" ON public."contact_custom_fields"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can insert custom fields for assigned contacts" ON public."contact_custom_fields";
CREATE POLICY "Users can insert custom fields for assigned contacts" ON public."contact_custom_fields"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.contact_notes
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can insert notes" ON public."contact_notes";
CREATE POLICY "Authenticated users can insert notes" ON public."contact_notes"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((author_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Users can delete their own notes" ON public."contact_notes";
CREATE POLICY "Users can delete their own notes" ON public."contact_notes"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((author_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Users can update their own notes" ON public."contact_notes";
CREATE POLICY "Users can update their own notes" ON public."contact_notes"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((author_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Users can view notes on accessible contacts" ON public."contact_notes";
CREATE POLICY "Users can view notes on accessible contacts" ON public."contact_notes"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.contact_purchases
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Agents can delete purchases for assigned contacts" ON public."contact_purchases";
CREATE POLICY "Agents can delete purchases for assigned contacts" ON public."contact_purchases"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Agents can insert purchases for assigned contacts" ON public."contact_purchases";
CREATE POLICY "Agents can insert purchases for assigned contacts" ON public."contact_purchases"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Agents can update purchases for assigned contacts" ON public."contact_purchases";
CREATE POLICY "Agents can update purchases for assigned contacts" ON public."contact_purchases"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Agents can view purchases for assigned contacts" ON public."contact_purchases";
CREATE POLICY "Agents can view purchases for assigned contacts" ON public."contact_purchases"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.contact_tags
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can delete contact tags" ON public."contact_tags";
CREATE POLICY "Authenticated can delete contact tags" ON public."contact_tags"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can insert tags for assigned contacts" ON public."contact_tags";
CREATE POLICY "Users can insert tags for assigned contacts" ON public."contact_tags"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can view contact tags" ON public."contact_tags";
CREATE POLICY "Users can view contact tags" ON public."contact_tags"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.contacts
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all contacts including unassigned" ON public."contacts";
CREATE POLICY "Admins can view all contacts including unassigned" ON public."contacts"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can insert contacts" ON public."contacts";
CREATE POLICY "Users can insert contacts" ON public."contacts"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((is_admin_or_supervisor(auth.uid()) OR ((assigned_to IS NOT NULL) AND (assigned_to IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))))));
DROP POLICY IF EXISTS "Users can update their assigned contacts" ON public."contacts";
CREATE POLICY "Users can update their assigned contacts" ON public."contacts"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "contacts_select_policy" ON public."contacts";
CREATE POLICY "contacts_select_policy" ON public."contacts"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_admin_or_supervisor(auth.uid()) OR (assigned_to = get_profile_id_for_user(auth.uid())) OR (assigned_to IS NULL)));

-- --------------------------------------------------------
-- public.conversation_analyses
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view analyses" ON public."conversation_analyses";
CREATE POLICY "Authenticated users can view analyses" ON public."conversation_analyses"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can insert own analyses" ON public."conversation_analyses";
CREATE POLICY "Users can insert own analyses" ON public."conversation_analyses"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((analyzed_by IS NULL) OR (analyzed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.conversation_closures
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Agents can create closures for their contacts" ON public."conversation_closures";
CREATE POLICY "Agents can create closures for their contacts" ON public."conversation_closures"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_contact_visible_to_user(contact_id, auth.uid()));
DROP POLICY IF EXISTS "Agents or admins can view closures" ON public."conversation_closures";
CREATE POLICY "Agents or admins can view closures" ON public."conversation_closures"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.conversation_events
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Agents or admins can view conversation events" ON public."conversation_events";
CREATE POLICY "Agents or admins can view conversation events" ON public."conversation_events"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Authorized users can insert events" ON public."conversation_events";
CREATE POLICY "Authorized users can insert events" ON public."conversation_events"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((((performed_by IS NULL) OR (performed_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1))) AND (is_admin_or_supervisor(auth.uid()) OR (contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to = ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid())
         LIMIT 1)))))));

-- --------------------------------------------------------
-- public.conversation_memory
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Agents can insert memory for their contacts" ON public."conversation_memory";
CREATE POLICY "Agents can insert memory for their contacts" ON public."conversation_memory"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_contact_visible_to_user(contact_id, auth.uid()));
DROP POLICY IF EXISTS "Agents can update memory for their contacts" ON public."conversation_memory";
CREATE POLICY "Agents can update memory for their contacts" ON public."conversation_memory"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_contact_visible_to_user(contact_id, auth.uid()));
DROP POLICY IF EXISTS "Agents or admins can view memory" ON public."conversation_memory";
CREATE POLICY "Agents or admins can view memory" ON public."conversation_memory"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.conversation_sla
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert SLA" ON public."conversation_sla";
CREATE POLICY "Admins can insert SLA" ON public."conversation_sla"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can update SLA" ON public."conversation_sla";
CREATE POLICY "Admins can update SLA" ON public."conversation_sla"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view SLA data" ON public."conversation_sla";
CREATE POLICY "Authenticated users can view SLA data" ON public."conversation_sla"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.conversation_snoozes
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can create own snoozes" ON public."conversation_snoozes";
CREATE POLICY "Users can create own snoozes" ON public."conversation_snoozes"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((snoozed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Users can delete own snoozes" ON public."conversation_snoozes";
CREATE POLICY "Users can delete own snoozes" ON public."conversation_snoozes"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((snoozed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Users can view own snoozes" ON public."conversation_snoozes";
CREATE POLICY "Users can view own snoozes" ON public."conversation_snoozes"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((snoozed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));

-- --------------------------------------------------------
-- public.conversation_tasks
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Agents can create tasks for their contacts" ON public."conversation_tasks";
CREATE POLICY "Agents can create tasks for their contacts" ON public."conversation_tasks"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_contact_visible_to_user(contact_id, auth.uid()));
DROP POLICY IF EXISTS "Agents can update own or assigned tasks" ON public."conversation_tasks";
CREATE POLICY "Agents can update own or assigned tasks" ON public."conversation_tasks"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((assigned_to = get_profile_id_for_user(auth.uid())) OR (created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Agents or admins can view tasks" ON public."conversation_tasks";
CREATE POLICY "Agents or admins can view tasks" ON public."conversation_tasks"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR (assigned_to = get_profile_id_for_user(auth.uid())) OR (created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Creators or admins can delete tasks" ON public."conversation_tasks";
CREATE POLICY "Creators or admins can delete tasks" ON public."conversation_tasks"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.crisis_room_alerts
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete crisis alerts" ON public."crisis_room_alerts";
CREATE POLICY "Admins can delete crisis alerts" ON public."crisis_room_alerts"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can insert crisis alerts" ON public."crisis_room_alerts";
CREATE POLICY "Admins can insert crisis alerts" ON public."crisis_room_alerts"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can update crisis alerts" ON public."crisis_room_alerts";
CREATE POLICY "Admins can update crisis alerts" ON public."crisis_room_alerts"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view crisis alerts" ON public."crisis_room_alerts";
CREATE POLICY "Authenticated can view crisis alerts" ON public."crisis_room_alerts"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((auth.uid() IS NOT NULL));

-- --------------------------------------------------------
-- public.csat_auto_config
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage csat config" ON public."csat_auto_config";
CREATE POLICY "Admins can manage csat config" ON public."csat_auto_config"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view csat config" ON public."csat_auto_config";
CREATE POLICY "Authenticated can view csat config" ON public."csat_auto_config"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.csat_surveys
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert CSAT surveys" ON public."csat_surveys";
CREATE POLICY "Users can insert CSAT surveys" ON public."csat_surveys"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((agent_id IS NULL) OR (agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can view own CSAT surveys" ON public."csat_surveys";
CREATE POLICY "Users can view own CSAT surveys" ON public."csat_surveys"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.custom_emojis
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can insert custom emojis" ON public."custom_emojis";
CREATE POLICY "Authenticated users can insert custom emojis" ON public."custom_emojis"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((uploaded_by = auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can update custom emojis" ON public."custom_emojis";
CREATE POLICY "Authenticated users can update custom emojis" ON public."custom_emojis"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())))
  WITH CHECK (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Authenticated users can view custom emojis" ON public."custom_emojis";
CREATE POLICY "Authenticated users can view custom emojis" ON public."custom_emojis"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Users can delete own or admin custom emojis" ON public."custom_emojis";
CREATE POLICY "Users can delete own or admin custom emojis" ON public."custom_emojis"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.deal_activities
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view deal activities" ON public."deal_activities";
CREATE POLICY "Admins can view deal activities" ON public."deal_activities"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Agents can view activities on their deals" ON public."deal_activities";
CREATE POLICY "Agents can view activities on their deals" ON public."deal_activities"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_admin_or_supervisor(auth.uid()) OR (performed_by = get_profile_id_for_user(auth.uid())) OR (deal_id IN ( SELECT sd.id
   FROM sales_deals sd
  WHERE (sd.assigned_to = get_profile_id_for_user(auth.uid()))))));
DROP POLICY IF EXISTS "Authenticated can insert deal activities" ON public."deal_activities";
CREATE POLICY "Authenticated can insert deal activities" ON public."deal_activities"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((performed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.email_labels
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage labels of own accounts" ON public."email_labels";
CREATE POLICY "Users can manage labels of own accounts" ON public."email_labels"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_labels.gmail_account_id) AND (ga.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Users can view labels of own accounts" ON public."email_labels";
CREATE POLICY "Users can view labels of own accounts" ON public."email_labels"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_labels.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));

-- --------------------------------------------------------
-- public.email_messages
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert messages for own accounts" ON public."email_messages";
CREATE POLICY "Users can insert messages for own accounts" ON public."email_messages"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND (ga.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Users can update messages of own accounts" ON public."email_messages";
CREATE POLICY "Users can update messages of own accounts" ON public."email_messages"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));
DROP POLICY IF EXISTS "Users can view messages of own accounts" ON public."email_messages";
CREATE POLICY "Users can view messages of own accounts" ON public."email_messages"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));

-- --------------------------------------------------------
-- public.email_threads
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete threads of own accounts" ON public."email_threads";
CREATE POLICY "Users can delete threads of own accounts" ON public."email_threads"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND (ga.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Users can insert threads for own accounts" ON public."email_threads";
CREATE POLICY "Users can insert threads for own accounts" ON public."email_threads"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND (ga.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Users can update threads of own accounts" ON public."email_threads";
CREATE POLICY "Users can update threads of own accounts" ON public."email_threads"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));
DROP POLICY IF EXISTS "Users can view threads of own accounts" ON public."email_threads";
CREATE POLICY "Users can view threads of own accounts" ON public."email_threads"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));

-- --------------------------------------------------------
-- public.entity_versions
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view entity versions" ON public."entity_versions";
CREATE POLICY "Admins can view entity versions" ON public."entity_versions"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Block authenticated version inserts" ON public."entity_versions";
CREATE POLICY "Block authenticated version inserts" ON public."entity_versions"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- --------------------------------------------------------
-- public.favorite_contacts
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own favorites" ON public."favorite_contacts";
CREATE POLICY "Users can manage own favorites" ON public."favorite_contacts"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((user_id = auth.uid()));

-- --------------------------------------------------------
-- public.followup_executions
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage followup executions" ON public."followup_executions";
CREATE POLICY "Admins can manage followup executions" ON public."followup_executions"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view followup executions" ON public."followup_executions";
CREATE POLICY "Authenticated can view followup executions" ON public."followup_executions"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.followup_sequences
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage followup sequences" ON public."followup_sequences";
CREATE POLICY "Admins can manage followup sequences" ON public."followup_sequences"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can view followup sequences" ON public."followup_sequences";
CREATE POLICY "Admins can view followup sequences" ON public."followup_sequences"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.followup_steps
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage followup steps" ON public."followup_steps";
CREATE POLICY "Admins can manage followup steps" ON public."followup_steps"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can view followup steps" ON public."followup_steps";
CREATE POLICY "Admins can view followup steps" ON public."followup_steps"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.geo_blocking_settings
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage geo settings" ON public."geo_blocking_settings";
CREATE POLICY "Admins can manage geo settings" ON public."geo_blocking_settings"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Geo blocking visible to admins only" ON public."geo_blocking_settings";
CREATE POLICY "Geo blocking visible to admins only" ON public."geo_blocking_settings"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.global_settings
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage global settings" ON public."global_settings";
CREATE POLICY "Admins can manage global settings" ON public."global_settings"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can view global settings" ON public."global_settings";
CREATE POLICY "Admins can view global settings" ON public."global_settings"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.gmail_accounts
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Block authenticated gmail deletes" ON public."gmail_accounts";
CREATE POLICY "Block authenticated gmail deletes" ON public."gmail_accounts"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (false);
DROP POLICY IF EXISTS "Block authenticated gmail inserts" ON public."gmail_accounts";
CREATE POLICY "Block authenticated gmail inserts" ON public."gmail_accounts"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS "Block authenticated gmail updates" ON public."gmail_accounts";
CREATE POLICY "Block authenticated gmail updates" ON public."gmail_accounts"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (false);
DROP POLICY IF EXISTS "Service role only for gmail accounts" ON public."gmail_accounts";
CREATE POLICY "Service role only for gmail accounts" ON public."gmail_accounts"
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
DROP POLICY IF EXISTS "Users can view their own gmail accounts" ON public."gmail_accounts";
CREATE POLICY "Users can view their own gmail accounts" ON public."gmail_accounts"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

-- --------------------------------------------------------
-- public.goals_configurations
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage their own goals" ON public."goals_configurations";
CREATE POLICY "Users can manage their own goals" ON public."goals_configurations"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())))
  WITH CHECK (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can view their own goals" ON public."goals_configurations";
CREATE POLICY "Users can view their own goals" ON public."goals_configurations"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.ip_whitelist
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage IP whitelist" ON public."ip_whitelist";
CREATE POLICY "Admins can manage IP whitelist" ON public."ip_whitelist"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can view IP whitelist" ON public."ip_whitelist";
CREATE POLICY "Admins can view IP whitelist" ON public."ip_whitelist"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.knowledge_base_articles
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage knowledge base" ON public."knowledge_base_articles";
CREATE POLICY "Admins can manage knowledge base" ON public."knowledge_base_articles"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view knowledge base" ON public."knowledge_base_articles";
CREATE POLICY "Authenticated can view knowledge base" ON public."knowledge_base_articles"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((is_published = true) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.knowledge_base_files
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage kb files" ON public."knowledge_base_files";
CREATE POLICY "Admins can manage kb files" ON public."knowledge_base_files"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Users can view knowledge base files" ON public."knowledge_base_files";
CREATE POLICY "Users can view knowledge base files" ON public."knowledge_base_files"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((article_id IN ( SELECT a.id
   FROM knowledge_base_articles a
  WHERE (a.is_published = true))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.login_attempts
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Block authenticated inserts on login_attempts" ON public."login_attempts";
CREATE POLICY "Block authenticated inserts on login_attempts" ON public."login_attempts"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS "Block authenticated updates on login_attempts" ON public."login_attempts";
CREATE POLICY "Block authenticated updates on login_attempts" ON public."login_attempts"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (false);
DROP POLICY IF EXISTS "Only admins can delete login attempts" ON public."login_attempts";
CREATE POLICY "Only admins can delete login attempts" ON public."login_attempts"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Only admins can view login attempts" ON public."login_attempts";
CREATE POLICY "Only admins can view login attempts" ON public."login_attempts"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- --------------------------------------------------------
-- public.message_reactions
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own reactions" ON public."message_reactions";
CREATE POLICY "Users can delete their own reactions" ON public."message_reactions"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((user_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Users can insert reactions for assigned contacts" ON public."message_reactions";
CREATE POLICY "Users can insert reactions for assigned contacts" ON public."message_reactions"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can view reactions on accessible messages" ON public."message_reactions";
CREATE POLICY "Users can view reactions on accessible messages" ON public."message_reactions"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((message_id IN ( SELECT m.id
   FROM messages m
  WHERE (m.contact_id IN ( SELECT c.id
           FROM contacts c
          WHERE ((c.assigned_to IN ( SELECT p.id
                   FROM profiles p
                  WHERE (p.user_id = auth.uid()))) OR (c.assigned_to IS NULL)))))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "message_reactions_delete_policy" ON public."message_reactions";
CREATE POLICY "message_reactions_delete_policy" ON public."message_reactions"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));
DROP POLICY IF EXISTS "message_reactions_insert_policy" ON public."message_reactions";
CREATE POLICY "message_reactions_insert_policy" ON public."message_reactions"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));
DROP POLICY IF EXISTS "message_reactions_select_policy" ON public."message_reactions";
CREATE POLICY "message_reactions_select_policy" ON public."message_reactions"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));
DROP POLICY IF EXISTS "message_reactions_update_policy" ON public."message_reactions";
CREATE POLICY "message_reactions_update_policy" ON public."message_reactions"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));

-- --------------------------------------------------------
-- public.message_templates
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can create their own templates" ON public."message_templates";
CREATE POLICY "Users can create their own templates" ON public."message_templates"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete their own templates" ON public."message_templates";
CREATE POLICY "Users can delete their own templates" ON public."message_templates"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update their own templates" ON public."message_templates";
CREATE POLICY "Users can update their own templates" ON public."message_templates"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view their templates and global ones" ON public."message_templates";
CREATE POLICY "Users can view their templates and global ones" ON public."message_templates"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((user_id = auth.uid()) OR (is_global = true)));

-- --------------------------------------------------------
-- public.messages
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert messages" ON public."messages";
CREATE POLICY "Users can insert messages" ON public."messages"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((agent_id IS NULL) OR (agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can update messages from their assigned contacts" ON public."messages";
CREATE POLICY "Users can update messages from their assigned contacts" ON public."messages"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can view messages from their assigned contacts" ON public."messages";
CREATE POLICY "Users can view messages from their assigned contacts" ON public."messages"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "messages_select_policy" ON public."messages";
CREATE POLICY "messages_select_policy" ON public."messages"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM contacts c
  WHERE ((c.id = messages.contact_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));

-- --------------------------------------------------------
-- public.meta_capi_events
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage capi events" ON public."meta_capi_events";
CREATE POLICY "Admins can manage capi events" ON public."meta_capi_events"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can view capi events" ON public."meta_capi_events";
CREATE POLICY "Admins can view capi events" ON public."meta_capi_events"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.mfa_sessions
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own MFA sessions" ON public."mfa_sessions";
CREATE POLICY "Users can manage own MFA sessions" ON public."mfa_sessions"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

-- --------------------------------------------------------
-- public.notifications
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Block authenticated notification inserts" ON public."notifications";
CREATE POLICY "Block authenticated notification inserts" ON public."notifications"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS "Users can delete own notifications" ON public."notifications";
CREATE POLICY "Users can delete own notifications" ON public."notifications"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update own notifications" ON public."notifications";
CREATE POLICY "Users can update own notifications" ON public."notifications"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view own notifications" ON public."notifications";
CREATE POLICY "Users can view own notifications" ON public."notifications"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

-- --------------------------------------------------------
-- public.nps_surveys
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins and own agents can view NPS surveys" ON public."nps_surveys";
CREATE POLICY "Admins and own agents can view NPS surveys" ON public."nps_surveys"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_admin_or_supervisor(auth.uid()) OR (agent_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));
DROP POLICY IF EXISTS "Admins can delete NPS surveys" ON public."nps_surveys";
CREATE POLICY "Admins can delete NPS surveys" ON public."nps_surveys"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can update NPS surveys" ON public."nps_surveys";
CREATE POLICY "Admins can update NPS surveys" ON public."nps_surveys"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Users can create own NPS surveys" ON public."nps_surveys";
CREATE POLICY "Users can create own NPS surveys" ON public."nps_surveys"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((agent_id IS NOT NULL) AND (agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));

-- --------------------------------------------------------
-- public.number_reputation
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert reputation" ON public."number_reputation";
CREATE POLICY "Admins can insert reputation" ON public."number_reputation"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can update reputation" ON public."number_reputation";
CREATE POLICY "Admins can update reputation" ON public."number_reputation"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view reputation" ON public."number_reputation";
CREATE POLICY "Authenticated can view reputation" ON public."number_reputation"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.passkey_credentials
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete own passkeys" ON public."passkey_credentials";
CREATE POLICY "Users can delete own passkeys" ON public."passkey_credentials"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert own passkeys" ON public."passkey_credentials";
CREATE POLICY "Users can insert own passkeys" ON public."passkey_credentials"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update own passkeys" ON public."passkey_credentials";
CREATE POLICY "Users can update own passkeys" ON public."passkey_credentials"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view own passkeys" ON public."passkey_credentials";
CREATE POLICY "Users can view own passkeys" ON public."passkey_credentials"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

-- --------------------------------------------------------
-- public.password_reset_requests
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete password reset requests" ON public."password_reset_requests";
CREATE POLICY "Admins can delete password reset requests" ON public."password_reset_requests"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can update reset requests without token access" ON public."password_reset_requests";
CREATE POLICY "Admins can update reset requests without token access" ON public."password_reset_requests"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can view reset requests" ON public."password_reset_requests";
CREATE POLICY "Admins can view reset requests" ON public."password_reset_requests"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can request own password reset" ON public."password_reset_requests";
CREATE POLICY "Users can request own password reset" ON public."password_reset_requests"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = auth.uid()));

-- --------------------------------------------------------
-- public.payment_links
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete payment links" ON public."payment_links";
CREATE POLICY "Admins can delete payment links" ON public."payment_links"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can insert payment links" ON public."payment_links";
CREATE POLICY "Authenticated can insert payment links" ON public."payment_links"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can update own payment links" ON public."payment_links";
CREATE POLICY "Users can update own payment links" ON public."payment_links"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can view own payment links" ON public."payment_links";
CREATE POLICY "Users can view own payment links" ON public."payment_links"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.performance_snapshots
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete performance snapshots" ON public."performance_snapshots";
CREATE POLICY "Admins can delete performance snapshots" ON public."performance_snapshots"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can view all performance snapshots" ON public."performance_snapshots";
CREATE POLICY "Admins can view all performance snapshots" ON public."performance_snapshots"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Users can insert own performance snapshots" ON public."performance_snapshots";
CREATE POLICY "Users can insert own performance snapshots" ON public."performance_snapshots"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((profile_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
DROP POLICY IF EXISTS "Users can view own performance snapshots" ON public."performance_snapshots";
CREATE POLICY "Users can view own performance snapshots" ON public."performance_snapshots"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((profile_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));

-- --------------------------------------------------------
-- public.permissions
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage permissions" ON public."permissions";
CREATE POLICY "Admins can manage permissions" ON public."permissions"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view permissions" ON public."permissions";
CREATE POLICY "Authenticated can view permissions" ON public."permissions"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.pinned_conversations
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own pins" ON public."pinned_conversations";
CREATE POLICY "Users can manage own pins" ON public."pinned_conversations"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((pinned_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));

-- --------------------------------------------------------
-- public.playbooks
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete playbooks" ON public."playbooks";
CREATE POLICY "Admins can delete playbooks" ON public."playbooks"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can manage playbooks" ON public."playbooks";
CREATE POLICY "Admins can manage playbooks" ON public."playbooks"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can update playbooks" ON public."playbooks";
CREATE POLICY "Admins can update playbooks" ON public."playbooks"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view playbooks" ON public."playbooks";
CREATE POLICY "Authenticated can view playbooks" ON public."playbooks"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.products
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert products" ON public."products";
CREATE POLICY "Admins can insert products" ON public."products"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can manage products" ON public."products";
CREATE POLICY "Admins can manage products" ON public."products"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view products" ON public."products";
CREATE POLICY "Authenticated users can view products" ON public."products"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.profiles
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admin supervisor can view all profiles" ON public."profiles";
CREATE POLICY "Admin supervisor can view all profiles" ON public."profiles"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can update any profile" ON public."profiles";
CREATE POLICY "Admins can update any profile" ON public."profiles"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Block sensitive field changes by non-admins" ON public."profiles";
CREATE POLICY "Block sensitive field changes by non-admins" ON public."profiles"
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  WITH CHECK ((is_admin_or_supervisor(auth.uid()) OR ((role = ( SELECT p.role
   FROM profiles p
  WHERE (p.user_id = auth.uid()))) AND (access_level = ( SELECT p.access_level
   FROM profiles p
  WHERE (p.user_id = auth.uid()))) AND (permissions = ( SELECT p.permissions
   FROM profiles p
  WHERE (p.user_id = auth.uid()))) AND (is_active = ( SELECT p.is_active
   FROM profiles p
  WHERE (p.user_id = auth.uid()))))));
DROP POLICY IF EXISTS "Users can insert their own profile safely" ON public."profiles";
CREATE POLICY "Users can insert their own profile safely" ON public."profiles"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((auth.uid() = user_id) AND ((role IS NULL) OR (role = 'agent'::text)) AND ((access_level IS NULL) OR (access_level = 'basic'::text)) AND ((permissions IS NULL) OR (permissions = '{}'::jsonb))));
DROP POLICY IF EXISTS "Users can update own profile" ON public."profiles";
CREATE POLICY "Users can update own profile" ON public."profiles"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can view own profile" ON public."profiles";
CREATE POLICY "Users can view own profile" ON public."profiles"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

-- --------------------------------------------------------
-- public.query_telemetry
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete telemetry" ON public."query_telemetry";
CREATE POLICY "Admins can delete telemetry" ON public."query_telemetry"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Users can insert own telemetry" ON public."query_telemetry";
CREATE POLICY "Users can insert own telemetry" ON public."query_telemetry"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view own telemetry" ON public."query_telemetry";
CREATE POLICY "Users can view own telemetry" ON public."query_telemetry"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.queue_goals
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage queue goals" ON public."queue_goals";
CREATE POLICY "Admins can manage queue goals" ON public."queue_goals"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view queue goals" ON public."queue_goals";
CREATE POLICY "Authenticated users can view queue goals" ON public."queue_goals"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.queue_members
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage queue members" ON public."queue_members";
CREATE POLICY "Admins can manage queue members" ON public."queue_members"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Queue members visible to admins or self" ON public."queue_members";
CREATE POLICY "Queue members visible to admins or self" ON public."queue_members"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_admin_or_supervisor(auth.uid()) OR (profile_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));

-- --------------------------------------------------------
-- public.queue_positions
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage queue positions" ON public."queue_positions";
CREATE POLICY "Admins can manage queue positions" ON public."queue_positions"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Users can view queue positions" ON public."queue_positions";
CREATE POLICY "Users can view queue positions" ON public."queue_positions"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.queue_skill_requirements
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage queue skills" ON public."queue_skill_requirements";
CREATE POLICY "Admins can manage queue skills" ON public."queue_skill_requirements"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view queue skills" ON public."queue_skill_requirements";
CREATE POLICY "Authenticated can view queue skills" ON public."queue_skill_requirements"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.queues
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage queues" ON public."queues";
CREATE POLICY "Admins can manage queues" ON public."queues"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view queues" ON public."queues";
CREATE POLICY "Authenticated users can view queues" ON public."queues"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.rate_limit_configs
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage rate limit configs" ON public."rate_limit_configs";
CREATE POLICY "Admins can manage rate limit configs" ON public."rate_limit_configs"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can read rate limit configs" ON public."rate_limit_configs";
CREATE POLICY "Admins can read rate limit configs" ON public."rate_limit_configs"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.rate_limit_logs
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert rate limit logs" ON public."rate_limit_logs";
CREATE POLICY "Admins can insert rate limit logs" ON public."rate_limit_logs"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can view rate limit logs" ON public."rate_limit_logs";
CREATE POLICY "Admins can view rate limit logs" ON public."rate_limit_logs"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.reminders
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own reminders" ON public."reminders";
CREATE POLICY "Users can manage own reminders" ON public."reminders"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));

-- --------------------------------------------------------
-- public.role_permissions
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage role permissions" ON public."role_permissions";
CREATE POLICY "Admins can manage role permissions" ON public."role_permissions"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view role permissions" ON public."role_permissions";
CREATE POLICY "Authenticated can view role permissions" ON public."role_permissions"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.sales_deals
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete deals" ON public."sales_deals";
CREATE POLICY "Admins can delete deals" ON public."sales_deals"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Users can insert deals" ON public."sales_deals";
CREATE POLICY "Users can insert deals" ON public."sales_deals"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((assigned_to IS NULL) OR (assigned_to IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can update assigned deals" ON public."sales_deals";
CREATE POLICY "Users can update assigned deals" ON public."sales_deals"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((assigned_to IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can view assigned or admin deals" ON public."sales_deals";
CREATE POLICY "Users can view assigned or admin deals" ON public."sales_deals"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_admin_or_supervisor(auth.uid()) OR (assigned_to IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));

-- --------------------------------------------------------
-- public.sales_pipeline_stages
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage pipeline stages" ON public."sales_pipeline_stages";
CREATE POLICY "Admins can manage pipeline stages" ON public."sales_pipeline_stages"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view pipeline stages" ON public."sales_pipeline_stages";
CREATE POLICY "Authenticated can view pipeline stages" ON public."sales_pipeline_stages"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.saved_filters
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete own saved filters" ON public."saved_filters";
CREATE POLICY "Users can delete own saved filters" ON public."saved_filters"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert own saved filters" ON public."saved_filters";
CREATE POLICY "Users can insert own saved filters" ON public."saved_filters"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update own saved filters" ON public."saved_filters";
CREATE POLICY "Users can update own saved filters" ON public."saved_filters"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view own saved filters" ON public."saved_filters";
CREATE POLICY "Users can view own saved filters" ON public."saved_filters"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view shared filters" ON public."saved_filters";
CREATE POLICY "Users can view shared filters" ON public."saved_filters"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_shared = true));

-- --------------------------------------------------------
-- public.scheduled_messages
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can create scheduled messages" ON public."scheduled_messages";
CREATE POLICY "Users can create scheduled messages" ON public."scheduled_messages"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can delete their scheduled messages" ON public."scheduled_messages";
CREATE POLICY "Users can delete their scheduled messages" ON public."scheduled_messages"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can update their scheduled messages" ON public."scheduled_messages";
CREATE POLICY "Users can update their scheduled messages" ON public."scheduled_messages"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can view their scheduled messages" ON public."scheduled_messages";
CREATE POLICY "Users can view their scheduled messages" ON public."scheduled_messages"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.scheduled_report_configs
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admin/supervisor can delete report configs" ON public."scheduled_report_configs";
CREATE POLICY "Admin/supervisor can delete report configs" ON public."scheduled_report_configs"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admin/supervisor can insert report configs" ON public."scheduled_report_configs";
CREATE POLICY "Admin/supervisor can insert report configs" ON public."scheduled_report_configs"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admin/supervisor can update report configs" ON public."scheduled_report_configs";
CREATE POLICY "Admin/supervisor can update report configs" ON public."scheduled_report_configs"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can read report configs" ON public."scheduled_report_configs";
CREATE POLICY "Admins can read report configs" ON public."scheduled_report_configs"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.scheduled_reports
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert scheduled reports" ON public."scheduled_reports";
CREATE POLICY "Admins can insert scheduled reports" ON public."scheduled_reports"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can manage scheduled reports" ON public."scheduled_reports";
CREATE POLICY "Admins can manage scheduled reports" ON public."scheduled_reports"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can view scheduled reports" ON public."scheduled_reports";
CREATE POLICY "Admins can view scheduled reports" ON public."scheduled_reports"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.security_alerts
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert security alerts" ON public."security_alerts";
CREATE POLICY "Admins can insert security alerts" ON public."security_alerts"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can manage security alerts" ON public."security_alerts";
CREATE POLICY "Admins can manage security alerts" ON public."security_alerts"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.sicoob_contact_mapping
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can insert sicoob mappings" ON public."sicoob_contact_mapping";
CREATE POLICY "Authenticated users can insert sicoob mappings" ON public."sicoob_contact_mapping"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Only admins can view sicoob mappings" ON public."sicoob_contact_mapping";
CREATE POLICY "Only admins can view sicoob mappings" ON public."sicoob_contact_mapping"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Service role can manage sicoob mappings" ON public."sicoob_contact_mapping";
CREATE POLICY "Service role can manage sicoob mappings" ON public."sicoob_contact_mapping"
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------
-- public.sla_configurations
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage SLA configurations" ON public."sla_configurations";
CREATE POLICY "Admins can manage SLA configurations" ON public."sla_configurations"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view SLA configurations" ON public."sla_configurations";
CREATE POLICY "Authenticated users can view SLA configurations" ON public."sla_configurations"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.sla_rules
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins and supervisors can delete SLA rules" ON public."sla_rules";
CREATE POLICY "Admins and supervisors can delete SLA rules" ON public."sla_rules"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins and supervisors can insert SLA rules" ON public."sla_rules";
CREATE POLICY "Admins and supervisors can insert SLA rules" ON public."sla_rules"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins and supervisors can update SLA rules" ON public."sla_rules";
CREATE POLICY "Admins and supervisors can update SLA rules" ON public."sla_rules"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "SLA rules visible to admins only" ON public."sla_rules";
CREATE POLICY "SLA rules visible to admins only" ON public."sla_rules"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.stickers
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view stickers" ON public."stickers";
CREATE POLICY "Authenticated users can view stickers" ON public."stickers"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Sticker delete with ownership" ON public."stickers";
CREATE POLICY "Sticker delete with ownership" ON public."stickers"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Sticker insert with ownership" ON public."stickers";
CREATE POLICY "Sticker insert with ownership" ON public."stickers"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Sticker update with ownership" ON public."stickers";
CREATE POLICY "Sticker update with ownership" ON public."stickers"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid())))
  WITH CHECK (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.tags
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage tags" ON public."tags";
CREATE POLICY "Admins can manage tags" ON public."tags"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view tags" ON public."tags";
CREATE POLICY "Authenticated users can view tags" ON public."tags"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Users can insert tags" ON public."tags";
CREATE POLICY "Users can insert tags" ON public."tags"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((created_by IS NULL) OR (created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.talkx_blacklist
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can add to blacklist" ON public."talkx_blacklist";
CREATE POLICY "Admins can add to blacklist" ON public."talkx_blacklist"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can remove from blacklist" ON public."talkx_blacklist";
CREATE POLICY "Admins can remove from blacklist" ON public."talkx_blacklist"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Only admins can view blacklist" ON public."talkx_blacklist";
CREATE POLICY "Only admins can view blacklist" ON public."talkx_blacklist"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.talkx_campaigns
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all campaigns" ON public."talkx_campaigns";
CREATE POLICY "Admins can view all campaigns" ON public."talkx_campaigns"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Users can create campaigns" ON public."talkx_campaigns";
CREATE POLICY "Users can create campaigns" ON public."talkx_campaigns"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
DROP POLICY IF EXISTS "Users can delete own draft campaigns" ON public."talkx_campaigns";
CREATE POLICY "Users can delete own draft campaigns" ON public."talkx_campaigns"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)) AND (status = 'draft'::text)));
DROP POLICY IF EXISTS "Users can update own campaigns" ON public."talkx_campaigns";
CREATE POLICY "Users can update own campaigns" ON public."talkx_campaigns"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
DROP POLICY IF EXISTS "Users can view own campaigns" ON public."talkx_campaigns";
CREATE POLICY "Users can view own campaigns" ON public."talkx_campaigns"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));

-- --------------------------------------------------------
-- public.talkx_recipients
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete recipients of own campaigns" ON public."talkx_recipients";
CREATE POLICY "Users can delete recipients of own campaigns" ON public."talkx_recipients"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1)) AND (tc.status = 'draft'::text)))));
DROP POLICY IF EXISTS "Users can insert recipients to own campaigns" ON public."talkx_recipients";
CREATE POLICY "Users can insert recipients to own campaigns" ON public."talkx_recipients"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1))))));
DROP POLICY IF EXISTS "Users can update recipients of own campaigns" ON public."talkx_recipients";
CREATE POLICY "Users can update recipients of own campaigns" ON public."talkx_recipients"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1))))));
DROP POLICY IF EXISTS "Users can view recipients of own campaigns" ON public."talkx_recipients";
CREATE POLICY "Users can view recipients of own campaigns" ON public."talkx_recipients"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND ((tc.created_by = ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1)) OR is_admin_or_supervisor(auth.uid()))))));

-- --------------------------------------------------------
-- public.team_conversation_members
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can update conversation members" ON public."team_conversation_members";
CREATE POLICY "Admins can update conversation members" ON public."team_conversation_members"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Members and admins can add conversation members" ON public."team_conversation_members";
CREATE POLICY "Members and admins can add conversation members" ON public."team_conversation_members"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((is_team_conversation_member(auth.uid(), conversation_id) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Members and admins can view conversation members" ON public."team_conversation_members";
CREATE POLICY "Members and admins can view conversation members" ON public."team_conversation_members"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_team_conversation_member(auth.uid(), conversation_id) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Members can leave or admins can remove" ON public."team_conversation_members";
CREATE POLICY "Members can leave or admins can remove" ON public."team_conversation_members"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((profile_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.team_conversations
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public."team_conversations";
CREATE POLICY "Authenticated users can create conversations" ON public."team_conversations"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((created_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));
DROP POLICY IF EXISTS "Creator can update conversation" ON public."team_conversations";
CREATE POLICY "Creator can update conversation" ON public."team_conversations"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((created_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));
DROP POLICY IF EXISTS "Members can view their conversations" ON public."team_conversations";
CREATE POLICY "Members can view their conversations" ON public."team_conversations"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_team_conversation_member(auth.uid(), id) OR (created_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1))));

-- --------------------------------------------------------
-- public.team_messages
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Members can send messages" ON public."team_messages";
CREATE POLICY "Members can send messages" ON public."team_messages"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((is_team_conversation_member(auth.uid(), conversation_id) AND (sender_id = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1))));
DROP POLICY IF EXISTS "Members can view conversation messages" ON public."team_messages";
CREATE POLICY "Members can view conversation messages" ON public."team_messages"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_team_conversation_member(auth.uid(), conversation_id));
DROP POLICY IF EXISTS "Senders can delete own messages" ON public."team_messages";
CREATE POLICY "Senders can delete own messages" ON public."team_messages"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((sender_id = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));
DROP POLICY IF EXISTS "Senders can edit own messages" ON public."team_messages";
CREATE POLICY "Senders can edit own messages" ON public."team_messages"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((sender_id = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));

-- --------------------------------------------------------
-- public.training_sessions
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete own training sessions" ON public."training_sessions";
CREATE POLICY "Users can delete own training sessions" ON public."training_sessions"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((profile_id = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can insert own training sessions" ON public."training_sessions";
CREATE POLICY "Users can insert own training sessions" ON public."training_sessions"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((profile_id = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can update own training sessions" ON public."training_sessions";
CREATE POLICY "Users can update own training sessions" ON public."training_sessions"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((profile_id = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can view own training sessions" ON public."training_sessions";
CREATE POLICY "Users can view own training sessions" ON public."training_sessions"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((profile_id = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.user_devices
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all user devices" ON public."user_devices";
CREATE POLICY "Admins can view all user devices" ON public."user_devices"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Users can delete their own devices" ON public."user_devices";
CREATE POLICY "Users can delete their own devices" ON public."user_devices"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert their own devices" ON public."user_devices";
CREATE POLICY "Users can insert their own devices" ON public."user_devices"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update their own devices" ON public."user_devices";
CREATE POLICY "Users can update their own devices" ON public."user_devices"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view their own devices" ON public."user_devices";
CREATE POLICY "Users can view their own devices" ON public."user_devices"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

-- --------------------------------------------------------
-- public.user_roles
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Only admins can manage roles" ON public."user_roles";
CREATE POLICY "Only admins can manage roles" ON public."user_roles"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users view own roles, admins view all" ON public."user_roles";
CREATE POLICY "Users view own roles, admins view all" ON public."user_roles"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- public.user_service_accounts
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all service accounts" ON public."user_service_accounts";
CREATE POLICY "Admins can view all service accounts" ON public."user_service_accounts"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Only admins can delete service accounts" ON public."user_service_accounts";
CREATE POLICY "Only admins can delete service accounts" ON public."user_service_accounts"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Only admins can insert service accounts" ON public."user_service_accounts";
CREATE POLICY "Only admins can insert service accounts" ON public."user_service_accounts"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Only admins can update service accounts" ON public."user_service_accounts";
CREATE POLICY "Only admins can update service accounts" ON public."user_service_accounts"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Users can view own service accounts" ON public."user_service_accounts";
CREATE POLICY "Users can view own service accounts" ON public."user_service_accounts"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id));

-- --------------------------------------------------------
-- public.user_sessions
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can insert own sessions" ON public."user_sessions";
CREATE POLICY "Authenticated can insert own sessions" ON public."user_sessions"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete their own sessions" ON public."user_sessions";
CREATE POLICY "Users can delete their own sessions" ON public."user_sessions"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update their own sessions" ON public."user_sessions";
CREATE POLICY "Users can update their own sessions" ON public."user_sessions"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view their own sessions" ON public."user_sessions";
CREATE POLICY "Users can view their own sessions" ON public."user_sessions"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

-- --------------------------------------------------------
-- public.user_settings
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert their own settings" ON public."user_settings";
CREATE POLICY "Users can insert their own settings" ON public."user_settings"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update their own settings" ON public."user_settings";
CREATE POLICY "Users can update their own settings" ON public."user_settings"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view their own settings" ON public."user_settings";
CREATE POLICY "Users can view their own settings" ON public."user_settings"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

-- --------------------------------------------------------
-- public.voice_command_logs
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own voice logs" ON public."voice_command_logs";
CREATE POLICY "Users can insert own voice logs" ON public."voice_command_logs"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can read own voice logs" ON public."voice_command_logs";
CREATE POLICY "Users can read own voice logs" ON public."voice_command_logs"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id));

-- --------------------------------------------------------
-- public.warroom_alerts
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete warroom alerts" ON public."warroom_alerts";
CREATE POLICY "Admins can delete warroom alerts" ON public."warroom_alerts"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can insert alerts" ON public."warroom_alerts";
CREATE POLICY "Admins can insert alerts" ON public."warroom_alerts"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can update alerts" ON public."warroom_alerts";
CREATE POLICY "Admins can update alerts" ON public."warroom_alerts"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can view warroom alerts" ON public."warroom_alerts";
CREATE POLICY "Admins can view warroom alerts" ON public."warroom_alerts"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.webauthn_challenges
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Block anon access to webauthn challenges" ON public."webauthn_challenges";
CREATE POLICY "Block anon access to webauthn challenges" ON public."webauthn_challenges"
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS "Users can manage own challenges" ON public."webauthn_challenges";
CREATE POLICY "Users can manage own challenges" ON public."webauthn_challenges"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

-- --------------------------------------------------------
-- public.webhook_rate_limits
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete rate limits" ON public."webhook_rate_limits";
CREATE POLICY "Admins can delete rate limits" ON public."webhook_rate_limits"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can insert rate limits" ON public."webhook_rate_limits";
CREATE POLICY "Admins can insert rate limits" ON public."webhook_rate_limits"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can update rate limits" ON public."webhook_rate_limits";
CREATE POLICY "Admins can update rate limits" ON public."webhook_rate_limits"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can view rate limits" ON public."webhook_rate_limits";
CREATE POLICY "Admins can view rate limits" ON public."webhook_rate_limits"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.whatsapp_connection_queues
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage connection queues" ON public."whatsapp_connection_queues";
CREATE POLICY "Admins can manage connection queues" ON public."whatsapp_connection_queues"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view connection queues" ON public."whatsapp_connection_queues";
CREATE POLICY "Authenticated can view connection queues" ON public."whatsapp_connection_queues"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.whatsapp_connections
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admin supervisor view connections" ON public."whatsapp_connections";
CREATE POLICY "Admin supervisor view connections" ON public."whatsapp_connections"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can delete connections" ON public."whatsapp_connections";
CREATE POLICY "Admins can delete connections" ON public."whatsapp_connections"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can insert connections" ON public."whatsapp_connections";
CREATE POLICY "Admins can insert connections" ON public."whatsapp_connections"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can update connections" ON public."whatsapp_connections";
CREATE POLICY "Admins can update connections" ON public."whatsapp_connections"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- --------------------------------------------------------
-- public.whatsapp_flows
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage whatsapp flows" ON public."whatsapp_flows";
CREATE POLICY "Admins can manage whatsapp flows" ON public."whatsapp_flows"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view whatsapp flows" ON public."whatsapp_flows";
CREATE POLICY "Authenticated can view whatsapp flows" ON public."whatsapp_flows"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.whatsapp_groups
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage whatsapp groups" ON public."whatsapp_groups";
CREATE POLICY "Admins can manage whatsapp groups" ON public."whatsapp_groups"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view whatsapp groups" ON public."whatsapp_groups";
CREATE POLICY "Authenticated users can view whatsapp groups" ON public."whatsapp_groups"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.whatsapp_templates
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert templates" ON public."whatsapp_templates";
CREATE POLICY "Admins can insert templates" ON public."whatsapp_templates"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Admins can manage templates" ON public."whatsapp_templates";
CREATE POLICY "Admins can manage templates" ON public."whatsapp_templates"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view templates" ON public."whatsapp_templates";
CREATE POLICY "Authenticated users can view templates" ON public."whatsapp_templates"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- public.whisper_messages
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete own whisper messages" ON public."whisper_messages";
CREATE POLICY "Users can delete own whisper messages" ON public."whisper_messages"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "Users can insert own whisper messages" ON public."whisper_messages";
CREATE POLICY "Users can insert own whisper messages" ON public."whisper_messages"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((sender_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Users can view own whisper messages" ON public."whisper_messages";
CREATE POLICY "Users can view own whisper messages" ON public."whisper_messages"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((sender_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR (target_agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));

-- --------------------------------------------------------
-- storage.objects
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete team chat files" ON storage."objects";
CREATE POLICY "Admins can delete team chat files" ON storage."objects"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'team-chat-files'::text) AND is_admin_or_supervisor(auth.uid())));
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage."objects";
CREATE POLICY "Anyone can view avatars" ON storage."objects"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((bucket_id = 'avatars'::text));
DROP POLICY IF EXISTS "Anyone can view stickers" ON storage."objects";
CREATE POLICY "Anyone can view stickers" ON storage."objects"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((bucket_id = 'stickers'::text));
DROP POLICY IF EXISTS "Auth upload audio memes owned" ON storage."objects";
CREATE POLICY "Auth upload audio memes owned" ON storage."objects"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'audio-memes'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))));
DROP POLICY IF EXISTS "Auth upload custom emojis owned" ON storage."objects";
CREATE POLICY "Auth upload custom emojis owned" ON storage."objects"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'custom-emojis'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))));
DROP POLICY IF EXISTS "Auth upload stickers owned" ON storage."objects";
CREATE POLICY "Auth upload stickers owned" ON storage."objects"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'stickers'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))));
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage."objects";
CREATE POLICY "Avatar images are publicly accessible" ON storage."objects"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((bucket_id = 'avatars'::text));
DROP POLICY IF EXISTS "Public read audio memes" ON storage."objects";
CREATE POLICY "Public read audio memes" ON storage."objects"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((bucket_id = 'audio-memes'::text));
DROP POLICY IF EXISTS "Public read for custom emojis" ON storage."objects";
CREATE POLICY "Public read for custom emojis" ON storage."objects"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((bucket_id = 'custom-emojis'::text));
DROP POLICY IF EXISTS "Team chat files readable by owner admin or conversation member" ON storage."objects";
CREATE POLICY "Team chat files readable by owner admin or conversation member" ON storage."objects"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((bucket_id = 'team-chat-files'::text) AND (((auth.uid())::text = (storage.foldername(name))[1]) OR is_admin_or_supervisor(auth.uid()) OR (EXISTS ( SELECT 1
   FROM (((team_conversation_members tcm1
     JOIN profiles p1 ON (((p1.id = tcm1.profile_id) AND (p1.user_id = auth.uid()))))
     JOIN team_conversation_members tcm2 ON ((tcm2.conversation_id = tcm1.conversation_id)))
     JOIN profiles p2 ON (((p2.id = tcm2.profile_id) AND ((p2.user_id)::text = (storage.foldername(objects.name))[1])))))))));
DROP POLICY IF EXISTS "Users can delete own audio memes" ON storage."objects";
CREATE POLICY "Users can delete own audio memes" ON storage."objects"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'audio-memes'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
DROP POLICY IF EXISTS "Users can delete own audio messages" ON storage."objects";
CREATE POLICY "Users can delete own audio messages" ON storage."objects"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'audio-messages'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
DROP POLICY IF EXISTS "Users can delete own custom emojis" ON storage."objects";
CREATE POLICY "Users can delete own custom emojis" ON storage."objects"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'custom-emojis'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
DROP POLICY IF EXISTS "Users can delete own stickers" ON storage."objects";
CREATE POLICY "Users can delete own stickers" ON storage."objects"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'stickers'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
DROP POLICY IF EXISTS "Users can delete own team chat files" ON storage."objects";
CREATE POLICY "Users can delete own team chat files" ON storage."objects"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'team-chat-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage."objects";
CREATE POLICY "Users can delete their own avatar" ON storage."objects"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage."objects";
CREATE POLICY "Users can delete their own avatars" ON storage."objects"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
DROP POLICY IF EXISTS "Users can delete their own or assigned media" ON storage."objects";
CREATE POLICY "Users can delete their own or assigned media" ON storage."objects"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'whatsapp-media'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN ( SELECT (c.id)::text AS id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR ((storage.foldername(name))[1] = (auth.uid())::text))));
DROP POLICY IF EXISTS "Users can read assigned audio messages" ON storage."objects";
CREATE POLICY "Users can read assigned audio messages" ON storage."objects"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((bucket_id = 'audio-messages'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN ( SELECT (c.id)::text AS id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))))));
DROP POLICY IF EXISTS "Users can read assigned whatsapp media" ON storage."objects";
CREATE POLICY "Users can read assigned whatsapp media" ON storage."objects"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((bucket_id = 'whatsapp-media'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN ( SELECT (c.id)::text AS id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR ((storage.foldername(name))[1] = (auth.uid())::text))));
DROP POLICY IF EXISTS "Users can update own audio memes" ON storage."objects";
CREATE POLICY "Users can update own audio memes" ON storage."objects"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((bucket_id = 'audio-memes'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))));
DROP POLICY IF EXISTS "Users can update own audio messages" ON storage."objects";
CREATE POLICY "Users can update own audio messages" ON storage."objects"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((bucket_id = 'audio-messages'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN ( SELECT (c.id)::text AS id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))))));
DROP POLICY IF EXISTS "Users can update own custom emojis" ON storage."objects";
CREATE POLICY "Users can update own custom emojis" ON storage."objects"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((bucket_id = 'custom-emojis'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))));
DROP POLICY IF EXISTS "Users can update own stickers" ON storage."objects";
CREATE POLICY "Users can update own stickers" ON storage."objects"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((bucket_id = 'stickers'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))));
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage."objects";
CREATE POLICY "Users can update their own avatar" ON storage."objects"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
DROP POLICY IF EXISTS "Users can upload assigned audio messages" ON storage."objects";
CREATE POLICY "Users can upload assigned audio messages" ON storage."objects"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'audio-messages'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN ( SELECT (c.id)::text AS id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR ((storage.foldername(name))[1] = (auth.uid())::text))));
DROP POLICY IF EXISTS "Users can upload assigned whatsapp media" ON storage."objects";
CREATE POLICY "Users can upload assigned whatsapp media" ON storage."objects"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'whatsapp-media'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN ( SELECT (c.id)::text AS id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR ((storage.foldername(name))[1] = (auth.uid())::text))));
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage."objects";
CREATE POLICY "Users can upload their own avatar" ON storage."objects"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
DROP POLICY IF EXISTS "Users can upload to own folder in team-chat-files" ON storage."objects";
CREATE POLICY "Users can upload to own folder in team-chat-files" ON storage."objects"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'team-chat-files'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- ============================================================
-- FIM BLOCO 03
-- ============================================================