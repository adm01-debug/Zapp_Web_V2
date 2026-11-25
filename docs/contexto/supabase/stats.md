# Métricas (voláteis — mudam sem alteração de schema)

Valores aproximados de propósito, para não gerar commits a cada coleta. Fora de `snapshot.json`; o bruto está em `stats.json`.

## Banco

| métrica | valor |
|---|---|
| tamanho | 500.0 MB |
| schema public | 350.2 MB |
| schema _bkp_261023 | 3.6 MB |
| schema ops | 184.0 KB |


## Tabelas (ordenadas por tamanho)

| tabela | linhas (~) | total | heap | índices | linhas mortas (~) | seq scans (~) | idx scans (~) | último autovacuum |
|---|---|---|---|---|---|---|---|---|
| public.email_attachments | ~71.5k | 138.6 MB | 61.6 MB | 76.9 MB | 0 | 0 | ~10 |  |
| public.messages | ~67.9k | 59.4 MB | 16.9 MB | 42.4 MB | ~80 | ~20 | ~585.9k | 2026-11-25 |
| public.email_messages | ~3.2k | 58.4 MB | 4.2 MB | 17.9 MB | 0 | ~60 | ~260 |  |
| public.audit_logs | ~89.1k | 38.7 MB | 25.5 MB | 13.2 MB | 1 | 0 | ~20 |  |
| public.ai_usage_logs | ~14k | 10.9 MB | 8.3 MB | 2.6 MB | ~10 | ~20 | ~12.9k | 2026-11-24 |
| public.ai_jobs | ~12.6k | 9.5 MB | 6.9 MB | 2.6 MB | ~1.7k | ~8.7k | ~87.2k | 2026-11-25 |
| public.copilot_insights | ~12.8k | 5.4 MB | 4.1 MB | 1.2 MB | 0 | 0 | 6 | 2026-11-25 |
| public.contacts | ~5.1k | 4.4 MB | 1.7 MB | 2.6 MB | ~240 | ~100 | ~11.5M | 2026-11-24 |
| public.talkx_recipients | ~8.2k | 3.5 MB | 1.2 MB | 2.3 MB | 0 | 0 | ~104.4k |  |
| public.notifications | ~2.2k | 2.5 MB | 1.7 MB | 720.0 KB | ~460 | 0 | ~21.4k |  |
| public.email_threads | ~2.5k | 2.2 MB | 1.5 MB | 680.0 KB | 0 | ~190 | ~130.3k |  |
| _bkp_261023.schema_migrations | ~920 | 1.5 MB | 1.0 MB | 0 B | 0 | ~10 |  |  |
| public.conversation_events | ~3.3k | 1.4 MB | 656.0 KB | 784.0 KB | 0 | 0 | ~1.3k |  |
| public.ai_budget_reservations | ~3.5k | 1.2 MB | 624.0 KB | 576.0 KB | ~530 | 0 | ~11.5k | 2026-11-24 |
| _bkp_261023.contacts | ~3.7k | 1.2 MB | 1.1 MB | 0 B | 0 | ~10 |  |  |
| public.conversation_sla | ~2.5k | 984.0 KB | 480.0 KB | 480.0 KB | 4 | ~10 | ~209.6k |  |
| public.connection_health_logs | ~2k | 624.0 KB | 232.0 KB | 352.0 KB | ~70 | 0 | ~2k | 2026-11-25 |
| _bkp_261023.functions_before | ~360 | 600.0 KB | 512.0 KB | 0 B | 0 | 9 |  |  |
| public.copilot_sessions | ~780 | 592.0 KB | 408.0 KB | 144.0 KB | ~90 | 2 | ~23k | 2026-11-25 |
| public.stickers | ~1.2k | 592.0 KB | 480.0 KB | 80.0 KB | 3 | ~220 | 1 |  |
| public.crm_sync_outbox | ~460 | 472.0 KB | 200.0 KB | 232.0 KB | 0 | ~10 | 0 |  |
| public.contact_deletion_audit | ~720 | 384.0 KB | 176.0 KB | 176.0 KB | 0 | 1 | 2 |  |
| public.talkx_campaigns | ~10 | 336.0 KB | 8.0 KB | 320.0 KB | 0 | ~15.5k | ~34.7k |  |
| public.warroom_alerts | ~640 | 280.0 KB | 152.0 KB | 88.0 KB | ~90 | 2 | ~3.6k | 2026-11-21 |
| public.conversation_tasks | 1 | 272.0 KB | 8.0 KB | 224.0 KB | 0 | ~9.4k | 0 |  |
| _bkp_261023.policies_before | ~460 | 264.0 KB | 256.0 KB | 0 B | 0 | 9 |  |  |
| public.security_alerts | ~120 | 240.0 KB | 144.0 KB | 64.0 KB | 0 | 0 | ~26.6k |  |
| public.audio_memes | ~540 | 232.0 KB | 144.0 KB | 56.0 KB | 0 | 0 | 1 |  |
| public.message_reactions | ~110 | 216.0 KB | 16.0 KB | 160.0 KB | 0 | ~580 | ~60 |  |
| public.whatsapp_groups | ~190 | 216.0 KB | 120.0 KB | 64.0 KB | 0 | ~180 | 0 |  |
| public.whatsapp_connections | 2 | 200.0 KB | 32.0 KB | 96.0 KB | ~30 | ~3.4k | ~66.8k |  |
| ops.hermes_change_log | 0 | 184.0 KB | 16.0 KB | 64.0 KB | 0 | 0 | 0 |  |
| public.user_sessions | ~120 | 184.0 KB | 48.0 KB | 96.0 KB | 3 | ~10 | ~20 |  |
| public.calls | ~20 | 168.0 KB | 16.0 KB | 120.0 KB | 4 | ~3.5k | ~10 |  |
| public.catalog_rate_limit_hits | ~200 | 168.0 KB | 72.0 KB | 56.0 KB | ~30 | 0 | ~60 |  |
| public.conversation_closures | ~20 | 168.0 KB | 16.0 KB | 112.0 KB | 0 | 4 | ~20 |  |
| public.message_attempts | ~160 | 152.0 KB | 48.0 KB | 72.0 KB | 0 | 5 | 2 |  |
| public.talkx_campaign_events | 0 | 128.0 KB | 32.0 KB | 64.0 KB | 0 | 0 | 2 |  |
| public.conversation_analyses | 0 | 120.0 KB | 8.0 KB | 104.0 KB | 0 | 0 | ~10 |  |
| public.agent_achievements | ~110 | 112.0 KB | 24.0 KB | 56.0 KB | 0 | 0 | ~130 |  |
| public.reminders | 1 | 112.0 KB | 8.0 KB | 96.0 KB | 0 | 1 | 0 |  |
| public.team_conversations | 2 | 112.0 KB | 8.0 KB | 96.0 KB | 0 | ~70 | 0 |  |
| public.user_devices | ~140 | 112.0 KB | 32.0 KB | 48.0 KB | 2 | 1 | 7 |  |
| public.agent_stats | ~10 | 104.0 KB | 24.0 KB | 48.0 KB | ~50 | ~460 | ~8.4k | 2026-11-25 |
| public.profiles | 4 | 104.0 KB | 8.0 KB | 56.0 KB | 2 | ~104k | ~2.4k |  |
| public.talkx_blacklist | 0 | 104.0 KB | 0 B | 96.0 KB | 0 | 0 | 2 |  |
| public.catalog_send_events | 0 | 96.0 KB | 8.0 KB | 80.0 KB | 0 | 0 | ~50 |  |
| public.gmail_accounts | 1 | 96.0 KB | 16.0 KB | 48.0 KB | 0 | ~2.1k | 0 |  |
| public.goals_configurations | 0 | 96.0 KB | 8.0 KB | 80.0 KB | 3 | 0 | ~740 |  |
| public.login_attempts | 3 | 96.0 KB | 8.0 KB | 48.0 KB | 0 | ~20 | 0 |  |
| public.team_messages | 2 | 96.0 KB | 8.0 KB | 80.0 KB | 0 | ~210 | 0 |  |
| public.edge_rate_limits | ~30 | 88.0 KB | 32.0 KB | 16.0 KB | ~70 | ~590 | ~85k | 2026-11-25 |
| public.ai_model_prices | 0 | 80.0 KB | 8.0 KB | 64.0 KB | 0 | 9 | ~216k |  |
| public.talkx_ai_requests | 0 | 80.0 KB | 8.0 KB | 64.0 KB | 3 | ~10 | ~20 |  |
| public.talkx_segments | 1 | 80.0 KB | 8.0 KB | 64.0 KB | 0 | ~20 | 0 |  |
| public.talkx_template_versions | 0 | 80.0 KB | 8.0 KB | 64.0 KB | 0 | 0 | 1 |  |
| public.talkx_templates | 5 | 80.0 KB | 8.0 KB | 64.0 KB | 0 | 3 | 0 |  |
| public._zapp_fn_before | ~350 | 72.0 KB | 64.0 KB | 0 B | 0 | 0 |  |  |
| public.favorite_contacts | 0 | 72.0 KB | 8.0 KB | 64.0 KB | 0 | 0 | ~560 |  |
| public.multiplix_delivery_items | 0 | 72.0 KB | 0 B | 64.0 KB | 0 | ~710 | ~4.4k |  |
| public.pinned_conversations | 0 | 72.0 KB | 8.0 KB | 64.0 KB | 0 | 0 | ~290 |  |
| public.queue_members | 4 | 72.0 KB | 8.0 KB | 64.0 KB | 0 | ~9.3k | ~10 |  |
| public.team_conversation_members | 4 | 72.0 KB | 8.0 KB | 56.0 KB | 0 | ~490 | ~1.2k |  |
| public.agent_presence | 6 | 64.0 KB | 8.0 KB | 16.0 KB | 4 | ~12.4k | ~8.2k | 2026-11-25 |
| public.ai_conversation_tags | 0 | 64.0 KB | 8.0 KB | 48.0 KB | 0 | 0 | 0 |  |
| public.catalog_rate_limits | 4 | 64.0 KB | 8.0 KB | 16.0 KB | 0 | 0 | 0 |  |
| public.csat_surveys | 0 | 64.0 KB | 0 B | 56.0 KB | 0 | 6 | ~4.4k |  |
| public.email_labels | ~20 | 64.0 KB | 8.0 KB | 48.0 KB | 0 | ~10 | 0 |  |
| public.link_preview_cache | 1 | 64.0 KB | 8.0 KB | 32.0 KB | ~30 | ~50 | ~40 |  |
| public.performance_snapshots | 0 | 64.0 KB | 8.0 KB | 48.0 KB | 0 | 0 | 1 |  |
| public.reconnection_logs | 0 | 64.0 KB | 8.0 KB | 48.0 KB | 0 | 0 | 6 |  |
| public.security_acl_alerts | 0 | 64.0 KB | 8.0 KB | 48.0 KB | 0 | 0 | ~880 |  |
| public.sla_rules | 0 | 64.0 KB | 0 B | 56.0 KB | 0 | 2 | ~1.3k |  |
| public.talkx_suppression_reasons | 6 | 64.0 KB | 8.0 KB | 48.0 KB | 0 | 1 | 0 |  |
| public.whatsapp_flows | 0 | 64.0 KB | 8.0 KB | 48.0 KB | 0 | 1 | 1 |  |
| public.instance_pauses | 0 | 56.0 KB | 0 B | 48.0 KB | 0 | 3 | 7 |  |
| public.link_preview_cache_metrics | ~50 | 56.0 KB | 16.0 KB | 16.0 KB | 0 | 0 | 0 |  |
| public.multiplix_dispatches | 0 | 56.0 KB | 0 B | 48.0 KB | 0 | ~150 | ~52.9k |  |
| public.role_permissions | ~60 | 56.0 KB | 8.0 KB | 48.0 KB | 0 | ~490 | 0 |  |
| public.team_message_receipts | 0 | 56.0 KB | 0 B | 48.0 KB | 0 | 1 | 5 |  |
| public.user_roles | ~10 | 56.0 KB | 8.0 KB | 48.0 KB | 1 | ~15.2M | ~950 |  |
| public.ai_providers | 4 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | ~6.4k | 0 |  |
| public.ai_usage_outbox | 0 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | 0 | ~880 |  |
| public.auto_close_config | 1 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | 9 | 0 |  |
| public.campaign_contacts | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 0 | 0 |  |
| public.chatbot_flows | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 1 | 1 |  |
| public.contact_notes | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 0 | ~80 |  |
| public.crm_contact_links | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 0 | ~200 |  |
| public.department_invitations | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 0 | 1 |  |
| public.department_invites | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 0 | 1 |  |
| public.departments | 0 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | 2 | ~80 |  |
| public.feature_flags | 0 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | ~100 | ~19.7k |  |
| public.geo_blocking_settings | 1 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | ~430 | 0 |  |
| public.global_settings | 0 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | 6 | ~11.7k |  |
| public.multiplix_recipients | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | ~11.8k | ~24.7k |  |
| public.permissions | 0 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | ~170 | ~10.2k |  |
| public.products | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 3 | 0 |  |
| public.queues | 1 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | ~2.7k | 1 |  |
| public.scheduled_messages | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | ~8.8k | ~8.9k |  |
| public.sla_alert_events | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 6 | 1 |  |
| public.sla_configurations | 3 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | ~1k | 0 |  |
| public.talkx_conversions | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | ~20 | 0 |  |
| public.talkx_links | 0 | 48.0 KB | 0 B | 40.0 KB | 0 | 0 | 1 |  |
| public.talkx_optout_keywords | ~10 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | ~1.7k | 0 |  |
| public.user_settings | 0 | 48.0 KB | 8.0 KB | 32.0 KB | 0 | 6 | ~370 |  |
| public.agent_visibility_grants | 0 | 40.0 KB | 0 B | 40.0 KB | 0 | 2 | 3 |  |
| public.blocked_ips | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 0 | ~430 |  |
| public.campaigns | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 0 | 1 |  |
| public.chatbot_executions | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 0 | 0 |  |
| public.contact_protection_policy | 1 | 40.0 KB | 8.0 KB | 32.0 KB | 0 | 0 | 0 |  |
| public.conversation_snoozes | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 0 | ~290 |  |
| public.knowledge_base_articles | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 0 | 1 |  |
| public.message_reports | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 2 | 2 |  |
| public.multiplix_events | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 0 | 0 |  |
| public.multiplix_voice_assets | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 2 | 0 |  |
| public.nps_surveys | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 0 | 2 |  |
| public.password_reset_requests | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 1 | 2 |  |
| public.query_telemetry | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 0 | 1 |  |
| public.rate_limit_logs | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 2 | 1 |  |
| public.sales_deals | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 0 | ~120 |  |
| public.search_events | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 0 | 7 |  |
| public.sicoob_contact_mapping | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 0 | 1 |  |
| public.talkx_contact_attributes | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 0 | 0 |  |
| public.talkx_delivery_log | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 6 | 0 |  |
| public.talkx_link_clicks | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 6 | 6 |  |
| public.talkx_test_sends | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 5 | 0 |  |
| public.team_message_reactions | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 0 | 2 |  |
| public.whisper_messages | 0 | 40.0 KB | 0 B | 32.0 KB | 0 | 0 | 2 |  |
| public._rb_message_reactions_one_per_agent_20261107121000 | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | 0 | 0 |  |
| public._zapp_mig133_log | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | 0 | 0 |  |
| public.agent_skills | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 1 |  |
| public.allowed_countries | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 1 |  |
| public.app_settings | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | 0 | 1 |  |
| public.audio_meme_favorites | 0 | 32.0 KB | 0 B | 32.0 KB | 0 | 0 | 1 |  |
| public.blocked_countries | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 1 |  |
| public.catalog_favorites | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | ~20 |  |
| public.channel_connections | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 4 | 1 |  |
| public.channel_routing_rules | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 0 |  |
| public.client_wallet_rules | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | ~1.8k |  |
| public.contact_block_audit | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 0 |  |
| public.contact_custom_fields | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 0 |  |
| public.conversation_memory | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | ~150 |  |
| public.csat_auto_config | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 1 |  |
| public.deal_activities | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 1 |  |
| public.department_audit_logs | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 3 | 1 |  |
| public.email_signatures | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 0 |  |
| public.entity_versions | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 0 |  |
| public.followup_executions | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 0 |  |
| public.followup_sequences | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 1 |  |
| public.gmail_oauth_states | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 1 |  |
| public.ip_whitelist | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | ~430 |  |
| public.message_pins | 0 | 32.0 KB | 0 B | 32.0 KB | 0 | 1 | 1 |  |
| public.multiplix_blocks | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 2 | 0 |  |
| public.outbox_events | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 0 |  |
| public.passkey_credentials | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 1 | 3 |  |
| public.qr_attempts | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 6 |  |
| public.queue_skill_requirements | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 0 |  |
| public.rate_limit_configs | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | ~430 | 0 |  |
| public.sales_pipeline_stages | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | ~120 | 0 |  |
| public.saved_filters | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | ~80 |  |
| public.searchbox_budget_alert_cron | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | 0 | 0 |  |
| public.talkx_alerts | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | ~10.6k |  |
| public.talkx_campaign_segments | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 1 | 0 |  |
| public.talkx_data_jobs | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | 0 | 0 |  |
| public.talkx_segment_fields | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 0 | 0 | 0 |  |
| public.talkx_segment_versions | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 1 |  |
| public.talkx_settings | 0 | 32.0 KB | 8.0 KB | 16.0 KB | 8 | 6 | ~32.5k |  |
| public.talkx_storage_purge_queue | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 1 | ~8.8k |  |
| public.talkx_template_variants | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 0 |  |
| public.voice_command_logs | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 1 |  |
| public.voip_profile_credentials | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 1 |  |
| public.webauthn_challenges | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 1 |  |
| public.webhook_failures | 0 | 32.0 KB | 0 B | 24.0 KB | 0 | 0 | 0 |  |
| public.whatsapp_connection_queues | 0 | 32.0 KB | 0 B | 32.0 KB | 0 | 0 | 0 |  |
| public._rb_message_reactions_contato_20261007001008 | 0 | 24.0 KB | 8.0 KB | 16.0 KB | 0 | 0 | 0 |  |
| public.automations | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 2 | 1 |  |
| public.away_message_log | 0 | 24.0 KB | 0 B | 24.0 KB | 0 | 2 | 0 |  |
| public.away_messages | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | ~170 |  |
| public.business_hours | 0 | 24.0 KB | 0 B | 24.0 KB | 0 | 0 | 7 |  |
| public.campaign_ab_variants | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 0 |  |
| public.contact_identity_map | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 0 |  |
| public.copilot_feedback | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 1 |  |
| public.copilot_retention_aggregates | 0 | 24.0 KB | 0 B | 24.0 KB | 0 | 0 | 1 |  |
| public.crisis_room_alerts | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 1 |  |
| public.followup_steps | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 0 |  |
| public.knowledge_base_files | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 0 |  |
| public.message_templates | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | ~30 | 5 |  |
| public.meta_capi_events | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 0 |  |
| public.mfa_sessions | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 1 |  |
| public.multiplix_audience_members | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 0 |  |
| public.multiplix_audiences | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 0 |  |
| public.multiplix_voice_grants | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 2 | 0 |  |
| public.number_reputation | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 8 | 0 |  |
| public.playbooks | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 1 | 1 |  |
| public.queue_positions | 0 | 24.0 KB | 0 B | 24.0 KB | 0 | ~530 | 0 |  |
| public.scheduled_report_configs | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | ~3k | 1 |  |
| public.talkx_help_views | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 0 |  |
| public.talkx_segment_library_history | 0 | 24.0 KB | 8.0 KB | 16.0 KB | 0 | 0 | ~20 |  |
| public.talkx_test_send_claims | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 6 |  |
| public.training_sessions | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 1 | 1 |  |
| public.user_service_accounts | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 1 |  |
| public.webhook_rate_limits | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 0 |  |
| public.whatsapp_templates | 0 | 24.0 KB | 0 B | 16.0 KB | 0 | 0 | 0 |  |
| _bkp_261023.global_settings | 0 | 16.0 KB | 8.0 KB | 0 B | 0 | 6 |  |  |
| _bkp_261023.team_messages | 0 | 16.0 KB | 8.0 KB | 0 B | 0 | 7 |  |  |
| _bkp_261023.user_settings | 0 | 16.0 KB | 8.0 KB | 0 B | 0 | 6 |  |  |
| public.agent_mini_game_xp_daily | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 0 | 1 |  |
| public.assistant_profiles | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 1 | 1 |  |
| public.connection_alert_preferences | 0 | 16.0 KB | 0 B | 16.0 KB | 0 | ~1.1k | ~90 |  |
| public.copilot_learning_moments | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 0 | 0 |  |
| public.copilot_objection_catalog | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 0 | 0 |  |
| public.copilot_outcomes | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 0 | 0 |  |
| public.copilot_usage | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 0 | 0 |  |
| public.custom_emojis | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 0 | 0 |  |
| public.message_favorites | 0 | 16.0 KB | 0 B | 16.0 KB | 0 | 1 | 1 |  |
| public.queue_goals | 0 | 16.0 KB | 0 B | 16.0 KB | 0 | ~80 | 0 |  |
| public.scheduled_reports | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 0 | 0 |  |
| public.searchbox_budget_alert_emails | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 0 | 0 |  |
| public.team_chat_media_acl_r2_db_020_rb | 0 | 16.0 KB | 0 B | 8.0 KB | 0 | 1 | 0 |  |
| _bkp_261023.agent_stats | 0 | 8.0 KB | 8.0 KB | 0 B | 0 | 6 |  |  |
| _bkp_261023.csat_surveys | 0 | 8.0 KB | 0 B | 0 B | 0 | 6 |  |  |
| public.copilot_conversation_scores | 0 | 8.0 KB | 0 B | 8.0 KB | 0 | 0 | 0 |  |
| public.copilot_help_requests | 0 | 8.0 KB | 0 B | 8.0 KB | 0 | 0 | 0 |  |
| public.copilot_seller_settings | 0 | 8.0 KB | 0 B | 8.0 KB | 0 | 1 | 0 |  |
| public.sla_alert_preferences | 0 | 8.0 KB | 0 B | 8.0 KB | 0 | 1 | 1 |  |


## Índices nunca usados (candidatos a remoção; ignore PK/UNIQUE)

| índice | tabela | tamanho |
|---|---|---|
| idx_ai_usage_logs_request_id | public.ai_usage_logs | 152.0 KB |
| idx_ai_usage_logs_status | public.ai_usage_logs | 176.0 KB |
| idx_audit_logs_details_path_ops | public.audit_logs | 200.0 KB |
| idx_contacts_name_asc | public.contacts | 304.0 KB |
| idx_contacts_phone_search_digits_trgm | public.contacts | 416.0 KB |
| idx_copilot_insights_session_time | public.copilot_insights | 288.0 KB |
| email_attachments_filename_trgm_idx | public.email_attachments | 11.4 MB |
| email_messages_body_text_trgm_idx | public.email_messages | 17.0 MB |
| idx_email_messages_date | public.email_messages | 160.0 KB |
| idx_email_threads_account_date | public.email_threads | 192.0 KB |
| idx_messages_read_sender | public.messages | 784.0 KB |
| idx_messages_transcription_trgm | public.messages | 192.0 KB |
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
| snapshot_reader | ~150 | ~145.7k | 984.37 | `SELECT jobid, runid, status, start_time, end_time, EXTRACT($2 FROM (end_time - start_time))::numeric(10,2) AS seconds, left(return_message, $3) AS return_message FROM (SELECT *, row_number() OVER (PARTITION BY jobid ORDE` |
| snapshot_reader | ~150 | ~63.7k | 430.15 | `SELECT table_schema AS schema, table_name AS "table", column_name AS "column", grantee, string_agg(privilege_type, $1 ORDER BY privilege_type) AS privileges FROM information_schema.column_privileges cp WHERE grantee NOT ` |
| snapshot_reader | ~150 | ~22.2k | 150.32 | `SELECT e.extname AS name, e.extversion AS version, n.nspname AS schema, (SELECT default_version FROM pg_available_extensions a WHERE a.name = e.extname) AS available_version FROM pg_extension e JOIN pg_namespace n ON n.o` |
| snapshot_reader | ~150 | ~18.6k | 125.49 | `SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS returns, l.lanname AS language, CASE p.prokind WHEN $1 THEN $2 WHEN $3 THEN $4 WHEN $5 TH` |
| snapshot_reader | ~150 | ~17.1k | 115.49 | `SELECT n.nspname AS schema, c.relname AS name, GREATEST(c.reltuples::bigint, $1) AS est_rows, pg_total_relation_size(c.oid) AS total_bytes, pg_relation_size(c.oid) AS heap_bytes, pg_indexes_size(c.oid) AS index_bytes, s.` |
| snapshot_reader | ~150 | ~14.4k | 97.47 | `SELECT n.nspname AS schema, c.relname AS "table", a.attnum AS position, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable, pg_get_expr(d.adbin, d.adrelid) AS "default", NULLIF(` |
| snapshot_reader | ~150 | ~13.8k | 93.42 | `SELECT version, name, statements FROM supabase_migrations.schema_migrations ORDER BY version` |
| snapshot_reader | ~150 | ~10.6k | 71.31 | `SELECT n.nspname AS schema, t.relname AS "table", ic.relname AS name, pg_get_indexdef(ix.indexrelid) AS definition, ix.indisunique AS is_unique, ix.indisprimary AS is_primary, ix.indisvalid AS is_valid, am.amname AS meth` |
| snapshot_reader | ~150 | ~8.7k | 58.73 | `SELECT n.nspname AS schema, c.relname AS name, CASE c.relkind WHEN $1 THEN $2 ELSE $3 END AS kind, pg_get_viewdef(c.oid, $4) AS definition, c.reloptions AS options, pg_get_userbyid(c.relowner) AS owner, obj_description(c` |
| snapshot_reader | ~150 | ~8.1k | 54.87 | `SELECT n.nspname AS schema, c.relname AS sequence, r.rolname AS grantee, concat_ws($1, CASE WHEN has_sequence_privilege(r.oid, c.oid, $2) THEN $3 END, CASE WHEN has_sequence_privilege(r.oid, c.oid, $4) THEN $5 END, CASE ` |
| snapshot_reader | ~150 | ~8k | 53.73 | `SELECT table_schema AS schema, table_name AS "table", grantee, string_agg(privilege_type, $1 ORDER BY privilege_type) AS privileges FROM information_schema.role_table_grants WHERE grantee NOT IN ($2, $3, $4, $5, $6, $7, ` |
| snapshot_reader | ~150 | ~7.9k | 53.44 | `SELECT n.nspname AS schema, c.relname AS "table", con.conname AS name, CASE con.contype WHEN $1 THEN $2 WHEN $3 THEN $4 WHEN $5 THEN $6 WHEN $7 THEN $8 WHEN $9 THEN $10 ELSE con.contype::text END AS type, pg_get_constrai` |
| snapshot_reader | ~150 | ~7.1k | 47.92 | `SELECT n.nspname AS schema, c.relname AS name, CASE c.relkind WHEN $1 THEN $2 WHEN $3 THEN $4 WHEN $5 THEN $6 END AS kind, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced, pg_get_userbyid(c.relowner)` |
| snapshot_reader | ~150 | ~5.6k | 37.83 | `SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.prosecdef AND n.nspname NOT IN ($1, $2, $3, $4, $5, $6` |
| snapshot_reader | ~150 | ~5.4k | 36.58 | `SELECT schemaname AS schema, tablename AS "table", policyname AS name, permissive, roles, cmd, qual AS "using", with_check FROM pg_policies WHERE schemaname NOT IN ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,` |


## Conexões
| usuário | estado | n |
|---|---|---|
| authenticator |  | 14 |
| pgbouncer |  | 2 |
| postgres |  | 1 |
| snapshot_reader | active | 1 |
| supabase_admin |  | 10 |
| supabase_storage_admin |  | 2 |
