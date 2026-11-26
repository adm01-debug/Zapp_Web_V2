# CHANGELOG do snapshot Supabase

Diff semântico gerado a cada coleta em que algo mudou.

## 2026-11-26 17:15 UTC

- **functions** adicionado (3): `public.recalcular_retencao_copiloto(p_dias integer)`, `public.resumo_orcamento_ia(p_dias integer)`, `public.run_copilot_retention(p_target_date date)`
- **functions** removido (1): `public.run_copilot_retention()`
- **functions** alterado (5): `public.handle_new_user_role()`, `public.is_admin_or_supervisor(_user_id uuid)`, `public.record_sla_alert(p_contact_id uuid, p_alert_type text, p_severity text)`, `public.resolve_sla_alert(p_event_id uuid)`, `public.talkx_connection_send_budget_internal(p_connection_id uuid)`
- **lints** adicionado (1): `policy_auth_fn_not_wrapped:public.copilot_retention_aggregates.admin_supervisor_retention`
- **policies (RLS)** adicionado (1): `public.copilot_retention_aggregates.admin_supervisor_retention`

## 2026-11-26 15:17 UTC

- **functions** alterado (1): `public.get_my_protection_policy()`

## 2026-11-26 13:25 UTC

- **functions** alterado (1): `public.talkx_segment_tags(p_segment uuid)`

## 2026-11-26 12:19 UTC

- **functions** adicionado (1): `public.talkx_connection_send_budget_internal(p_connection_id uuid)`
- **functions** alterado (3): `public.talkx_campaign_pace(p_campaign_id uuid)`, `public.talkx_connection_send_budget(p_connection_id uuid)`, `public.talkx_multiplix_connection_sent_count(p_connection_id uuid, p_since timestamp with time zone)`
- **migrations** adicionado (1): `20261127001500_talkx_campaign_pace_orcamento_interno`
- **migrations** alterado (1): `20261126234500_paridade_policies_admin_prod`

## 2026-11-26 04:15 UTC

- **functions** alterado (8): `public.archive_talkx_template(p_template_id uuid, p_archived boolean)`, `public.delete_talkx_template(p_template_id uuid)`, `public.duplicate_talkx_template(p_template_id uuid)`, `public.get_profile_id_for_user(_user_id uuid)`, `public.guard_talkx_template_delete()`, `public.ingest_inbound_message(p_connection_id uuid, p_phone text, p_push_name text, p_content text, p_message_type text, p_media_url text, p_external_id text, p_created_at timestamp with time zone)`, `public.is_admin(_user_id uuid)`, `public.is_admin_or_supervisor(_user_id uuid)`
- **lints** adicionado (12): `policy_auth_fn_not_wrapped:public.campaign_contacts.Admins can insert campaign contacts`, `policy_auth_fn_not_wrapped:public.campaign_contacts.Admins can view campaign contacts`, `policy_auth_fn_not_wrapped:public.campaigns.Admins can insert campaigns`, `policy_auth_fn_not_wrapped:public.chatbot_flows.Admins can insert chatbot flows`, `policy_auth_fn_not_wrapped:public.followup_sequences.Admins can view followup sequences`, `policy_auth_fn_not_wrapped:public.followup_steps.Admins can view followup steps`, `policy_auth_fn_not_wrapped:public.meta_capi_events.Admins can view capi events`, `policy_auth_fn_not_wrapped:public.products.Admins can insert products`, `policy_auth_fn_not_wrapped:public.scheduled_reports.Admins can insert scheduled reports`, `policy_auth_fn_not_wrapped:public.scheduled_reports.Admins can view scheduled reports`, `policy_auth_fn_not_wrapped:public.security_alerts.Admins can insert security alerts`, `policy_auth_fn_not_wrapped:public.whatsapp_templates.Admins can insert templates`
- **migrations** adicionado (1): `20261126234500_paridade_policies_admin_prod`
- **policies (RLS)** adicionado (12): `public.campaign_contacts.Admins can insert campaign contacts`, `public.campaign_contacts.Admins can view campaign contacts`, `public.campaigns.Admins can insert campaigns`, `public.chatbot_flows.Admins can insert chatbot flows`, `public.followup_sequences.Admins can view followup sequences`, `public.followup_steps.Admins can view followup steps`, `public.meta_capi_events.Admins can view capi events`, `public.products.Admins can insert products`, `public.scheduled_reports.Admins can insert scheduled reports`, `public.scheduled_reports.Admins can view scheduled reports`, `public.security_alerts.Admins can insert security alerts`, `public.whatsapp_templates.Admins can insert templates`

## 2026-11-26 03:24 UTC

- **colunas** adicionado (10): `public.city_whitelist.city_key`, `public.city_whitelist.city_name`, `public.city_whitelist.created_at`, `public.city_whitelist.created_by`, `public.city_whitelist.id`, `public.city_whitelist.is_active`, `public.conversation_tasks.message_id`, `public.geo_blocking_settings.city_whitelist_enabled`, `public.webhook_failures.external_id`, `public.webhook_failures.replay_payload`
- **colunas** alterado (1): `public.talkx_templates.archived_at`
- **constraints** adicionado (6): `public.city_whitelist.city_whitelist_city_key_key`, `public.city_whitelist.city_whitelist_city_key_not_empty`, `public.city_whitelist.city_whitelist_city_name_check`, `public.city_whitelist.city_whitelist_created_by_fkey`, `public.city_whitelist.city_whitelist_pkey`, `public.conversation_tasks.conversation_tasks_message_id_fkey`
- **functions** adicionado (7): `public.archive_talkx_template(p_template_id uuid, p_archived boolean)`, `public.delete_talkx_template(p_template_id uuid)`, `public.duplicate_talkx_template(p_template_id uuid)`, `public.guard_talkx_template_delete()`, `public.normalize_city_name(p_city text)`, `public.remind_me_about_message(p_message_id uuid, p_remind_at timestamp with time zone, p_note text)`, `public.resolve_network_policy(p_ip text, p_country_code text, p_city text, p_endpoint text, p_default_max_requests integer, p_default_window_seconds integer)`
- **functions** removido (1): `public.resolve_network_policy(p_ip text, p_country_code text, p_endpoint text, p_default_max_requests integer, p_default_window_seconds integer)`
- **functions** alterado (11): `public.current_profile_id()`, `public.get_profile_id_for_user(_user_id uuid)`, `public.guard_talkx_template_update()`, `public.is_admin_or_supervisor(_user_id uuid)`, `public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)`, `public.notify_due_tasks()`, `public.pin_message(p_message_id uuid)`, `public.report_message(p_message_id uuid, p_reason text, p_note text)`, `public.set_talkx_template_updated_at()`, `public.toggle_message_favorite(p_message_id uuid)`, `public.unpin_message(p_message_id uuid)`
- **indexes** adicionado (4): `public.city_whitelist_city_key_key`, `public.city_whitelist_pkey`, `public.idx_tasks_owner_message`, `public.webhook_failures_replay_pendente_idx`
- **lints** adicionado (4): `fk_without_index:public.city_whitelist.city_whitelist_created_by_fkey`, `fk_without_index:public.conversation_tasks.conversation_tasks_message_id_fkey`, `policy_auth_fn_not_wrapped:public.city_whitelist.Admins can manage city whitelist`, `policy_auth_fn_not_wrapped:public.whatsapp_connections.Admins can delete connections`
- **migrations** adicionado (6): `20261126010000_webhook_failures_replay`, `20261126010508_city_whitelist_network_policy`, `20261126011000_connections_delete_admin_only`, `20261126213000_talkx_template_duplicate_archive_delete`, `20261126213001_talkx_template_delete_atomic`, `20261126221500_remind_me_about_message`
- **policies (RLS)** adicionado (1): `public.city_whitelist.Admins can manage city whitelist`
- **policies (RLS)** alterado (1): `public.whatsapp_connections.Admins can delete connections`
- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_29`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_22`
- **tabelas** adicionado (1): `public.city_whitelist`
- **triggers** adicionado (1): `public.talkx_templates.trg_guard_talkx_template_delete`

## 2026-11-26 02:29 UTC

- **constraints** adicionado (2): `public.ai_providers.ai_providers_api_endpoint_safe`, `public.ai_providers.ai_providers_api_key_secret_name_safe`
- **functions** adicionado (2): `public.ai_provider_endpoint_is_safe(endpoint text)`, `public.ai_provider_secret_name_is_safe(secret_name text)`
- **functions** alterado (1): `public.crisis_room_snapshot()`
- **migrations** adicionado (1): `20261125120000_ai_providers_endpoint_secret_binding`

## 2026-11-26 01:20 UTC

- **migrations** adicionado (1): `20261125130000_ia009_kill_switch_chaves`

## 2026-11-26 00:33 UTC

- **functions** alterado (2): `public.count_multiplix_dead_letters(p_dispatch_id uuid)`, `public.list_multiplix_dead_letters(p_limit integer, p_dispatch_id uuid)`

## 2026-11-25 03:16 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_28`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_21`

## 2026-11-24 22:11 UTC

- **tabelas** alterado (225): `_bkp_261023.agent_stats`, `_bkp_261023.contacts`, `_bkp_261023.csat_surveys`, `_bkp_261023.functions_before`, `_bkp_261023.global_settings`, `_bkp_261023.policies_before`, `_bkp_261023.schema_migrations`, `_bkp_261023.team_messages`, `_bkp_261023.user_settings`, `ops.hermes_change_log`, `public._rb_message_reactions_contato_20261007001008`, `public._rb_message_reactions_one_per_agent_20261107121000`, `public._zapp_fn_before`, `public._zapp_mig133_log`, `public.agent_achievements`, `public.agent_mini_game_xp_daily`, `public.agent_presence`, `public.agent_skills`, `public.agent_stats`, `public.agent_visibility_grants`, `public.ai_budget_reservations`, `public.ai_conversation_tags`, `public.ai_jobs`, `public.ai_model_prices`, `public.ai_providers`, `public.ai_usage_logs`, `public.ai_usage_outbox`, `public.allowed_countries`, `public.app_settings`, `public.assistant_profiles`, `public.audio_meme_favorites`, `public.audio_memes`, `public.audit_logs`, `public.auto_close_config`, `public.automations`, `public.away_message_log`, `public.away_messages`, `public.blocked_countries`, `public.blocked_ips`, `public.business_hours` … (+185)
- **views** alterado (16): `ops._relation_dictionary_base`, `ops.application_data_dictionary`, `ops.managed_schema_dictionary`, `public.catalog_send_stats`, `public.channel_connections_safe`, `public.gmail_accounts_safe`, `public.password_reset_requests_safe`, `public.profiles_public`, `public.searchbox_usage_daily`, `public.talkx_campaign_metrics`, `public.talkx_campaign_optouts`, `public.talkx_engine_health`, `public.team_message_read_state`, `public.whatsapp_connections_agent`, `public.whatsapp_connections_public`, `public.whatsapp_connections_safe`

## 2026-11-24 17:13 UTC

- **colunas** adicionado (58): `ops._relation_dictionary_base.column_description`, `ops._relation_dictionary_base.column_name`, `ops._relation_dictionary_base.data_type`, `ops._relation_dictionary_base.default_or_generation_expression`, `ops._relation_dictionary_base.dictionary_scope`, `ops._relation_dictionary_base.estimated_rows`, `ops._relation_dictionary_base.foreign_key_targets`, `ops._relation_dictionary_base.generated_kind`, `ops._relation_dictionary_base.identity_generation`, `ops._relation_dictionary_base.is_nullable`, `ops._relation_dictionary_base.object_description`, `ops._relation_dictionary_base.object_name`, `ops._relation_dictionary_base.object_type`, `ops._relation_dictionary_base.ordinal_position`, `ops._relation_dictionary_base.primary_key_constraint`, `ops._relation_dictionary_base.primary_key_position`, `ops._relation_dictionary_base.rls_enabled`, `ops._relation_dictionary_base.rls_forced`, `ops._relation_dictionary_base.rls_policy_count`, `ops._relation_dictionary_base.schema_name`, `ops.application_data_dictionary.column_description`, `ops.application_data_dictionary.column_name`, `ops.application_data_dictionary.data_type`, `ops.application_data_dictionary.default_or_generation_expression`, `ops.application_data_dictionary.estimated_rows`, `ops.application_data_dictionary.foreign_key_targets`, `ops.application_data_dictionary.generated_kind`, `ops.application_data_dictionary.identity_generation`, `ops.application_data_dictionary.is_nullable`, `ops.application_data_dictionary.object_description`, `ops.application_data_dictionary.object_name`, `ops.application_data_dictionary.object_type`, `ops.application_data_dictionary.ordinal_position`, `ops.application_data_dictionary.primary_key_constraint`, `ops.application_data_dictionary.primary_key_position`, `ops.application_data_dictionary.rls_enabled`, `ops.application_data_dictionary.rls_forced`, `ops.application_data_dictionary.rls_policy_count`, `ops.application_data_dictionary.schema_name`, `ops.managed_schema_dictionary.column_description` … (+18)
- **lints** removido (405): `policy_auth_fn_not_wrapped:public.agent_achievements.Only admins can insert achievements directly`, `policy_auth_fn_not_wrapped:public.agent_achievements.Users can view own or admin all achievements`, `policy_auth_fn_not_wrapped:public.agent_skills.Admins can manage skills`, `policy_auth_fn_not_wrapped:public.agent_skills.Users can view own or admin all skills`, `policy_auth_fn_not_wrapped:public.agent_stats.Only admins can update agent stats`, `policy_auth_fn_not_wrapped:public.agent_stats.Users can insert own stats`, `policy_auth_fn_not_wrapped:public.agent_stats.Users can view agent stats`, `policy_auth_fn_not_wrapped:public.agent_visibility_grants.Admins and supervisors can manage visibility grants`, `policy_auth_fn_not_wrapped:public.agent_visibility_grants.Agents can view own grants`, `policy_auth_fn_not_wrapped:public.ai_conversation_tags.Admins can delete ai tags`, `policy_auth_fn_not_wrapped:public.ai_conversation_tags.Admins can update ai tags`, `policy_auth_fn_not_wrapped:public.ai_conversation_tags.Agents can delete tags on assigned contacts`, `policy_auth_fn_not_wrapped:public.ai_conversation_tags.Authenticated can view ai tags`, `policy_auth_fn_not_wrapped:public.ai_conversation_tags.Users can insert ai tags for assigned contacts`, `policy_auth_fn_not_wrapped:public.ai_providers.Admins can delete AI providers`, `policy_auth_fn_not_wrapped:public.ai_providers.Admins can insert AI providers`, `policy_auth_fn_not_wrapped:public.ai_providers.Admins can update AI providers`, `policy_auth_fn_not_wrapped:public.ai_providers.Admins can view AI providers`, `policy_auth_fn_not_wrapped:public.ai_usage_logs.Admins can view all AI usage logs`, `policy_auth_fn_not_wrapped:public.ai_usage_logs.Users can view own AI usage logs`, `policy_auth_fn_not_wrapped:public.allowed_countries.Admins can delete allowed countries`, `policy_auth_fn_not_wrapped:public.allowed_countries.Admins can insert allowed countries`, `policy_auth_fn_not_wrapped:public.allowed_countries.Admins can view allowed countries`, `policy_auth_fn_not_wrapped:public.audio_meme_favorites.Users manage own meme favorites`, `policy_auth_fn_not_wrapped:public.audio_memes.Authenticated users can insert audio memes`, `policy_auth_fn_not_wrapped:public.audio_memes.Authenticated users can update audio memes`, `policy_auth_fn_not_wrapped:public.audio_memes.Users can delete own audio memes`, `policy_auth_fn_not_wrapped:public.auto_close_config.Admins can manage auto-close config`, `policy_auth_fn_not_wrapped:public.automations.Admin/supervisor can create automations`, `policy_auth_fn_not_wrapped:public.automations.Admin/supervisor can delete automations`, `policy_auth_fn_not_wrapped:public.automations.Admin/supervisor can update automations`, `policy_auth_fn_not_wrapped:public.automations.Automations visible to admins only`, `policy_auth_fn_not_wrapped:public.away_messages.Admins can manage away messages`, `policy_auth_fn_not_wrapped:public.blocked_countries.Admins can delete blocked countries`, `policy_auth_fn_not_wrapped:public.blocked_countries.Admins can insert blocked countries`, `policy_auth_fn_not_wrapped:public.blocked_countries.Admins can view blocked countries`, `policy_auth_fn_not_wrapped:public.blocked_ips.Admins can delete blocked IPs`, `policy_auth_fn_not_wrapped:public.blocked_ips.Admins can insert blocked IPs`, `policy_auth_fn_not_wrapped:public.blocked_ips.Admins can update blocked IPs`, `policy_auth_fn_not_wrapped:public.blocked_ips.Only admins can view blocked IPs` … (+365)
- **policies (RLS)** removido (12): `public.campaign_contacts.Admins can insert campaign contacts`, `public.campaign_contacts.Admins can view campaign contacts`, `public.campaigns.Admins can insert campaigns`, `public.chatbot_flows.Admins can insert chatbot flows`, `public.followup_sequences.Admins can view followup sequences`, `public.followup_steps.Admins can view followup steps`, `public.meta_capi_events.Admins can view capi events`, `public.products.Admins can insert products`, `public.scheduled_reports.Admins can insert scheduled reports`, `public.scheduled_reports.Admins can view scheduled reports`, `public.security_alerts.Admins can insert security alerts`, `public.whatsapp_templates.Admins can insert templates`
- **policies (RLS)** alterado (439): `public.agent_achievements.Only admins can insert achievements directly`, `public.agent_achievements.Users can view own or admin all achievements`, `public.agent_presence.Users can insert own presence`, `public.agent_presence.Users can update own presence`, `public.agent_skills.Admins can manage skills`, `public.agent_skills.Users can view own or admin all skills`, `public.agent_stats.Only admins can update agent stats`, `public.agent_stats.Users can insert own stats`, `public.agent_stats.Users can view agent stats`, `public.agent_visibility_grants.Admins and supervisors can manage visibility grants`, `public.agent_visibility_grants.Agents can view own grants`, `public.ai_conversation_tags.Admins can delete ai tags`, `public.ai_conversation_tags.Admins can update ai tags`, `public.ai_conversation_tags.Agents can delete tags on assigned contacts`, `public.ai_conversation_tags.Authenticated can view ai tags`, `public.ai_conversation_tags.Users can insert ai tags for assigned contacts`, `public.ai_providers.Admins can delete AI providers`, `public.ai_providers.Admins can insert AI providers`, `public.ai_providers.Admins can update AI providers`, `public.ai_providers.Admins can view AI providers`, `public.ai_usage_logs.Admins can view all AI usage logs`, `public.ai_usage_logs.Users can view own AI usage logs`, `public.allowed_countries.Admins can delete allowed countries`, `public.allowed_countries.Admins can insert allowed countries`, `public.allowed_countries.Admins can view allowed countries`, `public.app_settings.app_settings_admin_all`, `public.assistant_profiles.assistant_profiles_insert`, `public.assistant_profiles.assistant_profiles_select`, `public.assistant_profiles.assistant_profiles_update`, `public.audio_meme_favorites.Users manage own meme favorites`, `public.audio_memes.Authenticated users can insert audio memes`, `public.audio_memes.Authenticated users can update audio memes`, `public.audio_memes.Users can delete own audio memes`, `public.audit_logs.Only admins can view audit logs`, `public.auto_close_config.Admins can manage auto-close config`, `public.automations.Admin/supervisor can create automations`, `public.automations.Admin/supervisor can delete automations`, `public.automations.Admin/supervisor can update automations`, `public.automations.Automations visible to admins only`, `public.away_messages.Admins can manage away messages` … (+399)
- **tabelas** alterado (6): `ops.hermes_change_log`, `public.contacts`, `public.departments`, `public.messages`, `public.role_permissions`, `public.user_roles`
- **views** adicionado (3): `ops._relation_dictionary_base`, `ops.application_data_dictionary`, `ops.managed_schema_dictionary`

## 2026-11-24 16:16 UTC

- **functions** alterado (3): `public.has_role(_user_id uuid, _role app_role)`, `public.is_admin(_user_id uuid)`, `public.is_admin_or_supervisor(_user_id uuid)`

## 2026-11-24 15:13 UTC

- **functions** removido (2): `public.e2e_cleanup()`, `public.e2e_cleanup_conversation_closures()`
- **migrations** adicionado (1): `20261124120000_drop_rpcs_e2e_orfas`

## 2026-11-24 11:13 UTC

- **lints** removido (11): `policy_auth_fn_not_wrapped:public.copilot_feedback.copilot_feedback_insert`, `policy_auth_fn_not_wrapped:public.copilot_feedback.copilot_feedback_select`, `policy_auth_fn_not_wrapped:public.copilot_seller_settings.copilot_seller_settings_insert`, `policy_auth_fn_not_wrapped:public.copilot_seller_settings.copilot_seller_settings_select`, `policy_auth_fn_not_wrapped:public.copilot_seller_settings.copilot_seller_settings_update`, `policy_auth_fn_not_wrapped:public.copilot_usage.copilot_usage_insert`, `policy_auth_fn_not_wrapped:public.copilot_usage.copilot_usage_select`, `policy_auth_fn_not_wrapped:public.message_templates.Users can create their own templates`, `policy_auth_fn_not_wrapped:public.message_templates.Users can delete their own templates`, `policy_auth_fn_not_wrapped:public.message_templates.Users can update their own templates`, `policy_auth_fn_not_wrapped:public.message_templates.Users can view their templates and global ones`
- **policies (RLS)** alterado (11): `public.copilot_feedback.copilot_feedback_insert`, `public.copilot_feedback.copilot_feedback_select`, `public.copilot_seller_settings.copilot_seller_settings_insert`, `public.copilot_seller_settings.copilot_seller_settings_select`, `public.copilot_seller_settings.copilot_seller_settings_update`, `public.copilot_usage.copilot_usage_insert`, `public.copilot_usage.copilot_usage_select`, `public.message_templates.Users can create their own templates`, `public.message_templates.Users can delete their own templates`, `public.message_templates.Users can update their own templates`, `public.message_templates.Users can view their templates and global ones`

## 2026-11-24 10:13 UTC

- **lints** removido (16): `policy_auth_fn_not_wrapped:public.agent_presence.Users can insert own presence`, `policy_auth_fn_not_wrapped:public.agent_presence.Users can update own presence`, `policy_auth_fn_not_wrapped:public.assistant_profiles.assistant_profiles_insert`, `policy_auth_fn_not_wrapped:public.assistant_profiles.assistant_profiles_select`, `policy_auth_fn_not_wrapped:public.assistant_profiles.assistant_profiles_update`, `policy_auth_fn_not_wrapped:public.user_devices.Users can delete their own devices`, `policy_auth_fn_not_wrapped:public.user_devices.Users can insert their own devices`, `policy_auth_fn_not_wrapped:public.user_devices.Users can update their own devices`, `policy_auth_fn_not_wrapped:public.user_devices.Users can view their own devices`, `policy_auth_fn_not_wrapped:public.user_sessions.Authenticated can insert own sessions`, `policy_auth_fn_not_wrapped:public.user_sessions.Users can delete their own sessions`, `policy_auth_fn_not_wrapped:public.user_sessions.Users can update their own sessions`, `policy_auth_fn_not_wrapped:public.user_sessions.Users can view their own sessions`, `policy_auth_fn_not_wrapped:public.user_settings.Users can insert their own settings`, `policy_auth_fn_not_wrapped:public.user_settings.Users can update their own settings`, `policy_auth_fn_not_wrapped:public.user_settings.Users can view their own settings`
- **policies (RLS)** alterado (16): `public.agent_presence.Users can insert own presence`, `public.agent_presence.Users can update own presence`, `public.assistant_profiles.assistant_profiles_insert`, `public.assistant_profiles.assistant_profiles_select`, `public.assistant_profiles.assistant_profiles_update`, `public.user_devices.Users can delete their own devices`, `public.user_devices.Users can insert their own devices`, `public.user_devices.Users can update their own devices`, `public.user_devices.Users can view their own devices`, `public.user_sessions.Authenticated can insert own sessions`, `public.user_sessions.Users can delete their own sessions`, `public.user_sessions.Users can update their own sessions`, `public.user_sessions.Users can view their own sessions`, `public.user_settings.Users can insert their own settings`, `public.user_settings.Users can update their own settings`, `public.user_settings.Users can view their own settings`

## 2026-11-24 01:15 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_27`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_20`

## 2026-11-24 00:30 UTC

- **migrations** adicionado (1): `20261122200000_x076_talkx_ai_requests`

## 2026-11-23 23:18 UTC

- **indexes** adicionado (8): `public.idx_away_message_log_whatsapp_connection_id`, `public.idx_message_favorites_message_id`, `public.idx_message_pins_message_id`, `public.idx_message_reports_reporter_id`, `public.idx_talkx_campaign_segments_segment_id`, `public.idx_talkx_campaigns_ab_winner_decided_by`, `public.idx_talkx_campaigns_ab_winner_variant_id`, `public.idx_team_message_receipts_profile_id`
- **lints** removido (8): `fk_without_index:public.away_message_log.away_message_log_whatsapp_connection_id_fkey`, `fk_without_index:public.message_favorites.message_favorites_message_id_fkey`, `fk_without_index:public.message_pins.message_pins_message_id_fkey`, `fk_without_index:public.message_reports.message_reports_reporter_id_fkey`, `fk_without_index:public.talkx_campaign_segments.talkx_campaign_segments_segment_id_fkey`, `fk_without_index:public.talkx_campaigns.talkx_campaigns_ab_winner_decided_by_fkey`, `fk_without_index:public.talkx_campaigns.talkx_campaigns_ab_winner_variant_id_fkey`, `fk_without_index:public.team_message_receipts.team_message_receipts_profile_id_fkey`
- **tabelas** alterado (9): `_bkp_261023.agent_stats`, `_bkp_261023.contacts`, `_bkp_261023.csat_surveys`, `_bkp_261023.functions_before`, `_bkp_261023.global_settings`, `_bkp_261023.policies_before`, `_bkp_261023.schema_migrations`, `_bkp_261023.team_messages`, `_bkp_261023.user_settings`

## 2026-11-23 20:14 UTC

- **colunas** adicionado (13): `public.talkx_ai_requests.cost_usd`, `public.talkx_ai_requests.created_at`, `public.talkx_ai_requests.created_by`, `public.talkx_ai_requests.entity_id`, `public.talkx_ai_requests.entity_type`, `public.talkx_ai_requests.id`, `public.talkx_ai_requests.input_hash`, `public.talkx_ai_requests.kind`, `public.talkx_ai_requests.model`, `public.talkx_ai_requests.output`, `public.talkx_ai_requests.status`, `public.talkx_ai_requests.tokens_in`, `public.talkx_ai_requests.tokens_out`
- **constraints** adicionado (7): `public.talkx_ai_requests.talkx_ai_requests_cost_usd_check`, `public.talkx_ai_requests.talkx_ai_requests_created_by_fkey`, `public.talkx_ai_requests.talkx_ai_requests_kind_check`, `public.talkx_ai_requests.talkx_ai_requests_pkey`, `public.talkx_ai_requests.talkx_ai_requests_status_check`, `public.talkx_ai_requests.talkx_ai_requests_tokens_in_check`, `public.talkx_ai_requests.talkx_ai_requests_tokens_out_check`
- **functions** alterado (1): `public.is_admin_or_supervisor(_user_id uuid)`
- **indexes** adicionado (4): `public.talkx_ai_requests_cache_idx`, `public.talkx_ai_requests_mes_idx`, `public.talkx_ai_requests_pkey`, `public.talkx_ai_requests_usuario_dia_idx`
- **lints** adicionado (1): `policy_auth_fn_not_wrapped:public.talkx_ai_requests.talkx_ai_requests_admin_read`
- **migrations** adicionado (1): `20261122190000_ia055_precos_entrada_e_saida`
- **policies (RLS)** adicionado (1): `public.talkx_ai_requests.talkx_ai_requests_admin_read`
- **tabelas** adicionado (1): `public.talkx_ai_requests`

## 2026-11-23 06:31 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_26`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_19`

## 2026-11-22 19:11 UTC

- **constraints** alterado (1): `public.ai_model_prices.ai_model_prices_unit_check`
- **functions** alterado (1): `public.ai_usage_cost_summary(p_since timestamp with time zone, p_until timestamp with time zone, p_top_functions integer)`

## 2026-11-22 12:17 UTC

- **colunas** adicionado (7): `public.assistant_profiles.ajuda`, `public.assistant_profiles.atividade`, `public.assistant_profiles.created_at`, `public.assistant_profiles.foco`, `public.assistant_profiles.tom`, `public.assistant_profiles.updated_at`, `public.assistant_profiles.user_id`
- **constraints** adicionado (5): `public.assistant_profiles.assistant_profiles_ajuda_check`, `public.assistant_profiles.assistant_profiles_atividade_check`, `public.assistant_profiles.assistant_profiles_pkey`, `public.assistant_profiles.assistant_profiles_tom_check`, `public.assistant_profiles.assistant_profiles_user_id_fkey`
- **indexes** adicionado (1): `public.assistant_profiles_pkey`
- **lints** adicionado (3): `policy_auth_fn_not_wrapped:public.assistant_profiles.assistant_profiles_insert`, `policy_auth_fn_not_wrapped:public.assistant_profiles.assistant_profiles_select`, `policy_auth_fn_not_wrapped:public.assistant_profiles.assistant_profiles_update`
- **migrations** adicionado (1): `20261121190000_assistant_profiles`
- **policies (RLS)** adicionado (3): `public.assistant_profiles.assistant_profiles_insert`, `public.assistant_profiles.assistant_profiles_select`, `public.assistant_profiles.assistant_profiles_update`
- **tabelas** adicionado (1): `public.assistant_profiles`

## 2026-11-22 03:16 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_25`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_18`

## 2026-11-21 21:10 UTC

- **functions** alterado (1): `public.talkx_campaign_segment_progress(p_campaign_id uuid)`

## 2026-11-21 12:17 UTC

- **functions** adicionado (2): `public.get_scheduled_report_cron_secret()`, `public.trigger_due_scheduled_report_configs()`
- **migrations** adicionado (1): `20261120080000_scheduled_report_cron`
- **vault secrets (nomes)** adicionado (1): `scheduled_report_cron_secret`

## 2026-11-21 04:14 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_24`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_17`

## 2026-11-20 05:14 UTC

- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_16`

## 2026-11-20 02:18 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_23`

## 2026-11-19 11:13 UTC

- **functions** adicionado (1): `public.set_talkx_campaign_ab(p_campaign_id uuid, p_expected_revision bigint, p_ab_enabled boolean, p_ab_metric text, p_ab_min_sample integer)`
- **functions** alterado (3): `public.is_admin_or_supervisor(_user_id uuid)`, `public.persist_talkx_recipient_message_snapshot(p_recipient_id uuid, p_claim_token uuid, p_personalized_message text, p_media_url text, p_media_type text, p_variant_id uuid)`, `public.talkx_next_recipients(p_campaign_id uuid, p_limit integer)`
- **migrations** adicionado (3): `20261118210000_talkx_next_recipients_variant_id`, `20261118220000_talkx_snapshot_variante_primeiro_vale`, `20261119010000_talkx_set_campaign_ab`
- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_22`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_15`

## 2026-11-18 21:12 UTC

- **colunas** adicionado (6): `public.talkx_campaigns.ab_enabled`, `public.talkx_campaigns.ab_metric`, `public.talkx_campaigns.ab_min_sample`, `public.talkx_campaigns.ab_winner_decided_at`, `public.talkx_campaigns.ab_winner_decided_by`, `public.talkx_campaigns.ab_winner_variant_id`
- **constraints** adicionado (4): `public.talkx_campaigns.talkx_campaigns_ab_metric_check`, `public.talkx_campaigns.talkx_campaigns_ab_min_sample_check`, `public.talkx_campaigns.talkx_campaigns_ab_winner_decided_by_fkey`, `public.talkx_campaigns.talkx_campaigns_ab_winner_variant_id_fkey`
- **constraints** alterado (1): `public.talkx_campaign_events.talkx_campaign_events_type_check`
- **functions** adicionado (2): `public.decide_talkx_ab_winner(p_campaign_id uuid, p_variant_id uuid)`, `public.talkx_campaign_variant_stats(p_campaign_id uuid)`
- **functions** alterado (4): `public.is_admin_or_supervisor(_user_id uuid)`, `public.snapshot_talkx_campaign_audience(p_campaign_id uuid, p_expected_revision bigint)`, `public.talkx_assign_variant(p_contact_id uuid, p_template_id uuid)`, `public.talkx_audience_query(p_rules jsonb, p_contact_ids uuid[], p_respect_suppression boolean)`
- **lints** adicionado (2): `fk_without_index:public.talkx_campaigns.talkx_campaigns_ab_winner_decided_by_fkey`, `fk_without_index:public.talkx_campaigns.talkx_campaigns_ab_winner_variant_id_fkey`
- **migrations** adicionado (1): `20261118190000_talkx_x065_ab_campanha`

## 2026-11-18 20:14 UTC

- **migrations** adicionado (1): `20261118200000_talkx_cron_indice_falha_suave`

## 2026-11-18 15:13 UTC

- **functions** adicionado (2): `public.talkx_template_library_stats(p_days integer, p_top integer)`, `public.talkx_template_stats(p_template_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)`
- **functions** alterado (2): `public.talkx_template_library_kpis()`, `public.talkx_template_metrics(p_template_id uuid)`
- **migrations** adicionado (1): `20261117120000_talkx_x091_template_stats_rpcs`

## 2026-11-18 03:16 UTC

- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_14`

## 2026-11-18 01:15 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_21`

## 2026-11-17 17:18 UTC

- **functions** alterado (3): `public.current_profile_id()`, `public.is_admin_or_supervisor(_user_id uuid)`, `public.is_team_conversation_member(_user_id uuid, _conversation_id uuid)`
- **migrations** adicionado (1): `20261021000000_recreate_team_message_receipt_policies_canonical`

## 2026-11-17 16:18 UTC

- **functions** alterado (9): `public.complete_talkx_campaign_if_drained(p_campaign_id uuid)`, `public.get_talkx_cron_secret()`, `public.is_admin_or_supervisor(_user_id uuid)`, `public.kick_talkx_campaign(p_campaign_id uuid)`, `public.purge_talkx_expired_data(p_limit integer)`, `public.sweep_talkx_stuck_recipients(p_limit integer)`, `public.talkx_engine_alerts()`, `public.talkx_engine_cron_runs(p_limit integer)`, `public.trigger_talkx_engine_tick()`
- **migrations** adicionado (1): `20261117110000_talkx_cron_tick_lock_e_janela`

## 2026-11-17 04:15 UTC

- **functions** alterado (1): `public.commit_copilot_tick(p_session_id uuid, p_state_version integer, p_patch jsonb, p_insights jsonb)`

## 2026-11-17 00:35 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_20`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_13`

## 2026-11-16 16:18 UTC

- **colunas** adicionado (10): `public.copilot_retention_aggregates.agg_date`, `public.copilot_retention_aggregates.avg_temperature`, `public.copilot_retention_aggregates.brinde_complete`, `public.copilot_retention_aggregates.created_at`, `public.copilot_retention_aggregates.id`, `public.copilot_retention_aggregates.insights_gen`, `public.copilot_retention_aggregates.profile_id`, `public.copilot_retention_aggregates.sessions_opened`, `public.copilot_retention_aggregates.ticks_processed`, `public.copilot_retention_aggregates.updated_at`
- **constraints** adicionado (3): `public.copilot_retention_aggregates.copilot_retention_aggregates_pkey`, `public.copilot_retention_aggregates.copilot_retention_aggregates_profile_id_agg_date_key`, `public.copilot_retention_aggregates.copilot_retention_aggregates_profile_id_fkey`
- **functions** adicionado (1): `public.run_copilot_retention()`
- **indexes** adicionado (4): `public.copilot_retention_aggregates_pkey`, `public.copilot_retention_aggregates_profile_id_agg_date_key`, `public.idx_copilot_insights_created_at`, `public.idx_copilot_retention_profile_date`
- **lints** adicionado (1): `policy_auth_fn_not_wrapped:public.copilot_retention_aggregates.own_retention`
- **migrations** adicionado (1): `20261115050000_copilot_retention_aggregates`
- **policies (RLS)** adicionado (2): `public.copilot_retention_aggregates.own_retention`, `public.copilot_retention_aggregates.service_role_retention`
- **tabelas** adicionado (1): `public.copilot_retention_aggregates`

## 2026-11-16 15:21 UTC

- **functions** adicionado (1): `public.commit_copilot_tick(p_session_id uuid, p_state_version integer, p_patch jsonb, p_insights jsonb)`
- **functions** alterado (1): `public.is_admin_or_supervisor(_user_id uuid)`
- **migrations** adicionado (2): `20261115030000_commit_copilot_tick`, `20261115040000_copilot_rls_supervisor`
- **policies (RLS)** alterado (6): `public.copilot_conversation_scores.copilot_conversation_scores_insert`, `public.copilot_conversation_scores.copilot_conversation_scores_select`, `public.copilot_conversation_scores.copilot_conversation_scores_update`, `public.copilot_help_requests.copilot_help_requests_select`, `public.copilot_learning_moments.copilot_learning_moments_insert`, `public.copilot_learning_moments.copilot_learning_moments_select`

## 2026-11-16 04:17 UTC

- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_12`

## 2026-11-16 03:18 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_19`

## 2026-11-15 20:12 UTC

- **functions** alterado (3): `public.auto_pause_instance(p_instance text, p_minutes integer, p_reason text)`, `public.pause_instance(p_instance text, p_minutes integer, p_reason text)`, `public.resume_instance(p_instance text)`

## 2026-11-15 06:21 UTC

- **functions** alterado (8): `public.get_multiplix_cron_secret()`, `public.is_instance_paused(p_instance text)`, `public.multiplix_connection_daily_usage(p_connection_id uuid)`, `public.multiplix_dispatch_window_is_open(p_dispatch_id uuid)`, `public.sweep_multiplix_stuck_items(p_limit integer)`, `public.sweep_multiplix_stuck_recipients(p_limit integer)`, `public.transition_multiplix_dispatch(p_dispatch_id uuid, p_action text, p_pause_reason text)`, `public.trigger_pending_multiplix_dispatches()`
- **migrations** adicionado (1): `20261115020000_multiplix_retoma_instance_paused`

## 2026-11-15 03:16 UTC

- **colunas** adicionado (1): `public.copilot_sessions.last_contact_message_at`
- **functions** adicionado (1): `public.enqueue_copilot_tick_on_contact_message()`
- **migrations** adicionado (1): `20261115010000_copilot_live_motor`
- **triggers** adicionado (1): `public.messages.trg_copilot_tick_on_contact_message`

## 2026-11-15 02:18 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_18`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_11`

## 2026-11-14 19:10 UTC

- **colunas** adicionado (4): `public.away_message_log.contact_id`, `public.away_message_log.id`, `public.away_message_log.sent_at`, `public.away_message_log.whatsapp_connection_id`
- **constraints** adicionado (3): `public.away_message_log.away_message_log_contact_id_fkey`, `public.away_message_log.away_message_log_pkey`, `public.away_message_log.away_message_log_whatsapp_connection_id_fkey`
- **functions** adicionado (2): `public.record_away_message(p_contact_id uuid, p_connection_id uuid)`, `public.should_send_away_message(p_contact_id uuid, p_connection_id uuid)`
- **functions** alterado (16): `public.accept_department_invite(p_code text)`, `public.admin_set_role(_user_id uuid, _role app_role)`, `public.create_department_invite(p_department_id uuid, p_max_uses integer, p_expires_hours integer)`, `public.fail_outbound_message(p_message_id uuid, p_claim_token uuid, p_retryable boolean)`, `public.is_admin(_user_id uuid)`, `public.is_admin_or_supervisor(_user_id uuid)`, `public.is_within_business_hours(connection_id uuid)`, `public.merge_brinde_state(p_session_id uuid, p_delta jsonb, p_version integer)`, `public.merge_contacts_atomic(p_primary_id uuid, p_secondary_ids uuid[], p_merged_fields jsonb)`, `public.multiplix_bump_version_on_dispatch_edit()`, `public.multiplix_confirm_dispatch(p_dispatch_id uuid, p_actor_id uuid, p_allow_manage_all boolean, p_expected_version integer, p_scheduled_at timestamp with time zone, p_correlation_id uuid)`, `public.reject_repeated_conversation_closure_without_reopen()`, `public.require_contact_edit_permission(p_contact_id uuid)`, `public.set_conversation_status(p_contact_id uuid, p_next text, p_reason text)`, `public.set_conversations_status(p_contact_ids uuid[], p_next text, p_expected_current text, p_reason text, p_restore boolean)`, `public.transition_multiplix_dispatch(p_dispatch_id uuid, p_action text, p_pause_reason text)`
- **indexes** adicionado (2): `public.away_message_log_pkey`, `public.idx_away_message_log_contato_conexao_sent_at`
- **lints** adicionado (3): `fk_without_index:public.away_message_log.away_message_log_whatsapp_connection_id_fkey`, `policy_auth_fn_not_wrapped:public.department_invites.dept_invites_select_admin`, `rls_no_policies:public.away_message_log`
- **migrations** adicionado (6): `20261113170200_away_message_rpcs`, `20261114120000_set_conversations_status_encerramento_repetido`, `20261114120500_merge_contacts_phone_secundario_unique`, `20261114121000_department_invites_restringe_select`, `20261114130000_multiplix_start_exige_confirmacao`, `20261114173000_fix_merge_brinde_state_execute_grant`
- **policies (RLS)** adicionado (1): `public.department_invites.dept_invites_select_admin`
- **policies (RLS)** removido (1): `public.department_invites.dept_invites_select_authenticated`
- **tabelas** adicionado (1): `public.away_message_log`

## 2026-11-14 14:29 UTC

- **functions** alterado (1): `public.set_conversation_status(p_contact_id uuid, p_next text, p_reason text)`

## 2026-11-14 05:09 UTC

- **constraints** removido (1): `public.user_roles.user_roles_no_special_agent`
- **constraints** alterado (1): `public.contacts.chk_conversation_status_values`
- **functions** adicionado (4): `public.guard_conversation_status_direct_update()`, `public.set_conversations_status(p_contact_ids uuid[], p_next text, p_expected_current text, p_reason text, p_restore boolean)`, `public.sweep_stuck_outbound_messages(p_min_age interval, p_limit integer)`, `public.transfer_conversation(p_contact_id uuid, p_to_agent_id uuid, p_to_queue_id uuid, p_note text, p_expected_agent_id uuid, p_expect_unassigned boolean)`
- **functions** removido (1): `public.transfer_conversation(p_contact_id uuid, p_to_agent_id uuid, p_to_queue_id uuid, p_note text, p_expected_agent_id uuid)`
- **functions** alterado (24): `public.admin_set_role(_user_id uuid, _role app_role)`, `public.can_edit_contact(p_assigned_to uuid, p_queue_id uuid)`, `public.can_edit_contact(p_assigned_to uuid, p_queue_id uuid, p_visible_agent_ids uuid[], p_profile_id uuid, p_is_admin boolean)`, `public.dispatch_scheduled_messages(p_limit integer)`, `public.effective_role(_user_id uuid)`, `public.enforce_conversation_status_transition()`, `public.enqueue_group_outbound_message(p_group_id uuid, p_client_message_id uuid, p_content text, p_message_type text, p_media_url text, p_reply_to_id uuid, p_whatsapp_connection_id uuid, p_caption text)`, `public.enqueue_outbound_message(p_contact_id uuid, p_client_message_id uuid, p_content text, p_message_type text, p_media_url text, p_reply_to_id uuid, p_whatsapp_connection_id uuid, p_caption text)`, `public.enqueue_rich_outbound_message(p_contact_id uuid, p_client_message_id uuid, p_display_content text, p_message_type text, p_delivery_payload jsonb, p_reply_to_id uuid, p_whatsapp_connection_id uuid)`, `public.force_conversation_closure_author()`, `public.get_my_protection_policy()`, `public.get_profile_id_for_user(_user_id uuid)`, `public.has_role(_user_id uuid, _role app_role)`, `public.is_admin(_user_id uuid)`, `public.is_admin_or_supervisor(_user_id uuid)`, `public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)`, `public.log_message_attempt(p_message_id uuid, p_attempt_no integer, p_outcome text, p_error_code text, p_error_message text, p_provider_status integer, p_provider_response jsonb, p_duration_ms integer)`, `public.mark_outbound_post_started(p_message_id uuid, p_claim_token uuid)`, `public.multiplix_audiences_validate_shared_roles()`, `public.require_contact_edit_permission(p_contact_id uuid)`, `public.resolve_outbound_whatsapp_connection(p_explicit_connection_id uuid, p_assigned_connection_id uuid)`, `public.set_conversation_status(p_contact_id uuid, p_next text, p_reason text)`, `public.sync_profile_role_from_user_roles()`, `public.user_has_permission(_user_id uuid, _permission_name text)`
- **migrations** adicionado (5): `20261113171300_conversation_status_regras_e_so_por_rpc`, `20261113171400_varredura_mensagens_presas_em_enviando`, `20261113171500_transfer_conversation_cas_sem_dono`, `20261113171600_agendadas_conexao_do_contato_caida`, `20261113172000_remove_enum_special_agent`
- **triggers** adicionado (1): `public.contacts.trg_contacts_conversation_status_rpc_only`
- **types/enums** alterado (1): `public.app_role`

## 2026-11-14 03:48 UTC

- **lints** removido (1): `view_security_definer:public.catalog_send_stats`
- **views** alterado (1): `public.catalog_send_stats`

## 2026-11-14 03:15 UTC

- **constraints** alterado (1): `public.chatbot_flows.chatbot_flows_trigger_type_check`
- **functions** adicionado (1): `public.update_own_profile(p_display_name text, p_avatar_url text, p_phone text, p_signature text, p_birthday text)`
- **functions** removido (1): `public.update_own_profile(p_display_name text, p_avatar_url text, p_phone text, p_email text, p_signature text, p_birthday text)`
- **functions** alterado (21): `public.add_agent_xp(p_profile_id uuid, p_xp integer)`, `public.ai_is_canonical_churn_risk(p_value text)`, `public.ai_is_canonical_priority(p_value text)`, `public.ai_is_canonical_sentiment(p_value text)`, `public.ai_is_canonical_urgency(p_value text)`, `public.ai_text_array(p_value jsonb)`, `public.copilot_sessions_updated_at()`, `public.current_profile_id()`, `public.enqueue_outbound_message(p_contact_id uuid, p_client_message_id uuid, p_content text, p_message_type text, p_media_url text, p_reply_to_id uuid, p_whatsapp_connection_id uuid, p_caption text)`, `public.grant_agent_achievement(p_profile_id uuid, p_type text, p_name text, p_description text, p_xp_reward integer)`, `public.handle_conversation_closure_gamification()`, `public.increment_agent_messages(p_profile_id uuid, p_type text)`, `public.is_admin_or_supervisor(_user_id uuid)`, `public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)`, `public.is_within_business_hours(connection_id uuid)`, `public.secd_caller_ok(p_subject_user_id uuid, p_admin_only boolean)`, `public.set_default_whatsapp_connection(p_connection_id uuid)`, `public.talk_me_eligible_waiting_contacts(p_queue_id uuid, p_contact_id uuid)`, `public.talk_me_list_pending_messages(p_contact_id uuid, p_limit integer)`, `public.talkx_campaign_window_open(p_campaign_id uuid, p_at timestamp with time zone)`, `public.update_agent_streak(p_profile_id uuid, p_increment boolean)`
- **indexes** adicionado (3): `public.chatbot_flows_ai_l1_one_active_idx`, `public.idx_audit_logs_details_path_ops`, `public.sla_configurations_single_active_default_idx`
- **lints** adicionado (1): `policy_auth_fn_not_wrapped:storage.objects.whatsapp media readable via visible message`
- **lints** removido (2): `policy_auth_fn_not_wrapped:public.audit_logs.Only admins can view audit logs`, `policy_auth_fn_not_wrapped:storage.objects.Users can delete own team chat files`
- **migrations** adicionado (12): `20261113150000_audit_logs_trilha_conexao_rapida`, `20261113170000_fix_search_path_funcoes_ai_copilot`, `20261113170100_revoke_maintain_anon_authenticated`, `20261113170300_reaplica_business_hours_overnight`, `20261113170400_reaplica_whatsapp_media_select_scope`, `20261113170500_reaplica_talk_me_pending_history`, `20261113170600_reaplica_gamification_revoke_rpcs`, `20261113170700_reaplica_sla_single_default`, `20261113170800_reaplica_talkx_n102_window`, `20261113170900_reaplica_update_own_profile_sem_email`, `20261113171100_reaplica_chatbot_flows_ai_l1`, `20261113171200_reaplica_parciais_comments_team_chat_delete`
- **policies (RLS)** alterado (3): `public.audit_logs.Only admins can view audit logs`, `storage.objects.Users can delete own team chat files`, `storage.objects.whatsapp media readable via visible message`

## 2026-11-14 01:21 UTC

- **functions** alterado (5): `public.fail_outbound_message(p_message_id uuid, p_claim_token uuid, p_retryable boolean)`, `public.is_admin_or_supervisor(_user_id uuid)`, `public.resolve_unconfirmed_message(p_message_id uuid, p_outcome text)`, `public.talkx_campaign_recipients_page(p_campaign_id uuid, p_page_size integer, p_cursor text, p_status text, p_search text, p_segment_id uuid)`, `public.talkx_suppression_reasons_guard()`
- **indexes** adicionado (1): `public.talkx_suppression_reasons_label_lower_key`
- **migrations** adicionado (3): `20261112170000_resolve_unconfirmed_somente_sending`, `20261112171000_talkx_recipients_page_aceita_cancelled`, `20261112172000_talkx_suppression_reasons_hardening`
- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_17`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_10`

## 2026-11-13 23:34 UTC

- **functions** alterado (2): `public.has_role(_user_id uuid, _role app_role)`, `public.set_instance_token(p_connection_id uuid, p_token text)`

## 2026-11-13 17:50 UTC

- **roles** adicionado (1): `zapp_agente_leitura`
- **roles** alterado (1): `postgres`

## 2026-11-13 16:05 UTC

- **functions** adicionado (2): `public.force_conversation_closure_author()`, `public.resolve_outbound_whatsapp_connection(p_explicit_connection_id uuid, p_assigned_connection_id uuid)`
- **functions** removido (1): `public.transfer_conversation(p_contact_id uuid, p_to_agent_id uuid, p_to_queue_id uuid, p_note text)`
- **functions** alterado (5): `public.enqueue_group_outbound_message(p_group_id uuid, p_client_message_id uuid, p_content text, p_message_type text, p_media_url text, p_reply_to_id uuid, p_whatsapp_connection_id uuid, p_caption text)`, `public.enqueue_outbound_message(p_contact_id uuid, p_client_message_id uuid, p_content text, p_message_type text, p_media_url text, p_reply_to_id uuid, p_whatsapp_connection_id uuid, p_caption text)`, `public.enqueue_rich_outbound_message(p_contact_id uuid, p_client_message_id uuid, p_display_content text, p_message_type text, p_delivery_payload jsonb, p_reply_to_id uuid, p_whatsapp_connection_id uuid)`, `public.get_profile_id_for_user(_user_id uuid)`, `public.transfer_conversation(p_contact_id uuid, p_to_agent_id uuid, p_to_queue_id uuid, p_note text, p_expected_agent_id uuid)`
- **migrations** adicionado (3): `20261113130000_envio_sem_conexao_de_teste_nem_fallback_silencioso`, `20261113130100_transfer_conversation_unica_e_fila_aguardando`, `20261113130300_conversation_closures_closed_by_do_autor`
- **policies (RLS)** alterado (1): `public.conversation_closures.Agents can create closures for their contacts`
- **triggers** adicionado (1): `public.conversation_closures.trg_conversation_closures_force_author`

## 2026-11-13 03:45 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_16`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_09`

## 2026-11-13 02:51 UTC

- **functions** alterado (5): `public.is_admin_or_supervisor(_user_id uuid)`, `public.mark_pause_investigated(p_pause_id uuid, p_notes text)`, `public.talkx_blacklist_audit_trigger()`, `public.talkx_blacklist_no_delete()`, `public.talkx_campaign_recipients_page(p_campaign_id uuid, p_page_size integer, p_cursor text, p_status text, p_search text, p_segment_id uuid)`

## 2026-11-12 22:24 UTC

- **migrations** alterado (2): `20261031160000_copilot_radar_delta_columns`, `20261112160000_talkx_blacklist_reconcilia_e_higiene`

## 2026-11-12 21:13 UTC

- **colunas** adicionado (2): `public.talkx_blacklist.import_batch_id`, `public.talkx_blacklist.removal_reason`
- **functions** adicionado (1): `public.talkx_blacklist_no_delete()`
- **functions** alterado (3): `public.mark_pause_investigated(p_pause_id uuid, p_notes text)`, `public.sanitize_reset_request()`, `public.talkx_blacklist_audit_trigger()`
- **indexes** adicionado (3): `public.idx_instance_pauses_investigated_by`, `public.idx_talkx_blacklist_reason_code`, `public.idx_talkx_suppression_reasons_created_by`
- **lints** removido (4): `fk_without_index:public.instance_pauses.instance_pauses_investigated_by_fkey`, `fk_without_index:public.talkx_blacklist.talkx_blacklist_reason_code_fk`, `fk_without_index:public.talkx_suppression_reasons.talkx_suppression_reasons_created_by_fkey`, `policy_auth_fn_not_wrapped:public.talkx_blacklist.Admins can remove from blacklist`
- **migrations** adicionado (1): `20261112160000_talkx_blacklist_reconcilia_e_higiene`
- **policies (RLS)** removido (1): `public.talkx_blacklist.Admins can remove from blacklist`
- **triggers** adicionado (2): `public.talkx_blacklist.trg_talkx_blacklist_audit`, `public.talkx_blacklist.trg_talkx_blacklist_no_delete`

## 2026-11-12 11:37 UTC

- **colunas** adicionado (6): `public.copilot_insights.data`, `public.copilot_insights.latency_ms`, `public.copilot_insights.tier`, `public.copilot_sessions.intent`, `public.copilot_sessions.last_processed_message_at`, `public.copilot_sessions.sentiment`
- **colunas** alterado (1): `public.copilot_sessions.comm_style`
- **constraints** adicionado (1): `public.copilot_insights.copilot_insights_tier_check`
- **functions** alterado (1): `public.mark_outbound_post_started(p_message_id uuid, p_claim_token uuid)`
- **migrations** adicionado (1): `20261031160000_copilot_radar_delta_columns`

## 2026-11-12 11:05 UTC

- **functions** alterado (1): `public.resolve_unconfirmed_message(p_message_id uuid, p_outcome text)`

## 2026-11-12 10:18 UTC

- **colunas** adicionado (2): `public.messages.delivery_post_started_at`, `public.messages.manually_resolved_at`
- **colunas** alterado (1): `public.talkx_blacklist.reason_code`
- **constraints** adicionado (1): `public.talkx_blacklist.talkx_blacklist_reason_code_fk`
- **functions** adicionado (7): `public.mark_outbound_post_started(p_message_id uuid, p_claim_token uuid)`, `public.resolve_unconfirmed_message(p_message_id uuid, p_outcome text)`, `public.talkx_blacklist_audit_trigger()`, `public.talkx_blacklist_reason_active_guard()`, `public.talkx_block_recipient(p_recipient_id uuid)`, `public.talkx_campaign_recipients_page(p_campaign_id uuid, p_page_size integer, p_cursor text, p_status text, p_search text, p_segment_id uuid)`, `public.talkx_suppress_contact(p_contact_id uuid, p_phone text, p_reason text, p_reason_code text, p_origin text, p_source_message_id uuid, p_campaign_id uuid)`
- **functions** removido (2): `public.talkx_campaign_recipients_page(p_campaign_id uuid, p_page_size integer, p_cursor text, p_status text, p_search text)`, `public.talkx_suppress_contact(p_contact_id uuid, p_phone text, p_reason text, p_reason_code talkx_blacklist_reason, p_origin text, p_source_message_id uuid, p_campaign_id uuid)`
- **functions** alterado (5): `public.claim_outbound_message(p_message_id uuid, p_agent_id uuid, p_worker text, p_lease_seconds integer)`, `public.fail_outbound_message(p_message_id uuid, p_claim_token uuid, p_retryable boolean)`, `public.guard_message_delivery_internal_fields()`, `public.is_admin_or_supervisor(_user_id uuid)`, `public.talkx_suppression_reasons_guard()`
- **lints** adicionado (1): `fk_without_index:public.talkx_blacklist.talkx_blacklist_reason_code_fk`
- **migrations** adicionado (5): `20261107180000_talkx_campaign_recipients_page_add_segment`, `20261108100000_talkx_suppression_reasons`, `20261108204000_revoke_anon_select_grants_all_tables`, `20261111160000_outbound_post_started`, `20261111170000_talkx_block_recipient`
- **triggers** adicionado (1): `public.talkx_blacklist.trg_talkx_blacklist_reason_active`
- **types/enums** removido (1): `public.talkx_blacklist_reason`
- **views** alterado (1): `public.talkx_campaign_optouts`

## 2026-11-12 09:00 UTC

- **functions** alterado (2): `public.is_admin_or_supervisor(_user_id uuid)`, `public.talkx_suppress_contact(p_contact_id uuid, p_phone text, p_reason text, p_reason_code talkx_blacklist_reason, p_origin text, p_source_message_id uuid, p_campaign_id uuid)`

## 2026-11-12 03:35 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_15`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_08`

## 2026-11-12 02:15 UTC

- **functions** alterado (3): `public.talkx_campaign_queue_by_segment(p_campaign_id uuid)`, `public.talkx_campaign_ranking(p_limit integer, p_metric text)`, `public.talkx_top_segments(p_limit integer)`

## 2026-11-12 01:38 UTC

- **functions** alterado (3): `public.get_profile_id_for_user(_user_id uuid)`, `public.is_admin_or_supervisor(_user_id uuid)`, `public.mark_pause_investigated(p_pause_id uuid, p_notes text)`

## 2026-11-12 00:07 UTC

- **colunas** adicionado (3): `public.instance_pauses.investigated_at`, `public.instance_pauses.investigated_by`, `public.instance_pauses.investigation_notes`
- **constraints** adicionado (4): `public.instance_pauses.instance_pauses_investigacao_completa`, `public.instance_pauses.instance_pauses_investigated_by_fkey`, `public.instance_pauses.instance_pauses_notas_sem_html`, `public.instance_pauses.instance_pauses_notas_tamanho`
- **functions** adicionado (1): `public.mark_pause_investigated(p_pause_id uuid, p_notes text)`
- **functions** alterado (2): `public.get_profile_id_for_user(_user_id uuid)`, `public.is_admin_or_supervisor(_user_id uuid)`
- **lints** adicionado (1): `fk_without_index:public.instance_pauses.instance_pauses_investigated_by_fkey`
- **migrations** adicionado (1): `20261111181000_instance_pause_investigation`

## 2026-11-11 22:22 UTC

- **colunas** adicionado (9): `public.copilot_sessions.brinde_state`, `public.talkx_suppression_reasons.active`, `public.talkx_suppression_reasons.code`, `public.talkx_suppression_reasons.created_at`, `public.talkx_suppression_reasons.created_by`, `public.talkx_suppression_reasons.is_system`, `public.talkx_suppression_reasons.label`, `public.talkx_suppression_reasons.sort_order`, `public.talkx_suppression_reasons.tone`
- **constraints** adicionado (4): `public.talkx_suppression_reasons.talkx_suppression_reasons_code_check`, `public.talkx_suppression_reasons.talkx_suppression_reasons_created_by_fkey`, `public.talkx_suppression_reasons.talkx_suppression_reasons_pkey`, `public.talkx_suppression_reasons.talkx_suppression_reasons_tone_check`
- **functions** adicionado (1): `public.talkx_suppression_reasons_guard()`
- **functions** alterado (3): `public.create_department_invite(p_department_id uuid, p_max_uses integer, p_expires_hours integer)`, `public.is_admin_or_supervisor(_user_id uuid)`, `public.talkx_suppress_contact(p_contact_id uuid, p_phone text, p_reason text, p_reason_code talkx_blacklist_reason, p_origin text, p_source_message_id uuid, p_campaign_id uuid)`
- **indexes** adicionado (1): `public.talkx_suppression_reasons_pkey`
- **lints** adicionado (3): `fk_without_index:public.talkx_suppression_reasons.talkx_suppression_reasons_created_by_fkey`, `policy_auth_fn_not_wrapped:public.talkx_suppression_reasons.talkx_suppression_reasons_update`, `policy_auth_fn_not_wrapped:public.talkx_suppression_reasons.talkx_suppression_reasons_write`
- **migrations** adicionado (2): `20261031140000_copilot_sessions_brinde_state`, `20261108090000_fix_create_department_invite_search_path`
- **policies (RLS)** adicionado (3): `public.talkx_suppression_reasons.talkx_suppression_reasons_read`, `public.talkx_suppression_reasons.talkx_suppression_reasons_update`, `public.talkx_suppression_reasons.talkx_suppression_reasons_write`
- **tabelas** adicionado (1): `public.talkx_suppression_reasons`
- **triggers** adicionado (1): `public.talkx_suppression_reasons.talkx_suppression_reasons_guard_trigger`

## 2026-11-11 17:44 UTC

- **functions** alterado (4): `public.claim_outbound_message(p_message_id uuid, p_agent_id uuid, p_worker text, p_lease_seconds integer)`, `public.fail_outbound_message(p_message_id uuid, p_claim_token uuid, p_retryable boolean)`, `public.guard_message_delivery_internal_fields()`, `public.is_admin_or_supervisor(_user_id uuid)`

## 2026-11-11 01:18 UTC

- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_07`

## 2026-11-11 00:35 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_14`

## 2026-11-10 16:16 UTC

- **functions** alterado (1): `public.is_admin_or_supervisor(_user_id uuid)`

## 2026-11-10 02:43 UTC

- **functions** alterado (2): `public.current_profile_id()`, `public.is_admin(_user_id uuid)`

## 2026-11-10 01:34 UTC

- **functions** alterado (1): `public.merge_brinde_state(p_session_id uuid, p_delta jsonb, p_version integer)`
- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_13`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_06`

## 2026-11-09 20:30 UTC

- **migrations** adicionado (4): `20261108201000_talkx_x074_analytics_rpcs`, `20261108202000_talkx_x086_template_metrics_rpcs`, `20261108203000_talkx_x058_campaign_queue_segment`, `20261108211000_talkx_campaign_resume_precheck`
- **migrations** removido (4): `20261108201000_`, `20261108202000_`, `20261108203000_`, `20261108211000_`

## 2026-11-09 16:17 UTC

- **functions** adicionado (1): `public.talkx_campaign_resume_precheck(p_campaign_id uuid)`
- **functions** alterado (1): `public.is_admin_or_supervisor(_user_id uuid)`
- **migrations** adicionado (4): `20261108201000_`, `20261108202000_`, `20261108203000_`, `20261108211000_`

## 2026-11-09 13:48 UTC

- **functions** alterado (1): `public.is_admin_or_supervisor(_user_id uuid)`

## 2026-11-09 10:54 UTC

- **migrations** alterado (3): `20261026160000_restore_rls_security_alerts_talkx_blacklist`, `20261026200000_contact_notes_pinned`, `20261026210000_dashboard_kpi_periodo_aditivo`

## 2026-11-09 04:09 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_12`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_05`

## 2026-11-08 23:22 UTC

- **functions** alterado (1): `public.is_admin_or_supervisor(_user_id uuid)`
- **migrations** alterado (2): `20261007010129_multiplix_drain_enum_cast`, `20261009011641_multiplix_drain_enum_cast`

## 2026-11-08 21:48 UTC

- **functions** adicionado (6): `public.talkx_campaign_heatmap(p_campaign_id uuid)`, `public.talkx_campaign_queue_by_segment(p_campaign_id uuid)`, `public.talkx_campaign_ranking(p_limit integer, p_metric text)`, `public.talkx_template_library_kpis()`, `public.talkx_template_metrics(p_template_id uuid)`, `public.talkx_top_segments(p_limit integer)`
- **functions** alterado (1): `public.is_admin_or_supervisor(_user_id uuid)`

## 2026-11-08 05:52 UTC

- **functions** alterado (1): `public.search_insights(p_days integer)`

## 2026-11-08 01:15 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_11`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_04`

## 2026-11-07 21:42 UTC

- **migrations** adicionado (1): `20261107143000_reconciliar_rls_department_policies`

## 2026-11-07 20:39 UTC

- **functions** alterado (3): `public.get_profile_id_for_user(_user_id uuid)`, `public.get_visible_agent_ids(_user_id uuid)`, `public.is_admin_or_supervisor(_user_id uuid)`

## 2026-11-07 19:47 UTC

- **functions** alterado (2): `public.current_profile_id()`, `public.is_admin(_user_id uuid)`

## 2026-11-07 17:18 UTC

- **migrations** adicionado (1): `20261107170000_fix_message_reactions_rls`
- **policies (RLS)** alterado (3): `public.message_reactions.message_reactions_delete_policy`, `public.message_reactions.message_reactions_insert_policy`, `public.message_reactions.message_reactions_update_policy`

## 2026-11-07 16:29 UTC

- **functions** alterado (2): `public.is_admin_or_supervisor(_user_id uuid)`, `public.register_agent_active_day(p_profile_id uuid, p_day date)`

## 2026-11-07 14:50 UTC

- **functions** alterado (2): `public.close_conversation_atomic(p_contact_id uuid, p_client_request_id uuid, p_close_reason text, p_outcome text, p_classification text, p_notes text)`, `public.is_admin_or_supervisor(_user_id uuid)`

## 2026-11-07 14:11 UTC

- **migrations** alterado (1): `20261103223000_ai_usage_outbox_drain_cron`

## 2026-11-07 13:55 UTC

- **functions** alterado (2): `public.increment_agent_resolutions(p_profile_id uuid)`, `public.update_agent_streak(p_profile_id uuid, p_increment boolean)`
- **lints** adicionado (15): `policy_auth_fn_not_wrapped:public.copilot_conversation_scores.copilot_conversation_scores_insert`, `policy_auth_fn_not_wrapped:public.copilot_conversation_scores.copilot_conversation_scores_select`, `policy_auth_fn_not_wrapped:public.copilot_conversation_scores.copilot_conversation_scores_update`, `policy_auth_fn_not_wrapped:public.copilot_help_requests.copilot_help_requests_insert`, `policy_auth_fn_not_wrapped:public.copilot_help_requests.copilot_help_requests_select`, `policy_auth_fn_not_wrapped:public.copilot_learning_moments.copilot_learning_moments_insert`, `policy_auth_fn_not_wrapped:public.copilot_learning_moments.copilot_learning_moments_select`, `policy_auth_fn_not_wrapped:public.copilot_objection_catalog.copilot_objection_catalog_insert`, `policy_auth_fn_not_wrapped:public.copilot_outcomes.copilot_outcomes_insert`, `policy_auth_fn_not_wrapped:public.copilot_outcomes.copilot_outcomes_select`, `policy_auth_fn_not_wrapped:public.copilot_seller_settings.copilot_seller_settings_insert`, `policy_auth_fn_not_wrapped:public.copilot_seller_settings.copilot_seller_settings_select`, `policy_auth_fn_not_wrapped:public.copilot_seller_settings.copilot_seller_settings_update`, `policy_auth_fn_not_wrapped:public.copilot_usage.copilot_usage_insert`, `policy_auth_fn_not_wrapped:public.copilot_usage.copilot_usage_select`
- **lints** removido (1): `rls_no_policies:public._rb_message_reactions_one_per_agent_20261107121000`
- **migrations** adicionado (4): `20261107123000_finalize_goal_notification_and_reaction_backup_policies`, `20261107133000_fix_copilot_rls_open_policies`, `20261107153000_fix_gamification_streak_resolutions_guard`, `20261107163000_fix_copilot_rls_wrong_join_column`
- **migrations** alterado (1): `20261010062941_talkx_campaign_recipients_page`
- **policies (RLS)** adicionado (1): `public._rb_message_reactions_one_per_agent_20261107121000.No client access to reaction rollback backup`
- **policies (RLS)** removido (1): `public.notifications.Block authenticated notification inserts`
- **policies (RLS)** alterado (15): `public.copilot_conversation_scores.copilot_conversation_scores_insert`, `public.copilot_conversation_scores.copilot_conversation_scores_select`, `public.copilot_conversation_scores.copilot_conversation_scores_update`, `public.copilot_help_requests.copilot_help_requests_insert`, `public.copilot_help_requests.copilot_help_requests_select`, `public.copilot_learning_moments.copilot_learning_moments_insert`, `public.copilot_learning_moments.copilot_learning_moments_select`, `public.copilot_objection_catalog.copilot_objection_catalog_insert`, `public.copilot_outcomes.copilot_outcomes_insert`, `public.copilot_outcomes.copilot_outcomes_select`, `public.copilot_seller_settings.copilot_seller_settings_insert`, `public.copilot_seller_settings.copilot_seller_settings_select`, `public.copilot_seller_settings.copilot_seller_settings_update`, `public.copilot_usage.copilot_usage_insert`, `public.copilot_usage.copilot_usage_select`

## 2026-11-07 13:42 UTC

- **colunas** adicionado (7): `public._rb_message_reactions_one_per_agent_20261107121000.contact_id`, `public._rb_message_reactions_one_per_agent_20261107121000.created_at`, `public._rb_message_reactions_one_per_agent_20261107121000.emoji`, `public._rb_message_reactions_one_per_agent_20261107121000.id`, `public._rb_message_reactions_one_per_agent_20261107121000.message_id`, `public._rb_message_reactions_one_per_agent_20261107121000.user_id`, `public.contacts.phone_search_digits`
- **constraints** adicionado (2): `public._rb_message_reactions_one_per_agent_20261107121000._rb_message_reactions_one_per_agent_20261107121000_pkey`, `public.message_reactions.message_reactions_one_per_agent`
- **indexes** adicionado (3): `public._rb_message_reactions_one_per_agent_20261107121000_pkey`, `public.idx_contacts_phone_search_digits_trgm`, `public.message_reactions_one_per_agent`
- **lints** adicionado (1): `rls_no_policies:public._rb_message_reactions_one_per_agent_20261107121000`
- **lints** removido (1): `policy_auth_fn_not_wrapped:public.notifications.Users can update own notifications`
- **migrations** adicionado (3): `20261107120000_goal_notifications_own_insert_policy`, `20261107121000_message_reactions_one_per_agent`, `20261107122000_contacts_phone_search_digits`
- **policies (RLS)** adicionado (2): `public.notifications.Users can insert own goal notifications`, `public.notifications.Users can mark own notifications as read`
- **policies (RLS)** removido (1): `public.notifications.Users can update own notifications`
- **tabelas** adicionado (1): `public._rb_message_reactions_one_per_agent_20261107121000`

## 2026-11-07 11:34 UTC

- **functions** adicionado (1): `public.get_ai_usage_outbox_drain_cron_secret()`
- **migrations** adicionado (1): `20261103223000_ai_usage_outbox_drain_cron`
- **vault secrets (nomes)** adicionado (1): `ai_usage_outbox_drain_cron_secret`

## 2026-11-07 02:02 UTC

- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_03`

## 2026-11-07 00:35 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_10`

## 2026-11-06 10:02 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_09`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_02`

## 2026-11-06 02:49 UTC

- **migrations** adicionado (3): `20261026240300_drop_bkp_261023`, `20261102012400_login_attempts_retencao_90d`, `20261102032200_revoga_execute_public_cron_schedule`
- **migrations** alterado (2): `20261102012200_department_invites_restringe_escrita`, `20261103201500_remove_pagamentos_e_special_agent`

## 2026-11-05 01:32 UTC

- **functions** alterado (1): `public.contacts_stats_series(p_include_legacy boolean)`
- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_08`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_01`

## 2026-11-04 21:15 UTC

- **functions** alterado (6): `public.claim_outbound_message(p_message_id uuid, p_agent_id uuid, p_worker text, p_lease_seconds integer)`, `public.complete_outbound_message(p_message_id uuid, p_claim_token uuid, p_external_id text, p_delivery_status text)`, `public.enqueue_ai_job(p_idempotency_key text, p_kind text, p_function_name text, p_user_id uuid, p_payload jsonb, p_priority integer, p_available_at timestamp with time zone, p_expires_at timestamp with time zone, p_max_attempts integer)`, `public.enqueue_outbound_message(p_contact_id uuid, p_client_message_id uuid, p_content text, p_message_type text, p_media_url text, p_reply_to_id uuid, p_whatsapp_connection_id uuid, p_caption text)`, `public.fail_outbound_message(p_message_id uuid, p_claim_token uuid, p_retryable boolean)`, `public.get_instance_token(p_instance_id text)`

## 2026-11-04 09:34 UTC

- **realtime** adicionado (1): `supabase_realtime_messages_publication:realtime.messages_2026_11_07`
- **realtime** removido (1): `supabase_realtime_messages_publication:realtime.messages_2026_10_31`

## 2026-11-04 01:38 UTC

- **colunas** removido (31): `public.contact_purchases.amount`, `public.contact_purchases.contact_id`, `public.contact_purchases.created_at`, `public.contact_purchases.created_by`, `public.contact_purchases.currency`, `public.contact_purchases.deal_id`, `public.contact_purchases.description`, `public.contact_purchases.external_id`, `public.contact_purchases.id`, `public.contact_purchases.purchase_type`, `public.contact_purchases.purchased_at`, `public.contact_purchases.source`, `public.contact_purchases.status`, `public.contact_purchases.title`, `public.contact_purchases.updated_at`, `public.payment_links.amount`, `public.payment_links.contact_id`, `public.payment_links.created_at`, `public.payment_links.created_by`, `public.payment_links.currency`, `public.payment_links.deal_id`, `public.payment_links.description`, `public.payment_links.expires_at`, `public.payment_links.external_id`, `public.payment_links.id`, `public.payment_links.paid_at`, `public.payment_links.payment_method`, `public.payment_links.payment_url`, `public.payment_links.status`, `public.payment_links.title`, `public.payment_links.updated_at`
- **constraints** adicionado (1): `public.user_roles.user_roles_no_special_agent`
- **constraints** removido (8): `public.contact_purchases.contact_purchases_contact_id_fkey`, `public.contact_purchases.contact_purchases_created_by_fkey`, `public.contact_purchases.contact_purchases_deal_id_fkey`, `public.contact_purchases.contact_purchases_pkey`, `public.payment_links.payment_links_contact_id_fkey`, `public.payment_links.payment_links_created_by_fkey`, `public.payment_links.payment_links_deal_id_fkey`, `public.payment_links.payment_links_pkey`
- **constraints** alterado (1): `public.profiles.profiles_role_check`
- **functions** removido (3): `public.guard_contact_purchase_identity()`, `public.talkx_attribute_purchases(p_since timestamp with time zone)`, `public.talkx_recompute_purchase_metrics(p_limit integer)`
- **functions** alterado (478): `public.accept_department_invite(p_code text)`, `public.add_agent_xp(p_profile_id uuid, p_xp integer)`, `public.add_contact_tag(p_contact_id uuid, p_tag text)`, `public.add_wa_tag_if_not_exists(p_contact_id uuid, p_prefix text, p_tag text)`, `public.admin_cron_jobs_permitidos()`, `public.admin_inbox_silence()`, `public.admin_list_cron_jobs()`, `public.admin_set_role(_user_id uuid, _role app_role)`, `public.admin_toggle_cron_job(p_jobname text, p_ativo boolean)`, `public.admin_unlock_login(p_email text)`, `public.agent_workload()`, `public.ai_budget_reconcile()`, `public.ai_budget_release(p_id uuid, p_reason text)`, `public.ai_budget_reserve(p_idempotency_key text, p_user_id uuid, p_function_name text, p_estimated_tokens integer, p_limit_tokens integer, p_ttl_ms integer)`, `public.ai_budget_settle(p_id uuid, p_actual_tokens integer)`, `public.ai_is_canonical_churn_risk(p_value text)`, `public.ai_is_canonical_priority(p_value text)`, `public.ai_is_canonical_sentiment(p_value text)`, `public.ai_is_canonical_urgency(p_value text)`, `public.ai_rate_limit_hit(p_key text, p_window_start timestamp with time zone)`, `public.ai_rate_limit_purge(p_older_than timestamp with time zone)`, `public.ai_sentiment_summary(p_days integer)`, `public.ai_text_array(p_value jsonb)`, `public.ai_usage_cost_summary(p_since timestamp with time zone, p_until timestamp with time zone, p_top_functions integer)`, `public.ai_usage_summary(p_since timestamp with time zone, p_until timestamp with time zone, p_bucket_seconds integer, p_top_functions integer, p_top_users integer)`, `public.app_bootstrap()`, `public.apply_client_wallet(p_contact_id uuid)`, `public.apply_pg_cron_escalonamento(p_reverter boolean)`, `public.apply_zapp_cron_secrets_l5()`, `public.assume_conversation(p_contact_id uuid)`, `public.attribute_multiplix_item_reply(p_phone text, p_message_id text, p_quoted_external_id text)`, `public.attribute_talkx_reply(p_contact_id uuid, p_phone text, p_message_id uuid)`, `public.audit_contact_address_change()`, `public.audit_contact_block_change()`, `public.audit_contact_deletion_change()`, `public.audit_operational_config()`, `public.audit_role_changes()`, `public.audit_role_permissions_changes()`, `public.auto_assign_contact()`, `public.auto_assign_to_queue_agent()` … (+438)
- **indexes** removido (9): `public.contact_purchases_pkey`, `public.contact_purchases_source_external_id_key`, `public.idx_contact_purchases_contact_id`, `public.idx_contact_purchases_created_by`, `public.idx_contact_purchases_deal_id`, `public.idx_payment_links_contact_id`, `public.idx_payment_links_created_by`, `public.idx_payment_links_deal_id`, `public.payment_links_pkey`
- **lints** adicionado (1): `policy_auth_fn_not_wrapped:public.agent_visibility_grants.Agents can view own grants`
- **lints** removido (9): `policy_auth_fn_not_wrapped:public.agent_visibility_grants.Special agents can view own grants`, `policy_auth_fn_not_wrapped:public.contact_purchases.Agents can delete purchases for assigned contacts`, `policy_auth_fn_not_wrapped:public.contact_purchases.Agents can insert purchases for assigned contacts`, `policy_auth_fn_not_wrapped:public.contact_purchases.Agents can update purchases for assigned contacts`, `policy_auth_fn_not_wrapped:public.contact_purchases.Agents can view purchases for assigned contacts`, `policy_auth_fn_not_wrapped:public.payment_links.Admins can delete payment links`, `policy_auth_fn_not_wrapped:public.payment_links.Authenticated can insert payment links`, `policy_auth_fn_not_wrapped:public.payment_links.Users can update own payment links`, `policy_auth_fn_not_wrapped:public.payment_links.Users can view own payment links`
- **migrations** adicionado (3): `20261102042200_talkx_delivery_log_sem_prazo_fixo`, `20261102052200_talkx_retencao_guarda_e_test_sends_90`, `20261103201500_remove_pagamentos_e_special_agent`
- **policies (RLS)** adicionado (1): `public.agent_visibility_grants.Agents can view own grants`
- **policies (RLS)** removido (9): `public.agent_visibility_grants.Special agents can view own grants`, `public.contact_purchases.Agents can delete purchases for assigned contacts`, `public.contact_purchases.Agents can insert purchases for assigned contacts`, `public.contact_purchases.Agents can update purchases for assigned contacts`, `public.contact_purchases.Agents can view purchases for assigned contacts`, `public.payment_links.Admins can delete payment links`, `public.payment_links.Authenticated can insert payment links`, `public.payment_links.Users can update own payment links`, `public.payment_links.Users can view own payment links`
- **realtime** removido (1): `supabase_realtime:public.payment_links`
- **tabelas** removido (2): `public.contact_purchases`, `public.payment_links`
- **triggers** removido (4): `public.contact_purchases.guard_contact_purchase_identity_insert`, `public.contact_purchases.guard_contact_purchase_identity_update`, `public.contact_purchases.update_contact_purchases_updated_at`, `public.payment_links.update_payment_links_updated_at`

## 2026-11-03 12:26 UTC

- Snapshot inicial.

