-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO 7 — FOREIGN KEYS (169 constraints)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Idempotente: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT para cada FK
-- Ordem: por tabela, depois por nome da constraint
-- Inclui: ON DELETE CASCADE, ON DELETE SET NULL, ações padrão
-- ═══════════════════════════════════════════════════════════════════════════════
-- PRÉ-REQUISITO: BLOCO 1 (tabelas) + BLOCO 6 (índices) devem estar aplicados.
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE agent_achievements DROP CONSTRAINT IF EXISTS agent_achievements_profile_id_fkey CASCADE;
ALTER TABLE agent_achievements ADD CONSTRAINT agent_achievements_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE agent_skills DROP CONSTRAINT IF EXISTS agent_skills_profile_id_fkey CASCADE;
ALTER TABLE agent_skills ADD CONSTRAINT agent_skills_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE agent_stats DROP CONSTRAINT IF EXISTS agent_stats_profile_id_fkey CASCADE;
ALTER TABLE agent_stats ADD CONSTRAINT agent_stats_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE agent_visibility_grants DROP CONSTRAINT IF EXISTS agent_visibility_grants_agent_id_fkey CASCADE;
ALTER TABLE agent_visibility_grants ADD CONSTRAINT agent_visibility_grants_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE agent_visibility_grants DROP CONSTRAINT IF EXISTS agent_visibility_grants_can_see_agent_id_fkey CASCADE;
ALTER TABLE agent_visibility_grants ADD CONSTRAINT agent_visibility_grants_can_see_agent_id_fkey FOREIGN KEY (can_see_agent_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE agent_visibility_grants DROP CONSTRAINT IF EXISTS agent_visibility_grants_granted_by_fkey CASCADE;
ALTER TABLE agent_visibility_grants ADD CONSTRAINT agent_visibility_grants_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ai_conversation_tags DROP CONSTRAINT IF EXISTS ai_conversation_tags_contact_id_fkey CASCADE;
ALTER TABLE ai_conversation_tags ADD CONSTRAINT ai_conversation_tags_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);

ALTER TABLE ai_providers DROP CONSTRAINT IF EXISTS ai_providers_created_by_fkey CASCADE;
ALTER TABLE ai_providers ADD CONSTRAINT ai_providers_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE ai_usage_logs DROP CONSTRAINT IF EXISTS ai_usage_logs_profile_id_fkey CASCADE;
ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id);

ALTER TABLE allowed_countries DROP CONSTRAINT IF EXISTS allowed_countries_added_by_fkey CASCADE;
ALTER TABLE allowed_countries ADD CONSTRAINT allowed_countries_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id);

ALTER TABLE audio_memes DROP CONSTRAINT IF EXISTS audio_memes_uploaded_by_fkey CASCADE;
ALTER TABLE audio_memes ADD CONSTRAINT audio_memes_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey CASCADE;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE auto_close_config DROP CONSTRAINT IF EXISTS auto_close_config_updated_by_fkey CASCADE;
ALTER TABLE auto_close_config ADD CONSTRAINT auto_close_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_created_by_fkey CASCADE;
ALTER TABLE automations ADD CONSTRAINT automations_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE away_messages DROP CONSTRAINT IF EXISTS away_messages_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE away_messages ADD CONSTRAINT away_messages_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;

ALTER TABLE blocked_countries DROP CONSTRAINT IF EXISTS blocked_countries_blocked_by_fkey CASCADE;
ALTER TABLE blocked_countries ADD CONSTRAINT blocked_countries_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES auth.users(id);

ALTER TABLE blocked_ips DROP CONSTRAINT IF EXISTS blocked_ips_blocked_by_fkey CASCADE;
ALTER TABLE blocked_ips ADD CONSTRAINT blocked_ips_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE business_hours DROP CONSTRAINT IF EXISTS business_hours_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE business_hours ADD CONSTRAINT business_hours_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;

ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_agent_id_fkey CASCADE;
ALTER TABLE calls ADD CONSTRAINT calls_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_contact_id_fkey CASCADE;
ALTER TABLE calls ADD CONSTRAINT calls_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE calls ADD CONSTRAINT calls_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL;

ALTER TABLE campaign_ab_variants DROP CONSTRAINT IF EXISTS campaign_ab_variants_campaign_id_fkey CASCADE;
ALTER TABLE campaign_ab_variants ADD CONSTRAINT campaign_ab_variants_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

ALTER TABLE campaign_contacts DROP CONSTRAINT IF EXISTS campaign_contacts_campaign_id_fkey CASCADE;
ALTER TABLE campaign_contacts ADD CONSTRAINT campaign_contacts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

ALTER TABLE campaign_contacts DROP CONSTRAINT IF EXISTS campaign_contacts_contact_id_fkey CASCADE;
ALTER TABLE campaign_contacts ADD CONSTRAINT campaign_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_created_by_fkey CASCADE;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);

ALTER TABLE channel_connections DROP CONSTRAINT IF EXISTS channel_connections_created_by_fkey CASCADE;
ALTER TABLE channel_connections ADD CONSTRAINT channel_connections_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE channel_connections DROP CONSTRAINT IF EXISTS channel_connections_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE channel_connections ADD CONSTRAINT channel_connections_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);

ALTER TABLE channel_routing_rules DROP CONSTRAINT IF EXISTS channel_routing_rules_channel_connection_id_fkey CASCADE;
ALTER TABLE channel_routing_rules ADD CONSTRAINT channel_routing_rules_channel_connection_id_fkey FOREIGN KEY (channel_connection_id) REFERENCES channel_connections(id);

ALTER TABLE channel_routing_rules DROP CONSTRAINT IF EXISTS channel_routing_rules_queue_id_fkey CASCADE;
ALTER TABLE channel_routing_rules ADD CONSTRAINT channel_routing_rules_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id);

ALTER TABLE chatbot_executions DROP CONSTRAINT IF EXISTS chatbot_executions_contact_id_fkey CASCADE;
ALTER TABLE chatbot_executions ADD CONSTRAINT chatbot_executions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE chatbot_executions DROP CONSTRAINT IF EXISTS chatbot_executions_flow_id_fkey CASCADE;
ALTER TABLE chatbot_executions ADD CONSTRAINT chatbot_executions_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES chatbot_flows(id) ON DELETE CASCADE;

ALTER TABLE chatbot_flows DROP CONSTRAINT IF EXISTS chatbot_flows_created_by_fkey CASCADE;
ALTER TABLE chatbot_flows ADD CONSTRAINT chatbot_flows_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE chatbot_flows DROP CONSTRAINT IF EXISTS chatbot_flows_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE chatbot_flows ADD CONSTRAINT chatbot_flows_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);

ALTER TABLE client_wallet_rules DROP CONSTRAINT IF EXISTS client_wallet_rules_agent_id_fkey CASCADE;
ALTER TABLE client_wallet_rules ADD CONSTRAINT client_wallet_rules_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE client_wallet_rules DROP CONSTRAINT IF EXISTS client_wallet_rules_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE client_wallet_rules ADD CONSTRAINT client_wallet_rules_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;

ALTER TABLE connection_health_logs DROP CONSTRAINT IF EXISTS connection_health_logs_connection_id_fkey CASCADE;
ALTER TABLE connection_health_logs ADD CONSTRAINT connection_health_logs_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;

ALTER TABLE contact_custom_fields DROP CONSTRAINT IF EXISTS contact_custom_fields_contact_id_fkey CASCADE;
ALTER TABLE contact_custom_fields ADD CONSTRAINT contact_custom_fields_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE contact_notes DROP CONSTRAINT IF EXISTS contact_notes_author_id_fkey CASCADE;
ALTER TABLE contact_notes ADD CONSTRAINT contact_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE contact_notes DROP CONSTRAINT IF EXISTS contact_notes_contact_id_fkey CASCADE;
ALTER TABLE contact_notes ADD CONSTRAINT contact_notes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE contact_purchases DROP CONSTRAINT IF EXISTS contact_purchases_contact_id_fkey CASCADE;
ALTER TABLE contact_purchases ADD CONSTRAINT contact_purchases_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE contact_purchases DROP CONSTRAINT IF EXISTS contact_purchases_created_by_fkey CASCADE;
ALTER TABLE contact_purchases ADD CONSTRAINT contact_purchases_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE contact_purchases DROP CONSTRAINT IF EXISTS contact_purchases_deal_id_fkey CASCADE;
ALTER TABLE contact_purchases ADD CONSTRAINT contact_purchases_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES sales_deals(id);

ALTER TABLE contact_tags DROP CONSTRAINT IF EXISTS contact_tags_contact_id_fkey CASCADE;
ALTER TABLE contact_tags ADD CONSTRAINT contact_tags_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE contact_tags DROP CONSTRAINT IF EXISTS contact_tags_tag_id_fkey CASCADE;
ALTER TABLE contact_tags ADD CONSTRAINT contact_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_assigned_to_fkey CASCADE;
ALTER TABLE contacts ADD CONSTRAINT contacts_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_channel_connection_id_fkey CASCADE;
ALTER TABLE contacts ADD CONSTRAINT contacts_channel_connection_id_fkey FOREIGN KEY (channel_connection_id) REFERENCES channel_connections(id);

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_queue_id_fkey CASCADE;
ALTER TABLE contacts ADD CONSTRAINT contacts_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE SET NULL;

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE contacts ADD CONSTRAINT contacts_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL;

ALTER TABLE conversation_analyses DROP CONSTRAINT IF EXISTS conversation_analyses_analyzed_by_fkey CASCADE;
ALTER TABLE conversation_analyses ADD CONSTRAINT conversation_analyses_analyzed_by_fkey FOREIGN KEY (analyzed_by) REFERENCES profiles(id);

ALTER TABLE conversation_analyses DROP CONSTRAINT IF EXISTS conversation_analyses_contact_id_fkey CASCADE;
ALTER TABLE conversation_analyses ADD CONSTRAINT conversation_analyses_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE conversation_closures DROP CONSTRAINT IF EXISTS conversation_closures_closed_by_fkey CASCADE;
ALTER TABLE conversation_closures ADD CONSTRAINT conversation_closures_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE conversation_closures DROP CONSTRAINT IF EXISTS conversation_closures_contact_id_fkey CASCADE;
ALTER TABLE conversation_closures ADD CONSTRAINT conversation_closures_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE conversation_events DROP CONSTRAINT IF EXISTS conversation_events_contact_id_fkey CASCADE;
ALTER TABLE conversation_events ADD CONSTRAINT conversation_events_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE conversation_events DROP CONSTRAINT IF EXISTS conversation_events_from_agent_id_fkey CASCADE;
ALTER TABLE conversation_events ADD CONSTRAINT conversation_events_from_agent_id_fkey FOREIGN KEY (from_agent_id) REFERENCES profiles(id);

ALTER TABLE conversation_events DROP CONSTRAINT IF EXISTS conversation_events_from_queue_id_fkey CASCADE;
ALTER TABLE conversation_events ADD CONSTRAINT conversation_events_from_queue_id_fkey FOREIGN KEY (from_queue_id) REFERENCES queues(id);

ALTER TABLE conversation_events DROP CONSTRAINT IF EXISTS conversation_events_performed_by_fkey CASCADE;
ALTER TABLE conversation_events ADD CONSTRAINT conversation_events_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES profiles(id);

ALTER TABLE conversation_events DROP CONSTRAINT IF EXISTS conversation_events_to_agent_id_fkey CASCADE;
ALTER TABLE conversation_events ADD CONSTRAINT conversation_events_to_agent_id_fkey FOREIGN KEY (to_agent_id) REFERENCES profiles(id);

ALTER TABLE conversation_events DROP CONSTRAINT IF EXISTS conversation_events_to_queue_id_fkey CASCADE;
ALTER TABLE conversation_events ADD CONSTRAINT conversation_events_to_queue_id_fkey FOREIGN KEY (to_queue_id) REFERENCES queues(id);

ALTER TABLE conversation_memory DROP CONSTRAINT IF EXISTS conversation_memory_contact_id_fkey CASCADE;
ALTER TABLE conversation_memory ADD CONSTRAINT conversation_memory_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE conversation_memory DROP CONSTRAINT IF EXISTS conversation_memory_updated_by_fkey CASCADE;
ALTER TABLE conversation_memory ADD CONSTRAINT conversation_memory_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE conversation_sla DROP CONSTRAINT IF EXISTS conversation_sla_contact_id_fkey CASCADE;
ALTER TABLE conversation_sla ADD CONSTRAINT conversation_sla_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE conversation_sla DROP CONSTRAINT IF EXISTS conversation_sla_sla_configuration_id_fkey CASCADE;
ALTER TABLE conversation_sla ADD CONSTRAINT conversation_sla_sla_configuration_id_fkey FOREIGN KEY (sla_configuration_id) REFERENCES sla_configurations(id);

ALTER TABLE conversation_snoozes DROP CONSTRAINT IF EXISTS conversation_snoozes_contact_id_fkey CASCADE;
ALTER TABLE conversation_snoozes ADD CONSTRAINT conversation_snoozes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE conversation_snoozes DROP CONSTRAINT IF EXISTS conversation_snoozes_snoozed_by_fkey CASCADE;
ALTER TABLE conversation_snoozes ADD CONSTRAINT conversation_snoozes_snoozed_by_fkey FOREIGN KEY (snoozed_by) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE conversation_tasks DROP CONSTRAINT IF EXISTS conversation_tasks_assigned_to_fkey CASCADE;
ALTER TABLE conversation_tasks ADD CONSTRAINT conversation_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE conversation_tasks DROP CONSTRAINT IF EXISTS conversation_tasks_contact_id_fkey CASCADE;
ALTER TABLE conversation_tasks ADD CONSTRAINT conversation_tasks_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE conversation_tasks DROP CONSTRAINT IF EXISTS conversation_tasks_created_by_fkey CASCADE;
ALTER TABLE conversation_tasks ADD CONSTRAINT conversation_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE crisis_room_alerts DROP CONSTRAINT IF EXISTS crisis_room_alerts_acknowledged_by_fkey CASCADE;
ALTER TABLE crisis_room_alerts ADD CONSTRAINT crisis_room_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES profiles(id);

ALTER TABLE csat_auto_config DROP CONSTRAINT IF EXISTS csat_auto_config_updated_by_fkey CASCADE;
ALTER TABLE csat_auto_config ADD CONSTRAINT csat_auto_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id);

ALTER TABLE csat_auto_config DROP CONSTRAINT IF EXISTS csat_auto_config_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE csat_auto_config ADD CONSTRAINT csat_auto_config_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);

ALTER TABLE csat_surveys DROP CONSTRAINT IF EXISTS csat_surveys_agent_id_fkey CASCADE;
ALTER TABLE csat_surveys ADD CONSTRAINT csat_surveys_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE csat_surveys DROP CONSTRAINT IF EXISTS csat_surveys_contact_id_fkey CASCADE;
ALTER TABLE csat_surveys ADD CONSTRAINT csat_surveys_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE deal_activities DROP CONSTRAINT IF EXISTS deal_activities_deal_id_fkey CASCADE;
ALTER TABLE deal_activities ADD CONSTRAINT deal_activities_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES sales_deals(id) ON DELETE CASCADE;

ALTER TABLE deal_activities DROP CONSTRAINT IF EXISTS deal_activities_performed_by_fkey CASCADE;
ALTER TABLE deal_activities ADD CONSTRAINT deal_activities_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE email_labels DROP CONSTRAINT IF EXISTS email_labels_gmail_account_id_fkey CASCADE;
ALTER TABLE email_labels ADD CONSTRAINT email_labels_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES gmail_accounts(id) ON DELETE CASCADE;

ALTER TABLE email_messages DROP CONSTRAINT IF EXISTS email_messages_gmail_account_id_fkey CASCADE;
ALTER TABLE email_messages ADD CONSTRAINT email_messages_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES gmail_accounts(id) ON DELETE CASCADE;

ALTER TABLE email_messages DROP CONSTRAINT IF EXISTS email_messages_thread_id_fkey CASCADE;
ALTER TABLE email_messages ADD CONSTRAINT email_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES email_threads(id) ON DELETE CASCADE;

ALTER TABLE email_threads DROP CONSTRAINT IF EXISTS email_threads_contact_id_fkey CASCADE;
ALTER TABLE email_threads ADD CONSTRAINT email_threads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE email_threads DROP CONSTRAINT IF EXISTS email_threads_gmail_account_id_fkey CASCADE;
ALTER TABLE email_threads ADD CONSTRAINT email_threads_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES gmail_accounts(id) ON DELETE CASCADE;

ALTER TABLE favorite_contacts DROP CONSTRAINT IF EXISTS favorite_contacts_contact_id_fkey CASCADE;
ALTER TABLE favorite_contacts ADD CONSTRAINT favorite_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE favorite_contacts DROP CONSTRAINT IF EXISTS favorite_contacts_user_id_fkey CASCADE;
ALTER TABLE favorite_contacts ADD CONSTRAINT favorite_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE followup_executions DROP CONSTRAINT IF EXISTS followup_executions_contact_id_fkey CASCADE;
ALTER TABLE followup_executions ADD CONSTRAINT followup_executions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);

ALTER TABLE followup_executions DROP CONSTRAINT IF EXISTS followup_executions_sequence_id_fkey CASCADE;
ALTER TABLE followup_executions ADD CONSTRAINT followup_executions_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES followup_sequences(id);

ALTER TABLE followup_sequences DROP CONSTRAINT IF EXISTS followup_sequences_created_by_fkey CASCADE;
ALTER TABLE followup_sequences ADD CONSTRAINT followup_sequences_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE followup_sequences DROP CONSTRAINT IF EXISTS followup_sequences_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE followup_sequences ADD CONSTRAINT followup_sequences_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);

ALTER TABLE followup_steps DROP CONSTRAINT IF EXISTS followup_steps_sequence_id_fkey CASCADE;
ALTER TABLE followup_steps ADD CONSTRAINT followup_steps_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES followup_sequences(id) ON DELETE CASCADE;

ALTER TABLE geo_blocking_settings DROP CONSTRAINT IF EXISTS geo_blocking_settings_updated_by_fkey CASCADE;
ALTER TABLE geo_blocking_settings ADD CONSTRAINT geo_blocking_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

ALTER TABLE goals_configurations DROP CONSTRAINT IF EXISTS goals_configurations_profile_id_fkey CASCADE;
ALTER TABLE goals_configurations ADD CONSTRAINT goals_configurations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE goals_configurations DROP CONSTRAINT IF EXISTS goals_configurations_queue_id_fkey CASCADE;
ALTER TABLE goals_configurations ADD CONSTRAINT goals_configurations_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE;

ALTER TABLE ip_whitelist DROP CONSTRAINT IF EXISTS ip_whitelist_added_by_fkey CASCADE;
ALTER TABLE ip_whitelist ADD CONSTRAINT ip_whitelist_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE knowledge_base_articles DROP CONSTRAINT IF EXISTS knowledge_base_articles_created_by_fkey CASCADE;
ALTER TABLE knowledge_base_articles ADD CONSTRAINT knowledge_base_articles_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE knowledge_base_files DROP CONSTRAINT IF EXISTS knowledge_base_files_article_id_fkey CASCADE;
ALTER TABLE knowledge_base_files ADD CONSTRAINT knowledge_base_files_article_id_fkey FOREIGN KEY (article_id) REFERENCES knowledge_base_articles(id) ON DELETE CASCADE;

ALTER TABLE message_reactions DROP CONSTRAINT IF EXISTS message_reactions_contact_id_fkey CASCADE;
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE message_reactions DROP CONSTRAINT IF EXISTS message_reactions_message_id_fkey CASCADE;
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;

ALTER TABLE message_reactions DROP CONSTRAINT IF EXISTS message_reactions_user_id_fkey CASCADE;
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_agent_id_fkey CASCADE;
ALTER TABLE messages ADD CONSTRAINT messages_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_channel_connection_id_fkey CASCADE;
ALTER TABLE messages ADD CONSTRAINT messages_channel_connection_id_fkey FOREIGN KEY (channel_connection_id) REFERENCES channel_connections(id);

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_contact_id_fkey CASCADE;
ALTER TABLE messages ADD CONSTRAINT messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE messages ADD CONSTRAINT messages_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL;

ALTER TABLE meta_capi_events DROP CONSTRAINT IF EXISTS meta_capi_events_contact_id_fkey CASCADE;
ALTER TABLE meta_capi_events ADD CONSTRAINT meta_capi_events_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE mfa_sessions DROP CONSTRAINT IF EXISTS mfa_sessions_user_id_fkey CASCADE;
ALTER TABLE mfa_sessions ADD CONSTRAINT mfa_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE nps_surveys DROP CONSTRAINT IF EXISTS nps_surveys_agent_id_fkey CASCADE;
ALTER TABLE nps_surveys ADD CONSTRAINT nps_surveys_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES profiles(id);

ALTER TABLE nps_surveys DROP CONSTRAINT IF EXISTS nps_surveys_contact_id_fkey CASCADE;
ALTER TABLE nps_surveys ADD CONSTRAINT nps_surveys_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE number_reputation DROP CONSTRAINT IF EXISTS number_reputation_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE number_reputation ADD CONSTRAINT number_reputation_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;

ALTER TABLE passkey_credentials DROP CONSTRAINT IF EXISTS passkey_credentials_user_id_fkey CASCADE;
ALTER TABLE passkey_credentials ADD CONSTRAINT passkey_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE password_reset_requests DROP CONSTRAINT IF EXISTS password_reset_requests_reviewed_by_fkey CASCADE;
ALTER TABLE password_reset_requests ADD CONSTRAINT password_reset_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);

ALTER TABLE password_reset_requests DROP CONSTRAINT IF EXISTS password_reset_requests_user_id_fkey CASCADE;
ALTER TABLE password_reset_requests ADD CONSTRAINT password_reset_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE payment_links DROP CONSTRAINT IF EXISTS payment_links_contact_id_fkey CASCADE;
ALTER TABLE payment_links ADD CONSTRAINT payment_links_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE payment_links DROP CONSTRAINT IF EXISTS payment_links_created_by_fkey CASCADE;
ALTER TABLE payment_links ADD CONSTRAINT payment_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE payment_links DROP CONSTRAINT IF EXISTS payment_links_deal_id_fkey CASCADE;
ALTER TABLE payment_links ADD CONSTRAINT payment_links_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES sales_deals(id) ON DELETE SET NULL;

ALTER TABLE pinned_conversations DROP CONSTRAINT IF EXISTS pinned_conversations_contact_id_fkey CASCADE;
ALTER TABLE pinned_conversations ADD CONSTRAINT pinned_conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE pinned_conversations DROP CONSTRAINT IF EXISTS pinned_conversations_pinned_by_fkey CASCADE;
ALTER TABLE pinned_conversations ADD CONSTRAINT pinned_conversations_pinned_by_fkey FOREIGN KEY (pinned_by) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE playbooks DROP CONSTRAINT IF EXISTS playbooks_created_by_fkey CASCADE;
ALTER TABLE playbooks ADD CONSTRAINT playbooks_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE products ADD CONSTRAINT products_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey CASCADE;
ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE queue_goals DROP CONSTRAINT IF EXISTS queue_goals_queue_id_fkey CASCADE;
ALTER TABLE queue_goals ADD CONSTRAINT queue_goals_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE;

ALTER TABLE queue_members DROP CONSTRAINT IF EXISTS queue_members_profile_id_fkey CASCADE;
ALTER TABLE queue_members ADD CONSTRAINT queue_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE queue_members DROP CONSTRAINT IF EXISTS queue_members_queue_id_fkey CASCADE;
ALTER TABLE queue_members ADD CONSTRAINT queue_members_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE;

ALTER TABLE queue_positions DROP CONSTRAINT IF EXISTS queue_positions_contact_id_fkey CASCADE;
ALTER TABLE queue_positions ADD CONSTRAINT queue_positions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);

ALTER TABLE queue_positions DROP CONSTRAINT IF EXISTS queue_positions_queue_id_fkey CASCADE;
ALTER TABLE queue_positions ADD CONSTRAINT queue_positions_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id);

ALTER TABLE queue_skill_requirements DROP CONSTRAINT IF EXISTS queue_skill_requirements_queue_id_fkey CASCADE;
ALTER TABLE queue_skill_requirements ADD CONSTRAINT queue_skill_requirements_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE;

ALTER TABLE rate_limit_logs DROP CONSTRAINT IF EXISTS rate_limit_logs_user_id_fkey CASCADE;
ALTER TABLE rate_limit_logs ADD CONSTRAINT rate_limit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_contact_id_fkey CASCADE;
ALTER TABLE reminders ADD CONSTRAINT reminders_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_profile_id_fkey CASCADE;
ALTER TABLE reminders ADD CONSTRAINT reminders_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_permission_id_fkey CASCADE;
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE;

ALTER TABLE sales_deals DROP CONSTRAINT IF EXISTS sales_deals_assigned_to_fkey CASCADE;
ALTER TABLE sales_deals ADD CONSTRAINT sales_deals_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE sales_deals DROP CONSTRAINT IF EXISTS sales_deals_contact_id_fkey CASCADE;
ALTER TABLE sales_deals ADD CONSTRAINT sales_deals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE sales_deals DROP CONSTRAINT IF EXISTS sales_deals_stage_id_fkey CASCADE;
ALTER TABLE sales_deals ADD CONSTRAINT sales_deals_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES sales_pipeline_stages(id) ON DELETE SET NULL;

ALTER TABLE scheduled_messages DROP CONSTRAINT IF EXISTS scheduled_messages_contact_id_fkey CASCADE;
ALTER TABLE scheduled_messages ADD CONSTRAINT scheduled_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE scheduled_messages DROP CONSTRAINT IF EXISTS scheduled_messages_created_by_fkey CASCADE;
ALTER TABLE scheduled_messages ADD CONSTRAINT scheduled_messages_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE scheduled_messages DROP CONSTRAINT IF EXISTS scheduled_messages_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE scheduled_messages ADD CONSTRAINT scheduled_messages_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);

ALTER TABLE scheduled_report_configs DROP CONSTRAINT IF EXISTS scheduled_report_configs_created_by_fkey CASCADE;
ALTER TABLE scheduled_report_configs ADD CONSTRAINT scheduled_report_configs_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE security_alerts DROP CONSTRAINT IF EXISTS security_alerts_resolved_by_fkey CASCADE;
ALTER TABLE security_alerts ADD CONSTRAINT security_alerts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE security_alerts DROP CONSTRAINT IF EXISTS security_alerts_user_id_fkey CASCADE;
ALTER TABLE security_alerts ADD CONSTRAINT security_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE sicoob_contact_mapping DROP CONSTRAINT IF EXISTS sicoob_contact_mapping_contact_id_fkey CASCADE;
ALTER TABLE sicoob_contact_mapping ADD CONSTRAINT sicoob_contact_mapping_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE sicoob_contact_mapping DROP CONSTRAINT IF EXISTS sicoob_contact_mapping_zappweb_agent_id_fkey CASCADE;
ALTER TABLE sicoob_contact_mapping ADD CONSTRAINT sicoob_contact_mapping_zappweb_agent_id_fkey FOREIGN KEY (zappweb_agent_id) REFERENCES profiles(id);

ALTER TABLE sla_rules DROP CONSTRAINT IF EXISTS sla_rules_agent_id_fkey CASCADE;
ALTER TABLE sla_rules ADD CONSTRAINT sla_rules_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE sla_rules DROP CONSTRAINT IF EXISTS sla_rules_contact_id_fkey CASCADE;
ALTER TABLE sla_rules ADD CONSTRAINT sla_rules_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE sla_rules DROP CONSTRAINT IF EXISTS sla_rules_queue_id_fkey CASCADE;
ALTER TABLE sla_rules ADD CONSTRAINT sla_rules_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE;

ALTER TABLE stickers DROP CONSTRAINT IF EXISTS stickers_owner_id_fkey CASCADE;
ALTER TABLE stickers ADD CONSTRAINT stickers_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_created_by_fkey CASCADE;
ALTER TABLE tags ADD CONSTRAINT tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE talkx_blacklist DROP CONSTRAINT IF EXISTS talkx_blacklist_blocked_by_fkey CASCADE;
ALTER TABLE talkx_blacklist ADD CONSTRAINT talkx_blacklist_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE talkx_blacklist DROP CONSTRAINT IF EXISTS talkx_blacklist_contact_id_fkey CASCADE;
ALTER TABLE talkx_blacklist ADD CONSTRAINT talkx_blacklist_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_created_by_fkey CASCADE;
ALTER TABLE talkx_campaigns ADD CONSTRAINT talkx_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE talkx_campaigns ADD CONSTRAINT talkx_campaigns_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);

ALTER TABLE talkx_recipients DROP CONSTRAINT IF EXISTS talkx_recipients_campaign_id_fkey CASCADE;
ALTER TABLE talkx_recipients ADD CONSTRAINT talkx_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES talkx_campaigns(id) ON DELETE CASCADE;

ALTER TABLE talkx_recipients DROP CONSTRAINT IF EXISTS talkx_recipients_contact_id_fkey CASCADE;
ALTER TABLE talkx_recipients ADD CONSTRAINT talkx_recipients_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE team_conversation_members DROP CONSTRAINT IF EXISTS team_conversation_members_conversation_id_fkey CASCADE;
ALTER TABLE team_conversation_members ADD CONSTRAINT team_conversation_members_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES team_conversations(id) ON DELETE CASCADE;

ALTER TABLE team_conversation_members DROP CONSTRAINT IF EXISTS team_conversation_members_profile_id_fkey CASCADE;
ALTER TABLE team_conversation_members ADD CONSTRAINT team_conversation_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE team_conversations DROP CONSTRAINT IF EXISTS team_conversations_created_by_fkey CASCADE;
ALTER TABLE team_conversations ADD CONSTRAINT team_conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE team_messages DROP CONSTRAINT IF EXISTS team_messages_conversation_id_fkey CASCADE;
ALTER TABLE team_messages ADD CONSTRAINT team_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES team_conversations(id) ON DELETE CASCADE;

ALTER TABLE team_messages DROP CONSTRAINT IF EXISTS team_messages_reply_to_id_fkey CASCADE;
ALTER TABLE team_messages ADD CONSTRAINT team_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES team_messages(id);

ALTER TABLE team_messages DROP CONSTRAINT IF EXISTS team_messages_sender_id_fkey CASCADE;
ALTER TABLE team_messages ADD CONSTRAINT team_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id);

ALTER TABLE training_sessions DROP CONSTRAINT IF EXISTS training_sessions_profile_id_fkey CASCADE;
ALTER TABLE training_sessions ADD CONSTRAINT training_sessions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey CASCADE;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_device_id_fkey CASCADE;
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_device_id_fkey FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE SET NULL;

ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_user_id_fkey CASCADE;
ALTER TABLE user_settings ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE warroom_alerts DROP CONSTRAINT IF EXISTS warroom_alerts_dismissed_by_fkey CASCADE;
ALTER TABLE warroom_alerts ADD CONSTRAINT warroom_alerts_dismissed_by_fkey FOREIGN KEY (dismissed_by) REFERENCES profiles(id);

ALTER TABLE whatsapp_connection_queues DROP CONSTRAINT IF EXISTS whatsapp_connection_queues_queue_id_fkey CASCADE;
ALTER TABLE whatsapp_connection_queues ADD CONSTRAINT whatsapp_connection_queues_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE;

ALTER TABLE whatsapp_connection_queues DROP CONSTRAINT IF EXISTS whatsapp_connection_queues_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE whatsapp_connection_queues ADD CONSTRAINT whatsapp_connection_queues_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;

ALTER TABLE whatsapp_connections DROP CONSTRAINT IF EXISTS whatsapp_connections_created_by_fkey CASCADE;
ALTER TABLE whatsapp_connections ADD CONSTRAINT whatsapp_connections_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE whatsapp_flows DROP CONSTRAINT IF EXISTS whatsapp_flows_created_by_fkey CASCADE;
ALTER TABLE whatsapp_flows ADD CONSTRAINT whatsapp_flows_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE whatsapp_flows DROP CONSTRAINT IF EXISTS whatsapp_flows_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE whatsapp_flows ADD CONSTRAINT whatsapp_flows_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL;

ALTER TABLE whatsapp_groups DROP CONSTRAINT IF EXISTS whatsapp_groups_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE whatsapp_groups ADD CONSTRAINT whatsapp_groups_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;

ALTER TABLE whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_whatsapp_connection_id_fkey CASCADE;
ALTER TABLE whatsapp_templates ADD CONSTRAINT whatsapp_templates_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);

ALTER TABLE whisper_messages DROP CONSTRAINT IF EXISTS whisper_messages_contact_id_fkey CASCADE;
ALTER TABLE whisper_messages ADD CONSTRAINT whisper_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);

ALTER TABLE whisper_messages DROP CONSTRAINT IF EXISTS whisper_messages_sender_id_fkey CASCADE;
ALTER TABLE whisper_messages ADD CONSTRAINT whisper_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id);

ALTER TABLE whisper_messages DROP CONSTRAINT IF EXISTS whisper_messages_target_agent_id_fkey CASCADE;
ALTER TABLE whisper_messages ADD CONSTRAINT whisper_messages_target_agent_id_fkey FOREIGN KEY (target_agent_id) REFERENCES profiles(id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIM DO BLOCO 7 — 169 foreign keys exportadas
-- ═══════════════════════════════════════════════════════════════════════════════
