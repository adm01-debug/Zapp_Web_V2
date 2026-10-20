-- ============================================================================
-- Etapas 13-32 do plano da auditoria de 27/08/2026 (achado A-08)
-- ============================================================================
-- 108 colunas de FK de coluna unica estavam sem indice de suporte.
-- Impacto: seq scan em JOIN e, principalmente, lock de tabela inteira em
-- DELETE/UPDATE do lado pai.
--
-- Sobre CONCURRENTLY: o plano previa CREATE INDEX CONCURRENTLY. Nao e possivel
-- via o gateway MCP (wrapper transacional, erro 25001 "cannot run inside a
-- transaction block"). A maior tabela do banco tem 584 kB / 41 linhas, entao o
-- lock de CREATE INDEX simples foi irrelevante — as 108 rodaram em 278 ms.
-- Se este arquivo for reaplicado num banco ja populado, troque para CONCURRENTLY
-- e rode fora de transacao.
--
-- Verificacao (deve retornar zero linhas):
--   SELECT c.relname||'.'||a.attname
--   FROM pg_constraint co
--   JOIN pg_class c ON c.oid=co.conrelid
--   JOIN pg_namespace n ON n.oid=c.relnamespace
--   JOIN unnest(co.conkey) k(att) ON true
--   JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.att
--   WHERE n.nspname='public' AND co.contype='f' AND array_length(co.conkey,1)=1
--     AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indkey[0]=a.attnum);
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_agent_visibility_grants_can_see_agent_id ON public.agent_visibility_grants (can_see_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_visibility_grants_granted_by ON public.agent_visibility_grants (granted_by);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_tags_contact_id ON public.ai_conversation_tags (contact_id);
CREATE INDEX IF NOT EXISTS idx_ai_providers_created_by ON public.ai_providers (created_by);
CREATE INDEX IF NOT EXISTS idx_allowed_countries_added_by ON public.allowed_countries (added_by);
CREATE INDEX IF NOT EXISTS idx_audio_memes_uploaded_by ON public.audio_memes (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_auto_close_config_updated_by ON public.auto_close_config (updated_by);
CREATE INDEX IF NOT EXISTS idx_automations_created_by ON public.automations (created_by);
CREATE INDEX IF NOT EXISTS idx_blocked_countries_blocked_by ON public.blocked_countries (blocked_by);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_blocked_by ON public.blocked_ips (blocked_by);
CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON public.calls (agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_contact_id ON public.calls (contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_whatsapp_connection_id ON public.calls (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_campaign_ab_variants_campaign_id ON public.campaign_ab_variants (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_contact_id ON public.campaign_contacts (contact_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_whatsapp_connection_id ON public.campaigns (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_channel_connections_created_by ON public.channel_connections (created_by);
CREATE INDEX IF NOT EXISTS idx_channel_connections_whatsapp_connection_id ON public.channel_connections (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_channel_routing_rules_channel_connection_id ON public.channel_routing_rules (channel_connection_id);
CREATE INDEX IF NOT EXISTS idx_channel_routing_rules_queue_id ON public.channel_routing_rules (queue_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_flows_created_by ON public.chatbot_flows (created_by);
CREATE INDEX IF NOT EXISTS idx_chatbot_flows_whatsapp_connection_id ON public.chatbot_flows (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_client_wallet_rules_agent_id ON public.client_wallet_rules (agent_id);
CREATE INDEX IF NOT EXISTS idx_client_wallet_rules_whatsapp_connection_id ON public.client_wallet_rules (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_contact_purchases_contact_id ON public.contact_purchases (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_purchases_created_by ON public.contact_purchases (created_by);
CREATE INDEX IF NOT EXISTS idx_contact_purchases_deal_id ON public.contact_purchases (deal_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag_id ON public.contact_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_contacts_channel_connection_id ON public.contacts (channel_connection_id);
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_connection_id ON public.contacts (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_conversation_analyses_analyzed_by ON public.conversation_analyses (analyzed_by);
CREATE INDEX IF NOT EXISTS idx_conversation_closures_closed_by ON public.conversation_closures (closed_by);
CREATE INDEX IF NOT EXISTS idx_conversation_events_from_agent_id ON public.conversation_events (from_agent_id);
CREATE INDEX IF NOT EXISTS idx_conversation_events_from_queue_id ON public.conversation_events (from_queue_id);
CREATE INDEX IF NOT EXISTS idx_conversation_events_performed_by ON public.conversation_events (performed_by);
CREATE INDEX IF NOT EXISTS idx_conversation_events_to_agent_id ON public.conversation_events (to_agent_id);
CREATE INDEX IF NOT EXISTS idx_conversation_events_to_queue_id ON public.conversation_events (to_queue_id);
CREATE INDEX IF NOT EXISTS idx_conversation_memory_updated_by ON public.conversation_memory (updated_by);
CREATE INDEX IF NOT EXISTS idx_conversation_sla_contact_id ON public.conversation_sla (contact_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sla_sla_configuration_id ON public.conversation_sla (sla_configuration_id);
CREATE INDEX IF NOT EXISTS idx_conversation_snoozes_snoozed_by ON public.conversation_snoozes (snoozed_by);
CREATE INDEX IF NOT EXISTS idx_conversation_tasks_created_by ON public.conversation_tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_crisis_room_alerts_acknowledged_by ON public.crisis_room_alerts (acknowledged_by);
CREATE INDEX IF NOT EXISTS idx_csat_auto_config_updated_by ON public.csat_auto_config (updated_by);
CREATE INDEX IF NOT EXISTS idx_csat_auto_config_whatsapp_connection_id ON public.csat_auto_config (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_csat_surveys_agent_id ON public.csat_surveys (agent_id);
CREATE INDEX IF NOT EXISTS idx_csat_surveys_contact_id ON public.csat_surveys (contact_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_deal_id ON public.deal_activities (deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_performed_by ON public.deal_activities (performed_by);
CREATE INDEX IF NOT EXISTS idx_favorite_contacts_user_id ON public.favorite_contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_followup_executions_contact_id ON public.followup_executions (contact_id);
CREATE INDEX IF NOT EXISTS idx_followup_executions_sequence_id ON public.followup_executions (sequence_id);
CREATE INDEX IF NOT EXISTS idx_followup_sequences_created_by ON public.followup_sequences (created_by);
CREATE INDEX IF NOT EXISTS idx_followup_sequences_whatsapp_connection_id ON public.followup_sequences (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_followup_steps_sequence_id ON public.followup_steps (sequence_id);
CREATE INDEX IF NOT EXISTS idx_geo_blocking_settings_updated_by ON public.geo_blocking_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_ip_whitelist_added_by ON public.ip_whitelist (added_by);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_articles_created_by ON public.knowledge_base_articles (created_by);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_files_article_id ON public.knowledge_base_files (article_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_contact_id ON public.message_reactions (contact_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON public.message_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_messages_agent_id ON public.messages (agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_connection_id ON public.messages (channel_connection_id);
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_connection_id ON public.messages (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_meta_capi_events_contact_id ON public.meta_capi_events (contact_id);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_agent_id ON public.nps_surveys (agent_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_reviewed_by ON public.password_reset_requests (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_payment_links_contact_id ON public.payment_links (contact_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_created_by ON public.payment_links (created_by);
CREATE INDEX IF NOT EXISTS idx_payment_links_deal_id ON public.payment_links (deal_id);
CREATE INDEX IF NOT EXISTS idx_pinned_conversations_pinned_by ON public.pinned_conversations (pinned_by);
CREATE INDEX IF NOT EXISTS idx_playbooks_created_by ON public.playbooks (created_by);
CREATE INDEX IF NOT EXISTS idx_products_whatsapp_connection_id ON public.products (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_queue_members_profile_id ON public.queue_members (profile_id);
CREATE INDEX IF NOT EXISTS idx_queue_positions_contact_id ON public.queue_positions (contact_id);
CREATE INDEX IF NOT EXISTS idx_queue_positions_queue_id ON public.queue_positions (queue_id);
CREATE INDEX IF NOT EXISTS idx_reminders_contact_id ON public.reminders (contact_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON public.role_permissions (permission_id);
CREATE INDEX IF NOT EXISTS idx_sales_deals_assigned_to ON public.sales_deals (assigned_to);
CREATE INDEX IF NOT EXISTS idx_sales_deals_contact_id ON public.sales_deals (contact_id);
CREATE INDEX IF NOT EXISTS idx_sales_deals_stage_id ON public.sales_deals (stage_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_contact_id ON public.scheduled_messages (contact_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_created_by ON public.scheduled_messages (created_by);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_whatsapp_connection_id ON public.scheduled_messages (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_report_configs_created_by ON public.scheduled_report_configs (created_by);
CREATE INDEX IF NOT EXISTS idx_security_alerts_resolved_by ON public.security_alerts (resolved_by);
CREATE INDEX IF NOT EXISTS idx_security_alerts_user_id ON public.security_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_sicoob_contact_mapping_contact_id ON public.sicoob_contact_mapping (contact_id);
CREATE INDEX IF NOT EXISTS idx_sicoob_contact_mapping_zappweb_agent_id ON public.sicoob_contact_mapping (zappweb_agent_id);
CREATE INDEX IF NOT EXISTS idx_tags_created_by ON public.tags (created_by);
CREATE INDEX IF NOT EXISTS idx_talkx_blacklist_blocked_by ON public.talkx_blacklist (blocked_by);
CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_whatsapp_connection_id ON public.talkx_campaigns (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_talkx_recipients_contact_id ON public.talkx_recipients (contact_id);
CREATE INDEX IF NOT EXISTS idx_team_conversations_created_by ON public.team_conversations (created_by);
CREATE INDEX IF NOT EXISTS idx_team_messages_reply_to_id ON public.team_messages (reply_to_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_sender_id ON public.team_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_profile_id ON public.training_sessions (profile_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_device_id ON public.user_sessions (device_id);
CREATE INDEX IF NOT EXISTS idx_warroom_alerts_dismissed_by ON public.warroom_alerts (dismissed_by);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connection_queues_queue_id ON public.whatsapp_connection_queues (queue_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_created_by ON public.whatsapp_connections (created_by);
CREATE INDEX IF NOT EXISTS idx_whatsapp_flows_created_by ON public.whatsapp_flows (created_by);
CREATE INDEX IF NOT EXISTS idx_whatsapp_flows_whatsapp_connection_id ON public.whatsapp_flows (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_whatsapp_connection_id ON public.whatsapp_groups (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_whatsapp_connection_id ON public.whatsapp_templates (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS idx_whisper_messages_contact_id ON public.whisper_messages (contact_id);
CREATE INDEX IF NOT EXISTS idx_whisper_messages_sender_id ON public.whisper_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_whisper_messages_target_agent_id ON public.whisper_messages (target_agent_id);
