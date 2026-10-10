# DB Inventory — Zapp Web V2

> Gerado em: 2026-10-04 | Fonte: `supabase/schema-catalog.json` (format v2) | Database: postgres schema public server: PG 17

## Resumo

| Item | Quantidade |
|---|---|
| Tables | 166 |
| Functions | 251 |
| Views | 12 |
| Columns | 1947 |
| Check constraints | 157 |
| Trigger functions | 64 |
| Function signatures | 253 |

## Tables

| Table | Columns | Checks |
|---|---|---|
| agent_achievements | 0 | 0 |
| agent_presence | 0 | 1 |
| agent_skills | 0 | 0 |
| agent_stats | 0 | 2 |
| agent_visibility_grants | 0 | 1 |
| ai_budget_reservations | 0 | 1 |
| ai_conversation_tags | 0 | 1 |
| ai_jobs | 0 | 5 |
| ai_model_prices | 0 | 5 |
| ai_providers | 0 | 0 |
| ai_usage_logs | 0 | 0 |
| allowed_countries | 0 | 0 |
| audio_meme_favorites | 0 | 0 |
| audio_memes | 0 | 0 |
| audit_logs | 0 | 1 |
| auto_close_config | 0 | 0 |
| automations | 0 | 0 |
| away_messages | 0 | 0 |
| blocked_countries | 0 | 0 |
| blocked_ips | 0 | 0 |
| business_hours | 0 | 1 |
| calls | 0 | 6 |
| campaign_ab_variants | 0 | 0 |
| campaign_contacts | 0 | 1 |
| campaigns | 0 | 2 |
| catalog_favorites | 0 | 0 |
| catalog_rate_limit_hits | 0 | 0 |
| catalog_rate_limits | 0 | 0 |
| catalog_send_events | 0 | 2 |
| channel_connections | 0 | 0 |
| channel_routing_rules | 0 | 0 |
| chatbot_executions | 0 | 1 |
| chatbot_flows | 0 | 1 |
| client_wallet_rules | 0 | 0 |
| connection_health_logs | 0 | 0 |
| contact_custom_fields | 0 | 0 |
| contact_deletion_audit | 0 | 2 |
| contact_identity_map | 0 | 0 |
| contact_notes | 0 | 1 |
| contact_purchases | 0 | 0 |
| contacts | 0 | 6 |
| conversation_analyses | 0 | 3 |
| conversation_closures | 0 | 0 |
| conversation_events | 0 | 1 |
| conversation_memory | 0 | 0 |
| conversation_sla | 0 | 0 |
| conversation_snoozes | 0 | 0 |
| conversation_tasks | 0 | 2 |
| crisis_room_alerts | 0 | 0 |
| crm_contact_links | 0 | 2 |
| crm_sync_outbox | 0 | 10 |
| csat_auto_config | 0 | 0 |
| csat_surveys | 0 | 0 |
| custom_emojis | 0 | 0 |
| deal_activities | 0 | 0 |
| department_audit_logs | 0 | 1 |
| department_invitations | 0 | 4 |
| department_invites | 0 | 0 |
| departments | 0 | 1 |
| edge_rate_limits | 0 | 0 |
| email_attachments | 0 | 0 |
| email_labels | 0 | 0 |
| email_messages | 0 | 2 |
| email_threads | 0 | 0 |
| entity_versions | 0 | 0 |
| favorite_contacts | 0 | 0 |
| feature_flags | 0 | 1 |
| followup_executions | 0 | 0 |
| followup_sequences | 0 | 0 |
| followup_steps | 0 | 0 |
| geo_blocking_settings | 0 | 1 |
| global_settings | 0 | 1 |
| gmail_accounts | 0 | 0 |
| goals_configurations | 0 | 1 |
| ip_whitelist | 0 | 0 |
| knowledge_base_articles | 0 | 0 |
| knowledge_base_files | 0 | 0 |
| link_preview_cache | 0 | 0 |
| link_preview_cache_metrics | 0 | 0 |
| login_attempts | 0 | 1 |
| message_reactions | 0 | 1 |
| message_templates | 0 | 0 |
| messages | 0 | 4 |
| meta_capi_events | 0 | 0 |
| mfa_sessions | 0 | 0 |
| multiplix_audience_members | 0 | 0 |
| multiplix_audiences | 0 | 1 |
| multiplix_blocks | 0 | 1 |
| multiplix_delivery_items | 0 | 1 |
| multiplix_dispatches | 0 | 1 |
| multiplix_events | 0 | 1 |
| multiplix_recipients | 0 | 2 |
| multiplix_voice_assets | 0 | 2 |
| multiplix_voice_grants | 0 | 1 |
| notifications | 0 | 0 |
| nps_surveys | 0 | 2 |
| number_reputation | 0 | 0 |
| passkey_credentials | 0 | 0 |
| password_reset_requests | 0 | 1 |
| payment_links | 0 | 0 |
| performance_snapshots | 0 | 0 |
| permissions | 0 | 0 |
| pinned_conversations | 0 | 0 |
| playbooks | 0 | 0 |
| products | 0 | 0 |
| profiles | 0 | 1 |
| query_telemetry | 0 | 0 |
| queue_goals | 0 | 0 |
| queue_members | 0 | 0 |
| queue_positions | 0 | 0 |
| queue_skill_requirements | 0 | 0 |
| queues | 0 | 0 |
| rate_limit_configs | 0 | 0 |
| rate_limit_logs | 0 | 0 |
| reminders | 0 | 0 |
| role_permissions | 0 | 0 |
| sales_deals | 0 | 0 |
| sales_pipeline_stages | 0 | 0 |
| saved_filters | 0 | 0 |
| scheduled_messages | 0 | 0 |
| scheduled_report_configs | 0 | 0 |
| scheduled_reports | 0 | 0 |
| security_alerts | 0 | 0 |
| sicoob_contact_mapping | 0 | 0 |
| sla_configurations | 0 | 0 |
| sla_rules | 0 | 0 |
| stickers | 0 | 0 |
| talkx_alerts | 0 | 1 |
| talkx_blacklist | 0 | 2 |
| talkx_campaign_events | 0 | 3 |
| talkx_campaign_segments | 0 | 2 |
| talkx_campaigns | 0 | 10 |
| talkx_conversions | 0 | 2 |
| talkx_delivery_log | 0 | 5 |
| talkx_link_clicks | 0 | 0 |
| talkx_links | 0 | 2 |
| talkx_optout_keywords | 0 | 1 |
| talkx_recipients | 0 | 4 |
| talkx_segments | 0 | 2 |
| talkx_settings | 0 | 0 |
| talkx_template_variants | 0 | 5 |
| talkx_template_versions | 0 | 3 |
| talkx_templates | 0 | 2 |
| talkx_test_send_claims | 0 | 0 |
| team_conversation_members | 0 | 2 |
| team_conversations | 0 | 3 |
| team_message_reactions | 0 | 1 |
| team_message_receipts | 0 | 3 |
| team_messages | 0 | 6 |
| training_sessions | 0 | 0 |
| user_devices | 0 | 0 |
| user_roles | 0 | 0 |
| user_service_accounts | 0 | 0 |
| user_sessions | 0 | 0 |
| user_settings | 0 | 6 |
| voice_command_logs | 0 | 0 |
| warroom_alerts | 0 | 0 |
| webauthn_challenges | 0 | 1 |
| webhook_failures | 0 | 0 |
| webhook_rate_limits | 0 | 0 |
| whatsapp_connection_queues | 0 | 0 |
| whatsapp_connections | 0 | 1 |
| whatsapp_flows | 0 | 0 |
| whatsapp_groups | 0 | 0 |
| whatsapp_templates | 0 | 0 |
| whisper_messages | 0 | 0 |

## Functions

| Function |
|---|
| accept_department_invite |
| add_agent_xp |
| add_wa_tag_if_not_exists |
| admin_set_role |
| ai_budget_reconcile |
| ai_budget_release |
| ai_budget_reserve |
| ai_budget_settle |
| ai_is_canonical_churn_risk |
| ai_is_canonical_priority |
| ai_is_canonical_sentiment |
| ai_is_canonical_urgency |
| ai_rate_limit_hit |
| ai_rate_limit_purge |
| ai_text_array |
| ai_usage_cost_summary |
| ai_usage_summary |
| apply_pg_cron_escalonamento |
| apply_zapp_cron_secrets_l5 |
| attribute_multiplix_item_reply |
| attribute_talkx_reply |
| calculate_level |
| can_delete_contacts |
| can_edit_contact |
| cancel_ai_job |
| catalog_rate_limit_hit |
| claim_ai_jobs |
| claim_crm_sync_outbox |
| claim_crm_sync_outbox_by_id |
| claim_multiplix_item |
| claim_multiplix_recipient |
| claim_outbound_message |
| claim_talkx_campaign_worker |
| claim_talkx_recipient |
| cleanup_crm_sync_outbox |
| cleanup_expired_challenges |
| cleanup_link_preview_cache |
| clear_login_attempts |
| close_conversation_atomic |
| complete_crm_sync_outbox |
| complete_multiplix_dispatch_if_drained |
| complete_multiplix_dispatch_if_items_drained |
| complete_multiplix_item |
| complete_multiplix_recipient |
| complete_outbound_message |
| complete_talkx_campaign_if_drained |
| complete_talkx_recipient |
| consume_rate_limit |
| contacts_count_by_type |
| conversation_closure_day |
| count_multiplix_dead_letters |
| count_searchbox_sessions_this_month |
| create_department_invite |
| current_profile_id |
| dashboard_contact_counts |
| dashboard_hourly_volume |
| dashboard_kpi |
| dashboard_leaderboard |
| dashboard_sentiment_alerts |
| decrypt_gmail_token |
| delete_contact |
| delete_contacts |
| delete_talkx_campaign |
| duplicate_talkx_campaign |
| effective_role |
| encrypt_gmail_token |
| enqueue_ai_job |
| enqueue_outbound_message |
| enqueue_rich_outbound_message |
| expire_stale_agent_presence |
| fail_crm_sync_outbox |
| fail_outbound_message |
| find_or_create_direct_conversation |
| finish_ai_job |
| fn_list_audio_meme_categories |
| fn_list_audio_memes_for_user |
| fn_send_audio_meme |
| fn_toggle_user_meme_favorite |
| get_ai_jobs_cron_secret |
| get_avatars_refresh_cron_secret |
| get_channel_credentials |
| get_channel_credentials_safe |
| get_connection_health_check_cron_secret |
| get_connection_instance |
| get_connection_qr_code |
| get_conversation_tab_counts |
| get_crm_sync_health |
| get_department_whatsapp_api_key |
| get_department_whatsapp_credentials |
| get_gmail_tokens |
| get_identity_matrix |
| get_instance_token |
| get_last_message_dates |
| get_multiplix_cron_secret |
| get_own_gmail_accounts |
| get_own_lockout_status |
| get_profile_id_for_user |
| get_profile_role_for_check |
| get_talkx_cron_secret |
| get_talkx_send_url |
| get_team_conversation_previews |
| get_team_inbox |
| get_team_messages_page |
| get_team_profiles |
| get_team_unread_counts |
| get_visible_agent_ids |
| grant_agent_achievement |
| has_role |
| heartbeat_ai_job |
| heartbeat_multiplix_item |
| increment_agent_messages |
| increment_agent_resolutions |
| ingest_inbound_message |
| is_account_locked |
| is_admin |
| is_admin_or_supervisor |
| is_contact_visible_to_user |
| is_country_allowed |
| is_country_blocked |
| is_ip_blocked |
| is_ip_whitelisted |
| is_privileged_contact_caller |
| is_team_conversation_member |
| is_valid_talkx_schedule_timezone |
| is_within_business_hours |
| kick_talkx_campaign |
| leave_team_group |
| link_email_crm_contact_guarded |
| list_multiplix_claimable_items |
| list_multiplix_dead_letters |
| log_audit_event |
| log_talkx_campaign_checklist |
| mark_first_response |
| mark_multiplix_item_dispatch_started |
| mark_multiplix_recipient_dispatch_started |
| mark_talkx_recipient_dispatch_started |
| mark_team_conversation_read |
| mcp_exec |
| mcp_exec_many |
| merge_contacts_atomic |
| multiplix_confirm_dispatch |
| multiplix_connection_daily_usage |
| multiplix_create_draft |
| multiplix_dispatch_window_is_open |
| my_calls_kpi |
| notify_due_reminders |
| notify_due_tasks |
| notify_searchbox_budget |
| pause_dispatches_for_connection |
| persist_conversation_analysis |
| persist_multiplix_item_message_snapshot |
| persist_multiplix_recipient_message_snapshot |
| persist_sentiment_alert |
| persist_talkx_recipient_message_snapshot |
| phone_variants |
| purge_talkx_expired_data |
| reap_ai_jobs |
| reassign_absent_agents |
| reassign_overloaded_agents |
| record_failed_login |
| record_incoming_call_event |
| record_multiplix_item_delivered |
| record_multiplix_item_sent |
| record_multiplix_recipient_delivered |
| record_multiplix_recipient_sent |
| record_talkx_conversion |
| record_talkx_link_click |
| record_talkx_recipient_delivered |
| record_talkx_recipient_receipt |
| record_talkx_recipient_sent |
| register_first_response_internal |
| register_multiplix_connection_failure |
| release_multiplix_item_claim |
| release_multiplix_recipient_claim |
| release_talkx_campaign_worker |
| release_talkx_recipient_claim |
| remove_team_member |
| remove_wa_label_from_all_contacts |
| remove_wa_tag_by_prefix |
| rename_wa_label_on_all_contacts |
| reorder_multiplix_blocks |
| replace_ai_conversation_tags |
| replace_talkx_draft_recipients |
| require_contact_edit_permission |
| require_contact_global_admin |
| reschedule_multiplix_item |
| reschedule_multiplix_recipient |
| reschedule_talkx_recipient |
| resolve_contact_guard_actor |
| resolve_talkx_outcome_unknown |
| retry_talkx_recipient |
| retry_talkx_recipients |
| save_talkx_campaign_draft |
| search_contacts |
| search_knowledge_base |
| search_my_calls |
| search_team_messages |
| set_call_agent_notes |
| set_conversation_status |
| set_department_whatsapp_config |
| set_instance_token |
| set_team_member_pref |
| set_team_member_role |
| skill_based_assign |
| snapshot_talkx_campaign_audience |
| store_gmail_tokens |
| sweep_multiplix_stuck_items |
| sweep_multiplix_stuck_recipients |
| sweep_talkx_stuck_recipients |
| talk_me_claim |
| talk_me_eligible_waiting_contacts |
| talk_me_list_queues |
| talk_me_list_waiting |
| talkx_analytics_scope |
| talkx_audience_query |
| talkx_benchmarks |
| talkx_campaign_logs |
| talkx_campaign_pace |
| talkx_campaign_reply_stats |
| talkx_campaign_report |
| talkx_connection_send_budget |
| talkx_delete_link |
| talkx_engine_alerts |
| talkx_engine_cron_runs |
| talkx_engine_window_open |
| talkx_increment_delivered |
| talkx_match_optout |
| talkx_next_recipients |
| talkx_normalize_optout_text |
| talkx_overview_stats |
| talkx_recipient_is_suppressed |
| talkx_resolve_audience |
| talkx_resolve_speed_pace |
| talkx_segment_tags |
| talkx_set_campaign_investment |
| talkx_suppress_contact |
| talkx_upsert_link |
| toggle_team_reaction |
| transfer_team_conversation_department |
| transition_multiplix_dispatch |
| transition_talkx_campaign |
| trigger_ai_jobs_tick |
| trigger_pending_multiplix_dispatches |
| trigger_talkx_engine_tick |
| update_agent_streak |
| update_own_profile |
| update_talkx_campaign_limits |
| update_talkx_template_with_snapshot |
| upsert_crm_contact_link_guarded |
| upsert_my_call |
| user_has_permission |

## Views

| View |
|---|
| catalog_send_stats |
| channel_connections_safe |
| gmail_accounts_safe |
| password_reset_requests_safe |
| profiles_public |
| searchbox_usage_daily |
| talkx_campaign_metrics |
| talkx_campaign_optouts |
| talkx_engine_health |
| whatsapp_connections_agent |
| whatsapp_connections_public |
| whatsapp_connections_safe |

## Check Constraints

| Constraint |
|---|
| agent_presence.agent_presence_status_check:CHECK ((status = ANY (ARRAY['online'::text, 'away'::text, 'offline'::text]))) |
| agent_stats.chk_level_min_one:CHECK ((level >= 1)) |
| agent_stats.chk_xp_non_negative:CHECK ((xp >= 0)) |
| agent_visibility_grants.agent_visibility_grants_no_self_grant:CHECK ((agent_id <> can_see_agent_id)) |
| ai_budget_reservations.ai_budget_reservations_status_check:CHECK ((status = ANY (ARRAY['reserved'::text, 'settled'::text, 'released'::text, 'expired'::text]))) |
| ai_conversation_tags.ai_conversation_tags_source_known:CHECK (((source IS NULL) OR (source = ANY (ARRAY['ai'::text, 'human'::text, 'manual'::text])))) |
| ai_jobs.ai_jobs_attempt_count_nonneg:CHECK ((attempt_count >= 0)) |
| ai_jobs.ai_jobs_max_attempts_range:CHECK (((max_attempts >= 1) AND (max_attempts <= 50))) |
| ai_jobs.ai_jobs_payload_object:CHECK ((jsonb_typeof(payload) = 'object'::text)) |
| ai_jobs.ai_jobs_priority_range:CHECK (((priority >= 0) AND (priority <= 1000))) |
| ai_jobs.ai_jobs_status_check:CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'partial'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text, 'outcome_unknown'::text]))) |
| ai_model_prices.ai_model_prices_currency_check:CHECK ((char_length(currency) = 3)) |
| ai_model_prices.ai_model_prices_price_check:CHECK ((unit_price >= (0)::numeric)) |
| ai_model_prices.ai_model_prices_source_check:CHECK ((source = ANY (ARRAY['internal'::text, 'provider_statement'::text]))) |
| ai_model_prices.ai_model_prices_unit_check:CHECK ((unit = ANY (ARRAY['token'::text, 'character'::text, 'second'::text, 'request'::text]))) |
| ai_model_prices.ai_model_prices_vigencia_check:CHECK (((valid_to IS NULL) OR (valid_to > valid_from))) |
| audit_logs.audit_logs_action_not_empty:CHECK ((length(btrim(action)) > 0)) |
| business_hours.business_hours_day_of_week_check:CHECK (((day_of_week >= 0) AND (day_of_week <= 6))) |
| calls.calls_channel_check:CHECK (((channel IS NULL) OR (channel = ANY (ARRAY['voip'::text, 'whatsapp'::text])))) |
| calls.calls_direction_check:CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))) |
| calls.calls_end_reason_check:CHECK (((end_reason IS NULL) OR (end_reason = ANY (ARRAY['completed'::text, 'hangup_local'::text, 'hangup_remote'::text, 'no_answer'::text, 'busy'::text, 'busy_here'::text, 'cancelled'::text, 'cancelled_remote'::text, 'declined'::text, 'failed'::text, 'timeout'::text])))) |
| calls.calls_provider_event_id_length:CHECK (((provider_event_id IS NULL) OR ((char_length(provider_event_id) >= 1) AND (char_length(provider_event_id) <= 200)))) |
| calls.calls_recording_status_check:CHECK ((recording_status = ANY (ARRAY['none'::text, 'pending'::text, 'available'::text, 'failed'::text]))) |
| calls.calls_status_check:CHECK ((status = ANY (ARRAY['ringing'::text, 'answered'::text, 'ended'::text, 'missed'::text, 'busy'::text, 'failed'::text, 'cancelled'::text, 'declined'::text]))) |
| campaign_contacts.campaign_contacts_status_check:CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text]))) |
| campaigns.campaigns_status_check:CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'completed'::text, 'cancelled'::text, 'paused'::text]))) |
| campaigns.campaigns_target_type_check:CHECK ((target_type = ANY (ARRAY['all'::text, 'tag'::text, 'queue'::text, 'custom'::text]))) |
| catalog_send_events.catalog_send_events_status_check:CHECK ((status = ANY (ARRAY['sent'::text, 'partial'::text, 'failed'::text]))) |
| catalog_send_events.catalog_send_events_template_check:CHECK ((template = ANY (ARRAY['formal'::text, 'informal'::text, 'promo'::text, 'custom'::text]))) |
| chatbot_executions.chatbot_executions_status_check:CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'paused'::text, 'cancelled'::text]))) |
| chatbot_flows.chatbot_flows_trigger_type_check:CHECK ((trigger_type = ANY (ARRAY['keyword'::text, 'first_message'::text, 'menu'::text, 'webhook'::text, 'schedule'::text]))) |
| contact_deletion_audit.contact_deletion_audit_operation_check:CHECK ((operation = ANY (ARRAY['delete'::text, 'restore'::text, 'update_marker'::text, 'purge'::text]))) |
| contact_deletion_audit.contact_deletion_audit_shape_check:CHECK ((((operation = 'delete'::text) AND (deleted_at_from IS NULL) AND (deleted_at_to IS NOT NULL)) OR ((operation = 'restore'::text) AND (deleted_at_from IS NOT NULL) AND (deleted_at_to IS NULL)) OR ((operation = 'purge'::text) AND (NOT (deleted_at_from IS DISTINCT FROM deleted_at_to))) OR ((operation = 'update_marker'::text) AND (deleted_at_from IS NOT NULL) AND (deleted_at_to IS NOT NULL) AND (deleted_at_from IS DISTINCT FROM deleted_at_to)))) |
| contact_notes.contact_notes_category_check:CHECK ((category = ANY (ARRAY['note'::text, 'fact'::text, 'objection'::text, 'promise'::text]))) |
| contacts.chk_contact_type:CHECK ((contact_type = ANY (ARRAY['cliente'::text, 'fornecedor'::text, 'transportadora'::text, 'colaborador'::text, 'prestador_servico'::text, 'parceiro'::text]))) |
| contacts.chk_conversation_status_values:CHECK (((conversation_status IS NULL) OR (conversation_status = ANY (ARRAY['open'::text, 'pending'::text, 'waiting'::text, 'resolved'::text, 'closed'::text, 'archived'::text])))) |
| contacts.contacts_ai_priority_canonical:CHECK (ai_is_canonical_priority(ai_priority)) |
| contacts.contacts_ai_sentiment_canonical:CHECK (ai_is_canonical_sentiment(ai_sentiment)) |
| contacts.contacts_email_format:CHECK (((email IS NULL) OR (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text))) |
| contacts.contacts_phone_not_empty:CHECK ((length(btrim(phone)) > 0)) |
| conversation_analyses.conversation_analyses_churn_risk_canonical:CHECK (ai_is_canonical_churn_risk(churn_risk)) |
| conversation_analyses.conversation_analyses_sentiment_canonical:CHECK (ai_is_canonical_sentiment(sentiment)) |
| conversation_analyses.conversation_analyses_urgency_canonical:CHECK (ai_is_canonical_urgency(urgency)) |
| conversation_events.conversation_events_closure_type_check:CHECK (((closure_id IS NULL) OR (event_type = 'close'::text))) |
| conversation_tasks.conversation_tasks_status_check:CHECK ((status = ANY (ARRAY['backlog'::text, 'todo'::text, 'doing'::text, 'waiting'::text, 'done'::text, 'cancelled'::text]))) |
| conversation_tasks.conversation_tasks_waiting_reason_check:CHECK (((status <> 'waiting'::text) OR (waiting_reason IS NOT NULL))) |
| crm_contact_links.crm_contact_links_link_source_check:CHECK ((link_source = ANY (ARRAY['phone_lookup'::text, 'manual'::text, 'sync_result'::text]))) |
| crm_contact_links.crm_contact_links_normalized_phone_check:CHECK (((normalized_phone IS NULL) OR (normalized_phone ~ '^[0-9]{8,15}$'::text))) |
| crm_sync_outbox.crm_sync_outbox_attempt_count_check:CHECK ((attempt_count >= 0)) |
| crm_sync_outbox.crm_sync_outbox_external_ids_bounded:CHECK ((((external_interaction_id IS NULL) OR ((length(external_interaction_id) >= 1) AND (length(external_interaction_id) <= 200))) AND ((external_contact_id IS NULL) OR ((length(external_contact_id) >= 1) AND (length(external_contact_id) <= 200))) AND ((external_company_id IS NULL) OR ((length(external_company_id) >= 1) AND (length(external_company_id) <= 200))))) |
| crm_sync_outbox.crm_sync_outbox_lease_state:CHECK ((((status = 'processing'::text) AND (locked_at IS NOT NULL) AND (locked_by IS NOT NULL) AND (lease_token IS NOT NULL)) OR ((status <> 'processing'::text) AND (locked_at IS NULL) AND (locked_by IS NULL) AND (lease_token IS NULL)))) |
| crm_sync_outbox.crm_sync_outbox_max_attempts_check:CHECK (((max_attempts >= 1) AND (max_attempts <= 20))) |
| crm_sync_outbox.crm_sync_outbox_normalized_phone_check:CHECK ((normalized_phone ~ '^[0-9]{8,15}$'::text)) |
| crm_sync_outbox.crm_sync_outbox_payload_check:CHECK ((jsonb_typeof(payload) = 'object'::text)) |
| crm_sync_outbox.crm_sync_outbox_payload_size:CHECK ((octet_length((payload)::text) <= 20000)) |
| crm_sync_outbox.crm_sync_outbox_phone_state:CHECK (((normalized_phone IS NOT NULL) OR ((status = 'dead_letter'::text) AND (last_error_code = ANY (ARRAY['INVALID_PHONE'::text, 'CONTACT_DELETED'::text]))))) |
| crm_sync_outbox.crm_sync_outbox_status_check:CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'succeeded'::text, 'failed'::text, 'dead_letter'::text]))) |
| crm_sync_outbox.crm_sync_outbox_success_state:CHECK (((status <> 'succeeded'::text) OR ((completed_at IS NOT NULL) AND (external_interaction_id IS NOT NULL) AND (external_contact_id IS NOT NULL)))) |
| department_audit_logs.department_audit_logs_action_check:CHECK ((action = ANY (ARRAY['accept_invite'::text, 'create_invite'::text, 'join_department'::text, 'leave_department'::text, 'remove_member'::text, 'update_settings'::text, 'delete_department'::text, 'create_department'::text, 'update_role'::text, 'kick_member'::text, 'create_group'::text, 'delete_group'::text]))) |
| department_invitations.department_invitations_code_format:CHECK (((length(code) >= 6) AND (length(code) <= 64))) |
| department_invitations.department_invitations_expires_after_created:CHECK (((expires_at IS NULL) OR (expires_at > created_at))) |
| department_invitations.department_invitations_max_uses_positive:CHECK ((max_uses >= 1)) |
| department_invitations.department_invitations_use_count_nonneg:CHECK ((use_count >= 0)) |
| departments.departments_whatsapp_mode_check:CHECK ((whatsapp_mode = ANY (ARRAY['none'::text, 'evolution'::text, 'official'::text]))) |
| email_messages.email_messages_direction_check:CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))) |
| email_messages.email_messages_from_format:CHECK ((from_address ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)) |
| feature_flags.feature_flags_key_check:CHECK ((key ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'::text)) |
| geo_blocking_settings.geo_blocking_settings_mode_check:CHECK ((mode = ANY (ARRAY['disabled'::text, 'whitelist'::text, 'blacklist'::text]))) |
| global_settings.global_settings_no_plaintext_api_token:CHECK ((key <> 'api_token'::text)) |
| goals_configurations.goal_owner_check:CHECK ((((profile_id IS NOT NULL) AND (queue_id IS NULL)) OR ((profile_id IS NULL) AND (queue_id IS NOT NULL)))) |
| login_attempts.login_attempts_attempt_count_max:CHECK ((attempt_count <= 10000)) |
| message_reactions.reaction_author_check:CHECK (((user_id IS NOT NULL) OR (contact_id IS NOT NULL))) |
| messages.messages_delivery_attempt_count_nonnegative:CHECK ((delivery_attempt_count >= 0)) |
| messages.messages_delivery_claim_state:CHECK ((((delivery_claim_token IS NULL) AND (delivery_claimed_at IS NULL) AND (delivery_claim_expires_at IS NULL) AND (delivery_claimed_by IS NULL)) OR ((delivery_claim_token IS NOT NULL) AND (delivery_claimed_at IS NOT NULL) AND (delivery_claim_expires_at IS NOT NULL) AND (delivery_claimed_by IS NOT NULL) AND (delivery_claim_expires_at > delivery_claimed_at) AND ((length(delivery_claimed_by) >= 1) AND (length(delivery_claimed_by) <= 100))))) |
| messages.messages_message_type_check:CHECK ((message_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'document'::text, 'sticker'::text, 'location'::text, 'contact'::text, 'poll'::text, 'button'::text, 'list'::text, 'reaction'::text, 'vcard'::text, 'ptt'::text, 'link'::text, 'template'::text, 'interactive'::text, 'order'::text, 'product'::text, 'catalog'::text]))) |
| messages.messages_sender_check:CHECK ((sender = ANY (ARRAY['agent'::text, 'contact'::text]))) |
| multiplix_audiences.multiplix_audiences_kind_check:CHECK ((kind = ANY (ARRAY['rule'::text, 'static_list'::text]))) |
| multiplix_blocks.multiplix_blocks_personalization_mode_check:CHECK (((personalization_mode IS NULL) OR (personalization_mode = ANY (ARRAY['same_audio'::text, 'personalized'::text])))) |
| multiplix_delivery_items.multiplix_delivery_items_reply_attribution_check:CHECK (((reply_attribution IS NULL) OR (reply_attribution = ANY (ARRAY['linked'::text, 'inferred'::text])))) |
| multiplix_dispatches.multiplix_dispatches_origin_check:CHECK ((origin = ANY (ARRAY['manual'::text, 'audience'::text, 'crm360'::text, 'contacts'::text]))) |
| multiplix_events.multiplix_events_kind_check:CHECK ((kind = ANY (ARRAY['dispatch_created'::text, 'dispatch_scheduled'::text, 'dispatch_started'::text, 'dispatch_paused'::text, 'dispatch_resumed'::text, 'dispatch_completed'::text, 'dispatch_failed'::text, 'dispatch_cancelled'::text, 'recipient_queued'::text, 'recipient_claimed'::text, 'recipient_sent'::text, 'recipient_delivered'::text, 'recipient_read'::text, 'recipient_failed'::text, 'recipient_skipped'::text, 'recipient_cancelled'::text, 'recipient_outcome_unknown'::text, 'item_queued'::text, 'item_claimed'::text, 'item_sent'::text, 'item_delivered'::text, 'item_read'::text, 'item_failed'::text, 'item_rescheduled'::text, 'item_dead_letter'::text, 'item_skipped'::text, 'item_cancelled'::text, 'connection_at_risk'::text, 'connection_failure'::text, 'note'::text]))) |
| multiplix_recipients.multiplix_recipients_delivery_claim_state:CHECK ((((status = 'sending'::multiplix_recipient_status) AND (delivery_claim_token IS NOT NULL) AND (delivery_claimed_at IS NOT NULL) AND (delivery_claim_expires_at IS NOT NULL) AND (delivery_claimed_by IS NOT NULL)) OR ((status <> 'sending'::multiplix_recipient_status) AND (delivery_claim_token IS NULL) AND (delivery_claimed_at IS NULL) AND (delivery_claim_expires_at IS NULL) AND (delivery_claimed_by IS NULL)))) |
| multiplix_recipients.multiplix_recipients_external_id_bounded:CHECK (((external_id IS NULL) OR ((length(btrim(external_id)) >= 1) AND (length(btrim(external_id)) <= 512)))) |
| multiplix_voice_assets.multiplix_voice_assets_caracteres_nao_negativo:CHECK (((caracteres IS NULL) OR (caracteres >= 0))) |
| multiplix_voice_assets.multiplix_voice_assets_duracao_nao_negativa:CHECK (((duracao_ms IS NULL) OR (duracao_ms >= 0))) |
| multiplix_voice_grants.multiplix_voice_grants_alvo_obrigatorio:CHECK (((roles IS NOT NULL) OR (perfis IS NOT NULL))) |
| nps_surveys.nps_surveys_score_check:CHECK (((score >= 0) AND (score <= 10))) |
| nps_surveys.nps_surveys_survey_type_check:CHECK ((survey_type = ANY (ARRAY['periodic'::text, 'post_resolution'::text, 'manual'::text]))) |
| password_reset_requests.password_reset_requests_status_check:CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))) |
| profiles.profiles_role_check:CHECK ((role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'agent'::text, 'special_agent'::text]))) |
| talkx_alerts.talkx_alerts_kind_check:CHECK ((kind = ANY (ARRAY['stalled_campaign'::text, 'stale_lease'::text, 'outcome_unknown'::text, 'high_failure_rate'::text, 'cron_degraded'::text]))) |
| talkx_blacklist.talkx_blacklist_origin_check:CHECK ((origin = ANY (ARRAY['manual'::text, 'optout'::text, 'system'::text, 'lgpd'::text, 'list'::text, 'auto_optout'::text]))) |
| talkx_blacklist.talkx_blacklist_phone_or_contact:CHECK (((phone IS NOT NULL) OR (contact_id IS NOT NULL))) |
| talkx_campaign_events.talkx_campaign_events_entity_type_format_check:CHECK (((entity_type IS NULL) OR (entity_type ~ '^[a-z][a-z0-9_.]{1,40}$'::text))) |
| talkx_campaign_events.talkx_campaign_events_target_check:CHECK (((campaign_id IS NOT NULL) <> ((entity_type IS NOT NULL) AND (entity_id IS NOT NULL)))) |
| talkx_campaign_events.talkx_campaign_events_type_check:CHECK ((event_type = ANY (ARRAY['created'::text, 'updated'::text, 'scheduled'::text, 'started'::text, 'paused'::text, 'resumed'::text, 'cancelled'::text, 'completed'::text, 'note'::text, 'scheduled_updated'::text, 'limits_updated'::text, 'connection_failed'::text, 'resumed_auto'::text, 'skipped_suppressed'::text, 'suppression_add'::text, 'suppression_remove'::text, 'suppression_update'::text, 'segments_reviewed'::text, 'checklist'::text, 'link_created'::text, 'link_updated'::text, 'link_deleted'::text, 'investment_updated'::text, 'report_exported'::text, 'report_shared'::text, 'import_created'::text, 'import_completed'::text]))) |
| talkx_campaign_segments.talkx_campaign_segments_position_check:CHECK ((("position" >= 1) AND ("position" <= 10))) |
| talkx_campaign_segments.talkx_campaign_segments_status_check:CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'paused'::text, 'done'::text]))) |
| talkx_campaigns.talkx_campaigns_audience_source_check:CHECK ((audience_source = ANY (ARRAY['contacts'::text, 'segment'::text, 'crm360'::text]))) |
| talkx_campaigns.talkx_campaigns_draft_step_range:CHECK (((draft_step IS NULL) OR ((draft_step >= 1) AND (draft_step <= 4)))) |
| talkx_campaigns.talkx_campaigns_legal_basis_check:CHECK (((legal_basis IS NULL) OR (legal_basis = ANY (ARRAY['consent'::text, 'legitimate_interest'::text, 'contract'::text])))) |
| talkx_campaigns.talkx_campaigns_max_per_minute_check:CHECK (((max_per_minute IS NULL) OR ((max_per_minute >= 1) AND (max_per_minute <= 60)))) |
| talkx_campaigns.talkx_campaigns_revision_positive:CHECK ((revision > 0)) |
| talkx_campaigns.talkx_campaigns_schedule_timezone_valid:CHECK (is_valid_talkx_schedule_timezone(schedule_timezone)) |
| talkx_campaigns.talkx_campaigns_send_interval_max_check:CHECK ((send_interval_max <= 86400000)) |
| talkx_campaigns.talkx_campaigns_send_window_valid:CHECK ((((send_window_start IS NULL) AND (send_window_end IS NULL)) OR ((send_window_start IS NOT NULL) AND (send_window_end IS NOT NULL) AND (send_window_start < send_window_end)))) |
| talkx_campaigns.talkx_campaigns_speed_profile_check:CHECK ((speed_profile = ANY (ARRAY['slow'::text, 'moderate'::text, 'fast'::text]))) |
| talkx_campaigns.talkx_campaigns_status_check:CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'paused'::text, 'completed'::text, 'cancelled'::text]))) |
| talkx_conversions.talkx_conversions_source_check:CHECK (((source IS NULL) OR (source = ANY (ARRAY['whatsapp'::text, 'manual'::text, 'import'::text, 'api'::text, 'checkout'::text])))) |
| talkx_conversions.talkx_conversions_value_check:CHECK (((value IS NULL) OR (value >= (0)::numeric))) |
| talkx_delivery_log.talkx_delivery_log_attempt_check:CHECK ((attempt >= 0)) |
| talkx_delivery_log.talkx_delivery_log_duration_check:CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))) |
| talkx_delivery_log.talkx_delivery_log_http_status_check:CHECK (((http_status IS NULL) OR ((http_status >= 100) AND (http_status <= 599)))) |
| talkx_delivery_log.talkx_delivery_log_outcome_check:CHECK ((outcome = ANY (ARRAY['sent'::text, 'failed'::text, 'outcome_unknown'::text, 'skipped'::text, 'rescheduled'::text, 'no_claim'::text, 'stopped'::text]))) |
| talkx_delivery_log.talkx_delivery_log_stage_check:CHECK ((stage = ANY (ARRAY['claim'::text, 'suppress_check'::text, 'dispatch'::text, 'complete'::text, 'reconcile'::text]))) |
| talkx_links.talkx_links_label_format_check:CHECK ((label ~ '^[a-z0-9][a-z0-9_-]{0,39}$'::text)) |
| talkx_links.talkx_links_target_url_check:CHECK ((target_url ~ '^https://'::text)) |
| talkx_optout_keywords.talkx_optout_keywords_match_mode_check:CHECK ((match_mode = ANY (ARRAY['exact'::text, 'contains'::text]))) |
| talkx_recipients.talkx_recipients_delivery_claim_state:CHECK ((((status = 'sending'::text) AND (delivery_claim_token IS NOT NULL) AND (delivery_claimed_at IS NOT NULL) AND (delivery_claim_expires_at IS NOT NULL) AND (delivery_claimed_by IS NOT NULL)) OR ((status <> 'sending'::text) AND (delivery_claim_token IS NULL) AND (delivery_claimed_at IS NULL) AND (delivery_claim_expires_at IS NULL) AND (delivery_claimed_by IS NULL)))) |
| talkx_recipients.talkx_recipients_external_id_bounded:CHECK (((external_id IS NULL) OR ((length(btrim(external_id)) >= 1) AND (length(btrim(external_id)) <= 512)))) |
| talkx_recipients.talkx_recipients_media_snapshot_shape:CHECK ((((media_url_snapshot IS NULL) AND (media_type_snapshot IS NULL)) OR (((length(btrim(media_url_snapshot)) >= 1) AND (length(btrim(media_url_snapshot)) <= 8192)) AND (media_type_snapshot = ANY (ARRAY['image'::text, 'video'::text, 'document'::text, 'audio'::text]))))) |
| talkx_recipients.talkx_recipients_status_check:CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'skipped'::text, 'outcome_unknown'::text, 'cancelled'::text]))) |
| talkx_segments.talkx_segments_origin_check:CHECK ((origin = ANY (ARRAY['zapp'::text, 'crm360'::text, 'custom'::text]))) |
| talkx_segments.talkx_segments_status_check:CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text]))) |
| talkx_template_variants.talkx_template_variants_content_check:CHECK (((length(content) >= 1) AND (length(content) <= 65536))) |
| talkx_template_variants.talkx_template_variants_label_check:CHECK ((label = ANY (ARRAY['A'::text, 'B'::text, 'C'::text]))) |
| talkx_template_variants.talkx_template_variants_media_type_check:CHECK (((media_type IS NULL) OR (media_type = ANY (ARRAY['image'::text, 'video'::text, 'document'::text, 'audio'::text])))) |
| talkx_template_variants.talkx_template_variants_media_url_check:CHECK (((media_url IS NULL) OR ((length(media_url) <= 8192) AND (media_url ~ '^https://'::text)))) |
| talkx_template_variants.talkx_template_variants_weight_check:CHECK (((weight > 0) AND (weight <= 100))) |
| talkx_template_versions.talkx_template_versions_media_type_check:CHECK (((media_type IS NULL) OR (media_type = ANY (ARRAY['image'::text, 'video'::text, 'document'::text, 'audio'::text])))) |
| talkx_template_versions.talkx_template_versions_status_check:CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'approved'::text]))) |
| talkx_template_versions.talkx_template_versions_version_positive:CHECK ((version_number > 0)) |
| talkx_templates.talkx_templates_media_type_check:CHECK (((media_type IS NULL) OR (media_type = ANY (ARRAY['image'::text, 'video'::text, 'document'::text, 'audio'::text])))) |
| talkx_templates.talkx_templates_status_check:CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'approved'::text]))) |
| team_conversation_members.team_conv_members_last_read_at_check:CHECK (((last_read_at IS NULL) OR (last_read_at <= (now() + '00:00:05'::interval)))) |
| team_conversation_members.team_conversation_members_member_role_check:CHECK ((member_role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))) |
| team_conversations.team_conversations_dept_required:CHECK (((type <> 'department'::text) OR (department_id IS NOT NULL))) |
| team_conversations.team_conversations_group_name_required:CHECK (((type <> 'group'::text) OR (name IS NOT NULL))) |
| team_conversations.team_conversations_type_check:CHECK ((type = ANY (ARRAY['direct'::text, 'group'::text, 'department'::text]))) |
| team_message_reactions.team_reactions_emoji_length:CHECK (((char_length(emoji) >= 1) AND (char_length(emoji) <= 8))) |
| team_message_receipts.team_message_receipts_status_check:CHECK ((status = ANY (ARRAY['delivered'::text, 'read'::text]))) |
| team_message_receipts.team_receipts_delivered_at_required:CHECK (((status <> ALL (ARRAY['delivered'::text, 'read'::text])) OR (delivered_at IS NOT NULL))) |
| team_message_receipts.team_receipts_read_at_required:CHECK (((status <> 'read'::text) OR (read_at IS NOT NULL))) |
| team_messages.team_messages_content_not_empty:CHECK (((TRIM(BOTH FROM content) <> ''::text) OR (media_url IS NOT NULL))) |
| team_messages.team_messages_media_consistency:CHECK (((media_url IS NULL) = (media_type IS NULL))) |
| team_messages.team_messages_message_type_check:CHECK ((message_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'audio'::text, 'document'::text, 'system'::text]))) |
| team_messages.team_messages_no_self_reply:CHECK (((reply_to_id IS NULL) OR (reply_to_id <> id))) |
| team_messages.team_messages_status_check:CHECK ((status = ANY (ARRAY['sent'::text, 'delivered'::text, 'read'::text, 'failed'::text]))) |
| team_messages.team_messages_type_media_check:CHECK (((message_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'file'::text, 'sticker'::text, 'system'::text])) OR (media_url IS NULL))) |
| user_settings.user_settings_goal_sound_type_valid:CHECK ((goal_sound_type = ANY (ARRAY['beep'::text, 'chime'::text, 'bell'::text, 'alert'::text, 'soft'::text]))) |
| user_settings.user_settings_mention_sound_type_valid:CHECK ((mention_sound_type = ANY (ARRAY['beep'::text, 'chime'::text, 'bell'::text, 'alert'::text, 'soft'::text]))) |
| user_settings.user_settings_message_sound_type_valid:CHECK ((message_sound_type = ANY (ARRAY['beep'::text, 'chime'::text, 'bell'::text, 'alert'::text, 'soft'::text]))) |
| user_settings.user_settings_sla_sound_type_valid:CHECK ((sla_sound_type = ANY (ARRAY['beep'::text, 'chime'::text, 'bell'::text, 'alert'::text, 'soft'::text]))) |
| user_settings.user_settings_sound_volume_range:CHECK (((sound_volume >= 10) AND (sound_volume <= 100))) |
| user_settings.user_settings_transcription_sound_type_valid:CHECK ((transcription_sound_type = ANY (ARRAY['beep'::text, 'chime'::text, 'bell'::text, 'alert'::text, 'soft'::text]))) |
| webauthn_challenges.webauthn_challenges_type_check:CHECK ((type = ANY (ARRAY['registration'::text, 'authentication'::text]))) |
| whatsapp_connections.whatsapp_connections_status_check:CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'connecting'::text, 'qr_pending'::text]))) |

## Trigger Functions

| Function |
|---|
| audit_contact_address_change |
| audit_contact_deletion_change |
| audit_role_changes |
| audit_role_permissions_changes |
| auto_assign_contact |
| auto_assign_to_queue_agent |
| bump_conversation_updated_at |
| clear_qr_on_connect |
| conversation_task_set_assignee |
| conversation_task_state_trigger |
| department_audit_logs_fill_profile_name |
| enforce_conversation_status_transition |
| enforce_multiplix_dispatch_mutability |
| enforce_multiplix_recipient_mutability |
| enforce_talkx_campaign_mutability |
| enforce_talkx_recipient_snapshot_mutability |
| enqueue_crm_sync_from_closure |
| ensure_single_default_ai_provider |
| ensure_single_default_filter |
| guard_contact_note_identity |
| guard_conversation_closure_request_id |
| guard_conversation_event_closure_id |
| guard_message_delivery_internal_fields |
| guard_multiplix_event_immutable |
| guard_talkx_template_update |
| guard_talkx_template_version_immutable |
| handle_conversation_closure_gamification |
| handle_message_gamification |
| handle_new_user |
| handle_new_user_role |
| init_agent_stats |
| log_assignment_change |
| messages_sla_first_response_trigger |
| multiplix_audiences_validate_shared_roles |
| multiplix_bump_version_on_block_change |
| multiplix_bump_version_on_dispatch_edit |
| normalize_contact_phone |
| prevent_contact_assignee_hijack |
| prevent_contact_queue_hijack |
| prevent_conversation_task_field_forgery |
| prevent_profile_privilege_escalation |
| rate_limit_reset_requests |
| record_talkx_campaign_lifecycle_event |
| redact_crm_sync_on_contact_delete |
| sanitize_reset_request |
| seed_default_goals_for_profile |
| set_scheduled_report_config_owner |
| set_talkx_template_updated_at |
| sync_contact_status_on_closure |
| sync_profile_role_from_user_roles |
| sync_thread_last_sender |
| team_message_receipts_update_guard |
| team_messages_edit_guard |
| team_messages_validate_reply_to |
| team_reactions_dedup_guard |
| team_receipts_fill_conversation_id |
| team_receipts_no_own_sender |
| trg_talkx_increment_replied_count |
| trg_talkx_increment_template_use_count |
| update_agent_level |
| update_device_last_seen |
| update_global_settings_updated_at |
| update_updated_at_column |
| validate_talkx_template_input |

## Function Signatures

| Signature |
|---|
| `accept_department_invite(p_code text)->jsonb|kind=f` |
| `add_agent_xp(p_profile_id uuid, p_xp integer)->json|kind=f` |
| `add_wa_tag_if_not_exists(p_contact_id uuid, p_prefix text, p_tag text)->void|kind=f` |
| `admin_set_role(_user_id uuid, _role app_role)->TABLE(out_user_id uuid, out_old_role app_role, out_new_role app_role)|kind=f` |
| `ai_budget_reconcile()->integer|kind=f` |
| `ai_budget_release(p_id uuid, p_reason text)->void|kind=f` |
| `ai_budget_reserve(p_idempotency_key text, p_user_id uuid, p_function_name text, p_estimated_tokens integer, p_limit_tokens integer, p_ttl_ms integer)->TABLE(id uuid, allowed boolean, used_tokens integer, limit_tokens integer)|kind=f` |
| `ai_budget_settle(p_id uuid, p_actual_tokens integer)->void|kind=f` |
| `ai_is_canonical_churn_risk(p_value text)->boolean|kind=f` |
| `ai_is_canonical_priority(p_value text)->boolean|kind=f` |
| `ai_is_canonical_sentiment(p_value text)->boolean|kind=f` |
| `ai_is_canonical_urgency(p_value text)->boolean|kind=f` |
| `ai_rate_limit_hit(p_key text, p_window_start timestamp with time zone)->integer|kind=f` |
| `ai_rate_limit_purge(p_older_than timestamp with time zone)->integer|kind=f` |
| `ai_text_array(p_value jsonb)->text[]|kind=f` |
| `ai_usage_cost_summary(p_since timestamp with time zone, p_until timestamp with time zone, p_top_functions integer)->jsonb|kind=f` |
| `ai_usage_summary(p_since timestamp with time zone, p_until timestamp with time zone, p_bucket_seconds integer, p_top_functions integer, p_top_users integer)->jsonb|kind=f` |
| `apply_pg_cron_escalonamento(p_reverter boolean)->integer|kind=f` |
| `apply_zapp_cron_secrets_l5()->void|kind=f` |
| `attribute_multiplix_item_reply(p_phone text, p_message_id text, p_quoted_external_id text)->jsonb|kind=f` |
| `attribute_talkx_reply(p_contact_id uuid, p_phone text, p_message_id uuid)->jsonb|kind=f` |
| `calculate_level(xp_amount bigint)->integer|kind=f` |
| `can_delete_contacts(p_ids uuid[])->TABLE(contact_id uuid, can_delete boolean)|kind=f` |
| `can_edit_contact(p_assigned_to uuid, p_queue_id uuid)->boolean|kind=f` |
| `can_edit_contact(p_assigned_to uuid, p_queue_id uuid, p_visible_agent_ids uuid[], p_profile_id uuid, p_is_admin boolean)->boolean|kind=f` |
| `cancel_ai_job(p_id uuid, p_reason text)->boolean|kind=f` |
| `catalog_rate_limit_hit(p_user uuid, p_action text, p_limit integer, p_window_ms integer)->boolean|kind=f` |
| `claim_ai_jobs(p_worker text, p_limit integer, p_lease_seconds integer)->SETOF ai_jobs|kind=f` |
| `claim_crm_sync_outbox(p_worker text, p_limit integer)->SETOF crm_sync_outbox|kind=f` |
| `claim_crm_sync_outbox_by_id(p_id uuid, p_worker text)->SETOF crm_sync_outbox|kind=f` |
| `claim_multiplix_item(p_dispatch_id uuid, p_item_id uuid, p_worker text, p_lease_seconds integer)->TABLE(item_id uuid, recipient_id uuid, block_id uuid, company_id uuid, claim_token uuid, claim_expires_at timestamp with time zone, delivery_attempt_count integer)|kind=f` |
| `claim_multiplix_recipient(p_dispatch_id uuid, p_recipient_id uuid, p_worker text, p_lease_seconds integer)->TABLE(recipient_id uuid, company_id uuid, claim_token uuid, claim_expires_at timestamp with time zone, delivery_attempt_count integer)|kind=f` |
| `claim_outbound_message(p_message_id uuid, p_agent_id uuid, p_worker text, p_lease_seconds integer)->TABLE(message_id uuid, client_message_id uuid, contact_id uuid, agent_id uuid, content text, message_type text, media_url text, caption text, media_filename text, media_mimetype text, reply_to_id uuid, reply_external_id text, whatsapp_connection_id uuid, whatsapp_instance_name text, contact_phone text, claim_token uuid, claim_expires_at timestamp with time zone, delivery_attempt_count integer)|kind=f` |
| `claim_talkx_campaign_worker(p_campaign_id uuid, p_worker text, p_lease_seconds integer)->boolean|kind=f` |
| `claim_talkx_recipient(p_campaign_id uuid, p_recipient_id uuid, p_worker text, p_lease_seconds integer)->TABLE(recipient_id uuid, contact_id uuid, claim_token uuid, claim_expires_at timestamp with time zone, delivery_attempt_count integer)|kind=f` |
| `cleanup_crm_sync_outbox(p_succeeded_days integer, p_dead_letter_days integer, p_limit integer)->integer|kind=f` |
| `cleanup_expired_challenges()->void|kind=f` |
| `cleanup_link_preview_cache()->TABLE(deleted_count integer, remaining_count integer, table_size_bytes bigint, duration_ms integer)|kind=f` |
| `clear_login_attempts(p_email text)->void|kind=f` |
| `close_conversation_atomic(p_contact_id uuid, p_client_request_id uuid, p_close_reason text, p_outcome text, p_classification text, p_notes text)->TABLE(closure_id uuid, event_id uuid, contact_id uuid, conversation_status text, conversation_status_changed_at timestamp with time zone)|kind=f` |
| `complete_crm_sync_outbox(p_id uuid, p_lease_token uuid, p_interaction_id text, p_contact_id text, p_company_id text)->void|kind=f` |
| `complete_multiplix_dispatch_if_drained(p_dispatch_id uuid)->boolean|kind=f` |
| `complete_multiplix_dispatch_if_items_drained(p_dispatch_id uuid)->boolean|kind=f` |
| `complete_multiplix_item(p_item_id uuid, p_claim_token uuid, p_status text, p_error_message text)->void|kind=f` |
| `complete_multiplix_recipient(p_recipient_id uuid, p_claim_token uuid, p_status text, p_error_message text)->void|kind=f` |
| `complete_outbound_message(p_message_id uuid, p_claim_token uuid, p_external_id text, p_delivery_status text)->messages|kind=f` |
| `complete_talkx_campaign_if_drained(p_campaign_id uuid)->boolean|kind=f` |
| `complete_talkx_recipient(p_recipient_id uuid, p_claim_token uuid, p_status text, p_error_message text)->void|kind=f` |
| `consume_rate_limit(p_key text, p_max integer, p_window_seconds integer)->TABLE(allowed boolean, remaining integer)|kind=f` |
| `contacts_count_by_type(include_legacy boolean)->TABLE(contact_type text, count bigint)|kind=f` |
| `conversation_closure_day(p_created_at timestamp with time zone)->date|kind=f` |
| `count_multiplix_dead_letters(p_dispatch_id uuid)->bigint|kind=f` |
| `count_searchbox_sessions_this_month()->integer|kind=f` |
| `create_department_invite(p_department_id uuid, p_max_uses integer, p_expires_hours integer)->jsonb|kind=f` |
| `current_profile_id()->uuid|kind=f` |
| `dashboard_contact_counts(p_since timestamp with time zone, p_until timestamp with time zone, p_queue uuid, p_agent uuid)->jsonb|kind=f` |
| `dashboard_hourly_volume(p_days integer, p_queue uuid, p_agent uuid)->TABLE(day date, hour integer, message_count bigint)|kind=f` |
| `dashboard_kpi(p_since timestamp with time zone, p_queue uuid, p_agent uuid)->jsonb|kind=f` |
| `dashboard_leaderboard(p_period text, p_limit integer)->jsonb|kind=f` |
| `dashboard_sentiment_alerts(p_since timestamp with time zone)->TABLE(id uuid, entity_id uuid, created_at timestamp with time zone, details jsonb)|kind=f` |
| `decrypt_gmail_token(p_encrypted bytea)->text|kind=f` |
| `delete_contact(p_id uuid)->uuid|kind=f` |
| `delete_contacts(p_ids uuid[])->integer|kind=f` |
| `delete_talkx_campaign(p_campaign_id uuid)->uuid|kind=f` |
| `duplicate_talkx_campaign(p_campaign_id uuid)->talkx_campaigns|kind=f` |
| `effective_role(_user_id uuid)->app_role|kind=f` |
| `encrypt_gmail_token(p_token text)->bytea|kind=f` |
| `enqueue_ai_job(p_idempotency_key text, p_kind text, p_function_name text, p_user_id uuid, p_payload jsonb, p_priority integer, p_available_at timestamp with time zone, p_expires_at timestamp with time zone, p_max_attempts integer)->uuid|kind=f` |
| `enqueue_outbound_message(p_contact_id uuid, p_client_message_id uuid, p_content text, p_message_type text, p_media_url text, p_reply_to_id uuid, p_whatsapp_connection_id uuid, p_caption text)->messages|kind=f` |
| `enqueue_rich_outbound_message(p_contact_id uuid, p_client_message_id uuid, p_display_content text, p_message_type text, p_delivery_payload jsonb, p_reply_to_id uuid, p_whatsapp_connection_id uuid)->messages|kind=f` |
| `expire_stale_agent_presence()->void|kind=f` |
| `fail_crm_sync_outbox(p_id uuid, p_lease_token uuid, p_error_code text)->void|kind=f` |
| `fail_outbound_message(p_message_id uuid, p_claim_token uuid, p_retryable boolean)->messages|kind=f` |
| `find_or_create_direct_conversation(other_profile_id uuid)->uuid|kind=f` |
| `finish_ai_job(p_id uuid, p_lease_token uuid, p_status text, p_result jsonb, p_error_code text)->boolean|kind=f` |
| `fn_list_audio_meme_categories()->TABLE(category text, total bigint)|kind=f` |
| `fn_list_audio_memes_for_user(p_category text, p_only_favs boolean, p_search text)->TABLE(id uuid, name text, audio_url text, category text, duration_seconds numeric, use_count integer, is_favorite boolean, created_at timestamp with time zone)|kind=f` |
| `fn_send_audio_meme(p_meme_id uuid)->audio_memes|kind=f` |
| `fn_toggle_user_meme_favorite(p_meme_id uuid)->boolean|kind=f` |
| `get_ai_jobs_cron_secret()->text|kind=f` |
| `get_avatars_refresh_cron_secret()->text|kind=f` |
| `get_channel_credentials(_connection_id uuid)->jsonb|kind=f` |
| `get_channel_credentials_safe(p_channel_id uuid)->jsonb|kind=f` |
| `get_connection_health_check_cron_secret()->text|kind=f` |
| `get_connection_instance(_connection_id uuid)->text|kind=f` |
| `get_connection_qr_code(_connection_id uuid)->text|kind=f` |
| `get_conversation_tab_counts(p_contact_id uuid)->TABLE(tasks_open integer, notes_total integer, files_total integer)|kind=f` |
| `get_crm_sync_health()->jsonb|kind=f` |
| `get_department_whatsapp_api_key(p_department_id uuid)->text|kind=f` |
| `get_department_whatsapp_credentials(p_department_id uuid)->jsonb|kind=f` |
| `get_gmail_tokens(p_account_id uuid)->TABLE(access_token text, refresh_token text)|kind=f` |
| `get_identity_matrix()->TABLE(auth_user_id uuid, email text, last_sign_in_at timestamp with time zone, is_banned boolean, profile_id uuid, display_name text, is_active boolean, profile_role_cached text, access_level text, user_roles_list text, effective_permissions text, created_at timestamp with time zone)|kind=f` |
| `get_instance_token(p_instance_id text)->text|kind=f` |
| `get_last_message_dates(contact_ids uuid[])->TABLE(contact_id uuid, last_message_at timestamp with time zone)|kind=f` |
| `get_multiplix_cron_secret()->text|kind=f` |
| `get_own_gmail_accounts()->TABLE(id uuid, user_id uuid, email_address text, is_active boolean, sync_status text, last_sync_at timestamp with time zone, last_error text, token_expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)|kind=f` |
| `get_own_lockout_status(p_email text)->TABLE(attempt_count integer, locked_until timestamp with time zone)|kind=f` |
| `get_profile_id_for_user(_user_id uuid)->uuid|kind=f` |
| `get_profile_role_for_check(p_user_id uuid)->TABLE(role text, access_level text, permissions jsonb)|kind=f` |
| `get_talkx_cron_secret()->text|kind=f` |
| `get_talkx_send_url()->text|kind=f` |
| `get_team_conversation_previews()->TABLE(conversation_id uuid, last_message_id uuid, last_message_content text, last_message_type text, last_message_sender_id uuid, last_message_created_at timestamp with time zone)|kind=f` |
| `get_team_inbox()->TABLE(conversation_id uuid, conversation_type text, conversation_name text, department_id uuid, last_message_at timestamp with time zone, last_message_text text, last_sender_id uuid, unread_count bigint, is_muted boolean, member_count bigint)|kind=f` |
| `get_team_messages_page(p_conversation_id uuid, p_before_id uuid, p_limit integer)->TABLE(id uuid, conversation_id uuid, sender_id uuid, content text, message_type text, reply_to_id uuid, media_url text, media_type text, media_bucket text, media_path text, is_edited boolean, created_at timestamp with time zone, updated_at timestamp with time zone, sender_name text, sender_avatar text)|kind=f` |
| `get_team_profiles()->TABLE(id uuid, user_id uuid, name text, email text, avatar_url text, role text, is_active boolean, department text, job_title text, phone text, max_chats integer, created_at timestamp with time zone)|kind=f` |
| `get_team_unread_counts()->TABLE(conversation_id uuid, unread_count bigint)|kind=f` |
| `get_visible_agent_ids(_user_id uuid)->SETOF uuid|kind=f` |
| `grant_agent_achievement(p_profile_id uuid, p_type text, p_name text, p_description text, p_xp_reward integer)->json|kind=f` |
| `has_role(_user_id uuid, _role app_role)->boolean|kind=f` |
| `heartbeat_ai_job(p_id uuid, p_lease_token uuid, p_lease_seconds integer)->boolean|kind=f` |
| `heartbeat_multiplix_item(p_item_id uuid, p_claim_token uuid, p_lease_seconds integer)->boolean|kind=f` |
| `increment_agent_messages(p_profile_id uuid, p_type text)->json|kind=f` |
| `increment_agent_resolutions(p_profile_id uuid)->json|kind=f` |
| `ingest_inbound_message(p_connection_id uuid, p_phone text, p_push_name text, p_content text, p_message_type text, p_media_url text, p_external_id text, p_created_at timestamp with time zone)->TABLE(contact_id uuid, contact_name text, assigned_to uuid, avatar_url text, contact_created boolean, message_id uuid, outcome text)|kind=f` |
| `is_account_locked(check_email text)->TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)|kind=f` |
| `is_admin(_user_id uuid)->boolean|kind=f` |
| `is_admin_or_supervisor(_user_id uuid)->boolean|kind=f` |
| `is_contact_visible_to_user(_contact_id uuid, _user_id uuid)->boolean|kind=f` |
| `is_country_allowed(check_country_code text)->boolean|kind=f` |
| `is_country_blocked(check_country_code text)->boolean|kind=f` |
| `is_ip_blocked(check_ip text)->boolean|kind=f` |
| `is_ip_whitelisted(check_ip text)->boolean|kind=f` |
| `is_privileged_contact_caller()->boolean|kind=f` |
| `is_team_conversation_member(_user_id uuid, _conversation_id uuid)->boolean|kind=f` |
| `is_valid_talkx_schedule_timezone(p_timezone text)->boolean|kind=f` |
| `is_within_business_hours(connection_id uuid)->boolean|kind=f` |
| `kick_talkx_campaign(p_campaign_id uuid)->void|kind=f` |
| `leave_team_group(p_conversation_id uuid)->jsonb|kind=f` |
| `link_email_crm_contact_guarded(p_zapp_contact_id uuid, p_external_contact_id text, p_external_company_id text, p_normalized_phone text, p_linked_by uuid)->void|kind=f` |
| `list_multiplix_claimable_items(p_dispatch_id uuid, p_limit integer)->TABLE(item_id uuid, recipient_id uuid, block_id uuid, block_order smallint, company_id uuid, attempt_count integer, next_attempt_at timestamp with time zone)|kind=f` |
| `list_multiplix_dead_letters(p_limit integer, p_dispatch_id uuid)->TABLE(item_id uuid, dispatch_id uuid, dispatch_name text, recipient_id uuid, block_id uuid, block_order smallint, attempt_count integer, error_class text, error_message text, failed_at timestamp with time zone, next_attempt_at timestamp with time zone, destino_mascarado text)|kind=f` |
| `log_audit_event(p_action text, p_entity_type text, p_entity_id text, p_details jsonb, p_user_agent text)->void|kind=f` |
| `log_talkx_campaign_checklist(p_campaign_id uuid, p_items jsonb)->uuid|kind=f` |
| `mark_first_response(p_contact_id uuid)->void|kind=f` |
| `mark_multiplix_item_dispatch_started(p_item_id uuid, p_claim_token uuid)->void|kind=f` |
| `mark_multiplix_recipient_dispatch_started(p_recipient_id uuid, p_claim_token uuid)->void|kind=f` |
| `mark_talkx_recipient_dispatch_started(p_recipient_id uuid, p_claim_token uuid)->void|kind=f` |
| `mark_team_conversation_read(p_conversation_id uuid)->void|kind=f` |
| `mcp_exec(sql text, max_rows integer)->jsonb|kind=f` |
| `mcp_exec_many(statements text[], max_rows integer)->jsonb|kind=f` |
| `merge_contacts_atomic(p_primary_id uuid, p_secondary_ids uuid[], p_merged_fields jsonb)->jsonb|kind=f` |
| `multiplix_confirm_dispatch(p_dispatch_id uuid, p_actor_id uuid, p_allow_manage_all boolean, p_expected_version integer, p_scheduled_at timestamp with time zone, p_correlation_id uuid)->TABLE(dispatch_id uuid, dispatch_version integer, status multiplix_dispatch_status, recipient_count integer, block_count integer, items_created integer, items_total integer, created boolean, scheduled_at timestamp with time zone)|kind=f` |
| `multiplix_connection_daily_usage(p_connection_id uuid)->jsonb|kind=f` |
| `multiplix_create_draft(p_name text, p_template text, p_recipients jsonb, p_client_request_id uuid, p_created_by uuid, p_whatsapp_connection_id uuid, p_scheduled_at timestamp with time zone, p_confirm_over_limit boolean)->TABLE(dispatch_id uuid, recipient_count integer, created boolean, duplicated_count integer)|kind=f` |
| `multiplix_dispatch_window_is_open(p_dispatch_id uuid)->boolean|kind=f` |
| `my_calls_kpi(p_scope text, p_channel text, p_from timestamp with time zone, p_to timestamp with time zone)->TABLE(total integer, outbound integer, inbound integer, missed_inbound integer, answered integer, avg_talk_seconds numeric)|kind=f` |
| `notify_due_reminders()->integer|kind=f` |
| `notify_due_tasks()->integer|kind=f` |
| `notify_searchbox_budget()->integer|kind=f` |
| `pause_dispatches_for_connection(p_connection_id uuid, p_reason text)->integer|kind=f` |
| `persist_conversation_analysis(p_contact_id uuid, p_analysis jsonb, p_analyzed_at timestamp with time zone)->jsonb|kind=f` |
| `persist_multiplix_item_message_snapshot(p_item_id uuid, p_claim_token uuid, p_personalized_message text)->text|kind=f` |
| `persist_multiplix_recipient_message_snapshot(p_recipient_id uuid, p_claim_token uuid, p_personalized_message text)->text|kind=f` |
| `persist_sentiment_alert(p_analysis_id uuid, p_contact_id uuid, p_recipient_user_id uuid, p_notification_title text, p_notification_message text, p_details jsonb)->TABLE(notification_created boolean, audit_created boolean, duplicate boolean)|kind=f` |
| `persist_talkx_recipient_message_snapshot(p_recipient_id uuid, p_claim_token uuid, p_personalized_message text, p_media_url text, p_media_type text, p_variant_id uuid)->TABLE(personalized_message text, media_url_snapshot text, media_type_snapshot text, variant_id_snapshot uuid)|kind=f` |
| `phone_variants(p_phone text)->text[]|kind=f` |
| `purge_talkx_expired_data(p_limit integer)->jsonb|kind=f` |
| `reap_ai_jobs()->integer|kind=f` |
| `reassign_absent_agents(inactive_minutes integer)->integer|kind=f` |
| `reassign_overloaded_agents()->integer|kind=f` |
| `record_failed_login(p_email text, p_ip_address text, p_user_agent text)->TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)|kind=f` |
| `record_incoming_call_event(p_contact_id uuid, p_whatsapp_connection_id uuid, p_status text, p_is_video boolean, p_provider_event_id text, p_should_notify boolean)->TABLE(call_id uuid, notification_id uuid, notification_created boolean, duplicate boolean)|kind=f` |
| `record_incoming_call_event(p_contact_id uuid, p_whatsapp_connection_id uuid, p_status text, p_is_video boolean, p_provider_event_id text, p_should_notify boolean, p_direction text)->TABLE(call_id uuid, notification_id uuid, notification_created boolean, duplicate boolean)|kind=f` |
| `record_multiplix_item_delivered(p_external_id text, p_connection_id uuid, p_event text)->boolean|kind=f` |
| `record_multiplix_item_sent(p_item_id uuid, p_claim_token uuid, p_external_id text)->void|kind=f` |
| `record_multiplix_recipient_delivered(p_external_id text, p_connection_id uuid)->boolean|kind=f` |
| `record_multiplix_recipient_sent(p_recipient_id uuid, p_claim_token uuid, p_external_id text)->void|kind=f` |
| `record_talkx_conversion(p_campaign_id uuid, p_external_ref text, p_value numeric, p_source text, p_currency text, p_link_id uuid, p_recipient_id uuid, p_occurred_at timestamp with time zone, p_attribution jsonb)->jsonb|kind=f` |
| `record_talkx_link_click(p_slug text, p_recipient uuid, p_ua text, p_ip_hash text)->jsonb|kind=f` |
| `record_talkx_recipient_delivered(p_external_id text, p_connection_id uuid, p_event text)->boolean|kind=f` |
| `record_talkx_recipient_receipt(p_external_id text, p_connection_id uuid, p_event text)->boolean|kind=f` |
| `record_talkx_recipient_sent(p_recipient_id uuid, p_claim_token uuid, p_external_id text)->void|kind=f` |
| `register_first_response_internal(p_contact_id uuid, p_responded_at timestamp with time zone, p_before_created_at timestamp with time zone)->void|kind=f` |
| `register_multiplix_connection_failure(p_connection_id uuid, p_signal text, p_error_class text)->jsonb|kind=f` |
| `release_multiplix_item_claim(p_item_id uuid, p_claim_token uuid)->boolean|kind=f` |
| `release_multiplix_recipient_claim(p_recipient_id uuid, p_claim_token uuid)->boolean|kind=f` |
| `release_talkx_campaign_worker(p_campaign_id uuid, p_worker text)->boolean|kind=f` |
| `release_talkx_recipient_claim(p_recipient_id uuid, p_claim_token uuid)->boolean|kind=f` |
| `remove_team_member(p_conversation_id uuid, p_profile_id uuid)->jsonb|kind=f` |
| `remove_wa_label_from_all_contacts(p_label_prefix text)->void|kind=f` |
| `remove_wa_tag_by_prefix(p_contact_id uuid, p_prefix text)->void|kind=f` |
| `rename_wa_label_on_all_contacts(p_label_prefix text, p_new_tag text)->void|kind=f` |
| `reorder_multiplix_blocks(p_dispatch_id uuid, p_block_ids uuid[])->TABLE(block_id uuid, block_order smallint)|kind=f` |
| `replace_ai_conversation_tags(p_contact_id uuid, p_tags jsonb)->jsonb|kind=f` |
| `replace_talkx_draft_recipients(p_campaign_id uuid, p_contact_ids uuid[])->integer|kind=f` |
| `require_contact_edit_permission(p_contact_id uuid)->void|kind=f` |
| `require_contact_global_admin()->void|kind=f` |
| `reschedule_multiplix_item(p_item_id uuid, p_claim_token uuid, p_retry_after timestamp with time zone, p_error_message text)->jsonb|kind=f` |
| `reschedule_multiplix_recipient(p_recipient_id uuid, p_claim_token uuid, p_retry_after timestamp with time zone, p_error_message text)->jsonb|kind=f` |
| `reschedule_talkx_recipient(p_recipient_id uuid, p_claim_token uuid, p_retry_after timestamp with time zone, p_error_message text)->jsonb|kind=f` |
| `resolve_contact_guard_actor()->uuid|kind=f` |
| `resolve_talkx_outcome_unknown(p_recipient_id uuid, p_resolution text, p_note text, p_confirm_duplicate_risk boolean)->jsonb|kind=f` |
| `retry_talkx_recipient(p_recipient_id uuid)->boolean|kind=f` |
| `retry_talkx_recipients(p_campaign_id uuid, p_recipient_ids uuid[])->jsonb|kind=f` |
| `save_talkx_campaign_draft(p_campaign_id uuid, p_expected_revision bigint, p_creation_key uuid, p_payload jsonb)->TABLE(campaign_id uuid, revision bigint, creation_replayed boolean)|kind=f` |
| `search_contacts(search_term text, contact_type_filter text, company_filter text, job_title_filter text, tag_filter text, date_from timestamp with time zone, sort_field text, sort_direction text, page_size integer, page_offset integer, include_legacy boolean)->TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint)|kind=f` |
| `search_knowledge_base(search_query text, max_results integer)->TABLE(id uuid, title text, content text, category text, tags text[], rank real)|kind=f` |
| `search_my_calls(p_scope text, p_channel text, p_direction text, p_result text, p_from timestamp with time zone, p_to timestamp with time zone, p_q text, p_limit integer, p_offset integer)->TABLE(id uuid, channel text, direction text, status text, end_reason text, started_at timestamp with time zone, answered_at timestamp with time zone, ended_at timestamp with time zone, talk_seconds integer, peer_number text, peer_name text, contact_id uuid, contact_name text, contact_phone text, contact_avatar_url text, agent_id uuid, answered_by uuid, recording_status text, agent_notes text, notes text, total_count bigint)|kind=f` |
| `search_team_messages(p_conversation_id uuid, p_query text, p_limit integer)->TABLE(id uuid, sender_id uuid, content text, created_at timestamp with time zone, sender_name text)|kind=f` |
| `set_call_agent_notes(p_call_id uuid, p_notes text)->void|kind=f` |
| `set_conversation_status(p_contact_id uuid, p_next text, p_reason text)->void|kind=f` |
| `set_department_whatsapp_config(p_department_id uuid, p_whatsapp_mode text, p_api_key text, p_instance_id text)->jsonb|kind=f` |
| `set_instance_token(p_connection_id uuid, p_token text)->uuid|kind=f` |
| `set_team_member_pref(p_conversation_id uuid, p_is_muted boolean)->void|kind=f` |
| `set_team_member_role(p_conversation_id uuid, p_profile_id uuid, p_new_role text)->void|kind=f` |
| `skill_based_assign(p_queue_id uuid)->uuid|kind=f` |
| `snapshot_talkx_campaign_audience(p_campaign_id uuid, p_expected_revision bigint)->jsonb|kind=f` |
| `store_gmail_tokens(p_account_id uuid, p_access_token text, p_refresh_token text)->void|kind=f` |
| `sweep_multiplix_stuck_items(p_limit integer)->integer|kind=f` |
| `sweep_multiplix_stuck_recipients(p_limit integer)->integer|kind=f` |
| `sweep_talkx_stuck_recipients(p_limit integer)->integer|kind=f` |
| `talk_me_claim(p_contact_id uuid)->TABLE(contact_id uuid, queue_id uuid, assigned_to uuid, conversation_status text, claimed_at timestamp with time zone)|kind=f` |
| `talk_me_eligible_waiting_contacts(p_queue_id uuid, p_contact_id uuid)->TABLE(contact_id uuid, contact_name text, avatar_url text, company text, job_title text, queue_id uuid, waiting_since timestamp with time zone, pending_message_count bigint, last_message_id uuid, last_message_content text, last_message_type text, last_message_media_url text, last_message_caption text, last_message_at timestamp with time zone)|kind=f` |
| `talk_me_list_queues()->TABLE(queue_id uuid, queue_name text, queue_color text, waiting_count bigint, oldest_waiting_at timestamp with time zone)|kind=f` |
| `talk_me_list_waiting(p_queue_id uuid, p_search text, p_limit integer, p_cursor_waiting_since timestamp with time zone, p_cursor_contact_id uuid)->TABLE(contact_id uuid, contact_name text, avatar_url text, company text, job_title text, queue_id uuid, queue_name text, queue_color text, waiting_since timestamp with time zone, pending_message_count bigint, last_message_id uuid, last_message_content text, last_message_type text, last_message_media_url text, last_message_caption text, last_message_at timestamp with time zone, total_count bigint, queue_position bigint)|kind=f` |
| `talkx_analytics_scope(p_audience_source text, p_department_id uuid, p_channel text)->TABLE(campaign_id uuid)|kind=f` |
| `talkx_audience_query(p_rules jsonb, p_contact_ids uuid[], p_respect_suppression boolean)->TABLE(id uuid, legacy_or_deleted boolean, invalid_phone boolean, is_suppressed boolean)|kind=f` |
| `talkx_benchmarks()->jsonb|kind=f` |
| `talkx_campaign_logs(p_campaign_id uuid, p_after timestamp with time zone, p_limit integer)->TABLE(id uuid, campaign_id uuid, recipient_id uuid, attempt integer, stage text, outcome text, http_status integer, error_code text, worker_id text, duration_ms integer, created_at timestamp with time zone)|kind=f` |
| `talkx_campaign_pace(p_campaign_id uuid)->jsonb|kind=f` |
| `talkx_campaign_reply_stats(p_campaign_id uuid)->jsonb|kind=f` |
| `talkx_campaign_report(p_campaign uuid)->jsonb|kind=f` |
| `talkx_connection_send_budget(p_connection_id uuid)->jsonb|kind=f` |
| `talkx_delete_link(p_link_id uuid)->jsonb|kind=f` |
| `talkx_engine_alerts()->jsonb|kind=f` |
| `talkx_engine_cron_runs(p_limit integer)->TABLE(runid bigint, jobid bigint, status text, return_message text, start_time timestamp with time zone, end_time timestamp with time zone)|kind=f` |
| `talkx_engine_window_open(p_campaign_id uuid)->boolean|kind=f` |
| `talkx_increment_delivered(p_campaign_id uuid)->void|kind=f` |
| `talkx_match_optout(p_text text)->text|kind=f` |
| `talkx_next_recipients(p_campaign_id uuid, p_limit integer)->TABLE(recipient_id uuid, contact_id uuid, status text, attempt_count integer, retry_after timestamp with time zone, personalized_message text, contact_name text, contact_nickname text, contact_phone text, contact_company text)|kind=f` |
| `talkx_normalize_optout_text(p_text text)->text|kind=f` |
| `talkx_overview_stats(p_from timestamp with time zone, p_to timestamp with time zone, p_audience_source text, p_department_id uuid, p_channel text, p_timezone text)->jsonb|kind=f` |
| `talkx_recipient_is_suppressed(p_contact_id uuid, p_phone text)->boolean|kind=f` |
| `talkx_resolve_audience(p_rules jsonb, p_segment_ids uuid[], p_mode text, p_limit integer, p_after uuid)->jsonb|kind=f` |
| `talkx_resolve_speed_pace(p_speed_profile text, p_send_interval_min integer, p_send_interval_max integer, p_typing_delay_min integer, p_typing_delay_max integer)->TABLE(speed_profile text, send_interval_min integer, send_interval_max integer, typing_delay_min integer, typing_delay_max integer)|kind=f` |
| `talkx_segment_tags(p_segment uuid)->jsonb|kind=f` |
| `talkx_set_campaign_investment(p_campaign_id uuid, p_investment numeric)->jsonb|kind=f` |
| `talkx_suppress_contact(p_contact_id uuid, p_phone text, p_reason text, p_reason_code talkx_blacklist_reason, p_origin text, p_source_message_id uuid, p_campaign_id uuid)->uuid|kind=f` |
| `talkx_upsert_link(p_campaign_id uuid, p_label text, p_target_url text, p_link_id uuid, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text)->jsonb|kind=f` |
| `toggle_team_reaction(p_message_id uuid, p_emoji text)->jsonb|kind=f` |
| `transfer_team_conversation_department(p_conversation_id uuid, p_to_department_id uuid)->jsonb|kind=f` |
| `transition_multiplix_dispatch(p_dispatch_id uuid, p_action text, p_pause_reason text)->TABLE(dispatch_id uuid, previous_status text, current_status text)|kind=f` |
| `transition_talkx_campaign(p_campaign_id uuid, p_action text, p_pause_reason text, p_actor_id uuid)->TABLE(campaign_id uuid, previous_status text, current_status text)|kind=f` |
| `trigger_ai_jobs_tick()->void|kind=f` |
| `trigger_pending_multiplix_dispatches()->void|kind=f` |
| `trigger_talkx_engine_tick()->void|kind=f` |
| `update_agent_streak(p_profile_id uuid, p_increment boolean)->json|kind=f` |
| `update_own_profile(p_display_name text, p_avatar_url text, p_phone text, p_email text, p_signature text, p_birthday text)->boolean|kind=f` |
| `update_talkx_campaign_limits(p_campaign_id uuid, p_expected_revision bigint, p_limits jsonb)->TABLE(campaign_id uuid, revision bigint)|kind=f` |
| `update_talkx_template_with_snapshot(p_template_id uuid, p_expected_updated_at timestamp with time zone, p_name text, p_description text, p_category text, p_content text, p_media_url text, p_media_type text, p_tags text[], p_status text, p_custom_variables text[])->TABLE(template_id uuid, updated_at timestamp with time zone, version_number integer)|kind=f` |
| `upsert_crm_contact_link_guarded(p_zapp_contact_id uuid, p_external_contact_id text, p_external_company_id text, p_normalized_phone text)->void|kind=f` |
| `upsert_my_call(p_id uuid, p_direction text, p_status text, p_channel text, p_peer_number text, p_peer_name text, p_contact_id uuid, p_provider_call_id text, p_answered_at timestamp with time zone, p_ended_at timestamp with time zone, p_end_reason text, p_talk_seconds integer)->uuid|kind=f` |
| `user_has_permission(_user_id uuid, _permission_name text)->boolean|kind=f` |
