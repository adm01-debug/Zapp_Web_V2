-- ============================================================
-- BLOCO 5 — Triggers (public schema)
-- Idempotente: DROP TRIGGER IF EXISTS antes de cada CREATE.
-- Pré-requisitos: BLOCO 1 (tabelas) + BLOCO 4 (functions).
-- Total: 69 triggers
-- ============================================================


-- ---------- agent_stats ----------
DROP TRIGGER IF EXISTS on_agent_stats_update_level ON public.agent_stats;
CREATE TRIGGER on_agent_stats_update_level BEFORE UPDATE OF xp ON agent_stats FOR EACH ROW EXECUTE FUNCTION update_agent_level();
DROP TRIGGER IF EXISTS update_agent_stats_updated_at ON public.agent_stats;
CREATE TRIGGER update_agent_stats_updated_at BEFORE UPDATE ON agent_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_level_on_xp_change ON public.agent_stats;
CREATE TRIGGER update_level_on_xp_change BEFORE INSERT OR UPDATE OF xp ON agent_stats FOR EACH ROW EXECUTE FUNCTION update_agent_level();

-- ---------- ai_providers ----------
DROP TRIGGER IF EXISTS ensure_single_default_ai_provider ON public.ai_providers;
CREATE TRIGGER ensure_single_default_ai_provider BEFORE INSERT OR UPDATE ON ai_providers FOR EACH ROW EXECUTE FUNCTION ensure_single_default_ai_provider();
DROP TRIGGER IF EXISTS update_ai_providers_updated_at ON public.ai_providers;
CREATE TRIGGER update_ai_providers_updated_at BEFORE UPDATE ON ai_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- auto_close_config ----------
DROP TRIGGER IF EXISTS update_auto_close_config_updated_at ON public.auto_close_config;
CREATE TRIGGER update_auto_close_config_updated_at BEFORE UPDATE ON auto_close_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- automations ----------
DROP TRIGGER IF EXISTS update_automations_updated_at ON public.automations;
CREATE TRIGGER update_automations_updated_at BEFORE UPDATE ON automations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- away_messages ----------
DROP TRIGGER IF EXISTS update_away_messages_updated_at ON public.away_messages;
CREATE TRIGGER update_away_messages_updated_at BEFORE UPDATE ON away_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- business_hours ----------
DROP TRIGGER IF EXISTS update_business_hours_updated_at ON public.business_hours;
CREATE TRIGGER update_business_hours_updated_at BEFORE UPDATE ON business_hours FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- campaigns ----------
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON public.campaigns;
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- channel_connections ----------
DROP TRIGGER IF EXISTS update_channel_connections_updated_at ON public.channel_connections;
CREATE TRIGGER update_channel_connections_updated_at BEFORE UPDATE ON channel_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- chatbot_flows ----------
DROP TRIGGER IF EXISTS update_chatbot_flows_updated_at ON public.chatbot_flows;
CREATE TRIGGER update_chatbot_flows_updated_at BEFORE UPDATE ON chatbot_flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- contact_custom_fields ----------
DROP TRIGGER IF EXISTS update_contact_custom_fields_updated_at ON public.contact_custom_fields;
CREATE TRIGGER update_contact_custom_fields_updated_at BEFORE UPDATE ON contact_custom_fields FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- contact_notes ----------
DROP TRIGGER IF EXISTS update_contact_notes_updated_at ON public.contact_notes;
CREATE TRIGGER update_contact_notes_updated_at BEFORE UPDATE ON contact_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- contact_purchases ----------
DROP TRIGGER IF EXISTS update_contact_purchases_updated_at ON public.contact_purchases;
CREATE TRIGGER update_contact_purchases_updated_at BEFORE UPDATE ON contact_purchases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- contacts ----------
DROP TRIGGER IF EXISTS on_contact_created_auto_assign ON public.contacts;
CREATE TRIGGER on_contact_created_auto_assign BEFORE INSERT ON contacts FOR EACH ROW EXECUTE FUNCTION auto_assign_contact();
DROP TRIGGER IF EXISTS on_contact_queue_auto_assign ON public.contacts;
CREATE TRIGGER on_contact_queue_auto_assign BEFORE INSERT ON contacts FOR EACH ROW EXECUTE FUNCTION auto_assign_to_queue_agent();
DROP TRIGGER IF EXISTS trg_log_assignment_change ON public.contacts;
CREATE TRIGGER trg_log_assignment_change AFTER UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION log_assignment_change();
DROP TRIGGER IF EXISTS trg_normalize_contact_phone ON public.contacts;
CREATE TRIGGER trg_normalize_contact_phone BEFORE INSERT OR UPDATE OF phone ON contacts FOR EACH ROW EXECUTE FUNCTION normalize_contact_phone();
DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- conversation_memory ----------
DROP TRIGGER IF EXISTS update_conversation_memory_updated_at ON public.conversation_memory;
CREATE TRIGGER update_conversation_memory_updated_at BEFORE UPDATE ON conversation_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- conversation_sla ----------
DROP TRIGGER IF EXISTS update_conversation_sla_updated_at ON public.conversation_sla;
CREATE TRIGGER update_conversation_sla_updated_at BEFORE UPDATE ON conversation_sla FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- conversation_tasks ----------
DROP TRIGGER IF EXISTS update_conversation_tasks_updated_at ON public.conversation_tasks;
CREATE TRIGGER update_conversation_tasks_updated_at BEFORE UPDATE ON conversation_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- email_threads ----------
DROP TRIGGER IF EXISTS update_email_threads_updated_at ON public.email_threads;
CREATE TRIGGER update_email_threads_updated_at BEFORE UPDATE ON email_threads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- geo_blocking_settings ----------
DROP TRIGGER IF EXISTS update_geo_blocking_settings_updated_at ON public.geo_blocking_settings;
CREATE TRIGGER update_geo_blocking_settings_updated_at BEFORE UPDATE ON geo_blocking_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- global_settings ----------
DROP TRIGGER IF EXISTS trigger_global_settings_updated_at ON public.global_settings;
CREATE TRIGGER trigger_global_settings_updated_at BEFORE UPDATE ON global_settings FOR EACH ROW EXECUTE FUNCTION update_global_settings_updated_at();

-- ---------- gmail_accounts ----------
DROP TRIGGER IF EXISTS update_gmail_accounts_updated_at ON public.gmail_accounts;
CREATE TRIGGER update_gmail_accounts_updated_at BEFORE UPDATE ON gmail_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- goals_configurations ----------
DROP TRIGGER IF EXISTS update_goals_configurations_updated_at ON public.goals_configurations;
CREATE TRIGGER update_goals_configurations_updated_at BEFORE UPDATE ON goals_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- knowledge_base_articles ----------
DROP TRIGGER IF EXISTS update_kb_articles_updated_at ON public.knowledge_base_articles;
CREATE TRIGGER update_kb_articles_updated_at BEFORE UPDATE ON knowledge_base_articles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- message_templates ----------
DROP TRIGGER IF EXISTS update_message_templates_updated_at ON public.message_templates;
CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON message_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- messages ----------
DROP TRIGGER IF EXISTS trg_sicoob_reply ON public.messages;
CREATE TRIGGER trg_sicoob_reply AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION notify_sicoob_on_reply();
DROP TRIGGER IF EXISTS update_messages_updated_at ON public.messages;
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- number_reputation ----------
DROP TRIGGER IF EXISTS update_number_reputation_updated_at ON public.number_reputation;
CREATE TRIGGER update_number_reputation_updated_at BEFORE UPDATE ON number_reputation FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- password_reset_requests ----------
DROP TRIGGER IF EXISTS sanitize_reset_request_trigger ON public.password_reset_requests;
CREATE TRIGGER sanitize_reset_request_trigger BEFORE INSERT ON password_reset_requests FOR EACH ROW EXECUTE FUNCTION sanitize_reset_request();
DROP TRIGGER IF EXISTS trg_rate_limit_reset ON public.password_reset_requests;
CREATE TRIGGER trg_rate_limit_reset BEFORE INSERT ON password_reset_requests FOR EACH ROW EXECUTE FUNCTION rate_limit_reset_requests();

-- ---------- payment_links ----------
DROP TRIGGER IF EXISTS update_payment_links_updated_at ON public.payment_links;
CREATE TRIGGER update_payment_links_updated_at BEFORE UPDATE ON payment_links FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- playbooks ----------
DROP TRIGGER IF EXISTS update_playbooks_updated_at ON public.playbooks;
CREATE TRIGGER update_playbooks_updated_at BEFORE UPDATE ON playbooks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- products ----------
DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- profiles ----------
DROP TRIGGER IF EXISTS on_profile_created_init_stats ON public.profiles;
CREATE TRIGGER on_profile_created_init_stats AFTER INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION init_agent_stats();
DROP TRIGGER IF EXISTS on_profile_update_prevent_escalation ON public.profiles;
CREATE TRIGGER on_profile_update_prevent_escalation BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION prevent_role_escalation();
DROP TRIGGER IF EXISTS prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_privilege_escalation BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION prevent_profile_privilege_escalation();
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- queue_goals ----------
DROP TRIGGER IF EXISTS update_queue_goals_updated_at ON public.queue_goals;
CREATE TRIGGER update_queue_goals_updated_at BEFORE UPDATE ON queue_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- queues ----------
DROP TRIGGER IF EXISTS update_queues_updated_at ON public.queues;
CREATE TRIGGER update_queues_updated_at BEFORE UPDATE ON queues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- rate_limit_configs ----------
DROP TRIGGER IF EXISTS update_rate_limit_configs_updated_at ON public.rate_limit_configs;
CREATE TRIGGER update_rate_limit_configs_updated_at BEFORE UPDATE ON rate_limit_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- sales_deals ----------
DROP TRIGGER IF EXISTS update_sales_deals_updated_at ON public.sales_deals;
CREATE TRIGGER update_sales_deals_updated_at BEFORE UPDATE ON sales_deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- sales_pipeline_stages ----------
DROP TRIGGER IF EXISTS update_pipeline_stages_updated_at ON public.sales_pipeline_stages;
CREATE TRIGGER update_pipeline_stages_updated_at BEFORE UPDATE ON sales_pipeline_stages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- saved_filters ----------
DROP TRIGGER IF EXISTS ensure_single_default_filter_trigger ON public.saved_filters;
CREATE TRIGGER ensure_single_default_filter_trigger BEFORE INSERT OR UPDATE ON saved_filters FOR EACH ROW EXECUTE FUNCTION ensure_single_default_filter();
DROP TRIGGER IF EXISTS update_saved_filters_updated_at ON public.saved_filters;
CREATE TRIGGER update_saved_filters_updated_at BEFORE UPDATE ON saved_filters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- scheduled_messages ----------
DROP TRIGGER IF EXISTS update_scheduled_messages_updated_at ON public.scheduled_messages;
CREATE TRIGGER update_scheduled_messages_updated_at BEFORE UPDATE ON scheduled_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- scheduled_report_configs ----------
DROP TRIGGER IF EXISTS update_scheduled_report_configs_updated_at ON public.scheduled_report_configs;
CREATE TRIGGER update_scheduled_report_configs_updated_at BEFORE UPDATE ON scheduled_report_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- scheduled_reports ----------
DROP TRIGGER IF EXISTS update_scheduled_reports_updated_at ON public.scheduled_reports;
CREATE TRIGGER update_scheduled_reports_updated_at BEFORE UPDATE ON scheduled_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- sla_configurations ----------
DROP TRIGGER IF EXISTS update_sla_configurations_updated_at ON public.sla_configurations;
CREATE TRIGGER update_sla_configurations_updated_at BEFORE UPDATE ON sla_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- sla_rules ----------
DROP TRIGGER IF EXISTS update_sla_rules_updated_at ON public.sla_rules;
CREATE TRIGGER update_sla_rules_updated_at BEFORE UPDATE ON sla_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- tags ----------
DROP TRIGGER IF EXISTS update_tags_updated_at ON public.tags;
CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- talkx_campaigns ----------
DROP TRIGGER IF EXISTS update_talkx_campaigns_updated_at ON public.talkx_campaigns;
CREATE TRIGGER update_talkx_campaigns_updated_at BEFORE UPDATE ON talkx_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- talkx_recipients ----------
DROP TRIGGER IF EXISTS update_talkx_recipients_updated_at ON public.talkx_recipients;
CREATE TRIGGER update_talkx_recipients_updated_at BEFORE UPDATE ON talkx_recipients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- team_conversations ----------
DROP TRIGGER IF EXISTS update_team_conversations_updated_at ON public.team_conversations;
CREATE TRIGGER update_team_conversations_updated_at BEFORE UPDATE ON team_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- team_messages ----------
DROP TRIGGER IF EXISTS update_team_messages_updated_at ON public.team_messages;
CREATE TRIGGER update_team_messages_updated_at BEFORE UPDATE ON team_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- user_devices ----------
DROP TRIGGER IF EXISTS on_device_update_last_seen ON public.user_devices;
CREATE TRIGGER on_device_update_last_seen BEFORE UPDATE ON user_devices FOR EACH ROW EXECUTE FUNCTION update_device_last_seen();
DROP TRIGGER IF EXISTS update_user_devices_last_seen ON public.user_devices;
CREATE TRIGGER update_user_devices_last_seen BEFORE UPDATE ON user_devices FOR EACH ROW EXECUTE FUNCTION update_device_last_seen();

-- ---------- user_roles ----------
DROP TRIGGER IF EXISTS audit_user_role_changes ON public.user_roles;
CREATE TRIGGER audit_user_role_changes AFTER INSERT OR DELETE OR UPDATE ON user_roles FOR EACH ROW EXECUTE FUNCTION audit_role_changes();

-- ---------- user_service_accounts ----------
DROP TRIGGER IF EXISTS update_user_service_accounts_updated_at ON public.user_service_accounts;
CREATE TRIGGER update_user_service_accounts_updated_at BEFORE UPDATE ON user_service_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- user_settings ----------
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- whatsapp_connections ----------
DROP TRIGGER IF EXISTS clear_qr_on_connect_trigger ON public.whatsapp_connections;
CREATE TRIGGER clear_qr_on_connect_trigger BEFORE UPDATE OF status ON whatsapp_connections FOR EACH ROW EXECUTE FUNCTION clear_qr_on_connect();
DROP TRIGGER IF EXISTS update_whatsapp_connections_updated_at ON public.whatsapp_connections;
CREATE TRIGGER update_whatsapp_connections_updated_at BEFORE UPDATE ON whatsapp_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- whatsapp_flows ----------
DROP TRIGGER IF EXISTS update_whatsapp_flows_updated_at ON public.whatsapp_flows;
CREATE TRIGGER update_whatsapp_flows_updated_at BEFORE UPDATE ON whatsapp_flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- whatsapp_groups ----------
DROP TRIGGER IF EXISTS update_whatsapp_groups_updated_at ON public.whatsapp_groups;
CREATE TRIGGER update_whatsapp_groups_updated_at BEFORE UPDATE ON whatsapp_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- whatsapp_templates ----------
DROP TRIGGER IF EXISTS update_whatsapp_templates_updated_at ON public.whatsapp_templates;
CREATE TRIGGER update_whatsapp_templates_updated_at BEFORE UPDATE ON whatsapp_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
