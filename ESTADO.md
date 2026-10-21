# ESTADO.md — o que está ligado e quem chama

Mapa das Edge Functions do Zapp Web V2: **quem chama cada edge** e o que está ligado
de verdade no código da ponta do dia. Complementa `docs/architecture/edge-functions.md`
(que descreve *o que* cada edge faz); aqui a pergunta é *quem a dispara*.

Base: `dia/2026-10-21`. 84 edges com `index.ts` em `supabase/functions/`.

## Como manter

A guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` recalcula esta tabela a
partir do código e falha quando:

* aparece uma edge nova que não está aqui (ou uma linha aponta para edge que não existe);
* uma âncora citada (`arquivo:linha`) deixa de conter o nome da edge — chamador removido;
* o grupo publicado deixa de ser o primeiro chamador real na ordem A → B → C → D;
* uma edge marcada como **órfã** passa a ter chamador, inclusive entrada externa em
  `supabase/config.toml` (ou vice-versa).

O quadro `## Totais` e a contagem do cabeçalho são um **retrato manual** da ponta do dia: eles
mudam a cada entrega que acrescenta uma edge, então a guarda **não** os recalcula — dois cartões
empilhados não podem brigar por um número global. O que a guarda prova é a tabela acima (conjunto
de edges, âncora e grupo de cada linha), sempre recalculado do código.

Ou seja: mudou o código, o teste vermelho obriga a atualizar este arquivo.

## Grupos (prioridade nesta ordem)

| Grupo | Significado |
|---|---|
| A | front (`invoke`/`invokeEdge`/rota em `src/`) |
| B | outra edge (`supabase/functions/`) |
| C | agendador `pg_cron`/`pg_net` (migration) |
| D | entrada externa (declarada em `supabase/config.toml`) |
| E | órfã (sem chamador no repositório) |

Uma edge pode ter mais de um chamador; o grupo registra o **primeiro** recalculado pela
guarda na ordem acima (A → B → C → D) e a coluna de âncoras lista as evidências achadas.
Sem nenhum chamador, o grupo é **E** — e a guarda prova a ausência nas quatro fontes.

## Totais

| Grupo | Edges |
|---|---|
| A | 54 |
| B | 1 |
| C | 3 |
| D | 6 |
| E | 20 |
| **total** | **84** |

## Tabela

| Edge | Grupo | Âncora do chamador (arquivo:linha) |
|---|---|---|
| `ai-auto-tag` | E | — sem chamador no repositório — |
| `ai-churn-analysis` | A | `src/components/ai/ChurnPredictionDashboard.tsx:182` |
| `ai-classify-tickets` | A | `src/components/ai/AutoTicketClassifier.tsx:146` |
| `ai-conversation-analysis` | A | `src/components/inbox/AIConversationAssistant.tsx:107` |
| `ai-conversation-summary` | A | `src/components/inbox/ConversationSummary.tsx:91` |
| `ai-enhance-message` | A | `src/components/inbox/chat/AIEnhanceButton.tsx:62` · `src/components/inbox/chat/AIRewriteButton.tsx:50` |
| `ai-jobs-worker` | C | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql:533` |
| `ai-kb-ingest` | A | `src/hooks/integrations/useKnowledgeBase.ts:126` · `src/hooks/integrations/useKnowledgeBase.ts:197` |
| `ai-proxy` | A | `src/hooks/ui/useUniversityHelp.ts:130` · `src/hooks/inbox/useObjectionDetector.ts:90` · `src/hooks/inbox/useObjectionDetector.ts:164` · `src/components/settings/ai-providers/useAIProviders.ts:121` · `src/components/admin/SupervisorCopilot.tsx:89` · `supabase/functions/talkx-ai/index.ts:589` |
| `ai-suggest-reply` | A | `src/components/inbox/AISuggestions.tsx:102` |
| `ai-transcribe-audio` | A | `src/components/inbox/AudioMessagePlayer.tsx:66` · `supabase/functions/_shared/evolution-webhook-messages.ts:1400` |
| `ai-usage-outbox-drain` | E | — sem chamador no repositório — |
| `approve-password-reset` | A | `src/hooks/security/usePasswordResetRequests.ts:51` · `src/hooks/security/usePasswordResetRequests.ts:72` · `src/components/security/PasswordResetRequestsPanel.tsx:31` · `src/components/security/PasswordResetRequestsPanel.tsx:43` |
| `auth-login` | A | `src/lib/serverLogin.ts:149` · `supabase/config.toml:39` |
| `auto-close-conversations` | E | — sem chamador no repositório — |
| `automation-suggest-reply` | A | `src/hooks/chat/useAutomationSuggestions.ts:192` |
| `batch-fetch-avatars` | A | `src/hooks/inbox/useInboxBulkActions.ts:245` · `src/hooks/chat/useNewConversation.ts:143` · `src/hooks/chat/useNewConversation.ts:151` · `supabase/migrations/20260828200100_cron_avatars_refresh_hourly.sql:11` · `supabase/migrations/20260902000200_fix_cron_avatars_refresh_key.sql:10` · `supabase/migrations/20260930250000_reschedule_cron_secrets_l5.sql:74` · `supabase/migrations/20260930390000_endurece_l5_contrato_e_jobs.sql:130` · `supabase/migrations/20260930430000_cron_sem_dml_direto_v2.sql:161` · `supabase/config.toml:26` |
| `bitrix-api` | A | `src/hooks/integrations/useBitrixApi.ts:33` · `src/components/integrations/BitrixIntegrationView.tsx:29` |
| `chatbot-l1` | A | `src/components/settings/ChatbotL1Config.tsx:235` · `supabase/functions/_shared/evolution-webhook-messages.ts:590` |
| `classify-audio-meme` | A | `src/hooks/communication/useAudioMemes.ts:243` · `src/components/settings/media-library/AIGenerateDialog.tsx:59` |
| `classify-emoji` | A | `src/hooks/integrations/useCustomEmojis.ts:142` |
| `classify-sticker` | A | `src/hooks/sticker-picker/useStickerPicker.ts:148` · `src/components/inbox/chat/MessageBubble.tsx:328` · `supabase/functions/_shared/evolution-webhook-messages.ts:1377` |
| `cleanup-rate-limit-logs` | E | — sem chamador no repositório — |
| `connection-health-check` | A | `src/components/monitoring/hooks/useMonitoringActions.ts:18` · `src/components/diagnostics/ConnectionHealthPanel.tsx:95` · `src/components/connections/ConnectionsView.tsx:99` · `supabase/migrations/20260924100800_schedule_connection_health_check_cron.sql:16` · `supabase/migrations/20260930250000_reschedule_cron_secrets_l5.sql:56` · `supabase/migrations/20260930390000_endurece_l5_contrato_e_jobs.sql:87` · `supabase/migrations/20260930430000_cron_sem_dml_direto_v2.sql:116` · `supabase/config.toml:23` |
| `create-user` | A | `src/components/admin/useAdminData.ts:448` · `src/components/admin/useAdminData.ts:455` |
| `crm-integration` | A | `src/lib/crmIntegration.ts:20` · `supabase/migrations/20261016011302_crm_sync_outbox_cron.sql:34` · `supabase/config.toml:55` |
| `csp-report` | D | `supabase/config.toml:58` |
| `detect-new-device` | A | `src/lib/avisoDispositivo.ts:117` |
| `elevenlabs-agent-token` | E | — sem chamador no repositório — |
| `elevenlabs-dialogue` | A | `src/components/voice/ElevenLabsDialogue.tsx:63` |
| `elevenlabs-scribe-token` | A | `src/hooks/communication/useVoiceAgent.ts:307` · `src/components/inbox/RealtimeTranscription.tsx:88` |
| `elevenlabs-sfx` | A | `src/components/settings/media-library/AIGenerateDialog.tsx:31` |
| `elevenlabs-sts` | A | `src/components/inbox/VoiceChanger.tsx:81` |
| `elevenlabs-tts` | A | `src/components/inbox/TextToAudioButton.tsx:80` · `src/components/inbox/VoiceSelector.tsx:99` |
| `elevenlabs-tts-stream` | A | `src/hooks/voice/playTtsAudio.ts:165` |
| `elevenlabs-voice-design` | A | `src/components/voice/ElevenLabsVoiceDesign.tsx:32` |
| `elevenlabs-webhook` | D | `supabase/config.toml:29` |
| `evolution-api` | A | `src/hooks/groups/actions.ts:106` · `src/components/monitoring/MonitoringConnectionsList.tsx:38` · `src/components/monitoring/MonitoringConnectionsList.tsx:54` |
| `evolution-sync` | A | `src/components/connections/ConnectionsView.tsx:74` |
| `evolution-webhook` | A | `src/components/monitoring/hooks/useMonitoringActions.ts:31` · `src/components/monitoring/hooks/useMonitoringActions.ts:60` · `supabase/functions/webhook-diagnostic/index.ts:96` · `supabase/functions/webhook-diagnostic/index.ts:169` · `supabase/functions/webhook-diagnostic/index.ts:304` · `supabase/functions/webhook-diagnostic/index.ts:314` · `supabase/functions/evolution-api/index.ts:492` · `supabase/functions/evolution-api/index.ts:558` · `supabase/functions/evolution-api/index.ts:719` · `supabase/functions/_shared/evolution-go-routes.ts:221` · `supabase/functions/_shared/evolution-sync-actions.ts:227` · `supabase/functions/_shared/evolution-sync-actions.ts:300` · `supabase/config.toml:8` |
| `external-db-bridge` | E | — sem chamador no repositório — |
| `external-db-proxy` | A | `src/lib/externalProxy.ts:33` |
| `fetch-link-preview` | B | `supabase/functions/_shared/evolution-webhook-messages.ts:276` |
| `get-call-recording` | A | `src/hooks/calls/useCallRecording.ts:35` · `supabase/config.toml:77` |
| `get-mapbox-token` | A | `src/lib/mapboxToken.ts:87` |
| `get-sip-password` | A | `src/lib/calls/sipProvisioning.ts:22` |
| `gmail-cron-sync` | C | `supabase/migrations/20260829110000_gmail_incremental_sync_cron.sql:18` · `supabase/config.toml:17` |
| `gmail-oauth` | A | `src/hooks/integrations/useGmailOAuth.ts:79` |
| `gmail-send` | E | — sem chamador no repositório — |
| `gmail-sync` | E | — sem chamador no repositório — |
| `gmail-webhook` | A | `src/components/admin/GmailWebhookMonitor.tsx:230` · `supabase/config.toml:14` |
| `health` | E | — sem chamador no repositório — |
| `invite-user` | A | `src/components/agents/InviteAgentDialog.tsx:48` · `supabase/config.toml:89` |
| `message-delivery` | A | `src/services/outbound-message.service.ts:456` · `src/lib/invokeEdge.ts:24` · `supabase/config.toml:49` |
| `metrics` | E | — sem chamador no repositório — |
| `migrate-media-storage` | A | `src/components/admin/MediaMigrationTool.tsx:28` |
| `multiplix-audience` | A | `src/hooks/integrations/useMultiplixAudience.ts:9` |
| `multiplix-dispatch` | A | `src/hooks/integrations/useMultiplixDispatches.ts:132` |
| `multiplix-send` | A | `src/hooks/integrations/useMultiplixDispatches.ts:408` · `supabase/migrations/20260927320000_multiplix_cron_scheduler.sql:63` · `supabase/migrations/20260929610000_multiplix_cron_window_and_limits.sql:149` |
| `multiplix-voices` | E | — sem chamador no repositório — |
| `promogifts-catalog` | A | `src/hooks/integrations/useCatalogQuickSearch.ts:12` · `src/hooks/integrations/useExternalCatalog.ts:182` · `supabase/config.toml:44` |
| `public-api` | D | `supabase/config.toml:35` |
| `recover-corrupted-audios` | E | — sem chamador no repositório — |
| `recover-message-media` | E | — sem chamador no repositório — |
| `revoke-auth-sessions` | A | `src/pages/ResetPassword.tsx:168` · `src/hooks/ui/useDeviceDetection.ts:131` · `src/hooks/ui/useDeviceDetection.ts:162` · `src/hooks/ui/useDeviceDetection.ts:173` · `src/components/admin/ForceLogoutButton.tsx:40` |
| `searchbox-budget-alert` | C | `supabase/migrations/20261002601230_searchbox_budget_alert_cron.sql:70` · `supabase/migrations/20261006235031_searchbox_budget_alert_email_ledger.sql:82` · `supabase/config.toml:68` |
| `send-email` | E | — sem chamador no repositório — |
| `send-rate-limit-alert` | E | — sem chamador no repositório — |
| `send-scheduled-report` | A | `src/hooks/chat/useScheduledReports.ts:151` |
| `sentiment-alert` | A | `src/hooks/inbox/useSentimentAlerts.ts:39` |
| `status` | E | — sem chamador no repositório — |
| `sync-call-records` | D | `supabase/config.toml:73` |
| `talkx-ai` | D | `supabase/config.toml:83` |
| `talkx-link` | A | `src/hooks/integrations/useTalkXLinks.ts:56` · `supabase/functions/talkx-send/index.ts:128` · `supabase/config.toml:65` |
| `talkx-report` | E | — sem chamador no repositório — |
| `talkx-scheduler` | E | — sem chamador no repositório — |
| `talkx-send` | A | `src/hooks/integrations/useTalkX.ts:509` · `src/hooks/integrations/useTalkX.ts:525` · `src/hooks/integrations/useTalkX.ts:534` · `src/hooks/integrations/useTalkX.ts:543` · `src/hooks/integrations/useTalkXTemplates.ts:196` · `supabase/functions/talkx-scheduler/index.ts:341` · `supabase/migrations/20261001391230_talkx_engine_tick.sql:60` |
| `talkx-storage-purge` | E | — sem chamador no repositório — |
| `voice-agent` | A | `src/hooks/voice/processTranscript.ts:12` |
| `voice-changer` | A | `src/components/inbox/VoiceChangerPicker.tsx:246` |
| `voice-copilot-action` | E | — sem chamador no repositório — |
| `webauthn` | A | `src/hooks/auth/useWebAuthn.ts:51` · `src/hooks/auth/useWebAuthn.ts:83` · `src/hooks/auth/useWebAuthn.ts:106` · `src/hooks/auth/useWebAuthn.ts:136` |
| `webhook-diagnostic` | A | `src/components/monitoring/hooks/useMonitoringActions.ts:79` |
| `whatsapp-webhook` | D | `supabase/config.toml:11` |

## Órfãs (20) — GATE B

Edge que existe em `supabase/functions/`, mas nenhum ponto do repositório a dispara: não há
`invoke`/`/functions/v1` em `src/`, nem chamada de outra edge, nem agendador em
`supabase/migrations/`, nem entrada em `supabase/config.toml`. Isso não quer dizer "morta" — o chamador pode ser externo
(N8N, cron do provedor, operação manual) — quer dizer **não comprovada no repositório**.
As auditorias de migração de 2026-08 já apontavam parte destes nomes; a guarda agora
mantém a lista honesta.

- `ai-auto-tag`
- `ai-usage-outbox-drain`
- `auto-close-conversations`
- `cleanup-rate-limit-logs`
- `elevenlabs-agent-token`
- `external-db-bridge`
- `gmail-send`
- `gmail-sync`
- `health`
- `metrics`
- `multiplix-voices`
- `recover-corrupted-audios`
- `recover-message-media`
- `send-email`
- `send-rate-limit-alert`
- `status`
- `talkx-report`
- `talkx-scheduler`
- `talkx-storage-purge`
- `voice-copilot-action`
