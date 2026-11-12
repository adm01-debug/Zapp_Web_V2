# Relacionamentos (chaves estrangeiras)


| de | colunas | para | colunas | on delete | on update |
|---|---|---|---|---|---|
| public.agent_achievements | profile_id | public.profiles | id | CASCADE | NO ACTION |
| public.agent_mini_game_xp_daily | profile_id | public.profiles | id | CASCADE | NO ACTION |
| public.agent_presence | user_id | auth.users | id | CASCADE | NO ACTION |
| public.agent_skills | profile_id | public.profiles | id | CASCADE | NO ACTION |
| public.agent_stats | profile_id | public.profiles | id | CASCADE | NO ACTION |
| public.agent_visibility_grants | agent_id | public.profiles | id | CASCADE | NO ACTION |
| public.agent_visibility_grants | can_see_agent_id | public.profiles | id | CASCADE | NO ACTION |
| public.agent_visibility_grants | granted_by | public.profiles | id | SET NULL | NO ACTION |
| public.ai_conversation_tags | contact_id | public.contacts | id | NO ACTION | NO ACTION |
| public.ai_model_prices | provider_id | public.ai_providers | id | SET NULL | NO ACTION |
| public.ai_providers | created_by | public.profiles | id | NO ACTION | NO ACTION |
| public.ai_usage_logs | profile_id | public.profiles | id | SET NULL | NO ACTION |
| public.ai_usage_logs | user_id | auth.users | id | SET NULL | NO ACTION |
| public.allowed_countries | added_by | auth.users | id | NO ACTION | NO ACTION |
| public.audio_meme_favorites | meme_id | public.audio_memes | id | CASCADE | NO ACTION |
| public.audio_meme_favorites | user_id | auth.users | id | CASCADE | NO ACTION |
| public.audio_memes | uploaded_by | auth.users | id | SET NULL | NO ACTION |
| public.audit_logs | user_id | auth.users | id | SET NULL | NO ACTION |
| public.auto_close_config | updated_by | public.profiles | id | SET NULL | NO ACTION |
| public.automations | created_by | public.profiles | id | SET NULL | NO ACTION |
| public.away_messages | whatsapp_connection_id | public.whatsapp_connections | id | CASCADE | NO ACTION |
| public.blocked_countries | blocked_by | auth.users | id | NO ACTION | NO ACTION |
| public.blocked_ips | blocked_by | auth.users | id | SET NULL | NO ACTION |
| public.business_hours | whatsapp_connection_id | public.whatsapp_connections | id | CASCADE | NO ACTION |
| public.calls | agent_id | public.profiles | id | SET NULL | NO ACTION |
| public.calls | answered_by | public.profiles | id | NO ACTION | NO ACTION |
| public.calls | contact_id | public.contacts | id | SET NULL | NO ACTION |
| public.calls | whatsapp_connection_id | public.whatsapp_connections | id | SET NULL | NO ACTION |
| public.campaign_ab_variants | campaign_id | public.campaigns | id | CASCADE | NO ACTION |
| public.campaign_contacts | campaign_id | public.campaigns | id | CASCADE | NO ACTION |
| public.campaign_contacts | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.campaigns | created_by | public.profiles | id | NO ACTION | NO ACTION |
| public.campaigns | whatsapp_connection_id | public.whatsapp_connections | id | NO ACTION | NO ACTION |
| public.catalog_favorites | user_id | auth.users | id | CASCADE | NO ACTION |
| public.catalog_send_events | agent_id | public.profiles | id | SET NULL | NO ACTION |
| public.catalog_send_events | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.channel_connections | created_by | public.profiles | id | NO ACTION | NO ACTION |
| public.channel_connections | whatsapp_connection_id | public.whatsapp_connections | id | NO ACTION | NO ACTION |
| public.channel_routing_rules | channel_connection_id | public.channel_connections | id | NO ACTION | NO ACTION |
| public.channel_routing_rules | queue_id | public.queues | id | NO ACTION | NO ACTION |
| public.chatbot_executions | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.chatbot_executions | flow_id | public.chatbot_flows | id | CASCADE | NO ACTION |
| public.chatbot_flows | created_by | public.profiles | id | NO ACTION | NO ACTION |
| public.chatbot_flows | whatsapp_connection_id | public.whatsapp_connections | id | NO ACTION | NO ACTION |
| public.client_wallet_rules | agent_id | public.profiles | id | CASCADE | NO ACTION |
| public.client_wallet_rules | whatsapp_connection_id | public.whatsapp_connections | id | CASCADE | NO ACTION |
| public.connection_alert_preferences | user_id | auth.users | id | CASCADE | NO ACTION |
| public.connection_health_logs | connection_id | public.whatsapp_connections | id | CASCADE | NO ACTION |
| public.contact_custom_fields | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.contact_notes | author_id | public.profiles | id | CASCADE | NO ACTION |
| public.contact_notes | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.contacts | ai_projection_analysis_id | public.conversation_analyses | id | SET NULL | NO ACTION |
| public.contacts | assigned_to | public.profiles | id | SET NULL | NO ACTION |
| public.contacts | channel_connection_id | public.channel_connections | id | NO ACTION | NO ACTION |
| public.contacts | queue_id | public.queues | id | SET NULL | NO ACTION |
| public.contacts | whatsapp_connection_id | public.whatsapp_connections | id | SET NULL | NO ACTION |
| public.conversation_analyses | analyzed_by | public.profiles | id | NO ACTION | NO ACTION |
| public.conversation_analyses | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.conversation_closures | closed_by | public.profiles | id | SET NULL | NO ACTION |
| public.conversation_closures | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.conversation_events | closure_id | public.conversation_closures | id | CASCADE | NO ACTION |
| public.conversation_events | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.conversation_events | from_agent_id | public.profiles | id | NO ACTION | NO ACTION |
| public.conversation_events | from_queue_id | public.queues | id | NO ACTION | NO ACTION |
| public.conversation_events | performed_by | public.profiles | id | NO ACTION | NO ACTION |
| public.conversation_events | to_agent_id | public.profiles | id | NO ACTION | NO ACTION |
| public.conversation_events | to_queue_id | public.queues | id | NO ACTION | NO ACTION |
| public.conversation_memory | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.conversation_memory | updated_by | public.profiles | id | SET NULL | NO ACTION |
| public.conversation_sla | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.conversation_sla | sla_configuration_id | public.sla_configurations | id | NO ACTION | NO ACTION |
| public.conversation_snoozes | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.conversation_snoozes | snoozed_by | public.profiles | id | CASCADE | NO ACTION |
| public.conversation_tasks | assigned_to | public.profiles | id | SET NULL | NO ACTION |
| public.conversation_tasks | contact_id | public.contacts | id | SET NULL | NO ACTION |
| public.conversation_tasks | created_by | public.profiles | id | SET NULL | NO ACTION |
| public.conversation_tasks | migrated_from_reminder_id | public.reminders | id | SET NULL | NO ACTION |
| public.copilot_feedback | created_by | auth.users | id | NO ACTION | NO ACTION |
| public.copilot_insights | profile_id | auth.users | id | NO ACTION | NO ACTION |
| public.copilot_insights | session_id | public.copilot_sessions | id | CASCADE | NO ACTION |
| public.copilot_sessions | profile_id | auth.users | id | NO ACTION | NO ACTION |
| public.crisis_room_alerts | acknowledged_by | public.profiles | id | NO ACTION | NO ACTION |
| public.crm_contact_links | linked_by | public.profiles | id | SET NULL | NO ACTION |
| public.crm_contact_links | zapp_contact_id | public.contacts | id | RESTRICT | NO ACTION |
| public.crm_sync_outbox | closure_id | public.conversation_closures | id | SET NULL | NO ACTION |
| public.crm_sync_outbox | contact_id | public.contacts | id | SET NULL | NO ACTION |
| public.csat_auto_config | updated_by | public.profiles | id | NO ACTION | NO ACTION |
| public.csat_auto_config | whatsapp_connection_id | public.whatsapp_connections | id | NO ACTION | NO ACTION |
| public.csat_surveys | agent_id | public.profiles | id | SET NULL | NO ACTION |
| public.csat_surveys | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.deal_activities | deal_id | public.sales_deals | id | CASCADE | NO ACTION |
| public.deal_activities | performed_by | public.profiles | id | SET NULL | NO ACTION |
| public.department_audit_logs | department_id | public.departments | id | CASCADE | NO ACTION |
| public.department_audit_logs | profile_id | public.profiles | id | SET NULL | NO ACTION |
| public.department_invitations | department_id | public.departments | id | CASCADE | NO ACTION |
| public.department_invitations | used_by | public.profiles | id | SET NULL | NO ACTION |
| public.department_invites | created_by | public.profiles | id | SET NULL | NO ACTION |
| public.department_invites | department_id | public.departments | id | CASCADE | NO ACTION |
| public.email_attachments | email_message_id | public.email_messages | id | CASCADE | NO ACTION |
| public.email_labels | gmail_account_id | public.gmail_accounts | id | CASCADE | NO ACTION |
| public.email_messages | gmail_account_id | public.gmail_accounts | id | CASCADE | NO ACTION |
| public.email_messages | thread_id | public.email_threads | id | CASCADE | NO ACTION |
| public.email_threads | contact_id | public.contacts | id | SET NULL | NO ACTION |
| public.email_threads | gmail_account_id | public.gmail_accounts | id | CASCADE | NO ACTION |
| public.favorite_contacts | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.favorite_contacts | user_id | auth.users | id | CASCADE | NO ACTION |
| public.feature_flags | updated_by | auth.users | id | SET NULL | NO ACTION |
| public.followup_executions | contact_id | public.contacts | id | NO ACTION | NO ACTION |
| public.followup_executions | sequence_id | public.followup_sequences | id | NO ACTION | NO ACTION |
| public.followup_sequences | created_by | public.profiles | id | NO ACTION | NO ACTION |
| public.followup_sequences | whatsapp_connection_id | public.whatsapp_connections | id | NO ACTION | NO ACTION |
| public.followup_steps | sequence_id | public.followup_sequences | id | CASCADE | NO ACTION |
| public.geo_blocking_settings | updated_by | auth.users | id | NO ACTION | NO ACTION |
| public.gmail_accounts | user_id | auth.users | id | RESTRICT | NO ACTION |
| public.gmail_oauth_states | user_id | auth.users | id | CASCADE | NO ACTION |
| public.goals_configurations | profile_id | public.profiles | id | CASCADE | NO ACTION |
| public.goals_configurations | queue_id | public.queues | id | CASCADE | NO ACTION |
| public.instance_pauses | investigated_by | public.profiles | id | SET NULL | NO ACTION |
| public.instance_pauses | paused_by | public.profiles | id | SET NULL | NO ACTION |
| public.instance_pauses | resumed_by | public.profiles | id | SET NULL | NO ACTION |
| public.ip_whitelist | added_by | auth.users | id | SET NULL | NO ACTION |
| public.knowledge_base_articles | created_by | public.profiles | id | SET NULL | NO ACTION |
| public.knowledge_base_files | article_id | public.knowledge_base_articles | id | CASCADE | NO ACTION |
| public.message_attempts | message_id | public.messages | id | CASCADE | NO ACTION |
| public.message_favorites | message_id | public.messages | id | CASCADE | NO ACTION |
| public.message_favorites | user_id | auth.users | id | CASCADE | NO ACTION |
| public.message_pins | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.message_pins | message_id | public.messages | id | CASCADE | NO ACTION |
| public.message_pins | pinned_by | auth.users | id | CASCADE | NO ACTION |
| public.message_reactions | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.message_reactions | message_id | public.messages | id | CASCADE | NO ACTION |
| public.message_reactions | user_id | public.profiles | id | CASCADE | NO ACTION |
| public.message_reports | message_id | public.messages | id | CASCADE | NO ACTION |
| public.message_reports | reporter_id | auth.users | id | CASCADE | NO ACTION |
| public.message_reports | resolved_by | auth.users | id | SET NULL | NO ACTION |
| public.message_templates | user_id | auth.users | id | CASCADE | NO ACTION |
| public.messages | agent_id | public.profiles | id | SET NULL | NO ACTION |
| public.messages | audio_meme_id | public.audio_memes | id | SET NULL | NO ACTION |
| public.messages | channel_connection_id | public.channel_connections | id | NO ACTION | NO ACTION |
| public.messages | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.messages | reply_to_id | public.messages | id | SET NULL | NO ACTION |
| public.messages | whatsapp_connection_id | public.whatsapp_connections | id | SET NULL | NO ACTION |
| public.messages | whatsapp_group_id | public.whatsapp_groups | id | SET NULL | NO ACTION |
| public.meta_capi_events | contact_id | public.contacts | id | SET NULL | NO ACTION |
| public.mfa_sessions | user_id | auth.users | id | CASCADE | NO ACTION |
| public.multiplix_audience_members | audience_id | public.multiplix_audiences | id | CASCADE | NO ACTION |
| public.multiplix_blocks | dispatch_id | public.multiplix_dispatches | id | CASCADE | NO ACTION |
| public.multiplix_delivery_items | block_id | public.multiplix_blocks | id | CASCADE | NO ACTION |
| public.multiplix_delivery_items | dispatch_id | public.multiplix_dispatches | id | CASCADE | NO ACTION |
| public.multiplix_delivery_items | recipient_id | public.multiplix_recipients | id | CASCADE | NO ACTION |
| public.multiplix_delivery_items | voice_asset_id | public.multiplix_voice_assets | id | SET NULL | NO ACTION |
| public.multiplix_dispatches | whatsapp_connection_id | public.whatsapp_connections | id | SET NULL | NO ACTION |
| public.multiplix_events | dispatch_id | public.multiplix_dispatches | id | RESTRICT | NO ACTION |
| public.multiplix_events | recipient_id | public.multiplix_recipients | id | RESTRICT | NO ACTION |
| public.multiplix_recipients | dispatch_id | public.multiplix_dispatches | id | CASCADE | NO ACTION |
| public.notifications | user_id | auth.users | id | CASCADE | NO ACTION |
| public.nps_surveys | agent_id | public.profiles | id | NO ACTION | NO ACTION |
| public.nps_surveys | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.number_reputation | whatsapp_connection_id | public.whatsapp_connections | id | CASCADE | NO ACTION |
| public.passkey_credentials | user_id | auth.users | id | CASCADE | NO ACTION |
| public.password_reset_requests | reviewed_by | auth.users | id | NO ACTION | NO ACTION |
| public.password_reset_requests | user_id | auth.users | id | CASCADE | NO ACTION |
| public.performance_snapshots | profile_id | public.profiles | id | CASCADE | NO ACTION |
| public.pinned_conversations | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.pinned_conversations | pinned_by | public.profiles | id | CASCADE | NO ACTION |
| public.playbooks | created_by | public.profiles | id | SET NULL | NO ACTION |
| public.products | whatsapp_connection_id | public.whatsapp_connections | id | SET NULL | NO ACTION |
| public.profiles | department_id | public.departments | id | NO ACTION | NO ACTION |
| public.profiles | user_id | auth.users | id | CASCADE | NO ACTION |
| public.qr_attempts | connection_id | public.whatsapp_connections | id | CASCADE | NO ACTION |
| public.query_telemetry | user_id | auth.users | id | SET NULL | NO ACTION |
| public.queue_goals | queue_id | public.queues | id | CASCADE | NO ACTION |
| public.queue_members | profile_id | public.profiles | id | CASCADE | NO ACTION |
| public.queue_members | queue_id | public.queues | id | CASCADE | NO ACTION |
| public.queue_positions | contact_id | public.contacts | id | NO ACTION | NO ACTION |
| public.queue_positions | queue_id | public.queues | id | NO ACTION | NO ACTION |
| public.queue_skill_requirements | queue_id | public.queues | id | CASCADE | NO ACTION |
| public.queues | overflow_queue_id | public.queues | id | SET NULL | NO ACTION |
| public.rate_limit_logs | user_id | auth.users | id | SET NULL | NO ACTION |
| public.reconnection_logs | connection_id | public.whatsapp_connections | id | CASCADE | NO ACTION |
| public.reminders | contact_id | public.contacts | id | SET NULL | NO ACTION |
| public.reminders | migrated_task_id | public.conversation_tasks | id | SET NULL | NO ACTION |
| public.reminders | profile_id | public.profiles | id | CASCADE | NO ACTION |
| public.role_permissions | permission_id | public.permissions | id | CASCADE | NO ACTION |
| public.sales_deals | assigned_to | public.profiles | id | SET NULL | NO ACTION |
| public.sales_deals | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.sales_deals | stage_id | public.sales_pipeline_stages | id | SET NULL | NO ACTION |
| public.saved_filters | user_id | auth.users | id | CASCADE | NO ACTION |
| public.scheduled_messages | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.scheduled_messages | created_by | public.profiles | id | NO ACTION | NO ACTION |
| public.scheduled_messages | whatsapp_connection_id | public.whatsapp_connections | id | NO ACTION | NO ACTION |
| public.scheduled_report_configs | created_by | public.profiles | id | SET NULL | NO ACTION |
| public.search_events | user_id | auth.users | id | CASCADE | NO ACTION |
| public.security_alerts | resolved_by | auth.users | id | SET NULL | NO ACTION |
| public.security_alerts | user_id | auth.users | id | SET NULL | NO ACTION |
| public.sicoob_contact_mapping | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.sicoob_contact_mapping | zappweb_agent_id | public.profiles | id | NO ACTION | NO ACTION |
| public.sla_alert_events | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.sla_alert_events | queue_id | public.queues | id | SET NULL | NO ACTION |
| public.sla_alert_events | resolved_by | public.profiles | id | SET NULL | NO ACTION |
| public.sla_alert_preferences | user_id | auth.users | id | CASCADE | NO ACTION |
| public.sla_rules | agent_id | public.profiles | id | CASCADE | NO ACTION |
| public.sla_rules | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.sla_rules | queue_id | public.queues | id | CASCADE | NO ACTION |
| public.stickers | owner_id | public.profiles | id | CASCADE | NO ACTION |
| public.talkx_alerts | campaign_id | public.talkx_campaigns | id | CASCADE | NO ACTION |
| public.talkx_blacklist | blocked_by | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_blacklist | campaign_id | public.talkx_campaigns | id | SET NULL | NO ACTION |
| public.talkx_blacklist | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.talkx_blacklist | removed_by | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_blacklist | source_message_id | public.messages | id | SET NULL | NO ACTION |
| public.talkx_campaign_events | actor_id | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_campaign_events | campaign_id | public.talkx_campaigns | id | CASCADE | NO ACTION |
| public.talkx_campaign_segments | campaign_id | public.talkx_campaigns | id | CASCADE | NO ACTION |
| public.talkx_campaign_segments | segment_id | public.talkx_segments | id | CASCADE | NO ACTION |
| public.talkx_campaigns | cancelled_by | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_campaigns | consent_confirmed_by | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_campaigns | created_by | public.profiles | id | NO ACTION | NO ACTION |
| public.talkx_campaigns | launch_confirmed_by | public.profiles | id | NO ACTION | NO ACTION |
| public.talkx_campaigns | launched_by | public.profiles | id | NO ACTION | NO ACTION |
| public.talkx_campaigns | owner | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_campaigns | paused_by | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_campaigns | recurrence_next_campaign_id | public.talkx_campaigns | id | SET NULL | NO ACTION |
| public.talkx_campaigns | responsible_id | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_campaigns | segment_id | public.talkx_segments | id | SET NULL | NO ACTION |
| public.talkx_campaigns | template_id | public.talkx_templates | id | SET NULL | NO ACTION |
| public.talkx_campaigns | template_version_id | public.talkx_template_versions | id | SET NULL | NO ACTION |
| public.talkx_campaigns | whatsapp_connection_id | public.whatsapp_connections | id | NO ACTION | NO ACTION |
| public.talkx_contact_attributes | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.talkx_conversions | campaign_id | public.talkx_campaigns | id | CASCADE | NO ACTION |
| public.talkx_conversions | link_id | public.talkx_links | id | SET NULL | NO ACTION |
| public.talkx_conversions | recipient_id | public.talkx_recipients | id | SET NULL | NO ACTION |
| public.talkx_delivery_log | campaign_id | public.talkx_campaigns | id | CASCADE | NO ACTION |
| public.talkx_delivery_log | recipient_id | public.talkx_recipients | id | CASCADE | NO ACTION |
| public.talkx_link_clicks | link_id | public.talkx_links | id | CASCADE | NO ACTION |
| public.talkx_link_clicks | recipient_id | public.talkx_recipients | id | SET NULL | NO ACTION |
| public.talkx_links | campaign_id | public.talkx_campaigns | id | CASCADE | NO ACTION |
| public.talkx_links | created_by | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_optout_keywords | created_by | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_recipients | campaign_id | public.talkx_campaigns | id | CASCADE | NO ACTION |
| public.talkx_recipients | contact_id | public.contacts | id | CASCADE | NO ACTION |
| public.talkx_recipients | reply_message_id | public.messages | id | SET NULL | NO ACTION |
| public.talkx_recipients | variant_id | public.talkx_template_variants | id | SET NULL | NO ACTION |
| public.talkx_segment_versions | created_by | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_segment_versions | segment_id | public.talkx_segments | id | CASCADE | NO ACTION |
| public.talkx_segments | created_by | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_segments | published_by | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_suppression_reasons | created_by | auth.users | id | SET NULL | NO ACTION |
| public.talkx_template_variants | template_id | public.talkx_templates | id | CASCADE | NO ACTION |
| public.talkx_template_versions | saved_by | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_template_versions | template_id | public.talkx_templates | id | CASCADE | NO ACTION |
| public.talkx_templates | created_by | public.profiles | id | SET NULL | NO ACTION |
| public.talkx_templates | current_version_id | public.talkx_template_versions | id | SET NULL | NO ACTION |
| public.talkx_test_sends | campaign_id | public.talkx_campaigns | id | NO ACTION | NO ACTION |
| public.talkx_test_sends | connection_id | public.whatsapp_connections | id | NO ACTION | NO ACTION |
| public.talkx_test_sends | template_id | public.talkx_templates | id | NO ACTION | NO ACTION |
| public.team_conversation_members | conversation_id | public.team_conversations | id | CASCADE | NO ACTION |
| public.team_conversation_members | profile_id | public.profiles | id | CASCADE | NO ACTION |
| public.team_conversations | created_by | public.profiles | id | NO ACTION | NO ACTION |
| public.team_conversations | department_id | public.departments | id | CASCADE | NO ACTION |
| public.team_conversations | direct_member_a | public.profiles | id | SET NULL | NO ACTION |
| public.team_conversations | direct_member_b | public.profiles | id | SET NULL | NO ACTION |
| public.team_message_reactions | conversation_id | public.team_conversations | id | CASCADE | NO ACTION |
| public.team_message_reactions | message_id | public.team_messages | id | CASCADE | NO ACTION |
| public.team_message_reactions | profile_id | public.profiles | id | CASCADE | NO ACTION |
| public.team_message_receipts | conversation_id | public.team_conversations | id | CASCADE | NO ACTION |
| public.team_message_receipts | message_id | public.team_messages | id | CASCADE | NO ACTION |
| public.team_message_receipts | profile_id | public.profiles | id | CASCADE | NO ACTION |
| public.team_messages | conversation_id | public.team_conversations | id | CASCADE | NO ACTION |
| public.team_messages | reply_to_id | public.team_messages | id | SET NULL | NO ACTION |
| public.team_messages | sender_id | public.profiles | id | NO ACTION | NO ACTION |
| public.training_sessions | profile_id | public.profiles | id | CASCADE | NO ACTION |
| public.user_devices | user_id | auth.users | id | CASCADE | NO ACTION |
| public.user_roles | user_id | auth.users | id | CASCADE | NO ACTION |
| public.user_service_accounts | user_id | auth.users | id | CASCADE | NO ACTION |
| public.user_sessions | device_id | public.user_devices | id | SET NULL | NO ACTION |
| public.user_sessions | user_id | auth.users | id | CASCADE | NO ACTION |
| public.user_settings | user_id | auth.users | id | CASCADE | NO ACTION |
| public.voice_command_logs | user_id | auth.users | id | CASCADE | NO ACTION |
| public.voip_profile_credentials | profile_id | public.profiles | id | CASCADE | NO ACTION |
| public.warroom_alerts | dismissed_by | public.profiles | id | NO ACTION | NO ACTION |
| public.webauthn_challenges | user_id | auth.users | id | CASCADE | NO ACTION |
| public.whatsapp_connection_queues | queue_id | public.queues | id | CASCADE | NO ACTION |
| public.whatsapp_connection_queues | whatsapp_connection_id | public.whatsapp_connections | id | CASCADE | NO ACTION |
| public.whatsapp_connections | created_by | public.profiles | id | SET NULL | NO ACTION |
| public.whatsapp_connections | instance_token_secret_id | vault.secrets | id | SET NULL | NO ACTION |
| public.whatsapp_flows | created_by | public.profiles | id | SET NULL | NO ACTION |
| public.whatsapp_flows | whatsapp_connection_id | public.whatsapp_connections | id | SET NULL | NO ACTION |
| public.whatsapp_groups | whatsapp_connection_id | public.whatsapp_connections | id | CASCADE | NO ACTION |
| public.whatsapp_templates | whatsapp_connection_id | public.whatsapp_connections | id | NO ACTION | NO ACTION |
| public.whisper_messages | contact_id | public.contacts | id | NO ACTION | NO ACTION |
| public.whisper_messages | sender_id | public.profiles | id | NO ACTION | NO ACTION |
| public.whisper_messages | target_agent_id | public.profiles | id | NO ACTION | NO ACTION |


_Diagrama omitido: mais de 120 tabelas._
