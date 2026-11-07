# CHANGELOG do snapshot Supabase

Diff semântico gerado a cada coleta em que algo mudou.

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

