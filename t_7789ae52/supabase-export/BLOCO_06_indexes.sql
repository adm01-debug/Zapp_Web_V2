-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO 6 — INDEXES (293 índices)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Idempotente: DROP IF EXISTS + CREATE INDEX para cada índice do schema public
-- Ordem: por tabela, depois por nome do índice
-- Inclui: UNIQUE, PRIMARY KEY (implícitos), GIN, btree, DESC, composite
-- ═══════════════════════════════════════════════════════════════════════════════
-- PRÉ-REQUISITO: BLOCO 1 (tabelas) deve estar aplicado antes deste bloco.
-- ═══════════════════════════════════════════════════════════════════════════════


DROP INDEX IF EXISTS public.agent_achievements_pkey CASCADE;
CREATE UNIQUE INDEX agent_achievements_pkey ON public.agent_achievements USING btree (id);

DROP INDEX IF EXISTS public.idx_agent_achievements_profile CASCADE;
CREATE INDEX idx_agent_achievements_profile ON public.agent_achievements USING btree (profile_id);

DROP INDEX IF EXISTS public.agent_skills_pkey CASCADE;
CREATE UNIQUE INDEX agent_skills_pkey ON public.agent_skills USING btree (id);

DROP INDEX IF EXISTS public.agent_skills_profile_id_skill_name_key CASCADE;
CREATE UNIQUE INDEX agent_skills_profile_id_skill_name_key ON public.agent_skills USING btree (profile_id, skill_name);

DROP INDEX IF EXISTS public.agent_stats_pkey CASCADE;
CREATE UNIQUE INDEX agent_stats_pkey ON public.agent_stats USING btree (id);

DROP INDEX IF EXISTS public.agent_stats_profile_id_key CASCADE;
CREATE UNIQUE INDEX agent_stats_profile_id_key ON public.agent_stats USING btree (profile_id);

DROP INDEX IF EXISTS public.idx_agent_stats_level CASCADE;
CREATE INDEX idx_agent_stats_level ON public.agent_stats USING btree (level DESC);

DROP INDEX IF EXISTS public.idx_agent_stats_xp CASCADE;
CREATE INDEX idx_agent_stats_xp ON public.agent_stats USING btree (xp DESC);

DROP INDEX IF EXISTS public.agent_visibility_grants_agent_id_can_see_agent_id_key CASCADE;
CREATE UNIQUE INDEX agent_visibility_grants_agent_id_can_see_agent_id_key ON public.agent_visibility_grants USING btree (agent_id, can_see_agent_id);

DROP INDEX IF EXISTS public.agent_visibility_grants_pkey CASCADE;
CREATE UNIQUE INDEX agent_visibility_grants_pkey ON public.agent_visibility_grants USING btree (id);

DROP INDEX IF EXISTS public.ai_conversation_tags_pkey CASCADE;
CREATE UNIQUE INDEX ai_conversation_tags_pkey ON public.ai_conversation_tags USING btree (id);

DROP INDEX IF EXISTS public.ai_providers_pkey CASCADE;
CREATE UNIQUE INDEX ai_providers_pkey ON public.ai_providers USING btree (id);

DROP INDEX IF EXISTS public.ai_usage_logs_pkey CASCADE;
CREATE UNIQUE INDEX ai_usage_logs_pkey ON public.ai_usage_logs USING btree (id);

DROP INDEX IF EXISTS public.idx_ai_usage_logs_created_at CASCADE;
CREATE INDEX idx_ai_usage_logs_created_at ON public.ai_usage_logs USING btree (created_at DESC);

DROP INDEX IF EXISTS public.idx_ai_usage_logs_function_name CASCADE;
CREATE INDEX idx_ai_usage_logs_function_name ON public.ai_usage_logs USING btree (function_name);

DROP INDEX IF EXISTS public.idx_ai_usage_logs_profile_id CASCADE;
CREATE INDEX idx_ai_usage_logs_profile_id ON public.ai_usage_logs USING btree (profile_id);

DROP INDEX IF EXISTS public.idx_ai_usage_logs_status CASCADE;
CREATE INDEX idx_ai_usage_logs_status ON public.ai_usage_logs USING btree (status);

DROP INDEX IF EXISTS public.idx_ai_usage_logs_user_id CASCADE;
CREATE INDEX idx_ai_usage_logs_user_id ON public.ai_usage_logs USING btree (user_id);

DROP INDEX IF EXISTS public.allowed_countries_country_code_key CASCADE;
CREATE UNIQUE INDEX allowed_countries_country_code_key ON public.allowed_countries USING btree (country_code);

DROP INDEX IF EXISTS public.allowed_countries_pkey CASCADE;
CREATE UNIQUE INDEX allowed_countries_pkey ON public.allowed_countries USING btree (id);

DROP INDEX IF EXISTS public.idx_allowed_countries_code CASCADE;
CREATE INDEX idx_allowed_countries_code ON public.allowed_countries USING btree (country_code);

DROP INDEX IF EXISTS public.audio_memes_pkey CASCADE;
CREATE UNIQUE INDEX audio_memes_pkey ON public.audio_memes USING btree (id);

DROP INDEX IF EXISTS public.audit_logs_pkey CASCADE;
CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id);

DROP INDEX IF EXISTS public.idx_audit_logs_action CASCADE;
CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);

DROP INDEX IF EXISTS public.idx_audit_logs_created_at CASCADE;
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);

DROP INDEX IF EXISTS public.idx_audit_logs_user_created CASCADE;
CREATE INDEX idx_audit_logs_user_created ON public.audit_logs USING btree (user_id, created_at DESC);

DROP INDEX IF EXISTS public.idx_audit_logs_user_id CASCADE;
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);

DROP INDEX IF EXISTS public.auto_close_config_pkey CASCADE;
CREATE UNIQUE INDEX auto_close_config_pkey ON public.auto_close_config USING btree (id);

DROP INDEX IF EXISTS public.automations_pkey CASCADE;
CREATE UNIQUE INDEX automations_pkey ON public.automations USING btree (id);

DROP INDEX IF EXISTS public.away_messages_pkey CASCADE;
CREATE UNIQUE INDEX away_messages_pkey ON public.away_messages USING btree (id);

DROP INDEX IF EXISTS public.away_messages_whatsapp_connection_id_key CASCADE;
CREATE UNIQUE INDEX away_messages_whatsapp_connection_id_key ON public.away_messages USING btree (whatsapp_connection_id);

DROP INDEX IF EXISTS public.blocked_countries_country_code_key CASCADE;
CREATE UNIQUE INDEX blocked_countries_country_code_key ON public.blocked_countries USING btree (country_code);

DROP INDEX IF EXISTS public.blocked_countries_pkey CASCADE;
CREATE UNIQUE INDEX blocked_countries_pkey ON public.blocked_countries USING btree (id);

DROP INDEX IF EXISTS public.idx_blocked_countries_code CASCADE;
CREATE INDEX idx_blocked_countries_code ON public.blocked_countries USING btree (country_code);

DROP INDEX IF EXISTS public.blocked_ips_ip_address_key CASCADE;
CREATE UNIQUE INDEX blocked_ips_ip_address_key ON public.blocked_ips USING btree (ip_address);

DROP INDEX IF EXISTS public.blocked_ips_pkey CASCADE;
CREATE UNIQUE INDEX blocked_ips_pkey ON public.blocked_ips USING btree (id);

DROP INDEX IF EXISTS public.idx_blocked_ips_expires CASCADE;
CREATE INDEX idx_blocked_ips_expires ON public.blocked_ips USING btree (expires_at);

DROP INDEX IF EXISTS public.idx_blocked_ips_ip CASCADE;
CREATE INDEX idx_blocked_ips_ip ON public.blocked_ips USING btree (ip_address);

DROP INDEX IF EXISTS public.business_hours_pkey CASCADE;
CREATE UNIQUE INDEX business_hours_pkey ON public.business_hours USING btree (id);

DROP INDEX IF EXISTS public.business_hours_whatsapp_connection_id_day_of_week_key CASCADE;
CREATE UNIQUE INDEX business_hours_whatsapp_connection_id_day_of_week_key ON public.business_hours USING btree (whatsapp_connection_id, day_of_week);

DROP INDEX IF EXISTS public.idx_business_hours_connection CASCADE;
CREATE INDEX idx_business_hours_connection ON public.business_hours USING btree (whatsapp_connection_id);

DROP INDEX IF EXISTS public.calls_pkey CASCADE;
CREATE UNIQUE INDEX calls_pkey ON public.calls USING btree (id);

DROP INDEX IF EXISTS public.campaign_ab_variants_pkey CASCADE;
CREATE UNIQUE INDEX campaign_ab_variants_pkey ON public.campaign_ab_variants USING btree (id);

DROP INDEX IF EXISTS public.campaign_contacts_pkey CASCADE;
CREATE UNIQUE INDEX campaign_contacts_pkey ON public.campaign_contacts USING btree (id);

DROP INDEX IF EXISTS public.idx_campaign_contacts_campaign CASCADE;
CREATE INDEX idx_campaign_contacts_campaign ON public.campaign_contacts USING btree (campaign_id, status);

DROP INDEX IF EXISTS public.idx_campaign_contacts_campaign_id CASCADE;
CREATE INDEX idx_campaign_contacts_campaign_id ON public.campaign_contacts USING btree (campaign_id);

DROP INDEX IF EXISTS public.idx_campaign_contacts_status CASCADE;
CREATE INDEX idx_campaign_contacts_status ON public.campaign_contacts USING btree (status);

DROP INDEX IF EXISTS public.campaigns_pkey CASCADE;
CREATE UNIQUE INDEX campaigns_pkey ON public.campaigns USING btree (id);

DROP INDEX IF EXISTS public.idx_campaigns_created_by CASCADE;
CREATE INDEX idx_campaigns_created_by ON public.campaigns USING btree (created_by);

DROP INDEX IF EXISTS public.idx_campaigns_status CASCADE;
CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status);

DROP INDEX IF EXISTS public.channel_connections_pkey CASCADE;
CREATE UNIQUE INDEX channel_connections_pkey ON public.channel_connections USING btree (id);

DROP INDEX IF EXISTS public.channel_routing_rules_pkey CASCADE;
CREATE UNIQUE INDEX channel_routing_rules_pkey ON public.channel_routing_rules USING btree (id);

DROP INDEX IF EXISTS public.chatbot_executions_pkey CASCADE;
CREATE UNIQUE INDEX chatbot_executions_pkey ON public.chatbot_executions USING btree (id);

DROP INDEX IF EXISTS public.idx_chatbot_executions_contact_id CASCADE;
CREATE INDEX idx_chatbot_executions_contact_id ON public.chatbot_executions USING btree (contact_id);

DROP INDEX IF EXISTS public.idx_chatbot_executions_flow_id CASCADE;
CREATE INDEX idx_chatbot_executions_flow_id ON public.chatbot_executions USING btree (flow_id);

DROP INDEX IF EXISTS public.idx_chatbot_executions_status CASCADE;
CREATE INDEX idx_chatbot_executions_status ON public.chatbot_executions USING btree (status);

DROP INDEX IF EXISTS public.chatbot_flows_pkey CASCADE;
CREATE UNIQUE INDEX chatbot_flows_pkey ON public.chatbot_flows USING btree (id);

DROP INDEX IF EXISTS public.idx_chatbot_flows_active CASCADE;
CREATE INDEX idx_chatbot_flows_active ON public.chatbot_flows USING btree (is_active);

DROP INDEX IF EXISTS public.client_wallet_rules_pkey CASCADE;
CREATE UNIQUE INDEX client_wallet_rules_pkey ON public.client_wallet_rules USING btree (id);

DROP INDEX IF EXISTS public.connection_health_logs_pkey CASCADE;
CREATE UNIQUE INDEX connection_health_logs_pkey ON public.connection_health_logs USING btree (id);

DROP INDEX IF EXISTS public.idx_health_logs_checked_at CASCADE;
CREATE INDEX idx_health_logs_checked_at ON public.connection_health_logs USING btree (checked_at DESC);

DROP INDEX IF EXISTS public.idx_health_logs_connection_checked CASCADE;
CREATE INDEX idx_health_logs_connection_checked ON public.connection_health_logs USING btree (connection_id, checked_at DESC);

DROP INDEX IF EXISTS public.contact_custom_fields_pkey CASCADE;
CREATE UNIQUE INDEX contact_custom_fields_pkey ON public.contact_custom_fields USING btree (id);

DROP INDEX IF EXISTS public.idx_contact_custom_fields_contact CASCADE;
CREATE INDEX idx_contact_custom_fields_contact ON public.contact_custom_fields USING btree (contact_id);

DROP INDEX IF EXISTS public.idx_contact_custom_fields_unique CASCADE;
CREATE UNIQUE INDEX idx_contact_custom_fields_unique ON public.contact_custom_fields USING btree (contact_id, field_name);

DROP INDEX IF EXISTS public.contact_notes_pkey CASCADE;
CREATE UNIQUE INDEX contact_notes_pkey ON public.contact_notes USING btree (id);

DROP INDEX IF EXISTS public.idx_contact_notes_author_id CASCADE;
CREATE INDEX idx_contact_notes_author_id ON public.contact_notes USING btree (author_id);

DROP INDEX IF EXISTS public.idx_contact_notes_contact_id CASCADE;
CREATE INDEX idx_contact_notes_contact_id ON public.contact_notes USING btree (contact_id);

DROP INDEX IF EXISTS public.contact_purchases_pkey CASCADE;
CREATE UNIQUE INDEX contact_purchases_pkey ON public.contact_purchases USING btree (id);

DROP INDEX IF EXISTS public.contact_tags_contact_id_tag_id_key CASCADE;
CREATE UNIQUE INDEX contact_tags_contact_id_tag_id_key ON public.contact_tags USING btree (contact_id, tag_id);

DROP INDEX IF EXISTS public.contact_tags_pkey CASCADE;
CREATE UNIQUE INDEX contact_tags_pkey ON public.contact_tags USING btree (id);

DROP INDEX IF EXISTS public.contacts_phone_key CASCADE;
CREATE UNIQUE INDEX contacts_phone_key ON public.contacts USING btree (phone);

DROP INDEX IF EXISTS public.contacts_phone_unique CASCADE;
CREATE UNIQUE INDEX contacts_phone_unique ON public.contacts USING btree (phone);

DROP INDEX IF EXISTS public.contacts_pkey CASCADE;
CREATE UNIQUE INDEX contacts_pkey ON public.contacts USING btree (id);

DROP INDEX IF EXISTS public.idx_contacts_assigned_to CASCADE;
CREATE INDEX idx_contacts_assigned_to ON public.contacts USING btree (assigned_to);

DROP INDEX IF EXISTS public.idx_contacts_company_trgm CASCADE;
CREATE INDEX idx_contacts_company_trgm ON public.contacts USING gin (company extensions.gin_trgm_ops);

DROP INDEX IF EXISTS public.idx_contacts_contact_type CASCADE;
CREATE INDEX idx_contacts_contact_type ON public.contacts USING btree (contact_type);

DROP INDEX IF EXISTS public.idx_contacts_created_at CASCADE;
CREATE INDEX idx_contacts_created_at ON public.contacts USING btree (created_at DESC);

DROP INDEX IF EXISTS public.idx_contacts_email_trgm CASCADE;
CREATE INDEX idx_contacts_email_trgm ON public.contacts USING gin (email extensions.gin_trgm_ops);

DROP INDEX IF EXISTS public.idx_contacts_job_title_trgm CASCADE;
CREATE INDEX idx_contacts_job_title_trgm ON public.contacts USING gin (job_title extensions.gin_trgm_ops);

DROP INDEX IF EXISTS public.idx_contacts_name_asc CASCADE;
CREATE INDEX idx_contacts_name_asc ON public.contacts USING btree (name);

DROP INDEX IF EXISTS public.idx_contacts_name_trgm CASCADE;
CREATE INDEX idx_contacts_name_trgm ON public.contacts USING gin (name extensions.gin_trgm_ops);

DROP INDEX IF EXISTS public.idx_contacts_nickname_trgm CASCADE;
CREATE INDEX idx_contacts_nickname_trgm ON public.contacts USING gin (nickname extensions.gin_trgm_ops);

DROP INDEX IF EXISTS public.idx_contacts_phone_trgm CASCADE;
CREATE INDEX idx_contacts_phone_trgm ON public.contacts USING gin (phone extensions.gin_trgm_ops);

DROP INDEX IF EXISTS public.idx_contacts_queue_id CASCADE;
CREATE INDEX idx_contacts_queue_id ON public.contacts USING btree (queue_id);

DROP INDEX IF EXISTS public.idx_contacts_surname_trgm CASCADE;
CREATE INDEX idx_contacts_surname_trgm ON public.contacts USING gin (surname extensions.gin_trgm_ops);

DROP INDEX IF EXISTS public.idx_contacts_type CASCADE;
CREATE INDEX idx_contacts_type ON public.contacts USING btree (contact_type);

DROP INDEX IF EXISTS public.conversation_analyses_pkey CASCADE;
CREATE UNIQUE INDEX conversation_analyses_pkey ON public.conversation_analyses USING btree (id);

DROP INDEX IF EXISTS public.idx_conversation_analyses_contact_department CASCADE;
CREATE INDEX idx_conversation_analyses_contact_department ON public.conversation_analyses USING btree (contact_id, department);

DROP INDEX IF EXISTS public.idx_conversation_analyses_contact_id CASCADE;
CREATE INDEX idx_conversation_analyses_contact_id ON public.conversation_analyses USING btree (contact_id);

DROP INDEX IF EXISTS public.idx_conversation_analyses_created_at CASCADE;
CREATE INDEX idx_conversation_analyses_created_at ON public.conversation_analyses USING btree (created_at DESC);

DROP INDEX IF EXISTS public.idx_conversation_analyses_department CASCADE;
CREATE INDEX idx_conversation_analyses_department ON public.conversation_analyses USING btree (department);

DROP INDEX IF EXISTS public.conversation_closures_pkey CASCADE;
CREATE UNIQUE INDEX conversation_closures_pkey ON public.conversation_closures USING btree (id);

DROP INDEX IF EXISTS public.idx_closures_contact CASCADE;
CREATE INDEX idx_closures_contact ON public.conversation_closures USING btree (contact_id);

DROP INDEX IF EXISTS public.idx_closures_reason CASCADE;
CREATE INDEX idx_closures_reason ON public.conversation_closures USING btree (close_reason);

DROP INDEX IF EXISTS public.conversation_events_pkey CASCADE;
CREATE UNIQUE INDEX conversation_events_pkey ON public.conversation_events USING btree (id);

DROP INDEX IF EXISTS public.idx_conversation_events_contact CASCADE;
CREATE INDEX idx_conversation_events_contact ON public.conversation_events USING btree (contact_id, created_at DESC);

DROP INDEX IF EXISTS public.idx_conversation_events_type CASCADE;
CREATE INDEX idx_conversation_events_type ON public.conversation_events USING btree (event_type);

DROP INDEX IF EXISTS public.conversation_memory_contact_id_key CASCADE;
CREATE UNIQUE INDEX conversation_memory_contact_id_key ON public.conversation_memory USING btree (contact_id);

DROP INDEX IF EXISTS public.conversation_memory_pkey CASCADE;
CREATE UNIQUE INDEX conversation_memory_pkey ON public.conversation_memory USING btree (id);

DROP INDEX IF EXISTS public.conversation_sla_pkey CASCADE;
CREATE UNIQUE INDEX conversation_sla_pkey ON public.conversation_sla USING btree (id);

DROP INDEX IF EXISTS public.conversation_snoozes_pkey CASCADE;
CREATE UNIQUE INDEX conversation_snoozes_pkey ON public.conversation_snoozes USING btree (id);

DROP INDEX IF EXISTS public.idx_snoozes_contact CASCADE;
CREATE INDEX idx_snoozes_contact ON public.conversation_snoozes USING btree (contact_id);

DROP INDEX IF EXISTS public.idx_snoozes_until CASCADE;
CREATE INDEX idx_snoozes_until ON public.conversation_snoozes USING btree (snooze_until);

DROP INDEX IF EXISTS public.conversation_tasks_pkey CASCADE;
CREATE UNIQUE INDEX conversation_tasks_pkey ON public.conversation_tasks USING btree (id);

DROP INDEX IF EXISTS public.idx_tasks_assigned CASCADE;
CREATE INDEX idx_tasks_assigned ON public.conversation_tasks USING btree (assigned_to);

DROP INDEX IF EXISTS public.idx_tasks_contact CASCADE;
CREATE INDEX idx_tasks_contact ON public.conversation_tasks USING btree (contact_id);

DROP INDEX IF EXISTS public.idx_tasks_status CASCADE;
CREATE INDEX idx_tasks_status ON public.conversation_tasks USING btree (status);

DROP INDEX IF EXISTS public.crisis_room_alerts_pkey CASCADE;
CREATE UNIQUE INDEX crisis_room_alerts_pkey ON public.crisis_room_alerts USING btree (id);

DROP INDEX IF EXISTS public.csat_auto_config_pkey CASCADE;
CREATE UNIQUE INDEX csat_auto_config_pkey ON public.csat_auto_config USING btree (id);

DROP INDEX IF EXISTS public.csat_surveys_pkey CASCADE;
CREATE UNIQUE INDEX csat_surveys_pkey ON public.csat_surveys USING btree (id);

DROP INDEX IF EXISTS public.custom_emojis_pkey CASCADE;
CREATE UNIQUE INDEX custom_emojis_pkey ON public.custom_emojis USING btree (id);

DROP INDEX IF EXISTS public.deal_activities_pkey CASCADE;
CREATE UNIQUE INDEX deal_activities_pkey ON public.deal_activities USING btree (id);

DROP INDEX IF EXISTS public.email_labels_gmail_account_id_gmail_label_id_key CASCADE;
CREATE UNIQUE INDEX email_labels_gmail_account_id_gmail_label_id_key ON public.email_labels USING btree (gmail_account_id, gmail_label_id);

DROP INDEX IF EXISTS public.email_labels_pkey CASCADE;
CREATE UNIQUE INDEX email_labels_pkey ON public.email_labels USING btree (id);

DROP INDEX IF EXISTS public.idx_email_labels_account CASCADE;
CREATE INDEX idx_email_labels_account ON public.email_labels USING btree (gmail_account_id);

DROP INDEX IF EXISTS public.email_messages_gmail_account_id_gmail_message_id_key CASCADE;
CREATE UNIQUE INDEX email_messages_gmail_account_id_gmail_message_id_key ON public.email_messages USING btree (gmail_account_id, gmail_message_id);

DROP INDEX IF EXISTS public.email_messages_pkey CASCADE;
CREATE UNIQUE INDEX email_messages_pkey ON public.email_messages USING btree (id);

DROP INDEX IF EXISTS public.idx_email_messages_account CASCADE;
CREATE INDEX idx_email_messages_account ON public.email_messages USING btree (gmail_account_id);

DROP INDEX IF EXISTS public.idx_email_messages_date CASCADE;
CREATE INDEX idx_email_messages_date ON public.email_messages USING btree (internal_date DESC);

DROP INDEX IF EXISTS public.idx_email_messages_thread CASCADE;
CREATE INDEX idx_email_messages_thread ON public.email_messages USING btree (thread_id);

DROP INDEX IF EXISTS public.email_threads_gmail_account_id_gmail_thread_id_key CASCADE;
CREATE UNIQUE INDEX email_threads_gmail_account_id_gmail_thread_id_key ON public.email_threads USING btree (gmail_account_id, gmail_thread_id);

DROP INDEX IF EXISTS public.email_threads_pkey CASCADE;
CREATE UNIQUE INDEX email_threads_pkey ON public.email_threads USING btree (id);

DROP INDEX IF EXISTS public.idx_email_threads_account CASCADE;
CREATE INDEX idx_email_threads_account ON public.email_threads USING btree (gmail_account_id);

DROP INDEX IF EXISTS public.idx_email_threads_contact CASCADE;
CREATE INDEX idx_email_threads_contact ON public.email_threads USING btree (contact_id);

DROP INDEX IF EXISTS public.idx_email_threads_last_message CASCADE;
CREATE INDEX idx_email_threads_last_message ON public.email_threads USING btree (last_message_at DESC);

DROP INDEX IF EXISTS public.entity_versions_entity_type_entity_id_version_number_key CASCADE;
CREATE UNIQUE INDEX entity_versions_entity_type_entity_id_version_number_key ON public.entity_versions USING btree (entity_type, entity_id, version_number);

DROP INDEX IF EXISTS public.entity_versions_pkey CASCADE;
CREATE UNIQUE INDEX entity_versions_pkey ON public.entity_versions USING btree (id);

DROP INDEX IF EXISTS public.idx_versions_date CASCADE;
CREATE INDEX idx_versions_date ON public.entity_versions USING btree (created_at DESC);

DROP INDEX IF EXISTS public.idx_versions_entity CASCADE;
CREATE INDEX idx_versions_entity ON public.entity_versions USING btree (entity_type, entity_id);

DROP INDEX IF EXISTS public.favorite_contacts_contact_id_user_id_key CASCADE;
CREATE UNIQUE INDEX favorite_contacts_contact_id_user_id_key ON public.favorite_contacts USING btree (contact_id, user_id);

DROP INDEX IF EXISTS public.favorite_contacts_pkey CASCADE;
CREATE UNIQUE INDEX favorite_contacts_pkey ON public.favorite_contacts USING btree (id);

DROP INDEX IF EXISTS public.followup_executions_pkey CASCADE;
CREATE UNIQUE INDEX followup_executions_pkey ON public.followup_executions USING btree (id);

DROP INDEX IF EXISTS public.followup_sequences_pkey CASCADE;
CREATE UNIQUE INDEX followup_sequences_pkey ON public.followup_sequences USING btree (id);

DROP INDEX IF EXISTS public.followup_steps_pkey CASCADE;
CREATE UNIQUE INDEX followup_steps_pkey ON public.followup_steps USING btree (id);

DROP INDEX IF EXISTS public.geo_blocking_settings_pkey CASCADE;
CREATE UNIQUE INDEX geo_blocking_settings_pkey ON public.geo_blocking_settings USING btree (id);

DROP INDEX IF EXISTS public.global_settings_key_key CASCADE;
CREATE UNIQUE INDEX global_settings_key_key ON public.global_settings USING btree (key);

DROP INDEX IF EXISTS public.global_settings_pkey CASCADE;
CREATE UNIQUE INDEX global_settings_pkey ON public.global_settings USING btree (id);

DROP INDEX IF EXISTS public.gmail_accounts_email_address_key CASCADE;
CREATE UNIQUE INDEX gmail_accounts_email_address_key ON public.gmail_accounts USING btree (email_address);

DROP INDEX IF EXISTS public.gmail_accounts_pkey CASCADE;
CREATE UNIQUE INDEX gmail_accounts_pkey ON public.gmail_accounts USING btree (id);

DROP INDEX IF EXISTS public.goals_configurations_pkey CASCADE;
CREATE UNIQUE INDEX goals_configurations_pkey ON public.goals_configurations USING btree (id);

DROP INDEX IF EXISTS public.goals_configurations_profile_id_goal_type_key CASCADE;
CREATE UNIQUE INDEX goals_configurations_profile_id_goal_type_key ON public.goals_configurations USING btree (profile_id, goal_type);

DROP INDEX IF EXISTS public.goals_configurations_queue_id_goal_type_key CASCADE;
CREATE UNIQUE INDEX goals_configurations_queue_id_goal_type_key ON public.goals_configurations USING btree (queue_id, goal_type);

DROP INDEX IF EXISTS public.ip_whitelist_ip_address_key CASCADE;
CREATE UNIQUE INDEX ip_whitelist_ip_address_key ON public.ip_whitelist USING btree (ip_address);

DROP INDEX IF EXISTS public.ip_whitelist_pkey CASCADE;
CREATE UNIQUE INDEX ip_whitelist_pkey ON public.ip_whitelist USING btree (id);

DROP INDEX IF EXISTS public.idx_kb_articles_search CASCADE;
CREATE INDEX idx_kb_articles_search ON public.knowledge_base_articles USING gin (search_vector);

DROP INDEX IF EXISTS public.knowledge_base_articles_pkey CASCADE;
CREATE UNIQUE INDEX knowledge_base_articles_pkey ON public.knowledge_base_articles USING btree (id);

DROP INDEX IF EXISTS public.knowledge_base_files_pkey CASCADE;
CREATE UNIQUE INDEX knowledge_base_files_pkey ON public.knowledge_base_files USING btree (id);

DROP INDEX IF EXISTS public.idx_login_attempts_email CASCADE;
CREATE INDEX idx_login_attempts_email ON public.login_attempts USING btree (email);

DROP INDEX IF EXISTS public.idx_login_attempts_locked CASCADE;
CREATE INDEX idx_login_attempts_locked ON public.login_attempts USING btree (locked_until) WHERE (locked_until IS NOT NULL);

DROP INDEX IF EXISTS public.login_attempts_email_key CASCADE;
CREATE UNIQUE INDEX login_attempts_email_key ON public.login_attempts USING btree (email);

DROP INDEX IF EXISTS public.login_attempts_pkey CASCADE;
CREATE UNIQUE INDEX login_attempts_pkey ON public.login_attempts USING btree (id);

DROP INDEX IF EXISTS public.idx_message_reactions_message CASCADE;
CREATE INDEX idx_message_reactions_message ON public.message_reactions USING btree (message_id);

DROP INDEX IF EXISTS public.message_reactions_message_id_contact_id_emoji_key CASCADE;
CREATE UNIQUE INDEX message_reactions_message_id_contact_id_emoji_key ON public.message_reactions USING btree (message_id, contact_id, emoji);

DROP INDEX IF EXISTS public.message_reactions_message_id_user_id_emoji_key CASCADE;
CREATE UNIQUE INDEX message_reactions_message_id_user_id_emoji_key ON public.message_reactions USING btree (message_id, user_id, emoji);

DROP INDEX IF EXISTS public.message_reactions_pkey CASCADE;
CREATE UNIQUE INDEX message_reactions_pkey ON public.message_reactions USING btree (id);

DROP INDEX IF EXISTS public.message_templates_pkey CASCADE;
CREATE UNIQUE INDEX message_templates_pkey ON public.message_templates USING btree (id);

DROP INDEX IF EXISTS public.idx_messages_contact_created CASCADE;
CREATE INDEX idx_messages_contact_created ON public.messages USING btree (contact_id, created_at DESC);

DROP INDEX IF EXISTS public.idx_messages_contact_id CASCADE;
CREATE INDEX idx_messages_contact_id ON public.messages USING btree (contact_id);

DROP INDEX IF EXISTS public.idx_messages_content_search CASCADE;
CREATE INDEX idx_messages_content_search ON public.messages USING gin (to_tsvector('portuguese'::regconfig, content));

DROP INDEX IF EXISTS public.idx_messages_created_at CASCADE;
CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);

DROP INDEX IF EXISTS public.idx_messages_external_id CASCADE;
CREATE INDEX idx_messages_external_id ON public.messages USING btree (external_id);

DROP INDEX IF EXISTS public.messages_pkey CASCADE;
CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id);

DROP INDEX IF EXISTS public.meta_capi_events_pkey CASCADE;
CREATE UNIQUE INDEX meta_capi_events_pkey ON public.meta_capi_events USING btree (id);

DROP INDEX IF EXISTS public.idx_mfa_sessions_user CASCADE;
CREATE INDEX idx_mfa_sessions_user ON public.mfa_sessions USING btree (user_id);

DROP INDEX IF EXISTS public.mfa_sessions_pkey CASCADE;
CREATE UNIQUE INDEX mfa_sessions_pkey ON public.mfa_sessions USING btree (id);

DROP INDEX IF EXISTS public.idx_notifications_created_at CASCADE;
CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);

DROP INDEX IF EXISTS public.idx_notifications_is_read CASCADE;
CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);

DROP INDEX IF EXISTS public.idx_notifications_user_id CASCADE;
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);

DROP INDEX IF EXISTS public.notifications_pkey CASCADE;
CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);

DROP INDEX IF EXISTS public.idx_nps_surveys_contact CASCADE;
CREATE INDEX idx_nps_surveys_contact ON public.nps_surveys USING btree (contact_id);

DROP INDEX IF EXISTS public.idx_nps_surveys_created CASCADE;
CREATE INDEX idx_nps_surveys_created ON public.nps_surveys USING btree (created_at DESC);

DROP INDEX IF EXISTS public.nps_surveys_pkey CASCADE;
CREATE UNIQUE INDEX nps_surveys_pkey ON public.nps_surveys USING btree (id);

DROP INDEX IF EXISTS public.idx_reputation_connection CASCADE;
CREATE INDEX idx_reputation_connection ON public.number_reputation USING btree (whatsapp_connection_id);

DROP INDEX IF EXISTS public.number_reputation_pkey CASCADE;
CREATE UNIQUE INDEX number_reputation_pkey ON public.number_reputation USING btree (id);

DROP INDEX IF EXISTS public.number_reputation_whatsapp_connection_id_key CASCADE;
CREATE UNIQUE INDEX number_reputation_whatsapp_connection_id_key ON public.number_reputation USING btree (whatsapp_connection_id);

DROP INDEX IF EXISTS public.idx_passkey_credentials_credential_id CASCADE;
CREATE INDEX idx_passkey_credentials_credential_id ON public.passkey_credentials USING btree (credential_id);

DROP INDEX IF EXISTS public.idx_passkey_credentials_user_id CASCADE;
CREATE INDEX idx_passkey_credentials_user_id ON public.passkey_credentials USING btree (user_id);

DROP INDEX IF EXISTS public.passkey_credentials_credential_id_key CASCADE;
CREATE UNIQUE INDEX passkey_credentials_credential_id_key ON public.passkey_credentials USING btree (credential_id);

DROP INDEX IF EXISTS public.passkey_credentials_pkey CASCADE;
CREATE UNIQUE INDEX passkey_credentials_pkey ON public.passkey_credentials USING btree (id);

DROP INDEX IF EXISTS public.idx_password_reset_requests_status CASCADE;
CREATE INDEX idx_password_reset_requests_status ON public.password_reset_requests USING btree (status);

DROP INDEX IF EXISTS public.idx_password_reset_requests_user CASCADE;
CREATE INDEX idx_password_reset_requests_user ON public.password_reset_requests USING btree (user_id);

DROP INDEX IF EXISTS public.password_reset_requests_pkey CASCADE;
CREATE UNIQUE INDEX password_reset_requests_pkey ON public.password_reset_requests USING btree (id);

DROP INDEX IF EXISTS public.payment_links_pkey CASCADE;
CREATE UNIQUE INDEX payment_links_pkey ON public.payment_links USING btree (id);

DROP INDEX IF EXISTS public.idx_performance_snapshots_created_at CASCADE;
CREATE INDEX idx_performance_snapshots_created_at ON public.performance_snapshots USING btree (created_at DESC);

DROP INDEX IF EXISTS public.idx_performance_snapshots_profile CASCADE;
CREATE INDEX idx_performance_snapshots_profile ON public.performance_snapshots USING btree (profile_id);

DROP INDEX IF EXISTS public.performance_snapshots_pkey CASCADE;
CREATE UNIQUE INDEX performance_snapshots_pkey ON public.performance_snapshots USING btree (id);

DROP INDEX IF EXISTS public.permissions_name_key CASCADE;
CREATE UNIQUE INDEX permissions_name_key ON public.permissions USING btree (name);

DROP INDEX IF EXISTS public.permissions_pkey CASCADE;
CREATE UNIQUE INDEX permissions_pkey ON public.permissions USING btree (id);

DROP INDEX IF EXISTS public.pinned_conversations_contact_id_pinned_by_key CASCADE;
CREATE UNIQUE INDEX pinned_conversations_contact_id_pinned_by_key ON public.pinned_conversations USING btree (contact_id, pinned_by);

DROP INDEX IF EXISTS public.pinned_conversations_pkey CASCADE;
CREATE UNIQUE INDEX pinned_conversations_pkey ON public.pinned_conversations USING btree (id);

DROP INDEX IF EXISTS public.playbooks_pkey CASCADE;
CREATE UNIQUE INDEX playbooks_pkey ON public.playbooks USING btree (id);

DROP INDEX IF EXISTS public.idx_products_active CASCADE;
CREATE INDEX idx_products_active ON public.products USING btree (is_active);

DROP INDEX IF EXISTS public.idx_products_category CASCADE;
CREATE INDEX idx_products_category ON public.products USING btree (category);

DROP INDEX IF EXISTS public.products_pkey CASCADE;
CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id);

DROP INDEX IF EXISTS public.products_sku_key CASCADE;
CREATE UNIQUE INDEX products_sku_key ON public.products USING btree (sku);

DROP INDEX IF EXISTS public.idx_profiles_is_active CASCADE;
CREATE INDEX idx_profiles_is_active ON public.profiles USING btree (is_active);

DROP INDEX IF EXISTS public.profiles_pkey CASCADE;
CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

DROP INDEX IF EXISTS public.profiles_user_id_key CASCADE;
CREATE UNIQUE INDEX profiles_user_id_key ON public.profiles USING btree (user_id);

DROP INDEX IF EXISTS public.idx_query_telemetry_created_at CASCADE;
CREATE INDEX idx_query_telemetry_created_at ON public.query_telemetry USING btree (created_at DESC);

DROP INDEX IF EXISTS public.idx_query_telemetry_severity CASCADE;
CREATE INDEX idx_query_telemetry_severity ON public.query_telemetry USING btree (severity);

DROP INDEX IF EXISTS public.query_telemetry_pkey CASCADE;
CREATE UNIQUE INDEX query_telemetry_pkey ON public.query_telemetry USING btree (id);

DROP INDEX IF EXISTS public.queue_goals_pkey CASCADE;
CREATE UNIQUE INDEX queue_goals_pkey ON public.queue_goals USING btree (id);

DROP INDEX IF EXISTS public.queue_goals_queue_id_key CASCADE;
CREATE UNIQUE INDEX queue_goals_queue_id_key ON public.queue_goals USING btree (queue_id);

DROP INDEX IF EXISTS public.queue_members_pkey CASCADE;
CREATE UNIQUE INDEX queue_members_pkey ON public.queue_members USING btree (id);

DROP INDEX IF EXISTS public.queue_members_queue_id_profile_id_key CASCADE;
CREATE UNIQUE INDEX queue_members_queue_id_profile_id_key ON public.queue_members USING btree (queue_id, profile_id);

DROP INDEX IF EXISTS public.queue_positions_pkey CASCADE;
CREATE UNIQUE INDEX queue_positions_pkey ON public.queue_positions USING btree (id);

DROP INDEX IF EXISTS public.queue_skill_requirements_pkey CASCADE;
CREATE UNIQUE INDEX queue_skill_requirements_pkey ON public.queue_skill_requirements USING btree (id);

DROP INDEX IF EXISTS public.queue_skill_requirements_queue_id_skill_name_key CASCADE;
CREATE UNIQUE INDEX queue_skill_requirements_queue_id_skill_name_key ON public.queue_skill_requirements USING btree (queue_id, skill_name);

DROP INDEX IF EXISTS public.queues_pkey CASCADE;
CREATE UNIQUE INDEX queues_pkey ON public.queues USING btree (id);

DROP INDEX IF EXISTS public.rate_limit_configs_pkey CASCADE;
CREATE UNIQUE INDEX rate_limit_configs_pkey ON public.rate_limit_configs USING btree (id);

DROP INDEX IF EXISTS public.idx_rate_limit_logs_created CASCADE;
CREATE INDEX idx_rate_limit_logs_created ON public.rate_limit_logs USING btree (created_at);

DROP INDEX IF EXISTS public.idx_rate_limit_logs_ip CASCADE;
CREATE INDEX idx_rate_limit_logs_ip ON public.rate_limit_logs USING btree (ip_address);

DROP INDEX IF EXISTS public.idx_rate_limit_logs_user CASCADE;
CREATE INDEX idx_rate_limit_logs_user ON public.rate_limit_logs USING btree (user_id);

DROP INDEX IF EXISTS public.rate_limit_logs_pkey CASCADE;
CREATE UNIQUE INDEX rate_limit_logs_pkey ON public.rate_limit_logs USING btree (id);

DROP INDEX IF EXISTS public.idx_reminders_profile CASCADE;
CREATE INDEX idx_reminders_profile ON public.reminders USING btree (profile_id);

DROP INDEX IF EXISTS public.idx_reminders_remind_at CASCADE;
CREATE INDEX idx_reminders_remind_at ON public.reminders USING btree (remind_at);

DROP INDEX IF EXISTS public.reminders_pkey CASCADE;
CREATE UNIQUE INDEX reminders_pkey ON public.reminders USING btree (id);

DROP INDEX IF EXISTS public.role_permissions_pkey CASCADE;
CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (id);

DROP INDEX IF EXISTS public.role_permissions_role_permission_id_key CASCADE;
CREATE UNIQUE INDEX role_permissions_role_permission_id_key ON public.role_permissions USING btree (role, permission_id);

DROP INDEX IF EXISTS public.sales_deals_pkey CASCADE;
CREATE UNIQUE INDEX sales_deals_pkey ON public.sales_deals USING btree (id);

DROP INDEX IF EXISTS public.sales_pipeline_stages_pkey CASCADE;
CREATE UNIQUE INDEX sales_pipeline_stages_pkey ON public.sales_pipeline_stages USING btree (id);

DROP INDEX IF EXISTS public.idx_saved_filters_user_entity CASCADE;
CREATE INDEX idx_saved_filters_user_entity ON public.saved_filters USING btree (user_id, entity_type);

DROP INDEX IF EXISTS public.saved_filters_pkey CASCADE;
CREATE UNIQUE INDEX saved_filters_pkey ON public.saved_filters USING btree (id);

DROP INDEX IF EXISTS public.idx_scheduled_messages_pending CASCADE;
CREATE INDEX idx_scheduled_messages_pending ON public.scheduled_messages USING btree (scheduled_at) WHERE (status = 'pending'::text);

DROP INDEX IF EXISTS public.scheduled_messages_pkey CASCADE;
CREATE UNIQUE INDEX scheduled_messages_pkey ON public.scheduled_messages USING btree (id);

DROP INDEX IF EXISTS public.scheduled_report_configs_pkey CASCADE;
CREATE UNIQUE INDEX scheduled_report_configs_pkey ON public.scheduled_report_configs USING btree (id);

DROP INDEX IF EXISTS public.scheduled_reports_pkey CASCADE;
CREATE UNIQUE INDEX scheduled_reports_pkey ON public.scheduled_reports USING btree (id);

DROP INDEX IF EXISTS public.idx_security_alerts_created CASCADE;
CREATE INDEX idx_security_alerts_created ON public.security_alerts USING btree (created_at);

DROP INDEX IF EXISTS public.idx_security_alerts_type CASCADE;
CREATE INDEX idx_security_alerts_type ON public.security_alerts USING btree (alert_type);

DROP INDEX IF EXISTS public.security_alerts_pkey CASCADE;
CREATE UNIQUE INDEX security_alerts_pkey ON public.security_alerts USING btree (id);

DROP INDEX IF EXISTS public.sicoob_contact_mapping_pkey CASCADE;
CREATE UNIQUE INDEX sicoob_contact_mapping_pkey ON public.sicoob_contact_mapping USING btree (id);

DROP INDEX IF EXISTS public.sicoob_contact_mapping_sicoob_user_id_sicoob_singular_id_key CASCADE;
CREATE UNIQUE INDEX sicoob_contact_mapping_sicoob_user_id_sicoob_singular_id_key ON public.sicoob_contact_mapping USING btree (sicoob_user_id, sicoob_singular_id);

DROP INDEX IF EXISTS public.sla_configurations_pkey CASCADE;
CREATE UNIQUE INDEX sla_configurations_pkey ON public.sla_configurations USING btree (id);

DROP INDEX IF EXISTS public.idx_sla_rules_active CASCADE;
CREATE INDEX idx_sla_rules_active ON public.sla_rules USING btree (is_active) WHERE (is_active = true);

DROP INDEX IF EXISTS public.idx_sla_rules_active_priority CASCADE;
CREATE INDEX idx_sla_rules_active_priority ON public.sla_rules USING btree (is_active, priority DESC);

DROP INDEX IF EXISTS public.idx_sla_rules_agent_id CASCADE;
CREATE INDEX idx_sla_rules_agent_id ON public.sla_rules USING btree (agent_id) WHERE (agent_id IS NOT NULL);

DROP INDEX IF EXISTS public.idx_sla_rules_company CASCADE;
CREATE INDEX idx_sla_rules_company ON public.sla_rules USING btree (company) WHERE (company IS NOT NULL);

DROP INDEX IF EXISTS public.idx_sla_rules_contact_id CASCADE;
CREATE INDEX idx_sla_rules_contact_id ON public.sla_rules USING btree (contact_id) WHERE (contact_id IS NOT NULL);

DROP INDEX IF EXISTS public.idx_sla_rules_queue_id CASCADE;
CREATE INDEX idx_sla_rules_queue_id ON public.sla_rules USING btree (queue_id) WHERE (queue_id IS NOT NULL);

DROP INDEX IF EXISTS public.sla_rules_pkey CASCADE;
CREATE UNIQUE INDEX sla_rules_pkey ON public.sla_rules USING btree (id);

DROP INDEX IF EXISTS public.idx_stickers_owner_id CASCADE;
CREATE INDEX idx_stickers_owner_id ON public.stickers USING btree (owner_id) WHERE (owner_id IS NOT NULL);

DROP INDEX IF EXISTS public.stickers_pkey CASCADE;
CREATE UNIQUE INDEX stickers_pkey ON public.stickers USING btree (id);

DROP INDEX IF EXISTS public.tags_name_key CASCADE;
CREATE UNIQUE INDEX tags_name_key ON public.tags USING btree (name);

DROP INDEX IF EXISTS public.tags_pkey CASCADE;
CREATE UNIQUE INDEX tags_pkey ON public.tags USING btree (id);

DROP INDEX IF EXISTS public.idx_talkx_blacklist_contact CASCADE;
CREATE INDEX idx_talkx_blacklist_contact ON public.talkx_blacklist USING btree (contact_id);

DROP INDEX IF EXISTS public.talkx_blacklist_contact_id_key CASCADE;
CREATE UNIQUE INDEX talkx_blacklist_contact_id_key ON public.talkx_blacklist USING btree (contact_id);

DROP INDEX IF EXISTS public.talkx_blacklist_pkey CASCADE;
CREATE UNIQUE INDEX talkx_blacklist_pkey ON public.talkx_blacklist USING btree (id);

DROP INDEX IF EXISTS public.idx_talkx_campaigns_created_by CASCADE;
CREATE INDEX idx_talkx_campaigns_created_by ON public.talkx_campaigns USING btree (created_by);

DROP INDEX IF EXISTS public.idx_talkx_campaigns_status CASCADE;
CREATE INDEX idx_talkx_campaigns_status ON public.talkx_campaigns USING btree (status);

DROP INDEX IF EXISTS public.talkx_campaigns_pkey CASCADE;
CREATE UNIQUE INDEX talkx_campaigns_pkey ON public.talkx_campaigns USING btree (id);

DROP INDEX IF EXISTS public.idx_talkx_recipients_campaign CASCADE;
CREATE INDEX idx_talkx_recipients_campaign ON public.talkx_recipients USING btree (campaign_id);

DROP INDEX IF EXISTS public.idx_talkx_recipients_status CASCADE;
CREATE INDEX idx_talkx_recipients_status ON public.talkx_recipients USING btree (status);

DROP INDEX IF EXISTS public.talkx_recipients_campaign_id_contact_id_key CASCADE;
CREATE UNIQUE INDEX talkx_recipients_campaign_id_contact_id_key ON public.talkx_recipients USING btree (campaign_id, contact_id);

DROP INDEX IF EXISTS public.talkx_recipients_pkey CASCADE;
CREATE UNIQUE INDEX talkx_recipients_pkey ON public.talkx_recipients USING btree (id);

DROP INDEX IF EXISTS public.idx_team_members_conversation CASCADE;
CREATE INDEX idx_team_members_conversation ON public.team_conversation_members USING btree (conversation_id);

DROP INDEX IF EXISTS public.idx_team_members_profile CASCADE;
CREATE INDEX idx_team_members_profile ON public.team_conversation_members USING btree (profile_id);

DROP INDEX IF EXISTS public.team_conversation_members_conversation_id_profile_id_key CASCADE;
CREATE UNIQUE INDEX team_conversation_members_conversation_id_profile_id_key ON public.team_conversation_members USING btree (conversation_id, profile_id);

DROP INDEX IF EXISTS public.team_conversation_members_pkey CASCADE;
CREATE UNIQUE INDEX team_conversation_members_pkey ON public.team_conversation_members USING btree (id);

DROP INDEX IF EXISTS public.team_conversations_pkey CASCADE;
CREATE UNIQUE INDEX team_conversations_pkey ON public.team_conversations USING btree (id);

DROP INDEX IF EXISTS public.idx_team_messages_conversation CASCADE;
CREATE INDEX idx_team_messages_conversation ON public.team_messages USING btree (conversation_id, created_at DESC);

DROP INDEX IF EXISTS public.team_messages_pkey CASCADE;
CREATE UNIQUE INDEX team_messages_pkey ON public.team_messages USING btree (id);

DROP INDEX IF EXISTS public.training_sessions_pkey CASCADE;
CREATE UNIQUE INDEX training_sessions_pkey ON public.training_sessions USING btree (id);

DROP INDEX IF EXISTS public.idx_user_devices_fingerprint CASCADE;
CREATE INDEX idx_user_devices_fingerprint ON public.user_devices USING btree (device_fingerprint);

DROP INDEX IF EXISTS public.idx_user_devices_user_id CASCADE;
CREATE INDEX idx_user_devices_user_id ON public.user_devices USING btree (user_id);

DROP INDEX IF EXISTS public.user_devices_pkey CASCADE;
CREATE UNIQUE INDEX user_devices_pkey ON public.user_devices USING btree (id);

DROP INDEX IF EXISTS public.user_devices_user_id_device_fingerprint_key CASCADE;
CREATE UNIQUE INDEX user_devices_user_id_device_fingerprint_key ON public.user_devices USING btree (user_id, device_fingerprint);

DROP INDEX IF EXISTS public.user_roles_pkey CASCADE;
CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (id);

DROP INDEX IF EXISTS public.user_roles_user_id_role_key CASCADE;
CREATE UNIQUE INDEX user_roles_user_id_role_key ON public.user_roles USING btree (user_id, role);

DROP INDEX IF EXISTS public.user_service_accounts_pkey CASCADE;
CREATE UNIQUE INDEX user_service_accounts_pkey ON public.user_service_accounts USING btree (id);

DROP INDEX IF EXISTS public.user_service_accounts_user_id_service_type_key CASCADE;
CREATE UNIQUE INDEX user_service_accounts_user_id_service_type_key ON public.user_service_accounts USING btree (user_id, service_type);

DROP INDEX IF EXISTS public.idx_user_sessions_active CASCADE;
CREATE INDEX idx_user_sessions_active ON public.user_sessions USING btree (is_active) WHERE (is_active = true);

DROP INDEX IF EXISTS public.idx_user_sessions_user_id CASCADE;
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);

DROP INDEX IF EXISTS public.user_sessions_pkey CASCADE;
CREATE UNIQUE INDEX user_sessions_pkey ON public.user_sessions USING btree (id);

DROP INDEX IF EXISTS public.user_settings_pkey CASCADE;
CREATE UNIQUE INDEX user_settings_pkey ON public.user_settings USING btree (id);

DROP INDEX IF EXISTS public.user_settings_user_id_key CASCADE;
CREATE UNIQUE INDEX user_settings_user_id_key ON public.user_settings USING btree (user_id);

DROP INDEX IF EXISTS public.idx_voice_command_logs_created_at CASCADE;
CREATE INDEX idx_voice_command_logs_created_at ON public.voice_command_logs USING btree (created_at DESC);

DROP INDEX IF EXISTS public.idx_voice_command_logs_user_id CASCADE;
CREATE INDEX idx_voice_command_logs_user_id ON public.voice_command_logs USING btree (user_id);

DROP INDEX IF EXISTS public.voice_command_logs_pkey CASCADE;
CREATE UNIQUE INDEX voice_command_logs_pkey ON public.voice_command_logs USING btree (id);

DROP INDEX IF EXISTS public.warroom_alerts_pkey CASCADE;
CREATE UNIQUE INDEX warroom_alerts_pkey ON public.warroom_alerts USING btree (id);

DROP INDEX IF EXISTS public.idx_webauthn_challenges_expires CASCADE;
CREATE INDEX idx_webauthn_challenges_expires ON public.webauthn_challenges USING btree (expires_at);

DROP INDEX IF EXISTS public.webauthn_challenges_pkey CASCADE;
CREATE UNIQUE INDEX webauthn_challenges_pkey ON public.webauthn_challenges USING btree (id);

DROP INDEX IF EXISTS public.idx_rate_limits_instance_window CASCADE;
CREATE INDEX idx_rate_limits_instance_window ON public.webhook_rate_limits USING btree (instance_id, window_start DESC);

DROP INDEX IF EXISTS public.webhook_rate_limits_pkey CASCADE;
CREATE UNIQUE INDEX webhook_rate_limits_pkey ON public.webhook_rate_limits USING btree (id);

DROP INDEX IF EXISTS public.whatsapp_connection_queues_pkey CASCADE;
CREATE UNIQUE INDEX whatsapp_connection_queues_pkey ON public.whatsapp_connection_queues USING btree (id);

DROP INDEX IF EXISTS public.whatsapp_connection_queues_whatsapp_connection_id_queue_id_key CASCADE;
CREATE UNIQUE INDEX whatsapp_connection_queues_whatsapp_connection_id_queue_id_key ON public.whatsapp_connection_queues USING btree (whatsapp_connection_id, queue_id);

DROP INDEX IF EXISTS public.whatsapp_connections_pkey CASCADE;
CREATE UNIQUE INDEX whatsapp_connections_pkey ON public.whatsapp_connections USING btree (id);

DROP INDEX IF EXISTS public.whatsapp_flows_pkey CASCADE;
CREATE UNIQUE INDEX whatsapp_flows_pkey ON public.whatsapp_flows USING btree (id);

DROP INDEX IF EXISTS public.idx_whatsapp_groups_category CASCADE;
CREATE INDEX idx_whatsapp_groups_category ON public.whatsapp_groups USING btree (category);

DROP INDEX IF EXISTS public.whatsapp_groups_group_id_key CASCADE;
CREATE UNIQUE INDEX whatsapp_groups_group_id_key ON public.whatsapp_groups USING btree (group_id);

DROP INDEX IF EXISTS public.whatsapp_groups_pkey CASCADE;
CREATE UNIQUE INDEX whatsapp_groups_pkey ON public.whatsapp_groups USING btree (id);

DROP INDEX IF EXISTS public.whatsapp_templates_pkey CASCADE;
CREATE UNIQUE INDEX whatsapp_templates_pkey ON public.whatsapp_templates USING btree (id);

DROP INDEX IF EXISTS public.whisper_messages_pkey CASCADE;
CREATE UNIQUE INDEX whisper_messages_pkey ON public.whisper_messages USING btree (id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIM DO BLOCO 6 — 293 índices exportados
-- ═══════════════════════════════════════════════════════════════════════════════
