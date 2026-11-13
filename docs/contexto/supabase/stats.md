# Métricas (voláteis — mudam sem alteração de schema)

Valores aproximados de propósito, para não gerar commits a cada coleta. Fora de `snapshot.json`; o bruto está em `stats.json`.

## Banco

| métrica | valor |
|---|---|
| tamanho | 444.3 MB |
| schema public | 302.5 MB |
| schema _bkp_261023 | 3.6 MB |
| schema ops | 184.0 KB |


## Tabelas (ordenadas por tamanho)

| tabela | linhas (~) | total | heap | índices | linhas mortas (~) | seq scans (~) | idx scans (~) | último autovacuum |
|---|---|---|---|---|---|---|---|---|
| public.email_attachments | ~71.5k | 138.6 MB | 61.6 MB | 76.9 MB | 0 | 0 | ~30 |  |
| public.email_messages | ~3.2k | 58.4 MB | 4.2 MB | 17.9 MB | 0 | ~140 | ~620 |  |
| public.messages | ~53.5k | 42.2 MB | 12.8 MB | 29.3 MB | ~30 | ~70 | ~525.3k |  |
| public.audit_logs | ~82.6k | 38.4 MB | 25.4 MB | 12.9 MB | 0 | 0 | ~30 |  |
| public.talkx_recipients | ~8.2k | 3.5 MB | 1.2 MB | 2.3 MB | 0 | 2 | ~31.8k |  |
| public.contacts | ~4.3k | 3.0 MB | 1.3 MB | 1.7 MB | 1 | ~200 | ~997.5k |  |
| public.email_threads | ~2.5k | 2.2 MB | 1.5 MB | 680.0 KB | 0 | ~410 | ~283.1k |  |
| _bkp_261023.schema_migrations | ~920 | 1.5 MB | 1.0 MB | 0 B | 0 | 0 |  |  |
| public.notifications | ~1.6k | 1.5 MB | 944.0 KB | 568.0 KB | ~310 | 3 | ~44.8k | 2026-11-10 |
| public.conversation_events | ~3.3k | 1.4 MB | 656.0 KB | 784.0 KB | 0 | 4 | ~1.6k |  |
| _bkp_261023.contacts | ~3.7k | 1.2 MB | 1.1 MB | 0 B | 0 | 0 |  |  |
| public.conversation_sla | ~1.8k | 696.0 KB | 344.0 KB | 328.0 KB | 0 | ~30 | ~305.8k |  |
| public.connection_health_logs | ~2k | 624.0 KB | 232.0 KB | 352.0 KB | ~180 | 6 | ~1.9k | 2026-11-12 |
| _bkp_261023.functions_before | ~360 | 600.0 KB | 512.0 KB | 0 B | 0 | 0 |  |  |
| public.stickers | ~780 | 496.0 KB | 400.0 KB | 64.0 KB | 0 | 3 | 0 |  |
| public.crm_sync_outbox | ~460 | 472.0 KB | 200.0 KB | 232.0 KB | 0 | 6 | 0 |  |
| public.contact_deletion_audit | ~720 | 384.0 KB | 176.0 KB | 176.0 KB | 0 | 3 | 0 |  |
| public.talkx_campaigns | 0 | 304.0 KB | 8.0 KB | 288.0 KB | 1 | ~70 | ~43.4k |  |
| public.conversation_tasks | 1 | 272.0 KB | 8.0 KB | 224.0 KB | 0 | ~9.4k | 0 |  |
| _bkp_261023.policies_before | ~460 | 264.0 KB | 256.0 KB | 0 B | 0 | 0 |  |  |
| public.whatsapp_connections | 2 | 264.0 KB | 32.0 KB | 96.0 KB | ~20 | ~4.9k | ~10.8k |  |
| public.ai_jobs | ~170 | 240.0 KB | 104.0 KB | 96.0 KB | 0 | ~8.2k | ~32.8k |  |
| public.security_alerts | ~120 | 240.0 KB | 144.0 KB | 64.0 KB | 0 | 4 | ~12.2k |  |
| public.audio_memes | ~540 | 232.0 KB | 144.0 KB | 56.0 KB | 2 | 6 | 4 |  |
| public.warroom_alerts | ~500 | 232.0 KB | 128.0 KB | 72.0 KB | 0 | 4 | ~1.7k |  |
| public.message_reactions | ~110 | 216.0 KB | 16.0 KB | 160.0 KB | 0 | ~130 | ~40 |  |
| public.whatsapp_groups | ~190 | 216.0 KB | 120.0 KB | 64.0 KB | 0 | ~300 | 0 |  |
| ops.hermes_change_log | 0 | 184.0 KB | 16.0 KB | 64.0 KB | 0 | 0 | 0 |  |
| public.user_sessions | ~120 | 184.0 KB | 48.0 KB | 96.0 KB | 2 | ~20 | 4 |  |
| public.ai_usage_logs | ~30 | 176.0 KB | 16.0 KB | 120.0 KB | 0 | 7 | 1 |  |
| public.catalog_rate_limit_hits | ~200 | 168.0 KB | 72.0 KB | 56.0 KB | ~20 | 4 | ~300 | 2026-11-12 |
| public.conversation_closures | ~20 | 168.0 KB | 16.0 KB | 112.0 KB | 0 | ~20 | ~120 |  |
| public.calls | ~20 | 152.0 KB | 16.0 KB | 104.0 KB | 0 | ~3.4k | 2 |  |
| public.talkx_campaign_events | 0 | 128.0 KB | 32.0 KB | 64.0 KB | 0 | 4 | 9 |  |
| public.conversation_analyses | 0 | 120.0 KB | 8.0 KB | 104.0 KB | 0 | 3 | ~20 |  |
| public.agent_achievements | ~110 | 112.0 KB | 24.0 KB | 56.0 KB | 0 | 3 | ~300 |  |
| public.reminders | 1 | 112.0 KB | 8.0 KB | 96.0 KB | 0 | 3 | 0 |  |
| public.team_conversations | 2 | 112.0 KB | 8.0 KB | 96.0 KB | 4 | ~100 | 1 |  |
| public.user_devices | ~140 | 112.0 KB | 32.0 KB | 48.0 KB | 0 | 3 | 7 |  |
| public.profiles | 4 | 104.0 KB | 8.0 KB | 56.0 KB | 2 | ~60.4k | ~3.3k |  |
| public.talkx_blacklist | 0 | 104.0 KB | 0 B | 96.0 KB | 0 | ~40 | ~43.6k |  |
| public.catalog_send_events | 0 | 96.0 KB | 8.0 KB | 80.0 KB | 0 | 4 | ~160 |  |
| public.gmail_accounts | 1 | 96.0 KB | 16.0 KB | 48.0 KB | ~10 | ~2.6k | 0 |  |
| public.goals_configurations | 0 | 96.0 KB | 8.0 KB | 80.0 KB | 0 | 3 | ~4k |  |
| public.login_attempts | 3 | 96.0 KB | 8.0 KB | 48.0 KB | 1 | ~10 | 1 |  |
| public.team_messages | 2 | 96.0 KB | 8.0 KB | 80.0 KB | 0 | ~280 | 0 |  |
| public.user_roles | 4 | 88.0 KB | 8.0 KB | 48.0 KB | 2 | ~4.2M | ~1.9k |  |
| public.link_preview_cache | 1 | 80.0 KB | 8.0 KB | 32.0 KB | 0 | ~20 | 0 |  |
| public.talkx_segments | 1 | 80.0 KB | 8.0 KB | 64.0 KB | 0 | ~60 | 0 |  |
| public.talkx_template_versions | 0 | 80.0 KB | 8.0 KB | 64.0 KB | 0 | 3 | 0 |  |
| public.talkx_templates | 5 | 80.0 KB | 8.0 KB | 64.0 KB | 0 | ~10 | 0 |  |
| public._zapp_fn_before | ~350 | 72.0 KB | 64.0 KB | 0 B | 0 | 4 |  |  |
| public.favorite_contacts | 0 | 72.0 KB | 8.0 KB | 64.0 KB | 0 | 3 | ~830 |  |
| public.multiplix_delivery_items | 0 | 72.0 KB | 0 B | 64.0 KB | 0 | 3 | ~4.2k |  |
| public.pinned_conversations | 0 | 72.0 KB | 8.0 KB | 64.0 KB | 0 | 3 | ~420 |  |
| public.queue_members | 4 | 72.0 KB | 8.0 KB | 64.0 KB | 0 | ~3.5k | ~20 |  |
| public.team_conversation_members | 4 | 72.0 KB | 8.0 KB | 56.0 KB | 0 | ~690 | ~1.7k |  |
| public.agent_presence | 6 | 64.0 KB | 8.0 KB | 16.0 KB | ~20 | ~13.5k | ~9.1k | 2026-11-13 |
| public.ai_budget_reservations | 0 | 64.0 KB | 8.0 KB | 48.0 KB | 0 | 7 | 0 |  |
| public.ai_conversation_tags | 0 | 64.0 KB | 8.0 KB | 48.0 KB | 0 | 3 | 0 |  |
| public.catalog_rate_limits | 4 | 64.0 KB | 8.0 KB | 16.0 KB | 0 | 4 | 0 |  |
| public.csat_surveys | 0 | 64.0 KB | 0 B | 56.0 KB | 0 | ~20 | ~4.2k |  |
| public.edge_rate_limits | 7 | 64.0 KB | 8.0 KB | 16.0 KB | ~10 | ~560 | ~1.9k | 2026-11-13 |
| public.email_labels | ~20 | 64.0 KB | 8.0 KB | 48.0 KB | 0 | ~30 | 0 |  |
| public.performance_snapshots | 0 | 64.0 KB | 8.0 KB | 48.0 KB | 0 | 3 | 0 |  |
| public.reconnection_logs | 0 | 64.0 KB | 8.0 KB | 48.0 KB | 0 | 3 | ~1.6k |  |
| public.security_acl_alerts | 0 | 64.0 KB | 8.0 KB | 48.0 KB | 0 | 3 | ~830 |  |
| public.sla_rules | 0 | 64.0 KB | 0 B | 56.0 KB | 0 | 3 | ~400 |  |
| public.whatsapp_flows | 0 | 64.0 KB | 8.0 KB | 48.0 KB | 0 | 6 | 0 |  |
| public.agent_stats | 9 | 56.0 KB | 8.0 KB | 48.0 KB | 7 | ~30 | ~2.2k |  |
| public.instance_pauses | 0 | 56.0 KB | 0 B | 48.0 KB | 0 | ~20 | 1 |  |
| public.link_preview_cache_metrics | ~50 | 56.0 KB | 16.0 KB | 16.0 KB | 0 | 3 | 0 |  |
| public.multiplix_dispatches | 0 | 56.0 KB | 0 B | 48.0 KB | 0 | ~490 | ~12.5k |  |
| public.role_permissions | ~40 | 56.0 KB | 8.0 KB | 48.0 KB | 0 | ~990 | 0 |  |
| public.ai_providers | 4 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | ~20 | 0 |  |
| public.ai_usage_outbox | 0 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | 9 | ~830 |  |
| public.auto_close_config | 1 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | 3 | 0 |  |
| public.campaign_contacts | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 3 | 0 |  |
| public.contact_notes | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 6 | ~90 |  |
| public.crm_contact_links | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 4 | ~210 |  |
| public.department_invitations | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 4 | 0 |  |
| public.department_invites | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 6 | 0 |  |
| public.departments | 0 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | 3 | ~180 |  |
| public.feature_flags | 0 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | ~170 | ~4.4k |  |
| public.geo_blocking_settings | 1 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | ~820 | 0 |  |
| public.global_settings | 0 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | 3 | ~1.8k |  |
| public.multiplix_recipients | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | ~4.2k | 0 |  |
| public.permissions | 0 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | ~360 | ~19.7k |  |
| public.products | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 6 | 0 |  |
| public.queues | 1 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | ~2k | 0 |  |
| public.scheduled_messages | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 3 | ~8.4k |  |
| public.sla_alert_events | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 3 | 0 |  |
| public.talkx_conversions | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | ~40 | 0 |  |
| public.talkx_links | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 3 | 0 |  |
| public.talkx_optout_keywords | ~10 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | 3 | 0 |  |
| public.talkx_suppression_reasons | 6 | 48.0 KB | 8.0 KB | 32.0 KB | 5 | ~30 | 3 |  |
| public.team_message_receipts | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 3 | ~30 |  |
| public.user_settings | 0 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | 3 | ~730 |  |
| public.agent_visibility_grants | 0 | 40.0 KB | 0 B | 40.0 KB | 0 | 3 | ~100 |  |
| public.ai_model_prices | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 3 | 0 |  |
| public.blocked_ips | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 3 | ~820 |  |
| public.campaigns | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 3 | 0 |  |
| public.chatbot_executions | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 4 | 0 |  |
| public.chatbot_flows | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | ~20 | 0 |  |
| public.contact_protection_policy | 0 | 40.0 KB | 8.0 KB | 32.0 KB | 0 | 3 | 0 |  |
| public.conversation_snoozes | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 3 | ~420 |  |
| public.copilot_sessions | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | ~20 | 1 |  |
| public.knowledge_base_articles | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 5 | 0 |  |
| public.multiplix_events | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 3 | 0 |  |
| public.multiplix_voice_assets | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 3 | 0 |  |
| public.nps_surveys | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 3 | 0 |  |
| public.password_reset_requests | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 9 | 0 |  |
| public.query_telemetry | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 3 | 0 |  |
| public.rate_limit_logs | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 3 | 0 |  |
| public.sales_deals | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 3 | ~90 |  |
| public.search_events | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 4 | 6 |  |
| public.sicoob_contact_mapping | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 3 | 0 |  |
| public.talkx_contact_attributes | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 3 | 0 |  |
| public.talkx_delivery_log | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 9 | 1 |  |
| public.talkx_link_clicks | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 9 | ~10 |  |
| public.talkx_test_sends | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 4 | 0 |  |
| public.team_message_reactions | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 3 | ~10 |  |
| public.whisper_messages | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 3 | 0 |  |
| public._rb_message_reactions_one_per_agent_20261107121000 | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | 6 | 0 |  |
| public._zapp_mig133_log | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | 4 | 0 |  |
| public.agent_skills | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.allowed_countries | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.app_settings | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | 3 | 0 |  |
| public.audio_meme_favorites | 0 | 32.0 KB | 0 B | 32.0 KB | 0 | 3 | ~1.6k |  |
| public.blocked_countries | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.catalog_favorites | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | ~50 |  |
| public.channel_connections | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 4 | 0 |  |
| public.channel_routing_rules | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.client_wallet_rules | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 6 | 0 |  |
| public.contact_block_audit | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 1 |  |
| public.contact_custom_fields | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 2 |  |
| public.conversation_memory | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 4 | ~140 |  |
| public.copilot_insights | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 5 | 0 |  |
| public.csat_auto_config | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.deal_activities | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.department_audit_logs | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.email_signatures | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.entity_versions | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.followup_executions | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.followup_sequences | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 4 | 0 |  |
| public.gmail_oauth_states | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 6 | 0 |  |
| public.ip_whitelist | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | ~820 |  |
| public.message_attempts | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.message_reports | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.multiplix_blocks | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.outbox_events | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 5 | 0 |  |
| public.passkey_credentials | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.qr_attempts | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 6 |  |
| public.queue_skill_requirements | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.rate_limit_configs | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | ~820 | 0 |  |
| public.sales_pipeline_stages | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | ~90 | 0 |  |
| public.saved_filters | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 6 | ~130 |  |
| public.searchbox_budget_alert_cron | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | 5 | 0 |  |
| public.sla_configurations | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | ~400 | 0 |  |
| public.talkx_alerts | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | ~10k |  |
| public.talkx_data_jobs | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | 3 | 0 |  |
| public.talkx_segment_fields | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | 3 | 0 |  |
| public.talkx_segment_versions | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.talkx_settings | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 6 | 3 | ~16.7k |  |
| public.talkx_storage_purge_queue | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 4 | ~8.3k |  |
| public.talkx_template_variants | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.voice_command_logs | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.voip_profile_credentials | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 5 | 0 |  |
| public.webauthn_challenges | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.webhook_failures | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 8 | 0 |  |
| public.whatsapp_connection_queues | 0 | 32.0 KB | 0 B | 32.0 KB | 0 | 3 | 0 |  |
| public._rb_message_reactions_contato_20261007001008 | 0 | 24.0 KB | 8.0 KB | 16.0 KB | 0 | 4 | 0 |  |
| public.automations | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 9 | 0 |  |
| public.away_messages | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 1 |  |
| public.business_hours | 0 | 24.0 KB | 0 B | 24.0 KB | 0 | 3 | 1 |  |
| public.campaign_ab_variants | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 0 |  |
| public.contact_identity_map | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 0 |  |
| public.copilot_feedback | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 0 |  |
| public.crisis_room_alerts | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 0 |  |
| public.followup_steps | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 4 | 0 |  |
| public.knowledge_base_files | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 5 | 0 |  |
| public.message_pins | 0 | 24.0 KB | 0 B | 24.0 KB | 0 | 3 | 0 |  |
| public.message_templates | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | ~40 | ~20 |  |
| public.meta_capi_events | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 4 | 0 |  |
| public.mfa_sessions | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 0 |  |
| public.multiplix_audience_members | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 0 |  |
| public.multiplix_audiences | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 0 |  |
| public.multiplix_voice_grants | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 0 |  |
| public.number_reputation | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 0 |  |
| public.playbooks | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 4 | 0 |  |
| public.queue_positions | 0 | 24.0 KB | 0 B | 24.0 KB | 0 | ~1.1k | 0 |  |
| public.scheduled_report_configs | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 4 | 0 |  |
| public.talkx_campaign_segments | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 0 |  |
| public.talkx_help_views | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 0 |  |
| public.talkx_segment_library_history | 0 | 24.0 KB | 8.0 KB | 16.0 KB | 0 | 3 | ~30 |  |
| public.talkx_test_send_claims | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 5 | 6 |  |
| public.training_sessions | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 1 |  |
| public.user_service_accounts | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 0 |  |
| public.webhook_rate_limits | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 3 | 0 |  |
| public.whatsapp_templates | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 6 | 0 |  |
| _bkp_261023.global_settings | 0 | 16.0 KB | 8.0 KB | 0 B | 0 | 0 |  |  |
| _bkp_261023.team_messages | 0 | 16.0 KB | 8.0 KB | 0 B | 0 | 0 |  |  |
| _bkp_261023.user_settings | 0 | 16.0 KB | 8.0 KB | 0 B | 0 | 0 |  |  |
| public.agent_mini_game_xp_daily | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 4 | 0 |  |
| public.connection_alert_preferences | 0 | 16.0 KB | 0 B | 16.0 KB | 0 | ~1.7k | ~180 |  |
| public.copilot_learning_moments | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 3 | 0 |  |
| public.copilot_objection_catalog | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 3 | 0 |  |
| public.copilot_outcomes | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 3 | 0 |  |
| public.copilot_usage | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 3 | 0 |  |
| public.custom_emojis | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 4 | 0 |  |
| public.queue_goals | 0 | 16.0 KB | 0 B | 16.0 KB | 0 | ~180 | 0 |  |
| public.scheduled_reports | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 3 | 0 |  |
| public.searchbox_budget_alert_emails | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 5 | 0 |  |
| public.team_chat_media_acl_r2_db_020_rb | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 4 | 0 |  |
| _bkp_261023.agent_stats | 0 | 8.0 KB | 8.0 KB | 0 B | 0 | 0 |  |  |
| _bkp_261023.csat_surveys | 0 | 8.0 KB | 0 B | 0 B | 0 | 0 |  |  |
| public.copilot_conversation_scores | 0 | 8.0 KB | 0 B | 8.0 KB | 0 | 3 | 0 |  |
| public.copilot_help_requests | 0 | 8.0 KB | 0 B | 8.0 KB | 0 | 3 | 0 |  |
| public.copilot_seller_settings | 0 | 8.0 KB | 0 B | 8.0 KB | 0 | 3 | 0 |  |
| public.message_favorites | 0 | 8.0 KB | 0 B | 8.0 KB | 0 | 3 | 0 |  |
| public.sla_alert_preferences | 0 | 8.0 KB | 0 B | 8.0 KB | 0 | 3 | 0 |  |


## Índices nunca usados (candidatos a remoção; ignore PK/UNIQUE)

| índice | tabela | tamanho |
|---|---|---|
| idx_contact_deletion_audit_contact | public.contact_deletion_audit | 80.0 KB |
| idx_contacts_name_asc | public.contacts | 192.0 KB |
| idx_contacts_phone_search_digits_trgm | public.contacts | 288.0 KB |
| email_attachments_filename_trgm_idx | public.email_attachments | 11.4 MB |
| email_messages_body_text_trgm_idx | public.email_messages | 17.0 MB |
| idx_email_messages_date | public.email_messages | 160.0 KB |
| idx_email_threads_account_date | public.email_threads | 192.0 KB |
| idx_messages_content_trgm | public.messages | 4.9 MB |
| idx_messages_media_url_trgm | public.messages | 4.3 MB |
| idx_messages_transcription_trgm | public.messages | 96.0 KB |
| idx_talkx_recipients_campaign_status | public.talkx_recipients | 88.0 KB |
| idx_talkx_recipients_claimable | public.talkx_recipients | 616.0 KB |
| idx_talkx_recipients_reply_message_id | public.talkx_recipients | 72.0 KB |
| idx_talkx_recipients_sent_at | public.talkx_recipients | 72.0 KB |
| idx_talkx_recipients_variant_id | public.talkx_recipients | 72.0 KB |


## Storage

_nenhum_


## Auth (agregados)

> ⚠️ Coleta de `auth` falhou nesta rodada (ver `errors.md`) — a tabela abaixo pode estar zerada por falha de coleta, não por ausência real de usuários.


| métrica | valor |
|---|---|
| usuários (~) |  |
| confirmados (~) |  |
| criados últimos 30d (~) |  |

_nenhum_


## Consultas mais custosas (pg_stat_statements, desde o último reset)
| role | chamadas (~) | total ms (~) | média ms | query |
|---|---|---|---|---|
| snapshot_reader | ~490 | ~1.2M | 2377.72 | `SELECT jobid, runid, status, start_time, end_time, EXTRACT($2 FROM (end_time - start_time))::numeric(10,2) AS seconds, left(return_message, $3) AS return_message FROM (SELECT *, row_number() OVER (PARTITION BY jobid ORDE` |
| snapshot_reader | ~490 | ~275.3k | 558.36 | `SELECT table_schema AS schema, table_name AS "table", column_name AS "column", grantee, string_agg(privilege_type, $1 ORDER BY privilege_type) AS privileges FROM information_schema.column_privileges cp WHERE grantee NOT ` |
| snapshot_reader | ~490 | ~150.3k | 304.96 | `SELECT e.extname AS name, e.extversion AS version, n.nspname AS schema, (SELECT default_version FROM pg_available_extensions a WHERE a.name = e.extname) AS available_version FROM pg_extension e JOIN pg_namespace n ON n.o` |
| snapshot_reader | ~490 | ~130.4k | 264.49 | `SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS returns, l.lanname AS language, CASE p.prokind WHEN $1 THEN $2 WHEN $3 THEN $4 WHEN $5 TH` |
| snapshot_reader | ~490 | ~100.8k | 204.36 | `SELECT n.nspname AS schema, c.relname AS "table", a.attnum AS position, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable, pg_get_expr(d.adbin, d.adrelid) AS "default", NULLIF(` |
| snapshot_reader | ~490 | ~100.7k | 204.32 | `SELECT n.nspname AS schema, c.relname AS name, GREATEST(c.reltuples::bigint, $1) AS est_rows, pg_total_relation_size(c.oid) AS total_bytes, pg_relation_size(c.oid) AS heap_bytes, pg_indexes_size(c.oid) AS index_bytes, s.` |
| snapshot_reader | ~490 | ~80.6k | 163.54 | `SELECT version, name, statements FROM supabase_migrations.schema_migrations ORDER BY version` |
| snapshot_reader | ~490 | ~52.9k | 107.27 | `SELECT n.nspname AS schema, c.relname AS name, CASE c.relkind WHEN $1 THEN $2 WHEN $3 THEN $4 WHEN $5 THEN $6 END AS kind, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced, pg_get_userbyid(c.relowner)` |
| snapshot_reader | ~490 | ~52.2k | 105.81 | `SELECT n.nspname AS schema, c.relname AS name, CASE c.relkind WHEN $1 THEN $2 ELSE $3 END AS kind, pg_get_viewdef(c.oid, $4) AS definition, c.reloptions AS options, pg_get_userbyid(c.relowner) AS owner, obj_description(c` |
| snapshot_reader | ~490 | ~36.6k | 74.24 | `SELECT n.nspname AS schema, t.relname AS "table", ic.relname AS name, pg_get_indexdef(ix.indexrelid) AS definition, ix.indisunique AS is_unique, ix.indisprimary AS is_primary, ix.indisvalid AS is_valid, am.amname AS meth` |
| snapshot_reader | ~490 | ~33.4k | 67.66 | `SELECT n.nspname AS schema, c.relname AS "table", con.conname AS name, CASE con.contype WHEN $1 THEN $2 WHEN $3 THEN $4 WHEN $5 THEN $6 WHEN $7 THEN $8 WHEN $9 THEN $10 ELSE con.contype::text END AS type, pg_get_constrai` |
| snapshot_reader | ~490 | ~26.2k | 53.20 | `SELECT n.nspname AS schema, c.relname AS sequence, r.rolname AS grantee, concat_ws($1, CASE WHEN has_sequence_privilege(r.oid, c.oid, $2) THEN $3 END, CASE WHEN has_sequence_privilege(r.oid, c.oid, $4) THEN $5 END, CASE ` |
| snapshot_reader | ~490 | ~24.5k | 49.74 | `SELECT table_schema AS schema, table_name AS "table", grantee, string_agg(privilege_type, $1 ORDER BY privilege_type) AS privileges FROM information_schema.role_table_grants WHERE grantee NOT IN ($2, $3, $4, $5, $6, $7, ` |
| snapshot_reader | ~490 | ~20.7k | 41.93 | `SELECT schemaname AS schema, tablename AS "table", policyname AS name, permissive, roles, cmd, qual AS "using", with_check FROM pg_policies WHERE schemaname NOT IN ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,` |
| snapshot_reader | ~490 | ~20.3k | 41.22 | `SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.prosecdef AND n.nspname NOT IN ($1, $2, $3, $4, $5, $6` |


## Conexões
| usuário | estado | n |
|---|---|---|
| authenticator |  | 9 |
| pgbouncer |  | 3 |
| postgres |  | 1 |
| snapshot_reader | active | 1 |
| supabase_admin |  | 10 |
| supabase_auth_admin |  | 2 |
| supabase_storage_admin |  | 5 |
