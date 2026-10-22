# Inventário de Tabelas — Produção (2026-10-22)

Total: **173 tabelas** no schema `public`.
RLS habilitado em todas (0 sem RLS).
types.ts cobre 170 tabelas; 3 faltando (internas): `_zapp_fn_before`, `_zapp_mig133_log`, `app_settings`.

## Tabelas por categoria

### Sistema/Auditoria
_zapp_fn_before, _zapp_mig133_log, app_settings, audit_logs, department_audit_logs,
entity_versions, query_telemetry, security_alerts

### Agentes/Usuários
agent_achievements, agent_presence, agent_skills, agent_stats, agent_visibility_grants,
profiles, permissions, role_permissions, user_devices, user_roles, user_service_accounts,
user_sessions, user_settings, mfa_sessions, passkey_credentials, webauthn_challenges,
password_reset_requests, training_sessions

### Contatos e CRM
contacts, contact_custom_fields, contact_deletion_audit, contact_identity_map,
contact_notes, contact_purchases, crm_contact_links, favorite_contacts,
contact_notes, deal_activities, sales_deals, sales_pipeline_stages

### Conversas e Mensagens
conversation_analyses, conversation_closures, conversation_events, conversation_memory,
conversation_sla, conversation_snoozes, conversation_tasks, crisis_room_alerts,
message_reactions, message_templates, messages, pinned_conversations,
team_conversation_members, team_conversations, team_message_reactions,
team_message_receipts, team_messages, whisper_messages

### Departamentos/Filas
departments, department_invitations, department_invites, queues, queue_goals,
queue_members, queue_positions, queue_skill_requirements

### Email
email_attachments, email_labels, email_messages, email_threads, gmail_accounts,
gmail_oauth_states, gmail_sync_state (via edge functions)

### WhatsApp/Canais
whatsapp_connections, whatsapp_connection_queues, whatsapp_flows, whatsapp_groups,
whatsapp_templates, channel_connections, channel_routing_rules

### TalkX (Campanhas)
talkx_alerts, talkx_blacklist, talkx_campaign_events, talkx_campaign_segments,
talkx_campaigns, talkx_conversions, talkx_delivery_log, talkx_link_clicks,
talkx_links, talkx_optout_keywords, talkx_recipients, talkx_segments,
talkx_settings, talkx_storage_purge_queue, talkx_template_variants,
talkx_template_versions, talkx_templates, talkx_test_send_claims

### Multiplix
multiplix_audience_members, multiplix_audiences, multiplix_blocks,
multiplix_delivery_items, multiplix_dispatches, multiplix_events,
multiplix_recipients, multiplix_voice_assets, multiplix_voice_grants

### IA/Automação
ai_budget_reservations, ai_conversation_tags, ai_jobs, ai_model_prices,
ai_providers, ai_usage_logs, automations, chatbot_executions, chatbot_flows,
followup_executions, followup_sequences, followup_steps, playbooks

### Segurança/Controle de Acesso
allowed_countries, blocked_countries, blocked_ips, geo_blocking_settings,
ip_whitelist, rate_limit_configs, rate_limit_logs, login_attempts,
edge_rate_limits, webhook_failures, webhook_rate_limits,
catalog_rate_limit_hits, catalog_rate_limits

### Storage/Mídia
audio_meme_favorites, audio_memes, knowledge_base_articles, knowledge_base_files,
stickers, custom_emojis, products, payment_links

### Monitoramento/Observabilidade
connection_alert_preferences, connection_health_logs, performance_snapshots,
link_preview_cache, link_preview_cache_metrics, search_events, meta_capi_events,
nps_surveys, number_reputation, catalog_send_events, catalog_favorites,
voice_command_logs, warroom_alerts

### Configuração
app_settings, auto_close_config, away_messages, business_hours, client_wallet_rules,
csat_auto_config, csat_surveys, feature_flags, global_settings, goals_configurations,
rate_limit_configs, saved_filters, scheduled_messages, sla_configurations, sla_rules

### Outros
calls, campaign_ab_variants, campaign_contacts, campaigns, crm_sync_outbox,
sicoob_contact_mapping

## FKs sem índice (S4 — 20 no schema public, live 2026-10-22)

Query de referência:
```sql
SELECT c.conrelid::regclass AS tabela, a.attname AS coluna_fk
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f'
  AND c.conrelid::regclass::text NOT LIKE 'pg_%'
  AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND a.attnum = ANY(i.indkey))
  AND c.conrelid::regclass::text IN (SELECT tablename::text FROM pg_tables WHERE schemaname = 'public')
ORDER BY 1, 2;
-- 20 linhas em 2026-10-22
```

| Tabela | FK |
|--------|-----|
| ai_model_prices | provider_id |
| contacts | ai_projection_analysis_id |
| conversation_events | from_queue_id |
| conversation_events | to_queue_id |
| department_invitations | used_by |
| multiplix_delivery_items | block_id |
| multiplix_delivery_items | recipient_id |
| multiplix_delivery_items | voice_asset_id |
| multiplix_dispatches | whatsapp_connection_id |
| reminders | migrated_task_id |
| talkx_campaigns | cancelled_by |
| talkx_campaigns | consent_confirmed_by |
| talkx_campaigns | launched_by |
| talkx_campaigns | owner |
| talkx_campaigns | paused_by |
| talkx_campaigns | responsible_id |
| talkx_campaigns | template_version_id |
| talkx_links | created_by |
| talkx_optout_keywords | created_by |
| talkx_templates | current_version_id |

**Nota histórica:** inventário anterior dizia 10 (stale). Contagem no ledger progresso.json dizia 21 (query anterior). Live em 2026-10-22 = **20** (query acima).
