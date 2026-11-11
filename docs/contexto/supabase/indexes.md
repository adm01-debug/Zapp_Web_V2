# Índices

Uso e tamanho em `stats.md`.

| tabela | índice | método | colunas | único | válido | predicado |
|---|---|---|---|---|---|---|
| ops.hermes_change_log | hermes_change_log_pkey | btree | id | sim | sim |  |
| ops.hermes_change_log | idx_hermes_change_log_created | btree | created_at | não | sim |  |
| ops.hermes_change_log | idx_hermes_change_log_run | btree | run_id | não | sim |  |
| ops.hermes_change_log | idx_hermes_change_log_status | btree | status | não | sim |  |
| public._rb_message_reactions_contato_20261007001008 | _rb_message_reactions_contato_20261007001008_pkey | btree | reaction_id | sim | sim |  |
| public._rb_message_reactions_one_per_agent_20261107121000 | _rb_message_reactions_one_per_agent_20261107121000_pkey | btree | id | sim | sim |  |
| public._zapp_mig133_log | _zapp_mig133_log_pkey | btree | version | sim | sim |  |
| public.agent_achievements | agent_achievements_pkey | btree | id | sim | sim |  |
| public.agent_achievements | idx_agent_achievements_earned_at | btree | earned_at | não | sim |  |
| public.agent_achievements | idx_agent_achievements_profile | btree | profile_id | não | sim |  |
| public.agent_achievements | ux_agent_achievements_one_time | btree | profile_id, achievement_type | sim | sim | `(achievement_type <> ALL (ARRAY['daily_goal'::text, 'streak'::text, 'message_milestone'::text, 'resolution'::text, 'resolution_milestone'::text]))` |
| public.agent_mini_game_xp_daily | agent_mini_game_xp_daily_pkey | btree | profile_id, game_id, dia | sim | sim |  |
| public.agent_presence | agent_presence_pkey | btree | user_id | sim | sim |  |
| public.agent_skills | agent_skills_pkey | btree | id | sim | sim |  |
| public.agent_skills | agent_skills_profile_id_skill_name_key | btree | profile_id, skill_name | sim | sim |  |
| public.agent_skills | idx_agent_skills_profile_id | btree | profile_id | não | sim |  |
| public.agent_stats | agent_stats_pkey | btree | id | sim | sim |  |
| public.agent_stats | agent_stats_profile_id_key | btree | profile_id | sim | sim |  |
| public.agent_stats | idx_agent_stats_xp | btree | xp | não | sim |  |
| public.agent_visibility_grants | agent_visibility_grants_agent_id_can_see_agent_id_key | btree | agent_id, can_see_agent_id | sim | sim |  |
| public.agent_visibility_grants | agent_visibility_grants_pkey | btree | id | sim | sim |  |
| public.agent_visibility_grants | idx_agent_visibility_grants_agent_id | btree | agent_id | não | sim |  |
| public.agent_visibility_grants | idx_agent_visibility_grants_can_see_agent_id | btree | can_see_agent_id | não | sim |  |
| public.agent_visibility_grants | idx_agent_visibility_grants_granted_by | btree | granted_by | não | sim |  |
| public.ai_budget_reservations | ai_budget_reservations_idempotency_key_key | btree | idempotency_key | sim | sim |  |
| public.ai_budget_reservations | ai_budget_reservations_pkey | btree | id | sim | sim |  |
| public.ai_budget_reservations | idx_ai_budget_reservations_reserved_expiry | btree | status, expires_at | não | sim | `(status = 'reserved'::text)` |
| public.ai_conversation_tags | ai_conversation_tags_contact_tag_uidx | btree | contact_id, tag_name | sim | sim |  |
| public.ai_conversation_tags | ai_conversation_tags_pkey | btree | id | sim | sim |  |
| public.ai_conversation_tags | idx_ai_conversation_tags_contact_id | btree | contact_id | não | sim |  |
| public.ai_jobs | ai_jobs_idempotency_key_key | btree | idempotency_key | sim | sim |  |
| public.ai_jobs | ai_jobs_pkey | btree | id | sim | sim |  |
| public.ai_jobs | idx_ai_jobs_queued_priority | btree | priority, available_at | não | sim | `(status = 'queued'::text)` |
| public.ai_jobs | idx_ai_jobs_running_lease | btree | lease_expires_at | não | sim | `(status = 'running'::text)` |
| public.ai_jobs | idx_ai_jobs_status_expires | btree | status, expires_at | não | sim | `(expires_at IS NOT NULL)` |
| public.ai_model_prices | ai_model_prices_pkey | btree | id | sim | sim |  |
| public.ai_model_prices | idx_ai_model_prices_provider_id | btree | provider_id | não | sim |  |
| public.ai_model_prices | idx_ai_model_prices_vigencia | btree | model, unit, valid_from | não | sim |  |
| public.ai_model_prices | uq_ai_model_prices_vigencia | btree | model, unit, valid_from, source | sim | sim |  |
| public.ai_providers | ai_providers_pkey | btree | id | sim | sim |  |
| public.ai_providers | idx_ai_providers_created_by | btree | created_by | não | sim |  |
| public.ai_usage_logs | ai_usage_logs_pkey | btree | id | sim | sim |  |
| public.ai_usage_logs | idx_ai_usage_logs_created_at | btree | created_at | não | sim |  |
| public.ai_usage_logs | idx_ai_usage_logs_function_name | btree | function_name | não | sim |  |
| public.ai_usage_logs | idx_ai_usage_logs_job_id | btree | job_id | não | sim | `(job_id IS NOT NULL)` |
| public.ai_usage_logs | idx_ai_usage_logs_profile_id | btree | profile_id | não | sim |  |
| public.ai_usage_logs | idx_ai_usage_logs_request_id | btree | request_id | não | sim |  |
| public.ai_usage_logs | idx_ai_usage_logs_status | btree | status | não | sim |  |
| public.ai_usage_logs | idx_ai_usage_logs_user_id | btree | user_id | não | sim |  |
| public.ai_usage_outbox | ai_usage_outbox_pkey | btree | id | sim | sim |  |
| public.ai_usage_outbox | idx_ai_usage_outbox_pendentes | btree | tentativas, created_at | não | sim | `(processed_at IS NULL)` |
| public.allowed_countries | allowed_countries_country_code_key | btree | country_code | sim | sim |  |
| public.allowed_countries | allowed_countries_pkey | btree | id | sim | sim |  |
| public.allowed_countries | idx_allowed_countries_added_by | btree | added_by | não | sim |  |
| public.app_settings | app_settings_pkey | btree | key | sim | sim |  |
| public.audio_meme_favorites | audio_meme_favorites_pkey | btree | id | sim | sim |  |
| public.audio_meme_favorites | audio_meme_favorites_user_id_meme_id_key | btree | user_id, meme_id | sim | sim |  |
| public.audio_meme_favorites | idx_audio_meme_favorites_meme | btree | meme_id | não | sim |  |
| public.audio_meme_favorites | idx_audio_meme_favorites_user_id | btree | user_id | não | sim |  |
| public.audio_memes | audio_memes_pkey | btree | id | sim | sim |  |
| public.audio_memes | idx_audio_memes_uploaded_by | btree | uploaded_by | não | sim |  |
| public.audit_logs | audit_logs_pkey | btree | id | sim | sim |  |
| public.audit_logs | idx_audit_logs_action_created_at | btree | action, created_at | não | sim |  |
| public.audit_logs | idx_audit_logs_created_at | btree | created_at | não | sim |  |
| public.audit_logs | idx_audit_logs_user_id | btree | user_id | não | sim |  |
| public.audit_logs | ux_audit_logs_dedupe_key | btree | dedupe_key | sim | sim | `(dedupe_key IS NOT NULL)` |
| public.auto_close_config | auto_close_config_pkey | btree | id | sim | sim |  |
| public.auto_close_config | idx_auto_close_config_updated_by | btree | updated_by | não | sim |  |
| public.automations | automations_pkey | btree | id | sim | sim |  |
| public.automations | idx_automations_created_by | btree | created_by | não | sim |  |
| public.away_messages | away_messages_pkey | btree | id | sim | sim |  |
| public.away_messages | away_messages_whatsapp_connection_id_key | btree | whatsapp_connection_id | sim | sim |  |
| public.blocked_countries | blocked_countries_country_code_key | btree | country_code | sim | sim |  |
| public.blocked_countries | blocked_countries_pkey | btree | id | sim | sim |  |
| public.blocked_countries | idx_blocked_countries_blocked_by | btree | blocked_by | não | sim |  |
| public.blocked_ips | blocked_ips_ip_address_key | btree | ip_address | sim | sim |  |
| public.blocked_ips | blocked_ips_pkey | btree | id | sim | sim |  |
| public.blocked_ips | idx_blocked_ips_blocked_by | btree | blocked_by | não | sim |  |
| public.blocked_ips | idx_blocked_ips_expires | btree | expires_at | não | sim |  |
| public.business_hours | business_hours_pkey | btree | id | sim | sim |  |
| public.business_hours | business_hours_whatsapp_connection_id_day_of_week_key | btree | whatsapp_connection_id, day_of_week | sim | sim |  |
| public.business_hours | idx_business_hours_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.calls | calls_agent_started_idx | btree | agent_id, started_at, id | não | sim |  |
| public.calls | calls_channel_provider_call_unique | btree | channel, provider_call_id | sim | sim | `(provider_call_id IS NOT NULL)` |
| public.calls | calls_connection_provider_event_unique | btree | whatsapp_connection_id, provider_event_id | sim | sim | `(provider_event_id IS NOT NULL)` |
| public.calls | calls_pkey | btree | id | sim | sim |  |
| public.calls | idx_calls_agent_id | btree | agent_id | não | sim |  |
| public.calls | idx_calls_answered_by | btree | answered_by | não | sim | `(answered_by IS NOT NULL)` |
| public.calls | idx_calls_contact_id | btree | contact_id | não | sim |  |
| public.calls | idx_calls_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.campaign_ab_variants | campaign_ab_variants_pkey | btree | id | sim | sim |  |
| public.campaign_ab_variants | idx_campaign_ab_variants_campaign_id | btree | campaign_id | não | sim |  |
| public.campaign_contacts | campaign_contacts_pkey | btree | id | sim | sim |  |
| public.campaign_contacts | idx_campaign_contacts_campaign | btree | campaign_id, status | não | sim |  |
| public.campaign_contacts | idx_campaign_contacts_campaign_id | btree | campaign_id | não | sim |  |
| public.campaign_contacts | idx_campaign_contacts_contact_id | btree | contact_id | não | sim |  |
| public.campaign_contacts | idx_campaign_contacts_status | btree | status | não | sim |  |
| public.campaigns | campaigns_pkey | btree | id | sim | sim |  |
| public.campaigns | idx_campaigns_created_by | btree | created_by | não | sim |  |
| public.campaigns | idx_campaigns_status | btree | status | não | sim |  |
| public.campaigns | idx_campaigns_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.catalog_favorites | catalog_favorites_pkey | btree | id | sim | sim |  |
| public.catalog_favorites | catalog_favorites_user_id_product_id_key | btree | user_id, product_id | sim | sim |  |
| public.catalog_favorites | idx_catalog_favorites_user_created | btree | user_id, created_at | não | sim |  |
| public.catalog_rate_limit_hits | catalog_rate_limit_hits_lookup_idx | btree | user_id, action, hit_at | não | sim |  |
| public.catalog_rate_limit_hits | catalog_rate_limit_hits_pkey | btree | id | sim | sim |  |
| public.catalog_rate_limits | catalog_rate_limits_pkey | btree | user_id, action | sim | sim |  |
| public.catalog_send_events | catalog_send_events_pkey | btree | id | sim | sim |  |
| public.catalog_send_events | idx_catalog_send_events_agent_id | btree | agent_id | não | sim |  |
| public.catalog_send_events | idx_catalog_send_events_contact | btree | contact_id | não | sim |  |
| public.catalog_send_events | idx_catalog_send_events_created | btree | created_at | não | sim |  |
| public.catalog_send_events | idx_catalog_send_events_product | btree | product_id | não | sim |  |
| public.channel_connections | channel_connections_pkey | btree | id | sim | sim |  |
| public.channel_connections | idx_channel_connections_created_by | btree | created_by | não | sim |  |
| public.channel_connections | idx_channel_connections_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.channel_routing_rules | channel_routing_rules_pkey | btree | id | sim | sim |  |
| public.channel_routing_rules | idx_channel_routing_rules_channel_connection_id | btree | channel_connection_id | não | sim |  |
| public.channel_routing_rules | idx_channel_routing_rules_queue_id | btree | queue_id | não | sim |  |
| public.chatbot_executions | chatbot_executions_pkey | btree | id | sim | sim |  |
| public.chatbot_executions | idx_chatbot_executions_contact_id | btree | contact_id | não | sim |  |
| public.chatbot_executions | idx_chatbot_executions_flow_id | btree | flow_id | não | sim |  |
| public.chatbot_executions | idx_chatbot_executions_status | btree | status | não | sim |  |
| public.chatbot_flows | chatbot_flows_pkey | btree | id | sim | sim |  |
| public.chatbot_flows | idx_chatbot_flows_active | btree | is_active | não | sim |  |
| public.chatbot_flows | idx_chatbot_flows_created_by | btree | created_by | não | sim |  |
| public.chatbot_flows | idx_chatbot_flows_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.client_wallet_rules | client_wallet_rules_pkey | btree | id | sim | sim |  |
| public.client_wallet_rules | idx_client_wallet_rules_agent_id | btree | agent_id | não | sim |  |
| public.client_wallet_rules | idx_client_wallet_rules_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.connection_alert_preferences | connection_alert_preferences_pkey | btree | id | sim | sim |  |
| public.connection_alert_preferences | connection_alert_preferences_user_id_key | btree | user_id | sim | sim |  |
| public.connection_health_logs | connection_health_logs_pkey | btree | id | sim | sim |  |
| public.connection_health_logs | idx_connection_health_logs_connection_id | btree | connection_id | não | sim |  |
| public.connection_health_logs | idx_health_logs_checked_at | btree | checked_at | não | sim |  |
| public.contact_block_audit | contact_block_audit_pkey | btree | id | sim | sim |  |
| public.contact_block_audit | idx_contact_block_audit_contact | btree | contact_id, performed_at | não | sim |  |
| public.contact_block_audit | idx_contact_block_audit_recent | btree | performed_at | não | sim |  |
| public.contact_custom_fields | contact_custom_fields_pkey | btree | id | sim | sim |  |
| public.contact_custom_fields | idx_contact_custom_fields_contact_id | btree | contact_id | não | sim |  |
| public.contact_custom_fields | idx_contact_custom_fields_unique | btree | contact_id, field_name | sim | sim |  |
| public.contact_deletion_audit | contact_deletion_audit_pkey | btree | id | sim | sim |  |
| public.contact_deletion_audit | idx_contact_deletion_audit_contact | btree | contact_id, performed_at | não | sim |  |
| public.contact_deletion_audit | idx_contact_deletion_audit_recent | btree | performed_at | não | sim |  |
| public.contact_identity_map | contact_identity_map_pkey | btree | lid | sim | sim |  |
| public.contact_identity_map | idx_contact_identity_map_jid | btree | jid | não | sim |  |
| public.contact_notes | contact_notes_pinned_idx | btree | contact_id, created_at, id | não | sim | `is_pinned` |
| public.contact_notes | contact_notes_pkey | btree | id | sim | sim |  |
| public.contact_notes | idx_contact_notes_author_id | btree | author_id | não | sim |  |
| public.contact_notes | idx_contact_notes_contact_category | btree | contact_id, category | não | sim |  |
| public.contact_notes | idx_contact_notes_contact_id | btree | contact_id | não | sim |  |
| public.contact_protection_policy | contact_protection_policy_pkey | btree | id | sim | sim |  |
| public.contact_protection_policy | contact_protection_policy_scope_role_uidx | btree | scope_role | sim | sim |  |
| public.contacts | contacts_phone_key | btree | phone | sim | sim |  |
| public.contacts | contacts_pkey | btree | id | sim | sim |  |
| public.contacts | idx_contacts_ai_projection_analysis_id | btree | ai_projection_analysis_id | não | sim |  |
| public.contacts | idx_contacts_assigned_queue | btree | assigned_to, queue_id | não | sim |  |
| public.contacts | idx_contacts_assigned_to | btree | assigned_to | não | sim |  |
| public.contacts | idx_contacts_assigned_to_gamif | btree | assigned_to | não | sim | `(assigned_to IS NOT NULL)` |
| public.contacts | idx_contacts_blocked_at | btree | blocked_at | não | sim | `(blocked_at IS NOT NULL)` |
| public.contacts | idx_contacts_channel_connection_id | btree | channel_connection_id | não | sim |  |
| public.contacts | idx_contacts_contact_type | btree | contact_type | não | sim |  |
| public.contacts | idx_contacts_conv_status_active | btree | conversation_status | não | sim | `(conversation_status <> ALL (ARRAY['resolved'::text, 'archived'::text]))` |
| public.contacts | idx_contacts_created_at | btree | created_at | não | sim |  |
| public.contacts | idx_contacts_deleted_at | btree | deleted_at | não | sim | `(deleted_at IS NOT NULL)` |
| public.contacts | idx_contacts_email_trgm | gin | email | não | sim |  |
| public.contacts | idx_contacts_is_lid_legacy | btree | is_lid_legacy | não | sim | `(is_lid_legacy = true)` |
| public.contacts | idx_contacts_name_asc | btree | name | não | sim |  |
| public.contacts | idx_contacts_phone_search_digits_trgm | gin | phone_search_digits | não | sim |  |
| public.contacts | idx_contacts_queue_id | btree | queue_id | não | sim |  |
| public.contacts | idx_contacts_tags_gin | gin | tags | não | sim |  |
| public.contacts | idx_contacts_talk_me_waiting | btree | queue_id, conversation_status, id | não | sim | `((assigned_to IS NULL) AND (deleted_at IS NULL) AND (channel_type = 'whatsapp'::text))` |
| public.contacts | idx_contacts_talkx_audience_eligible | btree | id | não | sim | `((deleted_at IS NULL) AND (is_lid_legacy = false) AND (phone ~ '^[0-9]{10,15}$'::text))` |
| public.contacts | idx_contacts_updated_at | btree | updated_at | não | sim |  |
| public.contacts | idx_contacts_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.conversation_analyses | conversation_analyses_pkey | btree | id | sim | sim |  |
| public.conversation_analyses | idx_conversation_analyses_analyzed_by | btree | analyzed_by | não | sim |  |
| public.conversation_analyses | idx_conversation_analyses_contact_department | btree | contact_id, department | não | sim |  |
| public.conversation_analyses | idx_conversation_analyses_contact_id | btree | contact_id | não | sim |  |
| public.conversation_analyses | idx_conversation_analyses_created_at | btree | created_at | não | sim |  |
| public.conversation_analyses | idx_conversation_analyses_department | btree | department | não | sim |  |
| public.conversation_analyses | ux_conversation_analyses_contact_request_key | btree | contact_id, request_key | sim | sim | `(request_key IS NOT NULL)` |
| public.conversation_closures | conversation_closures_pkey | btree | id | sim | sim |  |
| public.conversation_closures | idx_closures_contact | btree | contact_id | não | sim |  |
| public.conversation_closures | idx_closures_created_at | btree | created_at | não | sim |  |
| public.conversation_closures | idx_closures_created_contact | btree | created_at, contact_id | não | sim |  |
| public.conversation_closures | idx_closures_reason | btree | close_reason | não | sim |  |
| public.conversation_closures | idx_conversation_closures_closed_by | btree | closed_by | não | sim |  |
| public.conversation_closures | ux_conversation_closures_contact_request | btree | contact_id, client_request_id | sim | sim | `(client_request_id IS NOT NULL)` |
| public.conversation_events | conversation_events_pkey | btree | id | sim | sim |  |
| public.conversation_events | idx_conversation_events_contact | btree | contact_id, created_at | não | sim |  |
| public.conversation_events | idx_conversation_events_contact_id | btree | contact_id | não | sim |  |
| public.conversation_events | idx_conversation_events_from_agent_id | btree | from_agent_id | não | sim |  |
| public.conversation_events | idx_conversation_events_from_queue_id | btree | from_queue_id | não | sim |  |
| public.conversation_events | idx_conversation_events_performed_by | btree | performed_by | não | sim |  |
| public.conversation_events | idx_conversation_events_to_agent_id | btree | to_agent_id | não | sim |  |
| public.conversation_events | idx_conversation_events_to_queue_id | btree | to_queue_id | não | sim |  |
| public.conversation_events | idx_conversation_events_type | btree | event_type | não | sim |  |
| public.conversation_events | idx_events_created_at | btree | created_at | não | sim |  |
| public.conversation_events | ux_conversation_events_closure_id | btree | closure_id | sim | sim | `(closure_id IS NOT NULL)` |
| public.conversation_memory | conversation_memory_contact_id_key | btree | contact_id | sim | sim |  |
| public.conversation_memory | conversation_memory_pkey | btree | id | sim | sim |  |
| public.conversation_memory | idx_conversation_memory_updated_by | btree | updated_by | não | sim |  |
| public.conversation_sla | conversation_sla_pkey | btree | id | sim | sim |  |
| public.conversation_sla | idx_conversation_sla_contact_id | btree | contact_id | não | sim |  |
| public.conversation_sla | idx_conversation_sla_sla_configuration_id | btree | sla_configuration_id | não | sim |  |
| public.conversation_sla | idx_sla_first_message_at | btree | first_message_at | não | sim |  |
| public.conversation_sla | idx_sla_first_msg_contact | btree | first_message_at, contact_id | não | sim |  |
| public.conversation_sla | ux_conversation_sla_open_per_contact | btree | contact_id | sim | sim | `(first_response_at IS NULL)` |
| public.conversation_snoozes | conversation_snoozes_pkey | btree | id | sim | sim |  |
| public.conversation_snoozes | idx_conversation_snoozes_snoozed_by | btree | snoozed_by | não | sim |  |
| public.conversation_snoozes | idx_snoozes_contact | btree | contact_id | não | sim |  |
| public.conversation_snoozes | idx_snoozes_until | btree | snooze_until | não | sim |  |
| public.conversation_tasks | conversation_tasks_pkey | btree | id | sim | sim |  |
| public.conversation_tasks | idx_conversation_tasks_created_by | btree | created_by | não | sim |  |
| public.conversation_tasks | idx_conversation_tasks_owner_status_completed | btree | created_by, status, completed_at | não | sim |  |
| public.conversation_tasks | idx_conversation_tasks_owner_status_position | btree | created_by, status, position | não | sim |  |
| public.conversation_tasks | idx_tasks_assigned | btree | assigned_to | não | sim |  |
| public.conversation_tasks | idx_tasks_contact | btree | contact_id | não | sim |  |
| public.conversation_tasks | idx_tasks_owner_remind_pending | btree | created_by, remind_at | não | sim | `((remind_at IS NOT NULL) AND (notified_at IS NULL) AND (status <> ALL (ARRAY['done'::text, 'cancelled'::text])))` |
| public.conversation_tasks | idx_tasks_owner_status_due | btree | created_by, status, due_date | não | sim |  |
| public.conversation_tasks | idx_tasks_status | btree | status | não | sim |  |
| public.conversation_tasks | uq_conversation_tasks_migrated_from_reminder | btree | migrated_from_reminder_id | sim | sim | `(migrated_from_reminder_id IS NOT NULL)` |
| public.conversation_tasks | ux_conversation_tasks_creator_client_key | btree | created_by, client_task_id | sim | sim | `((client_task_id IS NOT NULL) AND (created_by IS NOT NULL))` |
| public.copilot_conversation_scores | copilot_conversation_scores_pkey | btree | conversation_id | sim | sim |  |
| public.copilot_feedback | copilot_feedback_pkey | btree | id | sim | sim |  |
| public.copilot_feedback | idx_copilot_feedback_created_by | btree | created_by | não | sim |  |
| public.copilot_help_requests | copilot_help_requests_pkey | btree | id | sim | sim |  |
| public.copilot_insights | copilot_insights_pkey | btree | id | sim | sim |  |
| public.copilot_insights | idx_copilot_insights_profile | btree | profile_id | não | sim |  |
| public.copilot_insights | idx_copilot_insights_session_time | btree | session_id, created_at | não | sim |  |
| public.copilot_learning_moments | copilot_learning_moments_pkey | btree | id | sim | sim |  |
| public.copilot_objection_catalog | copilot_objection_catalog_pkey | btree | id | sim | sim |  |
| public.copilot_outcomes | copilot_outcomes_pkey | btree | id | sim | sim |  |
| public.copilot_seller_settings | copilot_seller_settings_pkey | btree | seller_id | sim | sim |  |
| public.copilot_sessions | copilot_sessions_conversation_id_key | btree | conversation_id | sim | sim |  |
| public.copilot_sessions | copilot_sessions_pkey | btree | id | sim | sim |  |
| public.copilot_sessions | idx_copilot_sessions_profile | btree | profile_id | não | sim |  |
| public.copilot_sessions | idx_copilot_sessions_temperature | btree | temperature | não | sim |  |
| public.copilot_usage | copilot_usage_pkey | btree | id | sim | sim |  |
| public.crisis_room_alerts | crisis_room_alerts_pkey | btree | id | sim | sim |  |
| public.crisis_room_alerts | idx_crisis_room_alerts_acknowledged_by | btree | acknowledged_by | não | sim |  |
| public.crm_contact_links | crm_contact_links_external_contact_id_key | btree | external_contact_id | sim | sim |  |
| public.crm_contact_links | crm_contact_links_pkey | btree | id | sim | sim |  |
| public.crm_contact_links | crm_contact_links_zapp_contact_id_key | btree | zapp_contact_id | sim | sim |  |
| public.crm_contact_links | idx_crm_contact_links_linked_by | btree | linked_by | não | sim | `(linked_by IS NOT NULL)` |
| public.crm_contact_links | idx_crm_contact_links_phone | btree | normalized_phone | não | sim | `(normalized_phone IS NOT NULL)` |
| public.crm_sync_outbox | crm_sync_outbox_closure_id_key | btree | closure_id | sim | sim |  |
| public.crm_sync_outbox | crm_sync_outbox_idempotency_key_key | btree | idempotency_key | sim | sim |  |
| public.crm_sync_outbox | crm_sync_outbox_pkey | btree | id | sim | sim |  |
| public.crm_sync_outbox | idx_crm_sync_outbox_contact | btree | contact_id | não | sim | `(contact_id IS NOT NULL)` |
| public.crm_sync_outbox | idx_crm_sync_outbox_ready | btree | available_at, created_at | não | sim | `(status = ANY (ARRAY['pending'::text, 'failed'::text]))` |
| public.crm_sync_outbox | idx_crm_sync_outbox_stale | btree | locked_at, created_at | não | sim | `(status = 'processing'::text)` |
| public.crm_sync_outbox | idx_crm_sync_outbox_status_completed | btree | status, completed_at | não | sim | `(status = ANY (ARRAY['succeeded'::text, 'dead_letter'::text]))` |
| public.csat_auto_config | csat_auto_config_pkey | btree | id | sim | sim |  |
| public.csat_auto_config | idx_csat_auto_config_updated_by | btree | updated_by | não | sim |  |
| public.csat_auto_config | idx_csat_auto_config_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.csat_surveys | csat_surveys_pkey | btree | id | sim | sim |  |
| public.csat_surveys | idx_csat_surveys_agent_id | btree | agent_id | não | sim |  |
| public.csat_surveys | idx_csat_surveys_contact_id | btree | contact_id | não | sim |  |
| public.csat_surveys | idx_csat_surveys_contact_invites | btree | contact_id, created_at | não | sim | `(status = ANY (ARRAY['sent'::text, 'responded'::text]))` |
| public.csat_surveys | idx_csat_surveys_created_at_agent | btree | created_at, agent_id | não | sim | `(agent_id IS NOT NULL)` |
| public.csat_surveys | idx_csat_surveys_dispatch | btree | send_at | não | sim | `(status = 'scheduled'::text)` |
| public.csat_surveys | uq_csat_surveys_conversation | btree | conversation_id | sim | sim | `(conversation_id IS NOT NULL)` |
| public.custom_emojis | custom_emojis_pkey | btree | id | sim | sim |  |
| public.deal_activities | deal_activities_pkey | btree | id | sim | sim |  |
| public.deal_activities | idx_deal_activities_deal_id | btree | deal_id | não | sim |  |
| public.deal_activities | idx_deal_activities_performed_by | btree | performed_by | não | sim |  |
| public.department_audit_logs | department_audit_logs_pkey | btree | id | sim | sim |  |
| public.department_audit_logs | idx_dept_audit_logs_dept_id | btree | department_id, created_at | não | sim |  |
| public.department_audit_logs | idx_dept_audit_logs_profile_id | btree | profile_id | não | sim |  |
| public.department_invitations | department_invitations_code_key | btree | code | sim | sim |  |
| public.department_invitations | department_invitations_pkey | btree | id | sim | sim |  |
| public.department_invitations | idx_department_invitations_code | btree | code | não | sim | `(status = 'pending'::text)` |
| public.department_invitations | idx_department_invitations_used_by | btree | used_by | não | sim |  |
| public.department_invitations | idx_dept_invitations_dept_id | btree | department_id | não | sim |  |
| public.department_invites | department_invites_code_key | btree | code | sim | sim |  |
| public.department_invites | department_invites_pkey | btree | id | sim | sim |  |
| public.department_invites | idx_dept_invites_code | btree | code | não | sim |  |
| public.department_invites | idx_dept_invites_created_by | btree | created_by | não | sim |  |
| public.department_invites | idx_dept_invites_dept_id | btree | department_id | não | sim |  |
| public.departments | departments_name_key | btree | name | sim | sim |  |
| public.departments | departments_pkey | btree | id | sim | sim |  |
| public.edge_rate_limits | edge_rate_limits_pkey | btree | key | sim | sim |  |
| public.email_attachments | email_attachments_filename_trgm_idx | gin | filename | não | sim |  |
| public.email_attachments | email_attachments_msg_att_key | btree | email_message_id, gmail_attachment_id | sim | sim |  |
| public.email_attachments | email_attachments_pkey | btree | id | sim | sim |  |
| public.email_attachments | idx_email_attachments_email_message_id | btree | email_message_id | não | sim |  |
| public.email_labels | email_labels_gmail_account_id_gmail_label_id_key | btree | gmail_account_id, gmail_label_id | sim | sim |  |
| public.email_labels | email_labels_pkey | btree | id | sim | sim |  |
| public.email_labels | idx_email_labels_gmail_account_id | btree | gmail_account_id | não | sim |  |
| public.email_messages | email_messages_body_text_trgm_idx | gin | body_text | não | sim |  |
| public.email_messages | email_messages_gmail_account_id_gmail_message_id_key | btree | gmail_account_id, gmail_message_id | sim | sim |  |
| public.email_messages | email_messages_pkey | btree | id | sim | sim |  |
| public.email_messages | idx_email_messages_date | btree | internal_date | não | sim |  |
| public.email_messages | idx_email_messages_gmail_account_id | btree | gmail_account_id | não | sim |  |
| public.email_messages | idx_email_messages_thread_date | btree | thread_id, internal_date | não | sim |  |
| public.email_messages | idx_email_messages_thread_id | btree | thread_id | não | sim |  |
| public.email_signatures | email_signatures_one_default_per_user | btree | user_id | sim | sim | `is_default` |
| public.email_signatures | email_signatures_pkey | btree | id | sim | sim |  |
| public.email_signatures | email_signatures_user_id_idx | btree | user_id | não | sim |  |
| public.email_threads | email_threads_gmail_account_id_gmail_thread_id_key | btree | gmail_account_id, gmail_thread_id | sim | sim |  |
| public.email_threads | email_threads_pkey | btree | id | sim | sim |  |
| public.email_threads | idx_email_threads_account_date | btree | gmail_account_id, last_message_at | não | sim |  |
| public.email_threads | idx_email_threads_contact | btree | contact_id | não | sim |  |
| public.email_threads | idx_email_threads_gmail_account_id | btree | gmail_account_id | não | sim |  |
| public.email_threads | idx_email_threads_last_message | btree | last_message_at | não | sim |  |
| public.entity_versions | entity_versions_entity_type_entity_id_version_number_key | btree | entity_type, entity_id, version_number | sim | sim |  |
| public.entity_versions | entity_versions_pkey | btree | id | sim | sim |  |
| public.entity_versions | idx_versions_date | btree | created_at | não | sim |  |
| public.favorite_contacts | favorite_contacts_contact_id_user_id_key | btree | contact_id, user_id | sim | sim |  |
| public.favorite_contacts | favorite_contacts_pkey | btree | id | sim | sim |  |
| public.favorite_contacts | idx_favorite_contacts_contact_id | btree | contact_id | não | sim |  |
| public.favorite_contacts | idx_favorite_contacts_user_id | btree | user_id | não | sim |  |
| public.feature_flags | feature_flags_pkey | btree | key | sim | sim |  |
| public.feature_flags | idx_feature_flags_updated_by | btree | updated_by | não | sim |  |
| public.followup_executions | followup_executions_pkey | btree | id | sim | sim |  |
| public.followup_executions | idx_followup_executions_contact_id | btree | contact_id | não | sim |  |
| public.followup_executions | idx_followup_executions_sequence_id | btree | sequence_id | não | sim |  |
| public.followup_sequences | followup_sequences_pkey | btree | id | sim | sim |  |
| public.followup_sequences | idx_followup_sequences_created_by | btree | created_by | não | sim |  |
| public.followup_sequences | idx_followup_sequences_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.followup_steps | followup_steps_pkey | btree | id | sim | sim |  |
| public.followup_steps | idx_followup_steps_sequence_id | btree | sequence_id | não | sim |  |
| public.geo_blocking_settings | geo_blocking_settings_pkey | btree | id | sim | sim |  |
| public.geo_blocking_settings | idx_geo_blocking_settings_updated_by | btree | updated_by | não | sim |  |
| public.global_settings | global_settings_key_key | btree | key | sim | sim |  |
| public.global_settings | global_settings_pkey | btree | id | sim | sim |  |
| public.gmail_accounts | gmail_accounts_email_address_key | btree | email_address | sim | sim |  |
| public.gmail_accounts | gmail_accounts_pkey | btree | id | sim | sim |  |
| public.gmail_accounts | idx_gmail_accounts_user_id | btree | user_id | não | sim |  |
| public.gmail_oauth_states | gmail_oauth_states_open_user_state_idx | btree | user_id, state | não | sim | `(consumed_at IS NULL)` |
| public.gmail_oauth_states | gmail_oauth_states_pkey | btree | id | sim | sim |  |
| public.gmail_oauth_states | idx_gmail_oauth_states_user_id | btree | user_id | não | sim |  |
| public.goals_configurations | goals_configurations_pkey | btree | id | sim | sim |  |
| public.goals_configurations | goals_configurations_profile_id_goal_type_key | btree | profile_id, goal_type | sim | sim |  |
| public.goals_configurations | goals_configurations_queue_id_goal_type_key | btree | queue_id, goal_type | sim | sim |  |
| public.goals_configurations | idx_goals_configurations_profile_id | btree | profile_id | não | sim |  |
| public.goals_configurations | idx_goals_configurations_queue_id | btree | queue_id | não | sim |  |
| public.instance_pauses | idx_instance_pauses_paused_by | btree | paused_by | não | sim |  |
| public.instance_pauses | idx_instance_pauses_resumed_by | btree | resumed_by | não | sim |  |
| public.instance_pauses | instance_pauses_abertas_unicas | btree | instance | sim | sim | `(resumed_at IS NULL)` |
| public.instance_pauses | instance_pauses_instance_idx | btree | instance | não | sim |  |
| public.instance_pauses | instance_pauses_pkey | btree | id | sim | sim |  |
| public.ip_whitelist | idx_ip_whitelist_added_by | btree | added_by | não | sim |  |
| public.ip_whitelist | ip_whitelist_ip_address_key | btree | ip_address | sim | sim |  |
| public.ip_whitelist | ip_whitelist_pkey | btree | id | sim | sim |  |
| public.knowledge_base_articles | idx_kb_articles_search | gin | search_vector | não | sim |  |
| public.knowledge_base_articles | idx_knowledge_base_articles_created_by | btree | created_by | não | sim |  |
| public.knowledge_base_articles | knowledge_base_articles_pkey | btree | id | sim | sim |  |
| public.knowledge_base_files | idx_knowledge_base_files_article_id | btree | article_id | não | sim |  |
| public.knowledge_base_files | knowledge_base_files_pkey | btree | id | sim | sim |  |
| public.link_preview_cache | idx_link_preview_cache_expires_at | btree | expires_at | não | sim |  |
| public.link_preview_cache | link_preview_cache_pkey | btree | url_hash | sim | sim |  |
| public.link_preview_cache_metrics | link_preview_cache_metrics_pkey | btree | id | sim | sim |  |
| public.login_attempts | idx_login_attempts_locked | btree | locked_until | não | sim | `(locked_until IS NOT NULL)` |
| public.login_attempts | login_attempts_email_key | btree | email | sim | sim |  |
| public.login_attempts | login_attempts_pkey | btree | id | sim | sim |  |
| public.message_attempts | message_attempts_message_created_idx | btree | message_id, created_at | não | sim |  |
| public.message_attempts | message_attempts_pkey | btree | id | sim | sim |  |
| public.message_attempts | message_attempts_unique | btree | message_id, attempt_no, outcome | sim | sim |  |
| public.message_favorites | message_favorites_pkey | btree | user_id, message_id | sim | sim |  |
| public.message_pins | idx_message_pins_pinned_by | btree | pinned_by | não | sim |  |
| public.message_pins | message_pins_contact_id_message_id_key | btree | contact_id, message_id | sim | sim |  |
| public.message_pins | message_pins_pkey | btree | id | sim | sim |  |
| public.message_reactions | idx_message_reactions_contact_id | btree | contact_id | não | sim |  |
| public.message_reactions | idx_message_reactions_message_id | btree | message_id | não | sim |  |
| public.message_reactions | idx_message_reactions_user_id | btree | user_id | não | sim |  |
| public.message_reactions | message_reactions_message_id_contact_id_emoji_key | btree | message_id, contact_id, emoji | sim | sim |  |
| public.message_reactions | message_reactions_message_id_user_id_emoji_key | btree | message_id, user_id, emoji | sim | sim |  |
| public.message_reactions | message_reactions_one_per_agent | btree | message_id, user_id | sim | sim |  |
| public.message_reactions | message_reactions_pkey | btree | id | sim | sim |  |
| public.message_reports | idx_message_reports_resolved_by | btree | resolved_by | não | sim |  |
| public.message_reports | message_reports_message_id_reporter_id_key | btree | message_id, reporter_id | sim | sim |  |
| public.message_reports | message_reports_pkey | btree | id | sim | sim |  |
| public.message_templates | idx_message_templates_user_id | btree | user_id | não | sim |  |
| public.message_templates | message_templates_pkey | btree | id | sim | sim |  |
| public.messages | idx_messages_agent_id | btree | agent_id | não | sim |  |
| public.messages | idx_messages_audio_meme_id | btree | audio_meme_id | não | sim | `(audio_meme_id IS NOT NULL)` |
| public.messages | idx_messages_channel_connection_id | btree | channel_connection_id | não | sim | `(channel_connection_id IS NOT NULL)` |
| public.messages | idx_messages_contact_created | btree | contact_id, created_at | não | sim |  |
| public.messages | idx_messages_contact_id | btree | contact_id | não | sim |  |
| public.messages | idx_messages_contact_media | btree | contact_id, created_at | não | sim | `(media_url IS NOT NULL)` |
| public.messages | idx_messages_contact_read_sender | btree | contact_id, is_read, sender | não | sim |  |
| public.messages | idx_messages_content_trgm | gin | content | não | sim |  |
| public.messages | idx_messages_created_at | btree | created_at | não | sim |  |
| public.messages | idx_messages_delivery_claimable | btree | created_at, id | não | sim | `((sender = 'agent'::text) AND (status = 'sending'::text) AND (external_id IS NULL))` |
| public.messages | idx_messages_media_url_trgm | gin | media_url | não | sim | `(media_url IS NOT NULL)` |
| public.messages | idx_messages_read_sender | btree | is_read, sender | não | sim |  |
| public.messages | idx_messages_reply_to | btree | reply_to_id | não | sim | `(reply_to_id IS NOT NULL)` |
| public.messages | idx_messages_sender_created_at | btree | sender, created_at | não | sim |  |
| public.messages | idx_messages_transcription_trgm | gin | transcription | não | sim |  |
| public.messages | idx_messages_unread_contact | btree | is_read, sender, contact_id | não | sim | `((is_read = false) AND (sender = 'contact'::text))` |
| public.messages | idx_messages_unread_conversas | btree | contact_id | não | sim | `((sender = 'contact'::text) AND (is_read IS NOT TRUE))` |
| public.messages | idx_messages_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.messages | messages_external_id_uq | btree | external_id | sim | sim | `(external_id IS NOT NULL)` |
| public.messages | messages_group_client_msg_uq | btree | whatsapp_group_id, client_message_id | sim | sim | `((client_message_id IS NOT NULL) AND (whatsapp_group_id IS NOT NULL))` |
| public.messages | messages_pkey | btree | id | sim | sim |  |
| public.messages | messages_whatsapp_group_id_idx | btree | whatsapp_group_id | não | sim | `(whatsapp_group_id IS NOT NULL)` |
| public.messages | ux_messages_contact_client_message_id | btree | contact_id, client_message_id | sim | sim | `(client_message_id IS NOT NULL)` |
| public.messages | ux_messages_dedup | btree | whatsapp_connection_id, external_id, sender | sim | sim |  |
| public.meta_capi_events | idx_meta_capi_events_contact_id | btree | contact_id | não | sim |  |
| public.meta_capi_events | meta_capi_events_pkey | btree | id | sim | sim |  |
| public.mfa_sessions | idx_mfa_sessions_user | btree | user_id | não | sim |  |
| public.mfa_sessions | mfa_sessions_pkey | btree | id | sim | sim |  |
| public.multiplix_audience_members | idx_multiplix_audience_members_audience_id | btree | audience_id | não | sim |  |
| public.multiplix_audience_members | multiplix_audience_members_pkey | btree | id | sim | sim |  |
| public.multiplix_audiences | idx_multiplix_audiences_owner_id | btree | owner_id | não | sim |  |
| public.multiplix_audiences | multiplix_audiences_pkey | btree | id | sim | sim |  |
| public.multiplix_blocks | idx_multiplix_blocks_dispatch_id | btree | dispatch_id | não | sim |  |
| public.multiplix_blocks | multiplix_blocks_dispatch_order | btree | dispatch_id, block_order | sim | sim |  |
| public.multiplix_blocks | multiplix_blocks_pkey | btree | id | sim | sim |  |
| public.multiplix_delivery_items | idx_multiplix_delivery_items_block_id | btree | block_id | não | sim |  |
| public.multiplix_delivery_items | idx_multiplix_delivery_items_dispatch_replied | btree | dispatch_id | não | sim | `(replied_at IS NOT NULL)` |
| public.multiplix_delivery_items | idx_multiplix_delivery_items_dispatch_status | btree | dispatch_id, status | não | sim |  |
| public.multiplix_delivery_items | idx_multiplix_delivery_items_queue | btree | status, next_attempt_at | não | sim | `(status = ANY (ARRAY['pending'::multiplix_item_status, 'failed_transient'::multiplix_item_status]))` |
| public.multiplix_delivery_items | idx_multiplix_delivery_items_recipient_id | btree | recipient_id | não | sim |  |
| public.multiplix_delivery_items | idx_multiplix_delivery_items_voice_asset_id | btree | voice_asset_id | não | sim |  |
| public.multiplix_delivery_items | multiplix_delivery_items_idempotency_key_key | btree | idempotency_key | sim | sim |  |
| public.multiplix_delivery_items | multiplix_delivery_items_pkey | btree | id | sim | sim |  |
| public.multiplix_dispatches | idx_multiplix_dispatches_client_request_id | btree | client_request_id | sim | sim | `(client_request_id IS NOT NULL)` |
| public.multiplix_dispatches | idx_multiplix_dispatches_created_by | btree | created_by | não | sim |  |
| public.multiplix_dispatches | idx_multiplix_dispatches_created_by_created_at | btree | created_by, created_at | não | sim |  |
| public.multiplix_dispatches | idx_multiplix_dispatches_status | btree | status | não | sim |  |
| public.multiplix_dispatches | idx_multiplix_dispatches_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.multiplix_dispatches | multiplix_dispatches_pkey | btree | id | sim | sim |  |
| public.multiplix_events | idx_multiplix_events_correlation | btree | correlation_id | não | sim | `(correlation_id IS NOT NULL)` |
| public.multiplix_events | idx_multiplix_events_dispatch_created | btree | dispatch_id, created_at | não | sim |  |
| public.multiplix_events | idx_multiplix_events_recipient | btree | recipient_id | não | sim | `(recipient_id IS NOT NULL)` |
| public.multiplix_events | multiplix_events_pkey | btree | id | sim | sim |  |
| public.multiplix_recipients | idx_multiplix_recipients_dispatch_id | btree | dispatch_id | não | sim |  |
| public.multiplix_recipients | idx_multiplix_recipients_external_id | btree | external_id | sim | sim | `(external_id IS NOT NULL)` |
| public.multiplix_recipients | idx_multiplix_recipients_pending | btree | dispatch_id | não | sim | `(status = 'pending'::multiplix_recipient_status)` |
| public.multiplix_recipients | multiplix_recipients_dispatch_destino_key | btree | dispatch_id, destino_e164 | sim | sim |  |
| public.multiplix_recipients | multiplix_recipients_pkey | btree | id | sim | sim |  |
| public.multiplix_voice_assets | idx_multiplix_voice_assets_validos | btree | created_at | não | sim | `(invalidated_at IS NULL)` |
| public.multiplix_voice_assets | idx_multiplix_voice_assets_voice_id | btree | voice_id | não | sim |  |
| public.multiplix_voice_assets | multiplix_voice_assets_hash_key | btree | hash | sim | sim |  |
| public.multiplix_voice_assets | multiplix_voice_assets_pkey | btree | id | sim | sim |  |
| public.multiplix_voice_grants | idx_multiplix_voice_grants_voice_id | btree | voice_id | não | sim | `(revoked_at IS NULL)` |
| public.multiplix_voice_grants | multiplix_voice_grants_pkey | btree | id | sim | sim |  |
| public.notifications | idx_notifications_created_at | btree | created_at | não | sim |  |
| public.notifications | idx_notifications_is_read | btree | is_read | não | sim |  |
| public.notifications | idx_notifications_user_id | btree | user_id | não | sim |  |
| public.notifications | notifications_pkey | btree | id | sim | sim |  |
| public.notifications | ux_notifications_user_dedupe_key | btree | user_id, dedupe_key | sim | sim | `(dedupe_key IS NOT NULL)` |
| public.nps_surveys | idx_nps_surveys_agent_id | btree | agent_id | não | sim |  |
| public.nps_surveys | idx_nps_surveys_contact | btree | contact_id | não | sim |  |
| public.nps_surveys | idx_nps_surveys_created | btree | created_at | não | sim |  |
| public.nps_surveys | nps_surveys_pkey | btree | id | sim | sim |  |
| public.number_reputation | number_reputation_pkey | btree | id | sim | sim |  |
| public.number_reputation | number_reputation_whatsapp_connection_id_key | btree | whatsapp_connection_id | sim | sim |  |
| public.outbox_events | idx_outbox_events_pendentes | btree | created_at | não | sim | `(processed_at IS NULL)` |
| public.outbox_events | outbox_events_origem_event_id_unico | btree | origem, event_id | sim | sim |  |
| public.outbox_events | outbox_events_pkey | btree | id | sim | sim |  |
| public.passkey_credentials | idx_passkey_credentials_user_id | btree | user_id | não | sim |  |
| public.passkey_credentials | passkey_credentials_credential_id_key | btree | credential_id | sim | sim |  |
| public.passkey_credentials | passkey_credentials_pkey | btree | id | sim | sim |  |
| public.password_reset_requests | idx_password_reset_requests_reviewed_by | btree | reviewed_by | não | sim |  |
| public.password_reset_requests | idx_password_reset_requests_status | btree | status | não | sim |  |
| public.password_reset_requests | idx_password_reset_requests_user | btree | user_id | não | sim |  |
| public.password_reset_requests | password_reset_requests_pkey | btree | id | sim | sim |  |
| public.performance_snapshots | idx_performance_snapshots_created_at | btree | created_at | não | sim |  |
| public.performance_snapshots | idx_performance_snapshots_profile | btree | profile_id | não | sim |  |
| public.performance_snapshots | performance_snapshots_pkey | btree | id | sim | sim |  |
| public.permissions | permissions_name_key | btree | name | sim | sim |  |
| public.permissions | permissions_pkey | btree | id | sim | sim |  |
| public.pinned_conversations | idx_pinned_conversations_contact_id | btree | contact_id | não | sim |  |
| public.pinned_conversations | idx_pinned_conversations_pinned_by | btree | pinned_by | não | sim |  |
| public.pinned_conversations | pinned_conversations_contact_id_pinned_by_key | btree | contact_id, pinned_by | sim | sim |  |
| public.pinned_conversations | pinned_conversations_pkey | btree | id | sim | sim |  |
| public.playbooks | idx_playbooks_created_by | btree | created_by | não | sim |  |
| public.playbooks | playbooks_pkey | btree | id | sim | sim |  |
| public.products | idx_products_active | btree | is_active | não | sim |  |
| public.products | idx_products_category | btree | category | não | sim |  |
| public.products | idx_products_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.products | products_pkey | btree | id | sim | sim |  |
| public.products | products_sku_key | btree | sku | sim | sim |  |
| public.profiles | idx_profiles_dept_id | btree | department_id | não | sim | `(department_id IS NOT NULL)` |
| public.profiles | idx_profiles_is_active | btree | is_active | não | sim |  |
| public.profiles | profiles_pkey | btree | id | sim | sim |  |
| public.profiles | profiles_user_id_key | btree | user_id | sim | sim |  |
| public.qr_attempts | qr_attempts_connection_id_created_at_idx | btree | connection_id, created_at | não | sim |  |
| public.qr_attempts | qr_attempts_created_at_idx | btree | created_at | não | sim |  |
| public.qr_attempts | qr_attempts_pkey | btree | id | sim | sim |  |
| public.query_telemetry | idx_query_telemetry_created_at | btree | created_at | não | sim |  |
| public.query_telemetry | idx_query_telemetry_severity | btree | severity | não | sim |  |
| public.query_telemetry | idx_query_telemetry_user_id | btree | user_id | não | sim |  |
| public.query_telemetry | query_telemetry_pkey | btree | id | sim | sim |  |
| public.queue_goals | queue_goals_pkey | btree | id | sim | sim |  |
| public.queue_goals | queue_goals_queue_id_key | btree | queue_id | sim | sim |  |
| public.queue_members | idx_queue_members_profile_id | btree | profile_id | não | sim |  |
| public.queue_members | idx_queue_members_queue_id | btree | queue_id | não | sim |  |
| public.queue_members | queue_members_pkey | btree | id | sim | sim |  |
| public.queue_members | queue_members_queue_id_profile_id_key | btree | queue_id, profile_id | sim | sim |  |
| public.queue_positions | idx_queue_positions_contact_id | btree | contact_id | não | sim |  |
| public.queue_positions | idx_queue_positions_queue_id | btree | queue_id | não | sim |  |
| public.queue_positions | queue_positions_pkey | btree | id | sim | sim |  |
| public.queue_skill_requirements | idx_queue_skill_requirements_queue_id | btree | queue_id | não | sim |  |
| public.queue_skill_requirements | queue_skill_requirements_pkey | btree | id | sim | sim |  |
| public.queue_skill_requirements | queue_skill_requirements_queue_id_skill_name_key | btree | queue_id, skill_name | sim | sim |  |
| public.queues | idx_queues_overflow_queue_id | btree | overflow_queue_id | não | sim |  |
| public.queues | queues_pkey | btree | id | sim | sim |  |
| public.rate_limit_configs | rate_limit_configs_pkey | btree | id | sim | sim |  |
| public.rate_limit_logs | idx_rate_limit_logs_created | btree | created_at | não | sim |  |
| public.rate_limit_logs | idx_rate_limit_logs_ip | btree | ip_address | não | sim |  |
| public.rate_limit_logs | idx_rate_limit_logs_user | btree | user_id | não | sim |  |
| public.rate_limit_logs | rate_limit_logs_pkey | btree | id | sim | sim |  |
| public.reconnection_logs | reconnection_logs_connection_created_idx | btree | connection_id, created_at | não | sim |  |
| public.reconnection_logs | reconnection_logs_created_at_idx | btree | created_at | não | sim |  |
| public.reconnection_logs | reconnection_logs_pkey | btree | id | sim | sim |  |
| public.reminders | idx_reminders_contact_id | btree | contact_id | não | sim |  |
| public.reminders | idx_reminders_due_pending | btree | remind_at | não | sim | `((is_dismissed = false) AND (notified_at IS NULL))` |
| public.reminders | idx_reminders_migrated_task_id | btree | migrated_task_id | não | sim |  |
| public.reminders | idx_reminders_profile | btree | profile_id | não | sim |  |
| public.reminders | idx_reminders_remind_at | btree | remind_at | não | sim |  |
| public.reminders | reminders_pkey | btree | id | sim | sim |  |
| public.role_permissions | idx_role_permissions_permission_id | btree | permission_id | não | sim |  |
| public.role_permissions | role_permissions_pkey | btree | id | sim | sim |  |
| public.role_permissions | role_permissions_role_permission_id_key | btree | role, permission_id | sim | sim |  |
| public.sales_deals | idx_sales_deals_assigned_to | btree | assigned_to | não | sim |  |
| public.sales_deals | idx_sales_deals_contact_id | btree | contact_id | não | sim |  |
| public.sales_deals | idx_sales_deals_stage_id | btree | stage_id | não | sim |  |
| public.sales_deals | sales_deals_pkey | btree | id | sim | sim |  |
| public.sales_pipeline_stages | sales_pipeline_stages_pkey | btree | id | sim | sim |  |
| public.saved_filters | idx_saved_filters_user_entity | btree | user_id, entity_type | não | sim |  |
| public.saved_filters | saved_filters_inbox_user_lower_name_key | btree | user_id | sim | sim | `(entity_type = 'inbox_filters'::text)` |
| public.saved_filters | saved_filters_pkey | btree | id | sim | sim |  |
| public.scheduled_messages | idx_scheduled_messages_contact_id | btree | contact_id | não | sim |  |
| public.scheduled_messages | idx_scheduled_messages_created_by | btree | created_by | não | sim |  |
| public.scheduled_messages | idx_scheduled_messages_pending | btree | scheduled_at | não | sim | `(status = 'pending'::text)` |
| public.scheduled_messages | idx_scheduled_messages_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.scheduled_messages | scheduled_messages_pkey | btree | id | sim | sim |  |
| public.scheduled_report_configs | idx_scheduled_report_configs_created_by | btree | created_by | não | sim |  |
| public.scheduled_report_configs | scheduled_report_configs_pkey | btree | id | sim | sim |  |
| public.scheduled_reports | scheduled_reports_pkey | btree | id | sim | sim |  |
| public.search_events | idx_search_events_user_id | btree | user_id | não | sim |  |
| public.search_events | search_events_created_at_idx | btree | created_at | não | sim |  |
| public.search_events | search_events_pkey | btree | id | sim | sim |  |
| public.search_events | search_events_user_event_id_key | btree | user_id, client_event_id | sim | sim |  |
| public.searchbox_budget_alert_cron | searchbox_budget_alert_cron_pkey | btree | id | sim | sim |  |
| public.searchbox_budget_alert_emails | searchbox_budget_alert_emails_pkey | btree | mes | sim | sim |  |
| public.security_acl_alerts | security_acl_alerts_aberto_uidx | btree | alert_type, object_name, role_name, privilege | sim | sim | `(resolved_at IS NULL)` |
| public.security_acl_alerts | security_acl_alerts_leitura_idx | btree | resolved_at, detected_at | não | sim |  |
| public.security_acl_alerts | security_acl_alerts_pkey | btree | id | sim | sim |  |
| public.security_alerts | idx_security_alerts_created | btree | created_at | não | sim |  |
| public.security_alerts | idx_security_alerts_resolved_by | btree | resolved_by | não | sim |  |
| public.security_alerts | idx_security_alerts_user_id | btree | user_id | não | sim |  |
| public.security_alerts | security_alerts_pkey | btree | id | sim | sim |  |
| public.sicoob_contact_mapping | idx_sicoob_contact_mapping_contact_id | btree | contact_id | não | sim |  |
| public.sicoob_contact_mapping | idx_sicoob_contact_mapping_zappweb_agent_id | btree | zappweb_agent_id | não | sim |  |
| public.sicoob_contact_mapping | sicoob_contact_mapping_pkey | btree | id | sim | sim |  |
| public.sicoob_contact_mapping | sicoob_contact_mapping_sicoob_user_id_sicoob_singular_id_key | btree | sicoob_user_id, sicoob_singular_id | sim | sim |  |
| public.sla_alert_events | idx_sla_alert_events_queue_id | btree | queue_id | não | sim |  |
| public.sla_alert_events | idx_sla_alert_events_resolved_by | btree | resolved_by | não | sim |  |
| public.sla_alert_events | sla_alert_events_ativos_unicos | btree | contact_id, alert_type, severity | sim | sim | `(resolved_at IS NULL)` |
| public.sla_alert_events | sla_alert_events_contact_id_idx | btree | contact_id | não | sim |  |
| public.sla_alert_events | sla_alert_events_pkey | btree | id | sim | sim |  |
| public.sla_alert_preferences | sla_alert_preferences_pkey | btree | user_id | sim | sim |  |
| public.sla_configurations | sla_configurations_pkey | btree | id | sim | sim |  |
| public.sla_rules | idx_sla_rules_active | btree | is_active | não | sim | `(is_active = true)` |
| public.sla_rules | idx_sla_rules_active_priority | btree | is_active, priority | não | sim |  |
| public.sla_rules | idx_sla_rules_agent_id | btree | agent_id | não | sim | `(agent_id IS NOT NULL)` |
| public.sla_rules | idx_sla_rules_company | btree | company | não | sim | `(company IS NOT NULL)` |
| public.sla_rules | idx_sla_rules_contact_id | btree | contact_id | não | sim | `(contact_id IS NOT NULL)` |
| public.sla_rules | idx_sla_rules_queue_id | btree | queue_id | não | sim | `(queue_id IS NOT NULL)` |
| public.sla_rules | sla_rules_pkey | btree | id | sim | sim |  |
| public.stickers | idx_stickers_owner_id | btree | owner_id | não | sim | `(owner_id IS NOT NULL)` |
| public.stickers | stickers_pkey | btree | id | sim | sim |  |
| public.talkx_alerts | talkx_alerts_campaign_idx | btree | campaign_id, opened_at | não | sim |  |
| public.talkx_alerts | talkx_alerts_open_dedup | btree | kind | sim | sim | `(resolved_at IS NULL)` |
| public.talkx_alerts | talkx_alerts_pkey | btree | id | sim | sim |  |
| public.talkx_blacklist | idx_talkx_blacklist_blocked_by | btree | blocked_by | não | sim |  |
| public.talkx_blacklist | idx_talkx_blacklist_campaign_id | btree | campaign_id | não | sim |  |
| public.talkx_blacklist | idx_talkx_blacklist_contact_id | btree | contact_id | não | sim |  |
| public.talkx_blacklist | idx_talkx_blacklist_created_at_desc | btree | created_at | não | sim |  |
| public.talkx_blacklist | idx_talkx_blacklist_expires_at | btree | expires_at | não | sim | `(expires_at IS NOT NULL)` |
| public.talkx_blacklist | idx_talkx_blacklist_phone | btree | phone | não | sim | `(phone IS NOT NULL)` |
| public.talkx_blacklist | idx_talkx_blacklist_removed_by | btree | removed_by | não | sim |  |
| public.talkx_blacklist | idx_talkx_blacklist_source_message_id | btree | source_message_id | não | sim |  |
| public.talkx_blacklist | talkx_blacklist_contact_active_unique | btree | contact_id | sim | sim | `((contact_id IS NOT NULL) AND (removed_at IS NULL))` |
| public.talkx_blacklist | talkx_blacklist_phone_active_unique | btree | phone | sim | sim | `((phone IS NOT NULL) AND (removed_at IS NULL))` |
| public.talkx_blacklist | talkx_blacklist_pkey | btree | id | sim | sim |  |
| public.talkx_campaign_events | idx_talkx_campaign_events_actor_id | btree | actor_id | não | sim |  |
| public.talkx_campaign_events | idx_talkx_campaign_events_campaign_created | btree | campaign_id, created_at | não | sim |  |
| public.talkx_campaign_events | idx_talkx_campaign_events_campaign_id | btree | campaign_id | não | sim |  |
| public.talkx_campaign_events | talkx_campaign_events_pkey | btree | id | sim | sim |  |
| public.talkx_campaign_segments | talkx_campaign_segments_campaign_position_key | btree | campaign_id, position | sim | sim |  |
| public.talkx_campaign_segments | talkx_campaign_segments_pkey | btree | campaign_id, segment_id | sim | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_cancelled_by | btree | cancelled_by | não | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_consent_confirmed_by | btree | consent_confirmed_by | não | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_created_by | btree | created_by | não | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_launch_confirmed_by | btree | launch_confirmed_by | não | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_launched_by | btree | launched_by | não | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_owner | btree | owner | não | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_paused_by | btree | paused_by | não | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_recurrence_next | btree | recurrence_next_campaign_id | não | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_recurrence_pending | btree | completed_at | não | sim | `((recurrence_frequency IS NOT NULL) AND (status = 'completed'::text) AND (recurrence_next_campaign_id IS NULL) AND (recurrence_closed_at IS NULL))` |
| public.talkx_campaigns | idx_talkx_campaigns_recurrence_series | btree | recurrence_series_id | não | sim | `(recurrence_series_id IS NOT NULL)` |
| public.talkx_campaigns | idx_talkx_campaigns_responsible_id | btree | responsible_id | não | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_scheduled_at | btree | scheduled_at | não | sim | `(status = 'scheduled'::text)` |
| public.talkx_campaigns | idx_talkx_campaigns_segment_id | btree | segment_id | não | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_status | btree | status | não | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_template_id | btree | template_id | não | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_template_version_id | btree | template_version_id | não | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.talkx_campaigns | idx_talkx_campaigns_worker_lease | btree | worker_lease_expires_at | não | sim | `(worker_id IS NOT NULL)` |
| public.talkx_campaigns | talkx_campaigns_creator_draft_creation_key_uidx | btree | created_by, draft_creation_key | sim | sim | `(draft_creation_key IS NOT NULL)` |
| public.talkx_campaigns | talkx_campaigns_pkey | btree | id | sim | sim |  |
| public.talkx_contact_attributes | talkx_contact_attributes_last_purchase_idx | btree | last_purchase_at | não | sim |  |
| public.talkx_contact_attributes | talkx_contact_attributes_pkey | btree | contact_id | sim | sim |  |
| public.talkx_contact_attributes | talkx_contact_attributes_purchases_synced_idx | btree | purchases_synced_at | não | sim |  |
| public.talkx_contact_attributes | talkx_contact_attributes_rfm_segment_idx | btree | rfm_segment | não | sim |  |
| public.talkx_conversions | idx_talkx_conversions_camp | btree | campaign_id | não | sim |  |
| public.talkx_conversions | idx_talkx_conversions_link_id | btree | link_id | não | sim |  |
| public.talkx_conversions | idx_talkx_conversions_recipient_id | btree | recipient_id | não | sim |  |
| public.talkx_conversions | talkx_conversions_dedupe_key | btree | campaign_id, source, external_ref | sim | sim | `((external_ref IS NOT NULL) AND (source IS NOT NULL))` |
| public.talkx_conversions | talkx_conversions_pkey | btree | id | sim | sim |  |
| public.talkx_data_jobs | talkx_data_jobs_pkey | btree | job | sim | sim |  |
| public.talkx_delivery_log | talkx_delivery_log_campaign_created_idx | btree | campaign_id, created_at | não | sim |  |
| public.talkx_delivery_log | talkx_delivery_log_created_idx | btree | created_at | não | sim |  |
| public.talkx_delivery_log | talkx_delivery_log_pkey | btree | id | sim | sim |  |
| public.talkx_delivery_log | talkx_delivery_log_recipient_idx | btree | recipient_id, created_at | não | sim |  |
| public.talkx_help_views | idx_talkx_help_views_viewed_at_article | btree | viewed_at, article_id | não | sim |  |
| public.talkx_help_views | talkx_help_views_pkey | btree | id | sim | sim |  |
| public.talkx_link_clicks | idx_talkx_link_clicks_link | btree | link_id, clicked_at | não | sim |  |
| public.talkx_link_clicks | idx_talkx_link_clicks_link_id | btree | link_id | não | sim |  |
| public.talkx_link_clicks | idx_talkx_link_clicks_recipient_id | btree | recipient_id | não | sim |  |
| public.talkx_link_clicks | talkx_link_clicks_pkey | btree | id | sim | sim |  |
| public.talkx_links | idx_talkx_links_campaign | btree | campaign_id | não | sim |  |
| public.talkx_links | idx_talkx_links_created_by | btree | created_by | não | sim |  |
| public.talkx_links | talkx_links_campaign_label_lower_key | btree | campaign_id | sim | sim |  |
| public.talkx_links | talkx_links_pkey | btree | id | sim | sim |  |
| public.talkx_links | talkx_links_slug_lower_key | btree |  | sim | sim |  |
| public.talkx_optout_keywords | idx_talkx_optout_keywords_created_by | btree | created_by | não | sim |  |
| public.talkx_optout_keywords | talkx_optout_keywords_pkey | btree | keyword | sim | sim |  |
| public.talkx_recipients | idx_talkx_recipients_campaign_delivered_at | btree | campaign_id, delivered_at | não | sim | `(delivered_at IS NOT NULL)` |
| public.talkx_recipients | idx_talkx_recipients_campaign_id | btree | campaign_id | não | sim |  |
| public.talkx_recipients | idx_talkx_recipients_campaign_replied_at | btree | campaign_id, replied_at | não | sim | `(replied_at IS NOT NULL)` |
| public.talkx_recipients | idx_talkx_recipients_campaign_segment_status | btree | campaign_id, segment_id, status | não | sim |  |
| public.talkx_recipients | idx_talkx_recipients_campaign_sent_at | btree | campaign_id, sent_at | não | sim | `(sent_at IS NOT NULL)` |
| public.talkx_recipients | idx_talkx_recipients_campaign_status | btree | campaign_id, status | não | sim |  |
| public.talkx_recipients | idx_talkx_recipients_claimable | btree | campaign_id, created_at, id | não | sim | `(status = ANY (ARRAY['pending'::text, 'sending'::text]))` |
| public.talkx_recipients | idx_talkx_recipients_contact_id | btree | contact_id | não | sim |  |
| public.talkx_recipients | idx_talkx_recipients_external_id | btree | external_id | não | sim | `(external_id IS NOT NULL)` |
| public.talkx_recipients | idx_talkx_recipients_read_at | btree | read_at | não | sim | `(read_at IS NOT NULL)` |
| public.talkx_recipients | idx_talkx_recipients_replied_at | btree | replied_at | não | sim |  |
| public.talkx_recipients | idx_talkx_recipients_reply_lookup | btree | contact_id, sent_at | não | sim | `((replied_at IS NULL) AND (sent_at IS NOT NULL))` |
| public.talkx_recipients | idx_talkx_recipients_reply_message_id | btree | reply_message_id | não | sim |  |
| public.talkx_recipients | idx_talkx_recipients_retry | btree | campaign_id, retry_after | não | sim | `((status = 'pending'::text) AND (retry_after IS NOT NULL))` |
| public.talkx_recipients | idx_talkx_recipients_sent_at | btree | sent_at | não | sim |  |
| public.talkx_recipients | idx_talkx_recipients_status | btree | status | não | sim |  |
| public.talkx_recipients | idx_talkx_recipients_variant_id | btree | variant_id | não | sim |  |
| public.talkx_recipients | talkx_recipients_campaign_id_contact_id_key | btree | campaign_id, contact_id | sim | sim |  |
| public.talkx_recipients | talkx_recipients_pkey | btree | id | sim | sim |  |
| public.talkx_segment_fields | talkx_segment_fields_pkey | btree | field | sim | sim |  |
| public.talkx_segment_library_history | talkx_segment_library_history_pkey | btree | counted_on | sim | sim |  |
| public.talkx_segment_versions | idx_talkx_segment_versions_created_by | btree | created_by | não | sim |  |
| public.talkx_segment_versions | talkx_segment_versions_pkey | btree | id | sim | sim |  |
| public.talkx_segment_versions | talkx_segment_versions_segment_version_key | btree | segment_id, version_no | sim | sim |  |
| public.talkx_segments | idx_talkx_segments_created_by | btree | created_by | não | sim |  |
| public.talkx_segments | idx_talkx_segments_published_by | btree | published_by | não | sim |  |
| public.talkx_segments | idx_talkx_segments_tags | gin | tags | não | sim |  |
| public.talkx_segments | talkx_segments_pkey | btree | id | sim | sim |  |
| public.talkx_settings | talkx_settings_pkey | btree | key | sim | sim |  |
| public.talkx_storage_purge_queue | talkx_storage_purge_queue_pending_dedup | btree | bucket_id, object_name | sim | sim | `(processed_at IS NULL)` |
| public.talkx_storage_purge_queue | talkx_storage_purge_queue_pending_idx | btree | enqueued_at | não | sim | `(processed_at IS NULL)` |
| public.talkx_storage_purge_queue | talkx_storage_purge_queue_pkey | btree | id | sim | sim |  |
| public.talkx_suppression_reasons | talkx_suppression_reasons_pkey | btree | code | sim | sim |  |
| public.talkx_template_variants | idx_talkx_template_variants_template | btree | template_id | não | sim |  |
| public.talkx_template_variants | talkx_template_variants_pkey | btree | id | sim | sim |  |
| public.talkx_template_variants | talkx_template_variants_template_id_label_key | btree | template_id, label | sim | sim |  |
| public.talkx_template_versions | idx_talkx_template_versions_saved_by | btree | saved_by | não | sim |  |
| public.talkx_template_versions | idx_talkx_template_versions_template_id | btree | template_id | não | sim |  |
| public.talkx_template_versions | talkx_template_versions_pkey | btree | id | sim | sim |  |
| public.talkx_template_versions | talkx_template_versions_template_id_version_number_key | btree | template_id, version_number | sim | sim |  |
| public.talkx_templates | idx_talkx_templates_category | btree | category | não | sim |  |
| public.talkx_templates | idx_talkx_templates_created_by | btree | created_by | não | sim |  |
| public.talkx_templates | idx_talkx_templates_current_version_id | btree | current_version_id | não | sim |  |
| public.talkx_templates | talkx_templates_pkey | btree | id | sim | sim |  |
| public.talkx_test_send_claims | talkx_test_send_claims_pkey | btree | id | sim | sim |  |
| public.talkx_test_send_claims | talkx_test_send_claims_request_key_key | btree | request_key | sim | sim |  |
| public.talkx_test_sends | idx_talkx_test_sends_campaign_id | btree | campaign_id | não | sim |  |
| public.talkx_test_sends | idx_talkx_test_sends_connection_id | btree | connection_id | não | sim |  |
| public.talkx_test_sends | idx_talkx_test_sends_template_id | btree | template_id | não | sim |  |
| public.talkx_test_sends | talkx_test_sends_pkey | btree | id | sim | sim |  |
| public.team_chat_media_acl_r2_db_020_rb | team_chat_media_acl_r2_db_020_rb_pkey | btree | message_id | sim | sim |  |
| public.team_conversation_members | idx_team_conv_members_conv_muted | btree | conversation_id, is_muted | não | sim | `(is_muted = true)` |
| public.team_conversation_members | idx_team_conv_members_profile_id | btree | profile_id | não | sim |  |
| public.team_conversation_members | team_conversation_members_conversation_id_profile_id_key | btree | conversation_id, profile_id | sim | sim |  |
| public.team_conversation_members | team_conversation_members_pkey | btree | id | sim | sim |  |
| public.team_conversations | idx_team_conversations_created_by | btree | created_by | não | sim |  |
| public.team_conversations | idx_team_conversations_dept_id | btree | department_id | não | sim | `(department_id IS NOT NULL)` |
| public.team_conversations | idx_team_conversations_dept_unique | btree | department_id | sim | sim | `((type = 'department'::text) AND (department_id IS NOT NULL))` |
| public.team_conversations | idx_team_conversations_direct_member_a | btree | direct_member_a | não | sim |  |
| public.team_conversations | idx_team_conversations_direct_member_b | btree | direct_member_b | não | sim |  |
| public.team_conversations | idx_team_conversations_direct_pair | btree | direct_member_a, direct_member_b | sim | sim | `(type = 'direct'::text)` |
| public.team_conversations | team_conversations_pkey | btree | id | sim | sim |  |
| public.team_message_reactions | idx_team_message_reactions_conversation_id | btree | conversation_id | não | sim |  |
| public.team_message_reactions | idx_team_message_reactions_profile_id | btree | profile_id | não | sim |  |
| public.team_message_reactions | team_message_reactions_pkey | btree | id | sim | sim |  |
| public.team_message_reactions | team_message_reactions_unique | btree | message_id, profile_id, emoji | sim | sim |  |
| public.team_message_receipts | idx_team_message_receipts_conversation_id | btree | conversation_id | não | sim | `(conversation_id IS NOT NULL)` |
| public.team_message_receipts | idx_team_message_receipts_message_id | btree | message_id | não | sim |  |
| public.team_message_receipts | idx_team_message_receipts_unread | btree | message_id | não | sim | `(status <> 'read'::text)` |
| public.team_message_receipts | team_message_receipts_message_profile_unique | btree | message_id, profile_id | sim | sim |  |
| public.team_message_receipts | team_message_receipts_pkey | btree | id | sim | sim |  |
| public.team_messages | idx_team_messages_content_trgm | gin | content | não | sim |  |
| public.team_messages | idx_team_messages_conv_created | btree | conversation_id, created_at | não | sim |  |
| public.team_messages | idx_team_messages_reply_to | btree | reply_to_id | não | sim | `(reply_to_id IS NOT NULL)` |
| public.team_messages | idx_team_messages_sender_id | btree | sender_id | não | sim |  |
| public.team_messages | team_messages_pkey | btree | id | sim | sim |  |
| public.training_sessions | idx_training_sessions_profile_id | btree | profile_id | não | sim |  |
| public.training_sessions | training_sessions_pkey | btree | id | sim | sim |  |
| public.user_devices | idx_user_devices_fingerprint | btree | device_fingerprint | não | sim |  |
| public.user_devices | user_devices_pkey | btree | id | sim | sim |  |
| public.user_devices | user_devices_user_id_device_fingerprint_key | btree | user_id, device_fingerprint | sim | sim |  |
| public.user_roles | idx_user_roles_user_id | btree | user_id | não | sim |  |
| public.user_roles | user_roles_pkey | btree | id | sim | sim |  |
| public.user_roles | user_roles_user_id_role_key | btree | user_id, role | sim | sim |  |
| public.user_service_accounts | user_service_accounts_pkey | btree | id | sim | sim |  |
| public.user_service_accounts | user_service_accounts_user_id_service_type_key | btree | user_id, service_type | sim | sim |  |
| public.user_sessions | idx_user_sessions_active | btree | is_active | não | sim | `(is_active = true)` |
| public.user_sessions | idx_user_sessions_auth_session_id | btree | auth_session_id | sim | sim | `(auth_session_id IS NOT NULL)` |
| public.user_sessions | idx_user_sessions_device_id | btree | device_id | não | sim |  |
| public.user_sessions | idx_user_sessions_user_auth_session | btree | user_id, auth_session_id | não | sim |  |
| public.user_sessions | idx_user_sessions_user_id | btree | user_id | não | sim |  |
| public.user_sessions | user_sessions_pkey | btree | id | sim | sim |  |
| public.user_settings | user_settings_pkey | btree | id | sim | sim |  |
| public.user_settings | user_settings_user_id_key | btree | user_id | sim | sim |  |
| public.voice_command_logs | idx_voice_command_logs_created_at | btree | created_at | não | sim |  |
| public.voice_command_logs | idx_voice_command_logs_user_id | btree | user_id | não | sim |  |
| public.voice_command_logs | voice_command_logs_pkey | btree | id | sim | sim |  |
| public.voip_profile_credentials | voip_profile_credentials_pkey | btree | id | sim | sim |  |
| public.voip_profile_credentials | voip_profile_credentials_profile_id_key | btree | profile_id | sim | sim |  |
| public.voip_profile_credentials | voip_profile_credentials_ramal_lower_key | btree |  | sim | sim |  |
| public.warroom_alerts | idx_warroom_alerts_dismissed_by | btree | dismissed_by | não | sim |  |
| public.warroom_alerts | ux_warroom_alerts_dedupe_key | btree | dedupe_key | sim | sim | `(dedupe_key IS NOT NULL)` |
| public.warroom_alerts | warroom_alerts_pkey | btree | id | sim | sim |  |
| public.webauthn_challenges | idx_webauthn_challenges_expires | btree | expires_at | não | sim |  |
| public.webauthn_challenges | idx_webauthn_challenges_user_id | btree | user_id | não | sim |  |
| public.webauthn_challenges | webauthn_challenges_pkey | btree | id | sim | sim |  |
| public.webhook_failures | webhook_failures_endpoint_idx | btree | endpoint, error_at | não | sim |  |
| public.webhook_failures | webhook_failures_pkey | btree | id | sim | sim |  |
| public.webhook_failures | webhook_failures_resolved_idx | btree | resolved, error_at | não | sim | `(NOT resolved)` |
| public.webhook_rate_limits | idx_rate_limits_instance_window | btree | instance_id, window_start | não | sim |  |
| public.webhook_rate_limits | webhook_rate_limits_pkey | btree | id | sim | sim |  |
| public.whatsapp_connection_queues | idx_whatsapp_connection_queues_queue_id | btree | queue_id | não | sim |  |
| public.whatsapp_connection_queues | idx_whatsapp_connection_queues_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.whatsapp_connection_queues | whatsapp_connection_queues_pkey | btree | id | sim | sim |  |
| public.whatsapp_connection_queues | whatsapp_connection_queues_whatsapp_connection_id_queue_id_key | btree | whatsapp_connection_id, queue_id | sim | sim |  |
| public.whatsapp_connections | idx_wc_is_default | btree | is_default | não | sim | `(is_default = true)` |
| public.whatsapp_connections | idx_whatsapp_connections_created_by | btree | created_by | não | sim |  |
| public.whatsapp_connections | idx_whatsapp_connections_instance_token_secret_id | btree | instance_token_secret_id | não | sim |  |
| public.whatsapp_connections | whatsapp_connections_instance_id_key | btree | instance_id | sim | sim |  |
| public.whatsapp_connections | whatsapp_connections_one_default | btree | is_default | sim | sim | `is_default` |
| public.whatsapp_connections | whatsapp_connections_pkey | btree | id | sim | sim |  |
| public.whatsapp_flows | idx_whatsapp_flows_created_by | btree | created_by | não | sim |  |
| public.whatsapp_flows | idx_whatsapp_flows_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.whatsapp_flows | whatsapp_flows_pkey | btree | id | sim | sim |  |
| public.whatsapp_groups | idx_whatsapp_groups_category | btree | category | não | sim |  |
| public.whatsapp_groups | idx_whatsapp_groups_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.whatsapp_groups | whatsapp_groups_group_id_key | btree | group_id | sim | sim |  |
| public.whatsapp_groups | whatsapp_groups_pkey | btree | id | sim | sim |  |
| public.whatsapp_templates | idx_whatsapp_templates_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  |
| public.whatsapp_templates | whatsapp_templates_pkey | btree | id | sim | sim |  |
| public.whisper_messages | idx_whisper_messages_contact_id | btree | contact_id | não | sim |  |
| public.whisper_messages | idx_whisper_messages_sender_id | btree | sender_id | não | sim |  |
| public.whisper_messages | idx_whisper_messages_target_agent_id | btree | target_agent_id | não | sim |  |
| public.whisper_messages | whisper_messages_pkey | btree | id | sim | sim |  |
