# Inventário de Edge Functions — 84 funções no repo (2026-10-22)

Fonte: `ls supabase/functions/` (excluindo `_shared/` e `deno.json`).

## Lista completa (84 funções)

```
ai-auto-tag               ai-churn-analysis         ai-classify-tickets
ai-conversation-analysis  ai-conversation-summary   ai-enhance-message
ai-jobs-worker            ai-kb-ingest              ai-proxy
ai-suggest-reply          ai-transcribe-audio       ai-usage-outbox-drain
approve-password-reset    auth-login                auto-close-conversations
automation-suggest-reply  batch-fetch-avatars       bitrix-api
chatbot-l1                classify-audio-meme       classify-emoji
classify-sticker          cleanup-rate-limit-logs   connection-health-check
create-user               crm-integration           csp-report
detect-new-device         elevenlabs-agent-token    elevenlabs-dialogue
elevenlabs-scribe-token   elevenlabs-sfx            elevenlabs-sts
elevenlabs-tts            elevenlabs-tts-stream     elevenlabs-voice-design
elevenlabs-webhook        evolution-api             evolution-sync
evolution-webhook         external-db-bridge        external-db-proxy
fetch-link-preview        get-call-recording        get-mapbox-token
get-sip-password          gmail-cron-sync           gmail-oauth
gmail-send                gmail-sync                gmail-webhook
health                    invite-user               message-delivery
metrics                   migrate-media-storage     multiplix-audience
multiplix-dispatch        multiplix-send            multiplix-voices
promogifts-catalog        public-api                recover-corrupted-audios
recover-message-media     revoke-auth-sessions      searchbox-budget-alert
send-email                send-rate-limit-alert     send-scheduled-report
sentiment-alert           status                    sync-call-records
talkx-ai                  talkx-link                talkx-report
talkx-scheduler           talkx-send                talkx-storage-purge
voice-agent               voice-changer             voice-copilot-action
webauthn                  webhook-diagnostic        whatsapp-webhook
```

## Achados de segurança por função

### `auth-login` — verify_jwt=false
- Única função com `verify_jwt = false` em `supabase/functions/auth-login/index.ts`
- **Justificativa:** função de login recebe token não-autenticado para criar sessão
- **Mitigação:** código valida credenciais internamente antes de criar sessão JWT
- **Risco:** BAIXO — padrão correto para endpoints de autenticação

### Funções chamadas por crons (autenticação via x-cron-secret do vault)
- `gmail-cron-sync` ← job 4
- `connection-health-check` ← job 17
- `batch-fetch-avatars` ← job 18
- `searchbox-budget-alert` ← job 21

### Funções chamadas por webhooks externos
- `evolution-webhook` — WhatsApp (Evolution GO)
- `gmail-webhook` — Gmail
- `elevenlabs-webhook` — ElevenLabs
- `whatsapp-webhook` — WhatsApp direto

## NÃO VERIFICADO

- Lista exata de funções **deployed** em produção vs repo (requer REST API Supabase ou CLI)
- Logs de 7d por função (requer query_logs com filtro por função — não disponível via MCP read-only sem auth edge)
- R0/R1/R2 risk rating por função (requer leitura completa de cada index.ts — 84 funções)

## Funções com acesso a dados externos (R2 — risco maior)

Baseado nos nomes e no padrão de crons:
| Função | Acesso externo |
|--------|---------------|
| `evolution-api` | Evolution GO (WhatsApp) |
| `gmail-*` | Gmail API |
| `elevenlabs-*` | ElevenLabs API |
| `crm-integration` | CRM externo |
| `external-db-bridge` / `external-db-proxy` | Banco externo (CRM/SiCOOB) |
| `promogifts-catalog` | Catálogo externo |
| `bitrix-api` | Bitrix24 CRM |
