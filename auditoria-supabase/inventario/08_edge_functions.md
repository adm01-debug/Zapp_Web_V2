# Inventário — Edge Functions

**Data**: 2026-10-24 | Total: 83 funções no repo

## Funções com `verify_jwt = false` (risco mais alto)

| Função | Justificativa | Proteção alternativa |
|--------|--------------|---------------------|
| `auth-login` | Login server-side antes de ter JWT | Rate limit por email/IP + lockout |
| `whatsapp-webhook` | Recebe webhooks da Meta/Evolution | HMAC via `verifyMetaWebhookSignature` |
| `gmail-webhook` | Recebe push notifications do Gmail | Verificação Google (não auditada) |
| `gmail-cron-sync` | Cron via pg_cron | `x-cron-secret` do vault |
| `batch-fetch-avatars` | Cron via pg_cron | `x-cron-secret` do vault |
| `elevenlabs-webhook` | Recebe eventos do ElevenLabs | Não auditada (NÃO VERIFICADO) |

## Funções auditadas (código lido)

| Função | verify_jwt | Risco | Observações |
|--------|-----------|-------|-------------|
| `auth-login` | false | R0 | Rate limit + lockout implementados |
| `whatsapp-webhook` | false | R0 | HMAC validado, Zod schema |
| `evolution-api` | true | R1 | Sem validação de schema de entrada |

## Funções NÃO auditadas individualmente

Total: 76 funções. Classificação por categoria:

### Categoria: IA / LLM (11)
`ai-auto-tag`, `ai-churn-analysis`, `ai-classify-tickets`, `ai-conversation-analysis`,
`ai-conversation-summary`, `ai-enhance-message`, `ai-jobs-worker`, `ai-kb-ingest`,
`ai-proxy`, `ai-suggest-reply`, `ai-transcribe-audio`

**Risco default R1**: proxies de LLM com verify_jwt=true; principal risco é prompt injection
e vazamento de contexto entre tenants.

### Categoria: ElevenLabs / Voz (10)
`elevenlabs-agent-token`, `elevenlabs-dialogue`, `elevenlabs-scribe-token`, `elevenlabs-sfx`,
`elevenlabs-sts`, `elevenlabs-tts`, `elevenlabs-tts-stream`, `elevenlabs-voice-design`,
`elevenlabs-webhook`, `voice-changer`

**Risco default R1**: geração de tokens de serviço externo; validar que account_id é
verificado antes de emitir token.

### Categoria: Gmail / Email (5)
`gmail-cron-sync`, `gmail-oauth`, `gmail-send`, `gmail-sync`, `gmail-webhook`

**Risco default R1**: OAuth flow e envio de email; gmail-webhook é verify_jwt=false.

### Categoria: WhatsApp / Evolution (3)
`evolution-sync`, `evolution-webhook`, `whatsapp-webhook`

**Risco default R1**: evolution-webhook e whatsapp-webhook são webhooks externos.

### Categoria: TalkX / Campanhas (6)
`talkx-ai`, `talkx-link`, `talkx-report`, `talkx-scheduler`, `talkx-send`, `talkx-storage-purge`

**Risco default R1**: módulo em desenvolvimento ativo; talkx-scheduler é chamado por cron.

### Categoria: Multiplix (4)
`multiplix-audience`, `multiplix-dispatch`, `multiplix-send`, `multiplix-voices`

**Risco default R1**: dispatch de mensagens em massa.

### Categoria: Auth / Usuário (5)
`approve-password-reset`, `create-user`, `detect-new-device`, `invite-user`, `revoke-auth-sessions`

**Risco R2 potencial**: operações de gestão de usuário com service_role; validar que
account_id é verificado para evitar cross-tenant.

### Categoria: CRM / Integrações (4)
`bitrix-api`, `crm-integration`, `external-db-bridge`, `external-db-proxy`

**Risco R2 potencial**: `external-db-bridge` e `external-db-proxy` acessam bancos externos
(pgxfvjmuubtbowutlide, doufsxqlfjyuvxuezpln); validar que queries são parametrizadas.

### Categoria: Infra / Utilitários (15)
`cleanup-rate-limit-logs`, `connection-health-check`, `csp-report`, `fetch-link-preview`,
`get-call-recording`, `get-mapbox-token`, `get-sip-password`, `health`, `metrics`,
`migrate-media-storage`, `public-api`, `recover-corrupted-audios`, `recover-message-media`,
`send-rate-limit-alert`, `webhook-diagnostic`

**Risco default R0/R1**: maioria são funções de suporte; `migrate-media-storage` e
`recover-*` são operações destrutivas de dados que merecem auditoria individual.

### Categoria: Agendamentos / Relatórios (5)
`auto-close-conversations`, `automation-suggest-reply`, `message-delivery`, `send-email`,
`send-scheduled-report`

**Risco default R1**: triggers automáticos com potencial de escala.

## Logs 7d

**NÃO VERIFICADO** — `supabase_functions.hooks` não acessível via SQL.
Acessar via: Dashboard Supabase → Edge Functions → Logs, ou
`supabase functions logs <nome>` via CLI com credenciais do projeto.

## Observações de Segurança

1. `elevenlabs-webhook` com `verify_jwt=false` e sem auditoria de código é **HIGH-1** do relatório
2. Funções de categoria Auth com service_role merecem auditoria de cross-tenant (R2 → HIGH se confirmado)
3. `external-db-bridge`/`external-db-proxy` — confirmar que queries são parametrizadas (risco de SQL injection)
4. `ai-proxy` — confirmar que não vaza contexto entre tenants (cada request isolado por account_id)
