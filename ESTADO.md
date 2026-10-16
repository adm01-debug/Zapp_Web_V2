# ESTADO.md — o que está ligado e quem chama

Mapa das Edge Functions do Zapp Web V2: **quem chama cada edge** e o que está ligado
de verdade no código da ponta do dia. Complementa `docs/architecture/edge-functions.md`
(que descreve *o que* cada edge faz); aqui a pergunta é *quem a dispara*.

Base: código local de 16/10/2026 (não comprova deploy). 84 edges com `index.ts` em `supabase/functions/`.

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
| `ai-auto-tag` | E | sem chamador no repositório |
| `ai-churn-analysis` | A | `src/components/ai/ChurnPredictionDashboard.tsx:182` |
| `ai-classify-tickets` | A | `src/components/ai/AutoTicketClassifier.tsx:146` |
| `ai-conversation-analysis` | A | `src/components/inbox/AIConversationAssistant.tsx:107` |
| `ai-conversation-summary` | A | `src/components/inbox/ConversationSummary.tsx:91` |
| `ai-enhance-message` | A | `src/components/inbox/chat/AIEnhanceButton.tsx:62` |
| `ai-jobs-worker` | C | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql:533` |
| `ai-kb-ingest` | A | `src/hooks/integrations/useKnowledgeBase.ts:126` |
| `ai-proxy` | A | `src/hooks/ui/useUniversityHelp.ts:130` |
| `ai-suggest-reply` | A | `src/components/inbox/AISuggestions.tsx:102` |
| `ai-transcribe-audio` | A | `src/components/inbox/AudioMessagePlayer.tsx:66` |
| `ai-usage-outbox-drain` | E | sem chamador no repositório |
| `approve-password-reset` | A | `src/hooks/security/usePasswordResetRequests.ts:52` |
| `auth-login` | A | `src/lib/serverLogin.ts:149` |
| `auto-close-conversations` | E | sem chamador no repositório |
| `automation-suggest-reply` | A | `src/hooks/chat/useAutomationSuggestions.ts:192` |
| `batch-fetch-avatars` | A | `src/hooks/inbox/useInboxBulkActions.ts:245` |
| `bitrix-api` | A | `src/hooks/integrations/useBitrixApi.ts:33` |
| `chatbot-l1` | A | `src/components/settings/ChatbotL1Config.tsx:235` |
| `classify-audio-meme` | A | `src/hooks/communication/useAudioMemes.ts:243` |
| `classify-emoji` | A | `src/hooks/integrations/useCustomEmojis.ts:142` |
| `classify-sticker` | A | `src/hooks/sticker-picker/useStickerPicker.ts:148` |
| `cleanup-rate-limit-logs` | E | sem chamador no repositório |
| `connection-health-check` | A | `src/components/monitoring/hooks/useMonitoringActions.ts:18` |
| `create-user` | A | `src/components/admin/useAdminData.ts:448` |
| `crm-integration` | A | `src/lib/crmIntegration.ts:20` |
| `csp-report` | D | `supabase/config.toml:58` |
| `detect-new-device` | A | `src/lib/avisoDispositivo.ts:117` |
| `elevenlabs-agent-token` | E | sem chamador no repositório |
| `elevenlabs-dialogue` | A | `src/components/voice/ElevenLabsDialogue.tsx:63` |
| `elevenlabs-scribe-token` | A | `src/hooks/communication/useVoiceAgent.ts:307` |
| `elevenlabs-sfx` | A | `src/components/settings/media-library/AIGenerateDialog.tsx:31` |
| `elevenlabs-sts` | A | `src/components/inbox/VoiceChanger.tsx:81` |
| `elevenlabs-tts` | A | `src/components/inbox/TextToAudioButton.tsx:80` |
| `elevenlabs-tts-stream` | A | `src/hooks/voice/playTtsAudio.ts:165` |
| `elevenlabs-voice-design` | A | `src/components/voice/ElevenLabsVoiceDesign.tsx:32` |
| `elevenlabs-webhook` | D | `supabase/config.toml:29` |
| `evolution-api` | A | `src/hooks/groups/actions.ts:106` |
| `evolution-sync` | A | `src/components/connections/ConnectionsView.tsx:74` |
| `evolution-webhook` | A | `src/components/monitoring/hooks/useMonitoringActions.ts:31` |
| `external-db-bridge` | E | sem chamador no repositório |
| `external-db-proxy` | A | `src/lib/externalProxy.ts:33` |
| `fetch-link-preview` | B | `supabase/functions/_shared/evolution-webhook-messages.ts:276` |
| `get-call-recording` | A | `src/hooks/calls/useCallRecording.ts:35` |
| `get-mapbox-token` | A | `src/lib/mapboxToken.ts:87` |
| `get-sip-password` | A | `src/lib/calls/sipProvisioning.ts:22` |
| `gmail-cron-sync` | C | `supabase/migrations/20260829110000_gmail_incremental_sync_cron.sql:18` |
| `gmail-oauth` | A | `src/hooks/integrations/useGmailOAuth.ts:79` |
| `gmail-send` | E | sem chamador no repositório |
| `gmail-sync` | E | sem chamador no repositório |
| `gmail-webhook` | A | `src/components/admin/GmailWebhookMonitor.tsx:230` |
| `health` | E | sem chamador no repositório |
| `invite-user` | A | `src/components/agents/InviteAgentDialog.tsx:48` |
| `message-delivery` | A | `src/services/outbound-message.service.ts:456` |
| `metrics` | E | sem chamador no repositório |
| `migrate-media-storage` | A | `src/components/admin/MediaMigrationTool.tsx:28` |
| `multiplix-audience` | A | `src/hooks/integrations/useMultiplixAudience.ts:9` |
| `multiplix-dispatch` | A | `src/hooks/integrations/useMultiplixDispatches.ts:132` |
| `multiplix-send` | A | `src/hooks/integrations/useMultiplixDispatches.ts:408` |
| `multiplix-voices` | E | sem chamador no repositório |
| `promogifts-catalog` | A | `src/hooks/integrations/useCatalogQuickSearch.ts:12` |
| `public-api` | D | `supabase/config.toml:35` |
| `recover-corrupted-audios` | E | sem chamador no repositório |
| `recover-message-media` | E | sem chamador no repositório |
| `revoke-auth-sessions` | A | `src/pages/ResetPassword.tsx:168` |
| `searchbox-budget-alert` | C | `supabase/migrations/20261002601230_searchbox_budget_alert_cron.sql:70` |
| `send-email` | E | sem chamador no repositório |
| `send-rate-limit-alert` | E | sem chamador no repositório |
| `send-scheduled-report` | A | `src/hooks/chat/useScheduledReports.ts:151` |
| `sentiment-alert` | A | `src/hooks/inbox/useSentimentAlerts.ts:39` |
| `status` | E | sem chamador no repositório |
| `sync-call-records` | D | `supabase/config.toml:73` |
| `talkx-ai` | D | `supabase/config.toml:83` |
| `talkx-link` | A | `src/hooks/integrations/useTalkXLinks.ts:56` |
| `talkx-report` | E | sem chamador no repositório |
| `talkx-scheduler` | E | sem chamador no repositório |
| `talkx-send` | A | `src/hooks/integrations/useTalkX.ts:509` |
| `talkx-storage-purge` | E | sem chamador no repositório |
| `voice-agent` | A | `src/hooks/voice/processTranscript.ts:12` |
| `voice-changer` | A | `src/components/inbox/VoiceChangerPicker.tsx:246` |
| `voice-copilot-action` | E | sem chamador no repositório |
| `webauthn` | A | `src/hooks/auth/useWebAuthn.ts:51` |
| `webhook-diagnostic` | A | `src/components/monitoring/hooks/useMonitoringActions.ts:79` |
| `whatsapp-webhook` | D | `supabase/config.toml:11` |

## Órfãs (20) — GATE B

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

Edge que existe em `supabase/functions/`, mas nenhum ponto do repositório a dispara: não há
`invoke`/`/functions/v1` em `src/`, nem chamada de outra edge, nem agendador em
`supabase/migrations/`, nem entrada em `supabase/config.toml`. Isso não quer dizer "morta" — o chamador pode ser externo
(N8N, cron do provedor, operação manual) — quer dizer **não comprovada no repositório**.
As auditorias de migração de 2026-08 já apontavam parte destes nomes; a guarda agora
mantém a lista honesta.
