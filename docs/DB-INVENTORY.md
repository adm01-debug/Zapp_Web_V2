# DB Inventory — Zapp Web V2

> Gerado em: 2026-10-04 | Fonte: `supabase/schema-catalog.json` (format v2) | Database: postgres schema: public server: PG 17

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
| agent_achievements | 7 | 0 |
| agent_presence | 3 | 1 |
| agent_skills | 5 | 0 |
| agent_stats | 14 | 2 |
| agent_visibility_grants | 5 | 1 |
| ai_budget_reservations | 10 | 1 |
| ai_conversation_tags | 6 | 1 |
| ai_jobs | 23 | 5 |
| ai_model_prices | 11 | 5 |
| ai_providers | 15 | 0 |
| ai_usage_logs | 16 | 0 |
| allowed_countries | 5 | 0 |
| audio_meme_favorites | 4 | 0 |
| audio_memes | 9 | 0 |
| audit_logs | 9 | 1 |
| auto_close_config | 7 | 0 |
| automations | 12 | 0 |
| away_messages | 6 | 0 |
| blocked_countries | 6 | 0 |
| blocked_ips | 10 | 0 |
| business_hours | 8 | 1 |
| calls | 23 | 6 |
| campaign_ab_variants | 11 | 0 |
| campaign_contacts | 8 | 1 |
| campaigns | 22 | 2 |
| catalog_favorites | 7 | 0 |
| catalog_rate_limit_hits | 4 | 0 |
| catalog_rate_limits | 4 | 0 |
| catalog_send_events | 13 | 2 |
| channel_connections | 14 | 0 |
| channel_routing_rules | 8 | 0 |
| chatbot_executions | 10 | 1 |
| chatbot_flows | 15 | 1 |
| client_wallet_rules | 7 | 0 |
| connection_health_logs | 7 | 0 |
| contact_custom_fields | 7 | 0 |
| contact_deletion_audit | 9 | 2 |
| contact_identity_map | 5 | 0 |
| contact_notes | 9 | 1 |
| contact_purchases | 13 | 0 |
| contacts | 41 | 6 |
| conversation_analyses | 25 | 3 |
| conversation_closures | 9 | 0 |
| conversation_events | 11 | 1 |
| conversation_memory | 11 | 0 |
| conversation_sla | 10 | 0 |
| conversation_snoozes | 6 | 0 |
| conversation_tasks | 19 | 2 |
| crisis_room_alerts | 10 | 0 |
| crm_contact_links | 9 | 2 |
| crm_sync_outbox | 20 | 10 |
| csat_auto_config | 8 | 0 |
| csat_surveys | 7 | 0 |
| custom_emojis | 9 | 0 |
| deal_activities | 6 | 0 |
| department_audit_logs | 7 | 1 |
| department_invitations | 13 | 4 |
| department_invites | 6 | 0 |
| departments | 8 | 1 |
| edge_rate_limits | 4 | 0 |
| email_attachments | 7 | 0 |
| email_labels | 9 | 0 |
| email_messages | 24 | 2 |
| email_threads | 20 | 0 |
| entity_versions | 8 | 0 |
| favorite_contacts | 4 | 0 |
| feature_flags | 5 | 1 |
| followup_executions | 9 | 0 |
| followup_sequences | 8 | 0 |
| followup_steps | 8 | 0 |
| geo_blocking_settings | 5 | 1 |
| global_settings | 7 | 1 |
| gmail_accounts | 14 | 0 |
| goals_configurations | 10 | 1 |
| ip_whitelist | 5 | 0 |
| knowledge_base_articles | 11 | 0 |
| knowledge_base_files | 9 | 0 |
| link_preview_cache | 6 | 0 |
| link_preview_cache_metrics | 6 | 0 |
| login_attempts | 9 | 1 |
| message_reactions | 6 | 1 |
| message_templates | 10 | 0 |
| messages | 37 | 4 |
| meta_capi_events | 11 | 0 |
| mfa_sessions | 6 | 0 |
| multiplix_audience_members | 6 | 0 |
| multiplix_audiences | 10 | 1 |
| multiplix_blocks | 16 | 1 |
| multiplix_delivery_items | 25 | 1 |
| multiplix_dispatches | 34 | 1 |
| multiplix_events | 8 | 1 |
| multiplix_recipients | 28 | 2 |
| multiplix_voice_assets | 10 | 2 |
| multiplix_voice_grants | 9 | 1 |
| notifications | 10 | 0 |
| nps_surveys | 7 | 2 |
| number_reputation | 12 | 0 |
| passkey_credentials | 11 | 0 |
| password_reset_requests | 13 | 1 |
| payment_links | 16 | 0 |
| performance_snapshots | 14 | 0 |
| permissions | 5 | 0 |
| pinned_conversations | 5 | 0 |
| playbooks | 9 | 0 |
| products | 14 | 0 |
| profiles | 21 | 1 |
| query_telemetry | 13 | 0 |
| queue_goals | 9 | 0 |
| queue_members | 5 | 0 |
| queue_positions | 8 | 0 |
| queue_skill_requirements | 5 | 0 |
| queues | 9 | 0 |
| rate_limit_configs | 9 | 0 |
| rate_limit_logs | 10 | 0 |
| reminders | 10 | 0 |
| role_permissions | 4 | 0 |
| sales_deals | 17 | 0 |
| sales_pipeline_stages | 7 | 0 |
| saved_filters | 9 | 0 |
| scheduled_messages | 13 | 0 |
| scheduled_report_configs | 12 | 0 |
| scheduled_reports | 12 | 0 |
| security_alerts | 12 | 0 |
| sicoob_contact_mapping | 7 | 0 |
| sla_configurations | 9 | 0 |
| sla_rules | 15 | 0 |
| stickers | 10 | 0 |
| talkx_alerts | 6 | 1 |
| talkx_blacklist | 13 | 2 |
| talkx_campaign_events | 8 | 3 |
| talkx_campaign_segments | 7 | 2 |
| talkx_campaigns | 60 | 10 |
| talkx_conversions | 11 | 2 |
| talkx_delivery_log | 11 | 5 |
| talkx_link_clicks | 6 | 0 |
| talkx_links | 12 | 2 |
| talkx_optout_keywords | 5 | 1 |
| talkx_recipients | 32 | 4 |
| talkx_segments | 12 | 2 |
| talkx_settings | 4 | 0 |
| talkx_template_variants | 8 | 5 |
| talkx_template_versions | 14 | 3 |
| talkx_templates | 15 | 2 |
| talkx_test_send_claims | 5 | 0 |
| team_conversation_members | 9 | 2 |
| team_conversations | 11 | 3 |
| team_message_reactions | 6 | 1 |
| team_message_receipts | 7 | 3 |
| team_messages | 15 | 6 |
| training_sessions | 11 | 0 |
| user_devices | 13 | 0 |
| user_roles | 4 | 0 |
| user_service_accounts | 7 | 0 |
| user_sessions | 10 | 0 |
| user_settings | 35 | 6 |
| voice_command_logs | 9 | 0 |
| warroom_alerts | 8 | 0 |
| webauthn_challenges | 6 | 1 |
| webhook_failures | 11 | 0 |
| webhook_rate_limits | 6 | 0 |
| whatsapp_connection_queues | 4 | 0 |
| whatsapp_connections | 21 | 1 |
| whatsapp_flows | 12 | 0 |
| whatsapp_groups | 11 | 0 |
| whatsapp_templates | 14 | 0 |
| whisper_messages | 7 | 0 |

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

| Constraint | Table |
|---|---|
| agent_presence_status_check | agent_presence |
| chk_level_min_one | agent_stats |
| chk_xp_non_negative | agent_stats |
| agent_visibility_grants_no_self_grant | agent_visibility_grants |
| ai_budget_reservations_status_check | ai_budget_reservations |
| ai_conversation_tags_source_known | ai_conversation_tags |
| ai_jobs_attempt_count_nonneg | ai_jobs |
| ai_jobs_max_attempts_range | ai_jobs |
| ai_jobs_payload_object | ai_jobs |
| ai_jobs_priority_range | ai_jobs |
| ai_jobs_status_check | ai_jobs |
| ai_model_prices_currency_check | ai_model_prices |
| ai_model_prices_price_check | ai_model_prices |
| ai_model_prices_source_check | ai_model_prices |
| ai_model_prices_unit_check | ai_model_prices |
| ai_model_prices_vigencia_check | ai_model_prices |
| audit_logs_action_not_empty | audit_logs |
| business_hours_day_of_week_check | business_hours |
| calls_channel_check | calls |
| calls_direction_check | calls |
| calls_end_reason_check | calls |
| calls_provider_event_id_length | calls |
| calls_recording_status_check | calls |
| calls_status_check | calls |
| campaign_contacts_status_check | campaign_contacts |
| campaigns_status_check | campaigns |
| campaigns_target_type_check | campaigns |
| catalog_send_events_status_check | catalog_send_events |
| catalog_send_events_template_check | catalog_send_events |
| chatbot_executions_status_check | chatbot_executions |
| chatbot_flows_trigger_type_check | chatbot_flows |
| contact_deletion_audit_operation_check | contact_deletion_audit |
| contact_deletion_audit_shape_check | contact_deletion_audit |
| contact_notes_category_check | contact_notes |
| chk_contact_type | contacts |
| chk_conversation_status_values | contacts |
| contacts_ai_priority_canonical | contacts |
| contacts_ai_sentiment_canonical | contacts |
| contacts_email_format | contacts |
| contacts_phone_not_empty | contacts |
| conversation_analyses_churn_risk_canonical | conversation_analyses |
| conversation_analyses_sentiment_canonical | conversation_analyses |
| conversation_analyses_urgency_canonical | conversation_analyses |
| conversation_events_closure_type_check | conversation_events |
| conversation_tasks_status_check | conversation_tasks |
| conversation_tasks_waiting_reason_check | conversation_tasks |
| crm_contact_links_link_source_check | crm_contact_links |
| crm_contact_links_normalized_phone_check | crm_contact_links |
| crm_sync_outbox_attempt_count_check | crm_sync_outbox |
| crm_sync_outbox_external_ids_bounded | crm_sync_outbox |
| crm_sync_outbox_lease_state | crm_sync_outbox |
| crm_sync_outbox_max_attempts_check | crm_sync_outbox |
| crm_sync_outbox_normalized_phone_check | crm_sync_outbox |
| crm_sync_outbox_payload_check | crm_sync_outbox |
| crm_sync_outbox_payload_size | crm_sync_outbox |
| crm_sync_outbox_phone_state | crm_sync_outbox |
| crm_sync_outbox_status_check | crm_sync_outbox |
| crm_sync_outbox_success_state | crm_sync_outbox |
| department_audit_logs_action_check | department_audit_logs |
| department_invitations_code_format | department_invitations |
| department_invitations_expires_after_created | department_invitations |
| department_invitations_max_uses_positive | department_invitations |
| department_invitations_use_count_nonneg | department_invitations |
| departments_whatsapp_mode_check | departments |
| email_messages_direction_check | email_messages |
| email_messages_from_format | email_messages |
| feature_flags_key_check | feature_flags |
| geo_blocking_settings_mode_check | geo_blocking_settings |
| global_settings_no_plaintext_api_token | global_settings |
| goal_owner_check | goals_configurations |
| login_attempts_attempt_count_max | login_attempts |
| reaction_author_check | message_reactions |
| messages_delivery_attempt_count_nonnegative | messages |
| messages_delivery_claim_state | messages |
| messages_message_type_check | messages |
| messages_sender_check | messages |
| multiplix_audiences_kind_check | multiplix_audiences |
| multiplix_blocks_personalization_mode_check | multiplix_blocks |
| multiplix_delivery_items_reply_attribution_check | multiplix_delivery_items |
| multiplix_dispatches_origin_check | multiplix_dispatches |
| multiplix_events_kind_check | multiplix_events |
| multiplix_recipients_delivery_claim_state | multiplix_recipients |
| multiplix_recipients_external_id_bounded | multiplix_recipients |
| multiplix_voice_assets_caracteres_nao_negativo | multiplix_voice_assets |
| multiplix_voice_assets_duracao_nao_negativa | multiplix_voice_assets |
| multiplix_voice_grants_alvo_obrigatorio | multiplix_voice_grants |
| nps_surveys_score_check | nps_surveys |
| nps_surveys_survey_type_check | nps_surveys |
| password_reset_requests_status_check | password_reset_requests |
| profiles_role_check | profiles |
| talkx_alerts_kind_check | talkx_alerts |
| talkx_blacklist_origin_check | talkx_blacklist |
| talkx_blacklist_phone_or_contact | talkx_blacklist |
| talkx_campaign_events_entity_type_format_check | talkx_campaign_events |
| talkx_campaign_events_target_check | talkx_campaign_events |
| talkx_campaign_events_type_check | talkx_campaign_events |
| talkx_campaign_segments_position_check | talkx_campaign_segments |
| talkx_campaign_segments_status_check | talkx_campaign_segments |
| talkx_campaigns_audience_source_check | talkx_campaigns |
| talkx_campaigns_draft_step_range | talkx_campaigns |
| talkx_campaigns_legal_basis_check | talkx_campaigns |
| talkx_campaigns_max_per_minute_check | talkx_campaigns |
| talkx_campaigns_revision_positive | talkx_campaigns |
| talkx_campaigns_schedule_timezone_valid | talkx_campaigns |
| talkx_campaigns_send_interval_max_check | talkx_campaigns |
| talkx_campaigns_send_window_valid | talkx_campaigns |
| talkx_campaigns_speed_profile_check | talkx_campaigns |
| talkx_campaigns_status_check | talkx_campaigns |
| talkx_conversions_source_check | talkx_conversions |
| talkx_conversions_value_check | talkx_conversions |
| talkx_delivery_log_attempt_check | talkx_delivery_log |
| talkx_delivery_log_duration_check | talkx_delivery_log |
| talkx_delivery_log_http_status_check | talkx_delivery_log |
| talkx_delivery_log_outcome_check | talkx_delivery_log |
| talkx_delivery_log_stage_check | talkx_delivery_log |
| talkx_links_label_format_check | talkx_links |
| talkx_links_target_url_check | talkx_links |
| talkx_optout_keywords_match_mode_check | talkx_optout_keywords |
| talkx_recipients_delivery_claim_state | talkx_recipients |
| talkx_recipients_external_id_bounded | talkx_recipients |
| talkx_recipients_media_snapshot_shape | talkx_recipients |
| talkx_recipients_status_check | talkx_recipients |
| talkx_segments_origin_check | talkx_segments |
| talkx_segments_status_check | talkx_segments |
| talkx_template_variants_content_check | talkx_template_variants |
| talkx_template_variants_label_check | talkx_template_variants |
| talkx_template_variants_media_type_check | talkx_template_variants |
| talkx_template_variants_media_url_check | talkx_template_variants |
| talkx_template_variants_weight_check | talkx_template_variants |
| talkx_template_versions_media_type_check | talkx_template_versions |
| talkx_template_versions_status_check | talkx_template_versions |
| talkx_template_versions_version_positive | talkx_template_versions |
| talkx_templates_media_type_check | talkx_templates |
| talkx_templates_status_check | talkx_templates |
| team_conv_members_last_read_at_check | team_conversation_members |
| team_conversation_members_member_role_check | team_conversation_members |
| team_conversations_dept_required | team_conversations |
| team_conversations_group_name_required | team_conversations |
| team_conversations_type_check | team_conversations |
| team_reactions_emoji_length | team_message_reactions |
| team_message_receipts_status_check | team_message_receipts |
| team_receipts_delivered_at_required | team_message_receipts |
| team_receipts_read_at_required | team_message_receipts |
| team_messages_content_not_empty | team_messages |
| team_messages_media_consistency | team_messages |
| team_messages_message_type_check | team_messages |
| team_messages_no_self_reply | team_messages |
| team_messages_status_check | team_messages |
| team_messages_type_media_check | team_messages |
| user_settings_goal_sound_type_valid | user_settings |
| user_settings_mention_sound_type_valid | user_settings |
| user_settings_message_sound_type_valid | user_settings |
| user_settings_sla_sound_type_valid | user_settings |
| user_settings_sound_volume_range | user_settings |
| user_settings_transcription_sound_type_valid | user_settings |
| webauthn_challenges_type_check | webauthn_challenges |
| whatsapp_connections_status_check | whatsapp_connections |

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
| accept_department_invite(p_code text)->jsonb|kind=f |
| add_agent_xp(p_profile_id uuid, p_xp integer)->json|kind=f |
| add_wa_tag_if_not_exists(p_contact_id uuid, p_prefix text, p_tag text)->void|kind=f |
| admin_set_role(_user_id uuid, _role app_role)->TABLE(out_user_id uuid, out_old_role app_role, out_new_role app_role)|kind=f |
| ai_budget_reconcile()->integer|kind=f |
| ai_budget_release(p_id uuid, p_reason text)->void|kind=f |
| ai_budget_reserve(p_idempotency_key text, p_user_id uuid, p_function_name text, p_estimated_tokens integer, p_limit_tokens integer, p_ttl_ms integer)->TABLE(id uuid, allowed boolean, used_tokens integer, limit_tokens integer)|kind=f |
| ai_budget_settle(p_id uuid, p_actual_tokens integer)->void|kind=f |
| ai_is_canonical_churn_risk(p_value text)->boolean|kind=f |
| ai_is_canonical_priority(p_value text)->boolean|kind=f |
| ai_is_canonical_sentiment(p_value text)->boolean|kind=f |
| ai_is_canonical_urgency(p_value text)->boolean|kind=f |
| ai_rate_limit_hit(p_key text, p_window_start timestamp with time zone)->integer|kind=f |
| ai_rate_limit_purge(p_older_than timestamp with time zone)->integer|kind=f |
| ai_text_array(p_value jsonb)->text[]|kind=f |
| ai_usage_cost_summary(p_since timestamp with time zone, p_until timestamp with time zone, p_top_functions integer)->jsonb|kind=f |
| ai_usage_summary(p_since timestamp with time zone, p_until timestamp with time zone, p_bucket_seconds integer, p_top_functions integer, p_top_users integer)->jsonb|kind=f |
| apply_pg_cron_escalonamento(p_reverter boolean)->integer|kind=f |
| apply_zapp_cron_secrets_l5()->void|kind=f |
| attribute_multiplix_item_reply(p_phone text, p_message_id text, p_quoted_external_id text)->jsonb|kind=f |
| attribute_talkx_reply(p_contact_id uuid, p_phone text, p_message_id uuid)->jsonb|kind=f |
| calculate_level(xp_amount bigint)->integer|kind=f |
| can_delete_contacts(p_ids uuid[])->TABLE(contact_id uuid, can_delete boolean)|kind=f |
| can_edit_contact(p_assigned_to uuid, p_queue_id uuid)->boolean|kind=f |
| can_edit_contact(p_assigned_to uuid, p_queue_id uuid, p_visible_agent_ids uuid[], p_profile_id uuid, p_is_admin boolean)->boolean|kind=f |
| cancel_ai_job(p_id uuid, p_reason text)->boolean|kind=f |
| catalog_rate_limit_hit(p_user uuid, p_action text, p_limit integer, p_window_ms integer)->boolean|kind=f |
| claim_ai_jobs(p_worker text, p_limit integer, p_lease_seconds integer)->SETOF ai_jobs|kind=f |
| claim_crm_sync_outbox(p_worker text, p_limit integer)->SETOF crm_sync_outbox|kind=f |
| claim_crm_sync_outbox_by_id(p_id uuid, p_worker text)->SETOF crm_sync_outbox|kind=f |
| claim_multiplix_item(p_dispatch_id uuid, p_item_id uuid, p_worker text, p_lease_seconds integer)->TABLE(item_id uuid, recipient_id uuid, block_id uuid, company_id uuid, claim_token uuid, claim_expires_at timestamp with time zone, delivery_attempt_count integer)|kind=f |
| claim_multiplix_recipient(p_dispatch_id uuid, p_recipient_id uuid, p_worker text, p_lease_seconds integer)->TABLE(recipient_id uuid, company_id uuid, claim_token uuid, claim_expires_at timestamp with time zone, delivery_attempt_count integer)|kind=f |
| claim_outbound_message(p_message_id uuid, p_agent_id uuid, p_worker text, p_lease_seconds integer)->TABLE(message_id uuid, client_message_id uuid, contact_id uuid, agent_id uuid, content text, message_type text, media_url text, caption text, media_filename text, media_mimetype text, reply_to_id uuid, reply_external_id text, whatsapp_connection_id uuid, whatsapp_instance_name text, contact_phone text, claim_token uuid, claim_expires_at timestamp with time zone, delivery_attempt_count integer)|kind=f |
| claim_talkx_campaign_worker(p_campaign_id uuid, p_worker text, p_lease_seconds integer)->boolean|kind=f |
| claim_talkx_recipient(p_campaign_id uuid, p_recipient_id uuid, p_worker text, p_lease_seconds integer)->TABLE(recipient_id uuid, contact_id uuid, claim_token uuid, claim_expires_at timestamp with time zone, delivery_attempt_count integer)|kind=f |
| cleanup_crm_sync_outbox(p_succeeded_days integer, p_dead_letter_days integer, p_limit integer)->integer|kind=f |
| cleanup_expired_challenges()->void|kind=f |
| cleanup_link_preview_cache()->TABLE(deleted_count integer, remaining_count integer, table_size_bytes bigint, duration_ms integer)|kind=f |
| clear_login_attempts(p_email text)->void|kind=f |
| close_conversation_atomic(p_contact_id uuid, p_client_request_id uuid, p_close_reason text, p_outcome text, p_classification text, p_notes text)->TABLE(closure_id uuid, event_id uuid, contact_id uuid, conversation_status text, conversation_status_changed_at timestamp with time zone)|kind=f |
| complete_crm_sync_outbox(p_id uuid, p_lease_token uuid, p_interaction_id text, p_contact_id text, p_company_id text)->void|kind=f |
| complete_multiplix_dispatch_if_drained(p_dispatch_id uuid)->boolean|kind=f |
| complete_multiplix_dispatch_if_items_drained(p_dispatch_id uuid)->boolean|kind=f |
| complete_multiplix_item(p_item_id uuid, p_claim_token uuid, p_status text, p_error_message text)->void|kind=f |
| complete_multiplix_recipient(p_recipient_id uuid, p_claim_token uuid, p_status text, p_error_message text)->void|kind=f |
| complete_outbound_message(p_message_id uuid, p_claim_token uuid, p_external_id text, p_delivery_status text)->messages|kind=f |
| complete_talkx_campaign_if_drained(p_campaign_id uuid)->boolean|kind=f |
| complete_talkx_recipient(p_recipient_id uuid, p_claim_token uuid, p_status text, p_error_message text)->void|kind=f |
| consume_rate_limit(p_key text, p_max integer, p_window_seconds integer)->TABLE(allowed boolean, remaining integer)|kind=f |
| contacts_count_by_type(include_legacy boolean)->TABLE(contact_type text, count bigint)|kind=f |
| conversation_closure_day(p_created_at timestamp with time zone)->date|kind=f |
| count_multiplix_dead_letters(p_dispatch_id uuid)->bigint|kind=f |
| count_searchbox_sessions_this_month()->integer|kind=f |
| create_department_invite(p_department_id uuid, p_max_uses integer, p_expires_hours integer)->jsonb|kind=f |
| current_profile_id()->uuid|kind=f |
| dashboard_contact_counts(p_since timestamp with time zone, p_until timestamp with time zone, p_queue uuid, p_agent uuid)->jsonb|kind=f |
| dashboard_hourly_volume(p_days integer, p_queue uuid, p_agent uuid)->TABLE(day date, hour integer, message_count bigint)|kind=f |
| dashboard_kpi(p_since timestamp with time zone, p_queue uuid, p_agent uuid)->jsonb|kind=f |
| dashboard_leaderboard(p_period text, p_limit integer)->jsonb|kind=f |
| dashboard_sentiment_alerts(p_since timestamp with time zone)->TABLE(id uuid, entity_id uuid, created_at timestamp with time zone, details jsonb)|kind=f |
| decrypt_gmail_token(p_encrypted bytea)->text|kind=f |
| delete_contact(p_id uuid)->uuid|kind=f |
| delete_contacts(p_ids uuid[])->integer|kind=f |
| delete_talkx_campaign(p_campaign_id uuid)->uuid|kind=f |
| duplicate_talkx_campaign(p_campaign_id uuid)->talkx_campaigns|kind=f |
| effective_role(_user_id uuid)->app_role|kind=f |
| encrypt_gmail_token(p_token text)->bytea|kind=f |
| enqueue_ai_job(p_idempotency_key text, p_kind text, p_function_name text, p_user_id uuid, p_payload jsonb, p_priority integer, p_available_at timestamp with time zone, p_expires_at timestamp with time zone, p_max_attempts integer)->uuid|kind=f |
| enqueue_outbound_message(p_contact_id uuid, p_client_message_id uuid, p_content text, p_message_type text, p_media_url text, p_reply_to_id uuid, p_whatsapp_connection_id uuid, p_caption text)->messages|kind=f |
| enqueue_rich_outbound_message(p_contact_id uuid, p_client_message_id uuid, p_display_content text, p_message_type text, p_delivery_payload jsonb, p_reply_to_id uuid, p_whatsapp_connection_id uuid)->messages|kind=f |
| expire_stale_agent_presence()->void|kind=f |
| fail_crm_sync_outbox(p_id uuid, p_lease_token uuid, p_error_code text)->void|kind=f |
| fail_outbound_message(p_message_id uuid, p_claim_token uuid, p_retryable boolean)->messages|kind=f |
| find_or_create_direct_conversation(other_profile_id uuid)->uuid|kind=f |
| finish_ai_job(p_id uuid, p_lease_token uuid, p_status text, p_result jsonb, p_error_code text)->boolean|kind=f |
| fn_list_audio_meme_categories()->TABLE(category text, total bigint)|kind=f |
| fn_list_audio_memes_for_user(p_category text, p_only_favs boolean, p_search text)->TABLE(id uuid, name text, audio_url text, category text, duration_seconds numeric, use_count integer, is_favorite boolean, created_at timestamp with time zone)|kind=f |
| fn_send_audio_meme(p_meme_id uuid)->audio_memes|kind=f |
| fn_toggle_user_meme_favorite(p_meme_id uuid)->boolean|kind=f |
| get_ai_jobs_cron_secret()->text|kind=f |
| get_avatars_refresh_cron_secret()->text|kind=f |
| get_channel_credentials(_connection_id uuid)->jsonb|kind=f |
| get_channel_credentials_safe(p_channel_id uuid)->jsonb|kind=f |
| get_connection_health_check_cron_secret()->text|kind=f |
| get_connection_instance(_connection_id uuid)->text|kind=f |
| get_connection_qr_code(_connection_id uuid)->text|kind=f |
| get_conversation_tab_counts(p_contact_id uuid)->TABLE(tasks_open integer, notes_total integer, files_total integer)|kind=f |
| get_crm_sync_health()->jsonb|kind=f |
| get_department_whatsapp_api_key(p_department_id uuid)->text|kind=f |
| get_department_whatsapp_credentials(p_department_id uuid)->jsonb|kind=f |
| get_gmail_tokens(p_account_id uuid)->TABLE(access_token text, refresh_token text)|kind=f |
| get_identity_matrix()->TABLE(auth_user_id uuid, email text, last_sign_in_at timestamp with time zone, is_banned boolean, profile_id uuid, display_name text, is_active boolean, profile_role_cached text, access_level text, user_roles_list text, effective_permissions text, created_at timestamp with time zone)|kind=f |
| get_instance_token(p_instance_id text)->text|kind=f |
| get_last_message_dates(contact_ids uuid[])->TABLE(contact_id uuid, last_message_at timestamp with time zone)|kind=f |
| get_multiplix_cron_secret()->text|kind=f |
| get_own_gmail_accounts()->TABLE(id uuid, user_id uuid, email_address text, is_active boolean, sync_status text, last_sync_at timestamp with time zone, last_error text, token_expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)|kind=f |
| get_own_lockout_status(p_email text)->TABLE(attempt_count integer, locked_until timestamp with time zone)|kind=f |
| get_profile_id_for_user(_user_id uuid)->uuid|kind=f |
| get_profile_role_for_check(p_user_id uuid)->TABLE(role text, access_level text, permissions jsonb)|kind=f |
| get_talkx_cron_secret()->text|kind=f |
| get_talkx_send_url()->text|kind=f |
| get_team_conversation_previews()->TABLE(conversation_id uuid, last_message_id uuid, last_message_content text, last_message_type text, last_message_sender_id uuid, last_message_created_at timestamp with time zone)|kind=f |
| get_team_inbox()->TABLE(conversation_id uuid, conversation_type text, conversation_name text, department_id uuid, last_message_at timestamp with time zone, last_message_text text, last_sender_id uuid, unread_count bigint, is_muted boolean, member_count bigint)|kind=f |
| get_team_messages_page(p_conversation_id uuid, p_before_id uuid, p_limit integer)->TABLE(id uuid, conversation_id uuid, sender_id uuid, content text, message_type text, reply_to_id uuid, media_url text, media_type text, media_bucket text, media_path text, is_edited boolean, created_at timestamp with time zone, updated_at timestamp with time zone, sender_name text, sender_avatar text)|kind=f |
| get_team_profiles()->TABLE(id uuid, user_id uuid, name text, email text, avatar_url text, role text, is_active boolean, department text, job_title text, phone text, max_chats integer, created_at timestamp with time zone)|kind=f |
| get_team_unread_counts()->TABLE(conversation_id uuid, unread_count bigint)|kind=f |
| get_visible_agent_ids(_user_id uuid)->SETOF uuid|kind=f |
| grant_agent_achievement(p_profile_id uuid, p_type text, p_name text, p_description text, p_xp_reward integer)->json|kind=f |
| has_role(_user_id uuid, _role app_role)->boolean|kind=f |
| heartbeat_ai_job(p_id uuid, p_lease_token uuid, p_lease_seconds integer)->boolean|kind=f |
| heartbeat_multiplix_item(p_item_id uuid, p_claim_token uuid, p_lease_seconds integer)->boolean|kind=f |
| increment_agent_messages(p_profile_id uuid, p_type text)->json|kind=f |
| increment_agent_resolutions(p_profile_id uuid)->json|kind=f |
| ingest_inbound_message(p_connection_id uuid, p_phone text, p_push_name text, p_content text, p_message_type text, p_media_url text, p_external_id text, p_created_at timestamp with time zone)->TABLE(contact_id uuid, contact_name text, assigned_to uuid, avatar_url text, contact_created boolean, message_id uuid, outcome text)|kind=f |
| is_account_locked(check_email text)->TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)|kind=f |
| is_admin(_user_id uuid)->boolean|kind=f |
| is_admin_or_supervisor(_user_id uuid)->boolean|kind=f |
| is_contact_visible_to_user(_contact_id uuid, _user_id uuid)->boolean|kind=f |
| is_country_allowed(check_country_code text)->boolean|kind=f |
| is_country_blocked(check_country_code text)->boolean|kind=f |
| is_ip_blocked(check_ip text)->boolean|kind=f |
| is_ip_whitelisted(check_ip text)->boolean|kind=f |
| is_privileged_contact_caller()->boolean|kind=f |
| is_team_conversation_member(_user_id uuid, _conversation_id uuid)->boolean|kind=f |
| is_valid_talkx_schedule_timezone(p_timezone text)->boolean|kind=f |
| is_within_business_hours(connection_id uuid)->boolean|kind=f |
| kick_talkx_campaign(p_campaign_id uuid)->void|kind=f |
| leave_team_group(p_conversation_id uuid)->jsonb|kind=f |
| link_email_crm_contact_guarded(p_zapp_contact_id uuid, p_external_contact_id text, p_external_company_id text, p_normalized_phone text, p_linked_by uuid)->void|kind=f |
| list_multiplix_claimable_items(p_dispatch_id uuid, p_limit integer)->TABLE(item_id uuid, recipient_id uuid, block_id uuid, block_order smallint, company_id uuid, attempt_count integer, next_attempt_at timestamp with time zone)|kind=f |
| list_multiplix_dead_letters(p_limit integer, p_dispatch_id uuid)->TABLE(item_id uuid, dispatch_id uuid, dispatch_name text, recipient_id uuid, block_id uuid, block_order smallint, attempt_count integer, error_class text, error_message text, failed_at timestamp with time zone, next_attempt_at timestamp with time zone, destino_mascarado text)|kind=f |
| log_audit_event(p_action text, p_entity_type text, p_entity_id text, p_details jsonb, p_user_agent text)->void|kind=f |
| log_talkx_campaign_checklist(p_campaign_id uuid, p_items jsonb)->uuid|kind=f |
| mark_first_response(p_contact_id uuid)->void|kind=f |
| mark_multiplix_item_dispatch_started(p_item_id uuid, p_claim_token uuid)->void|kind=f |
| mark_multiplix_recipient_dispatch_started(p_recipient_id uuid, p_claim_token uuid)->void|kind=f |
| mark_talkx_recipient_dispatch_started(p_recipient_id uuid, p_claim_token uuid)->void|kind=f |
| mark_team_conversation_read(p_conversation_id uuid)->void|kind=f |
| mcp_exec(sql text, max_rows integer)->jsonb|kind=f |
| mcp_exec_many(statements text[], max_rows integer)->jsonb|kind=f |
| merge_contacts_atomic(p_primary_id uuid, p_secondary_ids uuid[], p_merged_fields jsonb)->jsonb|kind=f |
| multiplix_confirm_dispatch(p_dispatch_id uuid, p_actor_id uuid, p_allow_manage_all boolean, p_expected_version integer, p_scheduled_at timestamp with time zone, p_correlation_id uuid)->TABLE(dispatch_id uuid, dispatch_version integer, status multiplix_dispatch_status, recipient_count integer, block_count integer, items_created integer, items_total integer, created boolean, scheduled_at timestamp with time zone)|kind=f |
| multiplix_connection_daily_usage(p_connection_id uuid)->jsonb|kind=f |
| multiplix_create_draft(p_name text, p_template text, p_recipients jsonb, p_client_request_id uuid, p_created_by uuid, p_whatsapp_connection_id uuid, p_scheduled_at timestamp with time zone, p_confirm_over_limit boolean)->TABLE(dispatch_id uuid, recipient_count integer, created boolean, duplicated_count integer)|kind=f |
| multiplix_dispatch_window_is_open(p_dispatch_id uuid)->boolean|kind=f |
| my_calls_kpi(p_scope text, p_channel text, p_from timestamp with time zone, p_to timestamp with time zone)->TABLE(total integer, outbound integer, inbound integer, missed_inbound integer, answered integer, avg_talk_seconds numeric)|kind=f |
| notify_due_reminders()->integer|kind=f |
| notify_due_tasks()->integer|kind=f |
| notify_searchbox_budget()->integer|kind=f |
| pause_dispatches_for_connection(p_connection_id uuid, p_reason text)->integer|kind=f |
| persist_conversation_analysis(p_contact_id uuid, p_analysis jsonb, p_analyzed_at timestamp with time zone)->jsonb|kind=f |
| persist_multiplix_item_message_snapshot(p_item_id uuid, p_claim_token uuid, p_personalized_message text)->text|kind=f |
| persist_multiplix_recipient_message_snapshot(p_recipient_id uuid, p_claim_token uuid, p_personalized_message text)->text|kind=f |
| persist_sentiment_alert(p_analysis_id uuid, p_contact_id uuid, p_recipient_user_id uuid, p_notification_title text, p_notification_message text, p_details jsonb)->TABLE(notification_created boolean, audit_created boolean, duplicate boolean)|kind=f |
| persist_talkx_recipient_message_snapshot(p_recipient_id uuid, p_claim_token uuid, p_personalized_message text, p_media_url text, p_media_type text, p_variant_id uuid)->TABLE(personalized_message text, media_url_snapshot text, media_type_snapshot text, variant_id_snapshot uuid)|kind=f |
| phone_variants(p_phone text)->text[]|kind=f |
| purge_talkx_expired_data(p_limit integer)->jsonb|kind=f |
| reap_ai_jobs()->integer|kind=f |
| reassign_absent_agents(inactive_minutes integer)->integer|kind=f |
| reassign_overloaded_agents()->integer|kind=f |
| record_failed_login(p_email text, p_ip_address text, p_user_agent text)->TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)|kind=f |
| record_incoming_call_event(p_contact_id uuid, p_whatsapp_connection_id uuid, p_status text, p_is_video boolean, p_provider_event_id text, p_should_notify boolean)->TABLE(call_id uuid, notification_id uuid, notification_created boolean, duplicate boolean)|kind=f |
| record_incoming_call_event(p_contact_id uuid, p_whatsapp_connection_id uuid, p_status text, p_is_video boolean, p_provider_event_id text, p_should_notify boolean, p_direction text)->TABLE(call_id uuid, notification_id uuid, notification_created boolean, duplicate boolean)|kind=f |
| record_multiplix_item_delivered(p_external_id text, p_connection_id uuid, p_event text)->boolean|kind=f |
| record_multiplix_item_sent(p_item_id uuid, p_claim_token uuid, p_external_id text)->void|kind=f |
| record_multiplix_recipient_delivered(p_external_id text, p_connection_id uuid)->boolean|kind=f |
| record_multiplix_recipient_sent(p_recipient_id uuid, p_claim_token uuid, p_external_id text)->void|kind=f |
| record_talkx_conversion(p_campaign_id uuid, p_external_ref text, p_value numeric, p_source text, p_currency text, p_link_id uuid, p_recipient_id uuid, p_occurred_at timestamp with time zone, p_attribution jsonb)->jsonb|kind=f |
| record_talkx_link_click(p_slug text, p_recipient uuid, p_ua text, p_ip_hash text)->jsonb|kind=f |
| record_talkx_recipient_delivered(p_external_id text, p_connection_id uuid, p_event text)->boolean|kind=f |
| record_talkx_recipient_receipt(p_external_id text, p_connection_id uuid, p_event text)->boolean|kind=f |
| record_talkx_recipient_sent(p_recipient_id uuid, p_claim_token uuid, p_external_id text)->void|kind=f |
| register_first_response_internal(p_contact_id uuid, p_responded_at timestamp with time zone, p_before_created_at timestamp with time zone)->void|kind=f |
| register_multiplix_connection_failure(p_connection_id uuid, p_signal text, p_error_class text)->jsonb|kind=f |
| release_multiplix_item_claim(p_item_id uuid, p_claim_token uuid)->boolean|kind=f |
| release_multiplix_recipient_claim(p_recipient_id uuid, p_claim_token uuid)->boolean|kind=f |
| release_talkx_campaign_worker(p_campaign_id uuid, p_worker text)->boolean|kind=f |
| release_talkx_recipient_claim(p_recipient_id uuid, p_claim_token uuid)->boolean|kind=f |
| remove_team_member(p_conversation_id uuid, p_profile_id uuid)->jsonb|kind=f |
| remove_wa_label_from_all_contacts(p_label_prefix text)->void|kind=f |
| remove_wa_tag_by_prefix(p_contact_id uuid, p_prefix text)->void|kind=f |
| rename_wa_label_on_all_contacts(p_label_prefix text, p_new_tag text)->void|kind=f |
| reorder_multiplix_blocks(p_dispatch_id uuid, p_block_ids uuid[])->TABLE(block_id uuid, block_order smallint)|kind=f |
| replace_ai_conversation_tags(p_contact_id uuid, p_tags jsonb)->jsonb|kind=f |
| replace_talkx_draft_recipients(p_campaign_id uuid, p_contact_ids uuid[])->integer|kind=f |
| require_contact_edit_permission(p_contact_id uuid)->void|kind=f |
| require_contact_global_admin()->void|kind=f |
| reschedule_multiplix_item(p_item_id uuid, p_claim_token uuid, p_retry_after timestamp with time zone, p_error_message text)->jsonb|kind=f |
| reschedule_multiplix_recipient(p_recipient_id uuid, p_claim_token uuid, p_retry_after timestamp with time zone, p_error_message text)->jsonb|kind=f |
| reschedule_talkx_recipient(p_recipient_id uuid, p_claim_token uuid, p_retry_after timestamp with time zone, p_error_message text)->jsonb|kind=f |
| resolve_contact_guard_actor()->uuid|kind=f |
| resolve_talkx_outcome_unknown(p_recipient_id uuid, p_resolution text, p_note text, p_confirm_duplicate_risk boolean)->jsonb|kind=f |
| retry_talkx_recipient(p_recipient_id uuid)->boolean|kind=f |
| retry_talkx_recipients(p_campaign_id uuid, p_recipient_ids uuid[])->jsonb|kind=f |
| save_talkx_campaign_draft(p_campaign_id uuid, p_expected_revision bigint, p_creation_key uuid, p_payload jsonb)->TABLE(campaign_id uuid, revision bigint, creation_replayed boolean)|kind=f |
| search_contacts(search_term text, contact_type_filter text, company_filter text, job_title_filter text, tag_filter text, date_from timestamp with time zone, sort_field text, sort_direction text, page_size integer, page_offset integer, include_legacy boolean)->TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint)|kind=f |
| search_knowledge_base(search_query text, max_results integer)->TABLE(id uuid, title text, content text, category text, tags text[], rank real)|kind=f |
| search_my_calls(p_scope text, p_channel text, p_direction text, p_result text, p_from timestamp with time zone, p_to timestamp with time zone, p_q text, p_limit integer, p_offset integer)->TABLE(id uuid, channel text, direction text, status text, end_reason text, started_at timestamp with time zone, answered_at timestamp with time zone, ended_at timestamp with time zone, talk_seconds integer, peer_number text, peer_name text, contact_id uuid, contact_name text, contact_phone text, contact_avatar_url text, agent_id uuid, answered_by uuid, recording_status text, agent_notes text, notes text, total_count bigint)|kind=f |
| search_team_messages(p_conversation_id uuid, p_query text, p_limit integer)->TABLE(id uuid, sender_id uuid, content text, created_at timestamp with time zone, sender_name text)|kind=f |
| set_call_agent_notes(p_call_id uuid, p_notes text)->void|kind=f |
| set_conversation_status(p_contact_id uuid, p_next text, p_reason text)->void|kind=f |
| set_department_whatsapp_config(p_department_id uuid, p_whatsapp_mode text, p_api_key text, p_instance_id text)->jsonb|kind=f |
| set_instance_token(p_connection_id uuid, p_token text)->uuid|kind=f |
| set_team_member_pref(p_conversation_id uuid, p_is_muted boolean)->void|kind=f |
| set_team_member_role(p_conversation_id uuid, p_profile_id uuid, p_new_role text)->void|kind=f |
| skill_based_assign(p_queue_id uuid)->uuid|kind=f |
| snapshot_talkx_campaign_audience(p_campaign_id uuid, p_expected_revision bigint)->jsonb|kind=f |
| store_gmail_tokens(p_account_id uuid, p_access_token text, p_refresh_token text)->void|kind=f |
| sweep_multiplix_stuck_items(p_limit integer)->integer|kind=f |
| sweep_multiplix_stuck_recipients(p_limit integer)->integer|kind=f |
| sweep_talkx_stuck_recipients(p_limit integer)->integer|kind=f |
| talk_me_claim(p_contact_id uuid)->TABLE(contact_id uuid, queue_id uuid, assigned_to uuid, conversation_status text, claimed_at timestamp with time zone)|kind=f |
| talk_me_eligible_waiting_contacts(p_queue_id uuid, p_contact_id uuid)->TABLE(contact_id uuid, contact_name text, avatar_url text, company text, job_title text, queue_id uuid, waiting_since timestamp with time zone, pending_message_count bigint, last_message_id uuid, last_message_content text, last_message_type text, last_message_media_url text, last_message_caption text, last_message_at timestamp with time zone)|kind=f |
| talk_me_list_queues()->TABLE(queue_id uuid, queue_name text, queue_color text, waiting_count bigint, oldest_waiting_at timestamp with time zone)|kind=f |
| talk_me_list_waiting(p_queue_id uuid, p_search text, p_limit integer, p_cursor_waiting_since timestamp with time zone, p_cursor_contact_id uuid)->TABLE(contact_id uuid, contact_name text, avatar_url text, company text, job_title text, queue_id uuid, queue_name text, queue_color text, waiting_since timestamp with time zone, pending_message_count bigint, last_message_id uuid, last_message_content text, last_message_type text, last_message_media_url text, last_message_caption text, last_message_at timestamp with time zone, total_count bigint, queue_position bigint)|kind=f |
| talkx_analytics_scope(p_audience_source text, p_department_id uuid, p_channel text)->TABLE(campaign_id uuid)|kind=f |
| talkx_audience_query(p_rules jsonb, p_contact_ids uuid[], p_respect_suppression boolean)->TABLE(id uuid, legacy_or_deleted boolean, invalid_phone boolean, is_suppressed boolean)|kind=f |
| talkx_benchmarks()->jsonb|kind=f |
| talkx_campaign_logs(p_campaign_id uuid, p_after timestamp with time zone, p_limit integer)->TABLE(id uuid, campaign_id uuid, recipient_id uuid, attempt integer, stage text, outcome text, http_status integer, error_code text, worker_id text, duration_ms integer, created_at timestamp with time zone)|kind=f |
| talkx_campaign_pace(p_campaign_id uuid)->jsonb|kind=f |
| talkx_campaign_reply_stats(p_campaign_id uuid)->jsonb|kind=f |
| talkx_campaign_report(p_campaign uuid)->jsonb|kind=f |
| talkx_connection_send_budget(p_connection_id uuid)->jsonb|kind=f |
| talkx_delete_link(p_link_id uuid)->jsonb|kind=f |
| talkx_engine_alerts()->jsonb|kind=f |
| talkx_engine_cron_runs(p_limit integer)->TABLE(runid bigint, jobid bigint, status text, return_message text, start_time timestamp with time zone, end_time timestamp with time zone)|kind=f |
| talkx_engine_window_open(p_campaign_id uuid)->boolean|kind=f |
| talkx_increment_delivered(p_campaign_id uuid)->void|kind=f |
| talkx_match_optout(p_text text)->text|kind=f |
| talkx_next_recipients(p_campaign_id uuid, p_limit integer)->TABLE(recipient_id uuid, contact_id uuid, status text, attempt_count integer, retry_after timestamp with time zone, personalized_message text, contact_name text, contact_nickname text, contact_phone text, contact_company text)|kind=f |
| talkx_normalize_optout_text(p_text text)->text|kind=f |
| talkx_overview_stats(p_from timestamp with time zone, p_to timestamp with time zone, p_audience_source text, p_department_id uuid, p_channel text, p_timezone text)->jsonb|kind=f |
| talkx_recipient_is_suppressed(p_contact_id uuid, p_phone text)->boolean|kind=f |
| talkx_resolve_audience(p_rules jsonb, p_segment_ids uuid[], p_mode text, p_limit integer, p_after uuid)->jsonb|kind=f |
| talkx_resolve_speed_pace(p_speed_profile text, p_send_interval_min integer, p_send_interval_max integer, p_typing_delay_min integer, p_typing_delay_max integer)->TABLE(speed_profile text, send_interval_min integer, send_interval_max integer, typing_delay_min integer, typing_delay_max integer)|kind=f |
| talkx_segment_tags(p_segment uuid)->jsonb|kind=f |
| talkx_set_campaign_investment(p_campaign_id uuid, p_investment numeric)->jsonb|kind=f |
| talkx_suppress_contact(p_contact_id uuid, p_phone text, p_reason text, p_reason_code talkx_blacklist_reason, p_origin text, p_source_message_id uuid, p_campaign_id uuid)->uuid|kind=f |
| talkx_upsert_link(p_campaign_id uuid, p_label text, p_target_url text, p_link_id uuid, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text)->jsonb|kind=f |
| toggle_team_reaction(p_message_id uuid, p_emoji text)->jsonb|kind=f |
| transfer_team_conversation_department(p_conversation_id uuid, p_to_department_id uuid)->jsonb|kind=f |
| transition_multiplix_dispatch(p_dispatch_id uuid, p_action text, p_pause_reason text)->TABLE(dispatch_id uuid, previous_status text, current_status text)|kind=f |
| transition_talkx_campaign(p_campaign_id uuid, p_action text, p_pause_reason text, p_actor_id uuid)->TABLE(campaign_id uuid, previous_status text, current_status text)|kind=f |
| trigger_ai_jobs_tick()->void|kind=f |
| trigger_pending_multiplix_dispatches()->void|kind=f |
| trigger_talkx_engine_tick()->void|kind=f |
| update_agent_streak(p_profile_id uuid, p_increment boolean)->json|kind=f |
| update_own_profile(p_display_name text, p_avatar_url text, p_phone text, p_email text, p_signature text, p_birthday text)->boolean|kind=f |
| update_talkx_campaign_limits(p_campaign_id uuid, p_expected_revision bigint, p_limits jsonb)->TABLE(campaign_id uuid, revision bigint)|kind=f |
| update_talkx_template_with_snapshot(p_template_id uuid, p_expected_updated_at timestamp with time zone, p_name text, p_description text, p_category text, p_content text, p_media_url text, p_media_type text, p_tags text[], p_status text, p_custom_variables text[])->TABLE(template_id uuid, updated_at timestamp with time zone, version_number integer)|kind=f |
| upsert_crm_contact_link_guarded(p_zapp_contact_id uuid, p_external_contact_id text, p_external_company_id text, p_normalized_phone text)->void|kind=f |
| upsert_my_call(p_id uuid, p_direction text, p_status text, p_channel text, p_peer_number text, p_peer_name text, p_contact_id uuid, p_provider_call_id text, p_answered_at timestamp with time zone, p_ended_at timestamp with time zone, p_end_reason text, p_talk_seconds integer)->uuid|kind=f |
| user_has_permission(_user_id uuid, _permission_name text)->boolean|kind=f |

