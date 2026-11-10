# CHANGELOG do snapshot Supabase

Diff semântico gerado a cada coleta em que algo mudou.

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

