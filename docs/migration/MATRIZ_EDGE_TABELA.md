# Matriz edge function x tabela

> Gerado por `node scripts/ci/gerar-matriz-edge-tabela.mjs` — não editar à mão.
> Fonte: chamadas `.from('tabela')` em `supabase/functions/<funcao>/**/*.ts` (sem testes e sem `_shared`).
>
> Não cobre: tabelas acessadas por `.rpc()` (chamada de função, não de tabela), por nome em variável
> (`from(nome)`) nem por SQL cru. Chamadas `storage.from('bucket')` são bucket de storage, não tabela, e ficam de fora.

## Por função

| Função | Tabelas |
|---|---|
| `ai-auto-tag` | `contacts`, `messages`, `notifications`, `profiles`, `queue_members`, `queues`, `user_roles` |
| `ai-churn-analysis` | `contacts`, `messages` |
| `ai-classify-tickets` | `ai_conversation_tags` |
| `ai-conversation-analysis` | — |
| `ai-conversation-summary` | — |
| `ai-enhance-message` | — |
| `ai-jobs-worker` | `ai_jobs` |
| `ai-kb-ingest` | `knowledge_base_articles`, `knowledge_base_files` |
| `ai-proxy` | `ai_providers` |
| `ai-suggest-reply` | `contact_custom_fields`, `contact_notes`, `contacts`, `knowledge_base_articles` |
| `ai-transcribe-audio` | — |
| `approve-password-reset` | `password_reset_requests` |
| `auth-login` | — |
| `auto-close-conversations` | `auto_close_config`, `contacts`, `conversation_closures`, `messages` |
| `batch-fetch-avatars` | `contacts`, `whatsapp_connections` |
| `bitrix-api` | `contacts` |
| `chatbot-l1` | `chatbot_flows`, `contacts`, `knowledge_base_articles`, `messages` |
| `classify-audio-meme` | — |
| `classify-emoji` | — |
| `classify-sticker` | — |
| `cleanup-rate-limit-logs` | `blocked_ips`, `rate_limit_logs`, `security_alerts` |
| `connection-health-check` | `connection_health_logs`, `profiles`, `warroom_alerts`, `whatsapp_connections` |
| `create-user` | `gmail_accounts`, `profiles`, `user_roles`, `user_service_accounts` |
| `crm-integration` | `carriers`, `companies`, `company_addresses`, `company_social_media`, `contact_phones`, `contacts`, `conversation_closures`, `crm_contact_links`, `crm_sync_outbox`, `customers`, `email_messages`, `email_threads`, `feature_flags`, `gmail_accounts`, `profiles`, `suppliers` |
| `csp-report` | — |
| `detect-new-device` | `security_alerts`, `user_devices`, `user_sessions` |
| `elevenlabs-agent-token` | — |
| `elevenlabs-dialogue` | — |
| `elevenlabs-scribe-token` | — |
| `elevenlabs-sfx` | — |
| `elevenlabs-sts` | — |
| `elevenlabs-tts` | — |
| `elevenlabs-tts-stream` | — |
| `elevenlabs-voice-design` | `audit_logs` |
| `elevenlabs-webhook` | `audit_logs` |
| `evolution-api` | `contacts`, `global_settings`, `whatsapp_connections` |
| `evolution-sync` | — |
| `evolution-webhook` | `whatsapp_connections` |
| `external-db-bridge` | `query_telemetry` |
| `external-db-proxy` | — |
| `fetch-link-preview` | `link_preview_cache` |
| `get-call-recording` | `calls` |
| `get-mapbox-token` | — |
| `get-sip-password` | `profiles` |
| `gmail-cron-sync` | `gmail_accounts` |
| `gmail-oauth` | `gmail_accounts`, `gmail_oauth_states` |
| `gmail-send` | `email_messages`, `email_threads`, `gmail_accounts` |
| `gmail-sync` | `email_attachments`, `email_messages`, `email_threads`, `gmail_accounts` |
| `gmail-webhook` | `contacts`, `email_attachments`, `email_messages`, `email_threads`, `gmail_accounts` |
| `health` | `whatsapp_connections` |
| `message-delivery` | `messages`, `profiles` |
| `metrics` | `query_telemetry`, `rate_limit_logs`, `webhook_rate_limits` |
| `migrate-media-storage` | `messages`, `whatsapp_connections` |
| `multiplix-audience` | `profiles` |
| `multiplix-dispatch` | `multiplix_audience_members`, `multiplix_audiences`, `multiplix_blocks`, `multiplix_dispatches`, `multiplix_recipients`, `profiles` |
| `multiplix-send` | `multiplix_delivery_items`, `multiplix_dispatches`, `multiplix_events`, `multiplix_voice_assets`, `profiles`, `whatsapp_connections` |
| `multiplix-voices` | `multiplix_voice_assets`, `multiplix_voice_grants`, `profiles`, `user_roles` |
| `promogifts-catalog` | `categories`, `product_variants`, `products`, `suppliers` |
| `public-api` | — |
| `recover-corrupted-audios` | `messages`, `whatsapp_connections` |
| `revoke-auth-sessions` | — |
| `searchbox-budget-alert` | `searchbox_usage_daily` |
| `send-email` | — |
| `send-rate-limit-alert` | `blocked_ips`, `notifications`, `security_alerts`, `user_roles` |
| `send-scheduled-report` | `agent_stats`, `contacts`, `conversation_analyses`, `conversation_sla`, `messages`, `scheduled_reports` |
| `sentiment-alert` | `contacts`, `conversation_analyses`, `profiles`, `user_settings` |
| `status` | — |
| `sync-call-records` | `calls` |
| `talkx-ai` | — |
| `talkx-link` | `talkx_links`, `talkx_recipients` |
| `talkx-report` | `profiles`, `talkx_campaigns`, `talkx_recipients` |
| `talkx-scheduler` | `talkx_campaigns`, `talkx_settings`, `whatsapp_connections` |
| `talkx-send` | `contact_custom_fields`, `profiles`, `talkx_campaign_events`, `talkx_campaigns`, `talkx_delivery_log`, `talkx_links`, `talkx_recipients`, `talkx_settings`, `talkx_template_variants`, `talkx_templates`, `talkx_test_send_claims`, `whatsapp_connections` |
| `talkx-storage-purge` | — |
| `voice-agent` | — |
| `voice-changer` | — |
| `voice-copilot-action` | `contact_notes`, `contacts`, `conversation_analyses`, `profiles`, `queues`, `user_roles` |
| `webauthn` | `passkey_credentials`, `webauthn_challenges` |
| `webhook-diagnostic` | `messages`, `whatsapp_connections` |
| `whatsapp-webhook` | `channel_connections`, `messages` |

## Por tabela

| Tabela | Funções |
|---|---|
| `agent_stats` | `send-scheduled-report` |
| `ai_conversation_tags` | `ai-classify-tickets` |
| `ai_jobs` | `ai-jobs-worker` |
| `ai_providers` | `ai-proxy` |
| `audit_logs` | `elevenlabs-voice-design`, `elevenlabs-webhook` |
| `auto_close_config` | `auto-close-conversations` |
| `blocked_ips` | `cleanup-rate-limit-logs`, `send-rate-limit-alert` |
| `calls` | `get-call-recording`, `sync-call-records` |
| `carriers` | `crm-integration` |
| `categories` | `promogifts-catalog` |
| `channel_connections` | `whatsapp-webhook` |
| `chatbot_flows` | `chatbot-l1` |
| `companies` | `crm-integration` |
| `company_addresses` | `crm-integration` |
| `company_social_media` | `crm-integration` |
| `connection_health_logs` | `connection-health-check` |
| `contact_custom_fields` | `ai-suggest-reply`, `talkx-send` |
| `contact_notes` | `ai-suggest-reply`, `voice-copilot-action` |
| `contact_phones` | `crm-integration` |
| `contacts` | `ai-auto-tag`, `ai-churn-analysis`, `ai-suggest-reply`, `auto-close-conversations`, `batch-fetch-avatars`, `bitrix-api`, `chatbot-l1`, `crm-integration`, `evolution-api`, `gmail-webhook`, `send-scheduled-report`, `sentiment-alert`, `voice-copilot-action` |
| `conversation_analyses` | `send-scheduled-report`, `sentiment-alert`, `voice-copilot-action` |
| `conversation_closures` | `auto-close-conversations`, `crm-integration` |
| `conversation_sla` | `send-scheduled-report` |
| `crm_contact_links` | `crm-integration` |
| `crm_sync_outbox` | `crm-integration` |
| `customers` | `crm-integration` |
| `email_attachments` | `gmail-sync`, `gmail-webhook` |
| `email_messages` | `crm-integration`, `gmail-send`, `gmail-sync`, `gmail-webhook` |
| `email_threads` | `crm-integration`, `gmail-send`, `gmail-sync`, `gmail-webhook` |
| `feature_flags` | `crm-integration` |
| `global_settings` | `evolution-api` |
| `gmail_accounts` | `create-user`, `crm-integration`, `gmail-cron-sync`, `gmail-oauth`, `gmail-send`, `gmail-sync`, `gmail-webhook` |
| `gmail_oauth_states` | `gmail-oauth` |
| `knowledge_base_articles` | `ai-kb-ingest`, `ai-suggest-reply`, `chatbot-l1` |
| `knowledge_base_files` | `ai-kb-ingest` |
| `link_preview_cache` | `fetch-link-preview` |
| `messages` | `ai-auto-tag`, `ai-churn-analysis`, `auto-close-conversations`, `chatbot-l1`, `message-delivery`, `migrate-media-storage`, `recover-corrupted-audios`, `send-scheduled-report`, `webhook-diagnostic`, `whatsapp-webhook` |
| `multiplix_audience_members` | `multiplix-dispatch` |
| `multiplix_audiences` | `multiplix-dispatch` |
| `multiplix_blocks` | `multiplix-dispatch` |
| `multiplix_delivery_items` | `multiplix-send` |
| `multiplix_dispatches` | `multiplix-dispatch`, `multiplix-send` |
| `multiplix_events` | `multiplix-send` |
| `multiplix_recipients` | `multiplix-dispatch` |
| `multiplix_voice_assets` | `multiplix-send`, `multiplix-voices` |
| `multiplix_voice_grants` | `multiplix-voices` |
| `notifications` | `ai-auto-tag`, `send-rate-limit-alert` |
| `passkey_credentials` | `webauthn` |
| `password_reset_requests` | `approve-password-reset` |
| `product_variants` | `promogifts-catalog` |
| `products` | `promogifts-catalog` |
| `profiles` | `ai-auto-tag`, `connection-health-check`, `create-user`, `crm-integration`, `get-sip-password`, `message-delivery`, `multiplix-audience`, `multiplix-dispatch`, `multiplix-send`, `multiplix-voices`, `sentiment-alert`, `talkx-report`, `talkx-send`, `voice-copilot-action` |
| `query_telemetry` | `external-db-bridge`, `metrics` |
| `queue_members` | `ai-auto-tag` |
| `queues` | `ai-auto-tag`, `voice-copilot-action` |
| `rate_limit_logs` | `cleanup-rate-limit-logs`, `metrics` |
| `scheduled_reports` | `send-scheduled-report` |
| `searchbox_usage_daily` | `searchbox-budget-alert` |
| `security_alerts` | `cleanup-rate-limit-logs`, `detect-new-device`, `send-rate-limit-alert` |
| `suppliers` | `crm-integration`, `promogifts-catalog` |
| `talkx_campaign_events` | `talkx-send` |
| `talkx_campaigns` | `talkx-report`, `talkx-scheduler`, `talkx-send` |
| `talkx_delivery_log` | `talkx-send` |
| `talkx_links` | `talkx-link`, `talkx-send` |
| `talkx_recipients` | `talkx-link`, `talkx-report`, `talkx-send` |
| `talkx_settings` | `talkx-scheduler`, `talkx-send` |
| `talkx_template_variants` | `talkx-send` |
| `talkx_templates` | `talkx-send` |
| `talkx_test_send_claims` | `talkx-send` |
| `user_devices` | `detect-new-device` |
| `user_roles` | `ai-auto-tag`, `create-user`, `multiplix-voices`, `send-rate-limit-alert`, `voice-copilot-action` |
| `user_service_accounts` | `create-user` |
| `user_sessions` | `detect-new-device` |
| `user_settings` | `sentiment-alert` |
| `warroom_alerts` | `connection-health-check` |
| `webauthn_challenges` | `webauthn` |
| `webhook_rate_limits` | `metrics` |
| `whatsapp_connections` | `batch-fetch-avatars`, `connection-health-check`, `evolution-api`, `evolution-webhook`, `health`, `migrate-media-storage`, `multiplix-send`, `recover-corrupted-audios`, `talkx-scheduler`, `talkx-send`, `webhook-diagnostic` |
