# ESTADO.md â€” o que estÃ¡ ligado e quem chama

Mapa das Edge Functions do Zapp Web V2: **quem chama cada edge** e o que estÃ¡ ligado
de verdade no cÃ³digo da ponta do dia. Complementa `docs/architecture/edge-functions.md`
(que descreve *o que* cada edge faz); aqui a pergunta Ã© *quem a dispara*.

Base: `dia/2026-10-20`. 84 edges com `index.ts` em `supabase/functions/`.

## Como manter

A guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` recalcula esta tabela a
partir do cÃ³digo e falha quando:

* aparece uma edge nova que nÃ£o estÃ¡ aqui (ou uma linha aponta para edge que nÃ£o existe);
* uma Ã¢ncora citada (`arquivo:linha`) deixa de conter o nome da edge â€” chamador removido;
* o grupo publicado deixa de ser o primeiro chamador real na ordem A â†’ B â†’ C â†’ D;
* uma edge marcada como **Ã³rfÃ£** passa a ter chamador, inclusive entrada externa em
  `supabase/config.toml` (ou vice-versa).

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

| Edge | Grupo | Ã‚ncora do chamador (arquivo:linha) |
|---|---|---|
| `ai-auto-tag` | E | â€” sem chamador no repositÃ³rio â€” |
| `ai-churn-analysis` | A | `src/components/ai/ChurnPredictionDashboard.tsx:182` |
| `ai-classify-tickets` | A | `src/components/ai/AutoTicketClassifier.tsx:146` |
| `ai-conversation-analysis` | A | `src/components/inbox/AIConversationAssistant.tsx:107` |
| `ai-conversation-summary` | A | `src/components/inbox/ConversationSummary.tsx:91` |
| `ai-enhance-message` | A | `src/components/inbox/chat/AIEnhanceButton.tsx:62` Â· `src/components/inbox/chat/AIRewriteButton.tsx:50` |
| `ai-jobs-worker` | C | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql:533` |
| `ai-kb-ingest` | A | `src/hooks/integrations/useKnowledgeBase.ts:126` Â· `src/hooks/integrations/useKnowledgeBase.ts:197` |
| `ai-proxy` | A | `src/components/admin/SupervisorCopilot.tsx:89` Â· `src/components/settings/ai-providers/useAIProviders.ts:121` Â· `src/hooks/inbox/useObjectionDetector.ts:90` Â· `src/hooks/inbox/useObjectionDetector.ts:164` Â· `src/hooks/ui/useUniversityHelp.ts:130` Â· `supabase/functions/talkx-ai/index.ts:589` |
| `ai-suggest-reply` | A | `src/components/inbox/AISuggestions.tsx:102` |
| `ai-transcribe-audio` | A | `src/components/inbox/AudioMessagePlayer.tsx:66` Â· `supabase/functions/_shared/evolution-webhook-messages.ts:1400` |
| `ai-usage-outbox-drain` | E | â€” sem chamador no repositÃ³rio â€” |
| `approve-password-reset` | A | `src/components/security/PasswordResetRequestsPanel.tsx:31` Â· `src/components/security/PasswordResetRequestsPanel.tsx:43` Â· `src/hooks/security/usePasswordResetRequests.ts:51` Â· `src/hooks/security/usePasswordResetRequests.ts:72` |
| `auth-login` | A | `src/lib/serverLogin.ts:149` Â· `supabase/config.toml:39` |
| `auto-close-conversations` | E | â€” sem chamador no repositÃ³rio â€” |
| `automation-suggest-reply` | A | `src/hooks/chat/useAutomationSuggestions.ts:192` |
| `batch-fetch-avatars` | A | `src/hooks/chat/useNewConversation.ts:143` Â· `src/hooks/chat/useNewConversation.ts:151` Â· `src/hooks/inbox/useInboxBulkActions.ts:249` Â· `supabase/migrations/20260828200100_cron_avatars_refresh_hourly.sql:11` Â· `supabase/migrations/20260902000200_fix_cron_avatars_refresh_key.sql:10` Â· `supabase/migrations/20260930250000_reschedule_cron_secrets_l5.sql:74` Â· `supabase/migrations/20260930390000_endurece_l5_contrato_e_jobs.sql:130` Â· `supabase/migrations/20260930430000_cron_sem_dml_direto_v2.sql:161` Â· `supabase/config.toml:26` |
| `bitrix-api` | A | `src/components/integrations/BitrixIntegrationView.tsx:29` Â· `src/hooks/integrations/useBitrixApi.ts:33` |
| `chatbot-l1` | A | `src/components/settings/ChatbotL1Config.tsx:235` Â· `supabase/functions/_shared/evolution-webhook-messages.ts:590` |
| `classify-audio-meme` | A | `src/components/settings/media-library/AIGenerateDialog.tsx:59` Â· `src/hooks/communication/useAudioMemes.ts:243` |
| `classify-emoji` | A | `src/hooks/integrations/useCustomEmojis.ts:142` |
| `classify-sticker` | A | `src/components/inbox/chat/MessageBubble.tsx:329` Â· `src/hooks/sticker-picker/useStickerPicker.ts:148` Â· `supabase/functions/_shared/evolution-webhook-messages.ts:1377` |
| `cleanup-rate-limit-logs` | E | â€” sem chamador no repositÃ³rio â€” |
| `connection-health-check` | A | `src/components/connections/ConnectionsView.tsx:101` Â· `src/components/diagnostics/ConnectionHealthPanel.tsx:95` Â· `src/components/monitoring/hooks/useMonitoringActions.ts:18` Â· `supabase/migrations/20260924100800_schedule_connection_health_check_cron.sql:16` Â· `supabase/migrations/20260930250000_reschedule_cron_secrets_l5.sql:56` Â· `supabase/migrations/20260930390000_endurece_l5_contrato_e_jobs.sql:87` Â· `supabase/migrations/20260930430000_cron_sem_dml_direto_v2.sql:116` Â· `supabase/config.toml:23` |
| `create-user` | A | `src/components/admin/useAdminData.ts:448` Â· `src/components/admin/useAdminData.ts:455` |
| `crm-integration` | A | `src/lib/crmIntegration.ts:20` Â· `supabase/migrations/20261016011302_crm_sync_outbox_cron.sql:34` Â· `supabase/config.toml:55` |
| `csp-report` | D | `supabase/config.toml:58` |
| `detect-new-device` | A | `src/lib/avisoDispositivo.ts:117` |
| `elevenlabs-agent-token` | E | â€” sem chamador no repositÃ³rio â€” |
| `elevenlabs-dialogue` | A | `src/components/voice/ElevenLabsDialogue.tsx:63` |
| `elevenlabs-scribe-token` | A | `src/components/inbox/RealtimeTranscription.tsx:88` Â· `src/hooks/communication/useVoiceAgent.ts:307` |
| `elevenlabs-sfx` | A | `src/components/settings/media-library/AIGenerateDialog.tsx:31` |
| `elevenlabs-sts` | A | `src/components/inbox/VoiceChanger.tsx:81` |
| `elevenlabs-tts` | A | `src/components/inbox/TextToAudioButton.tsx:80` Â· `src/components/inbox/VoiceSelector.tsx:99` |
| `elevenlabs-tts-stream` | A | `src/hooks/voice/playTtsAudio.ts:165` |
| `elevenlabs-voice-design` | A | `src/components/voice/ElevenLabsVoiceDesign.tsx:32` |
| `elevenlabs-webhook` | D | `supabase/config.toml:29` |
| `evolution-api` | A | `src/components/monitoring/MonitoringConnectionsList.tsx:38` Â· `src/components/monitoring/MonitoringConnectionsList.tsx:54` Â· `src/hooks/groups/actions.ts:106` |
| `evolution-sync` | A | `src/components/connections/ConnectionsView.tsx:76` |
| `evolution-webhook` | A | `src/components/monitoring/hooks/useMonitoringActions.ts:31` Â· `src/components/monitoring/hooks/useMonitoringActions.ts:60` Â· `supabase/functions/_shared/evolution-go-routes.ts:221` Â· `supabase/functions/_shared/evolution-sync-actions.ts:227` Â· `supabase/functions/_shared/evolution-sync-actions.ts:300` Â· `supabase/functions/evolution-api/index.ts:493` Â· `supabase/functions/evolution-api/index.ts:559` Â· `supabase/functions/evolution-api/index.ts:720` Â· `supabase/functions/webhook-diagnostic/index.ts:96` Â· `supabase/functions/webhook-diagnostic/index.ts:169` Â· `supabase/functions/webhook-diagnostic/index.ts:304` Â· `supabase/functions/webhook-diagnostic/index.ts:314` Â· `supabase/config.toml:8` |
| `external-db-bridge` | E | â€” sem chamador no repositÃ³rio â€” |
| `external-db-proxy` | A | `src/lib/externalProxy.ts:33` |
| `fetch-link-preview` | B | `supabase/functions/_shared/evolution-webhook-messages.ts:276` |
| `get-call-recording` | A | `src/hooks/calls/useCallRecording.ts:35` Â· `supabase/config.toml:77` |
| `get-mapbox-token` | A | `src/lib/mapboxToken.ts:87` |
| `get-sip-password` | A | `src/lib/calls/sipProvisioning.ts:22` |
| `gmail-cron-sync` | C | `supabase/migrations/20260829110000_gmail_incremental_sync_cron.sql:18` Â· `supabase/config.toml:17` |
| `gmail-oauth` | A | `src/hooks/integrations/useGmailOAuth.ts:79` |
| `gmail-send` | E | â€” sem chamador no repositÃ³rio â€” |
| `gmail-sync` | E | â€” sem chamador no repositÃ³rio â€” |
| `gmail-webhook` | A | `src/components/admin/GmailWebhookMonitor.tsx:230` Â· `supabase/config.toml:14` |
| `health` | E | â€” sem chamador no repositÃ³rio â€” |
| `invite-user` | A | `src/components/agents/InviteAgentDialog.tsx:48` Â· `supabase/config.toml:89` |
| `message-delivery` | A | `src/lib/invokeEdge.ts:24` Â· `src/services/outbound-message.service.ts:456` Â· `supabase/config.toml:49` |
| `metrics` | E | â€” sem chamador no repositÃ³rio â€” |
| `migrate-media-storage` | A | `src/components/admin/MediaMigrationTool.tsx:28` |
| `multiplix-audience` | A | `src/hooks/integrations/useMultiplixAudience.ts:9` |
| `multiplix-dispatch` | A | `src/hooks/integrations/useMultiplixDispatches.ts:132` |
| `multiplix-send` | A | `src/hooks/integrations/useMultiplixDispatches.ts:408` Â· `supabase/migrations/20260927320000_multiplix_cron_scheduler.sql:63` Â· `supabase/migrations/20260929610000_multiplix_cron_window_and_limits.sql:149` |
| `multiplix-voices` | E | â€” sem chamador no repositÃ³rio â€” |
| `promogifts-catalog` | A | `src/hooks/integrations/useCatalogQuickSearch.ts:12` Â· `src/hooks/integrations/useExternalCatalog.ts:182` Â· `supabase/config.toml:44` |
| `public-api` | D | `supabase/config.toml:35` |
| `recover-corrupted-audios` | E | â€” sem chamador no repositÃ³rio â€” |
| `recover-message-media` | E | â€” sem chamador no repositÃ³rio â€” |
| `revoke-auth-sessions` | A | `src/components/admin/ForceLogoutButton.tsx:40` Â· `src/hooks/ui/useDeviceDetection.ts:131` Â· `src/hooks/ui/useDeviceDetection.ts:162` Â· `src/hooks/ui/useDeviceDetection.ts:173` Â· `src/pages/ResetPassword.tsx:168` |
| `searchbox-budget-alert` | C | `supabase/migrations/20261002601230_searchbox_budget_alert_cron.sql:70` Â· `supabase/migrations/20261006235031_searchbox_budget_alert_email_ledger.sql:82` Â· `supabase/config.toml:68` |
| `send-email` | E | â€” sem chamador no repositÃ³rio â€” |
| `send-rate-limit-alert` | E | â€” sem chamador no repositÃ³rio â€” |
| `send-scheduled-report` | A | `src/hooks/chat/useScheduledReports.ts:151` |
| `sentiment-alert` | A | `src/hooks/inbox/useSentimentAlerts.ts:39` |
| `status` | E | â€” sem chamador no repositÃ³rio â€” |
| `sync-call-records` | D | `supabase/config.toml:73` |
| `talkx-ai` | D | `supabase/config.toml:83` |
| `talkx-link` | A | `src/hooks/integrations/useTalkXLinks.ts:56` Â· `supabase/functions/talkx-send/index.ts:128` Â· `supabase/config.toml:65` |
| `talkx-report` | E | â€” sem chamador no repositÃ³rio â€” |
| `talkx-scheduler` | E | â€” sem chamador no repositÃ³rio â€” |
| `talkx-send` | A | `src/hooks/integrations/useTalkX.ts:509` Â· `src/hooks/integrations/useTalkX.ts:525` Â· `src/hooks/integrations/useTalkX.ts:534` Â· `src/hooks/integrations/useTalkX.ts:543` Â· `src/hooks/integrations/useTalkXTemplates.ts:196` Â· `supabase/functions/talkx-scheduler/index.ts:341` Â· `supabase/migrations/20261001391230_talkx_engine_tick.sql:60` |
| `talkx-storage-purge` | E | â€” sem chamador no repositÃ³rio â€” |
| `voice-agent` | A | `src/hooks/voice/processTranscript.ts:12` |
| `voice-changer` | A | `src/components/inbox/VoiceChangerPicker.tsx:246` |
| `voice-copilot-action` | E | â€” sem chamador no repositÃ³rio â€” |
| `webauthn` | A | `src/hooks/auth/useWebAuthn.ts:51` Â· `src/hooks/auth/useWebAuthn.ts:83` Â· `src/hooks/auth/useWebAuthn.ts:106` Â· `src/hooks/auth/useWebAuthn.ts:136` |
| `webhook-diagnostic` | A | `src/components/monitoring/hooks/useMonitoringActions.ts:79` |
| `whatsapp-webhook` | D | `supabase/config.toml:11` |

## Ã“rfÃ£s (20) â€” GATE B

Edge que existe em `supabase/functions/`, mas nenhum ponto do repositÃ³rio a dispara: nÃ£o hÃ¡
`invoke`/`/functions/v1` em `src/`, nem chamada de outra edge, nem agendador em
ÍÕÁ…‰…Í”½µ¥É…Ñ¥½¹Ì½€°¹•´•¹ÑÉ…‘„•´ÍÕÁ…‰…Í”½½¹™¥œ¹Ñ½µ±€¸%ÍÍ¼»¼ÅÕ•È‘¥é•È€‰µ½ÉÑ„ˆƒŠP¼¡…µ…‘½ÈÁ½‘”Í•È•áÑ•É¹¼(¡8á8°É½¸‘¼ÁÉ½Ù•‘½È°½Á•É‡Ÿ¼µ…¹Õ…°¤ƒŠPÅÕ•È‘¥é•È€¨©»¼½µÁÉ½Ù…‘„¹¼É•Á½Í¥ÓÍÉ¥¼¨¨¸)Ì…Õ‘¥Ñ½É¥…Ì‘”µ¥É‡Ÿ¼‘”€ÈÀÈØ´Àà«„…Á½¹Ñ…Ù…´Á…ÉÑ”‘•ÍÑ•Ì¹½µ•Ìì„Õ…É‘„…½É„)µ…¹Ó¥´„±¥ÍÑ„¡½¹•ÍÑ„¸((´…¤µ…ÕÑ¼µÑ…€(´…¤µÕÍ…”µ½ÕÑ‰½àµ‘É…¥¹€(´…ÕÑ¼µ±½Í”µ½¹Ù•ÉÍ…Ñ¥½¹Í€(´±•…¹ÕÀµÉ…Ñ”µ±¥µ¥Ğµ±½Í€(´•±•Ù•¹±…‰Ìµ…•¹ĞµÑ½­•¹€(´•áÑ•É¹…°µ‘ˆµ‰É¥‘•€(´µ…¥°µÍ•¹‘€(´µ…¥°µÍå¹€(´¡•…±Ñ¡€(´µ•ÑÉ¥Í€(´µÕ±Ñ¥Á±¥àµÙ½¥•Í€(´É•½Ù•Èµ½ÉÉÕÁÑ•µ…Õ‘¥½Í€(´É•½Ù•Èµµ•ÍÍ…”µµ•‘¥…€(´Í•¹µ•µ…¥±€(´Í•¹µÉ…Ñ”µ±¥µ¥Ğµ…±•ÉÑ€(´ÍÑ…ÑÕÍ€(´Ñ…±­àµÉ•Á½ÉÑ€(´Ñ…±­àµÍ¡•‘Õ±•É€(´Ñ…±­àµÍÑ½É…”µÁÕÉ•€(´Ù½¥”µ½Á¥±½Ğµ…Ñ¥½¹€(