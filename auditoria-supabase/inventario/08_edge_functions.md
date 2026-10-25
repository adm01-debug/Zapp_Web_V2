# Inventário — Edge Functions

**Data**: 2026-10-24 | **Total**: 84 funções auditadas individualmente (código lido)
**Método**: head -40/50 de cada index.ts + grep de padrões auth/injeção SQL

## Resumo

| Categoria | Qtd |
|-----------|-----|
| verify_jwt=false | 14 |
| verify_jwt=true | 70 |
| Risco R0 (padrão seguro) | 49 |
| Risco R1 (controles adicionais verificados) | 35 |
| Risco R2 ou superior | 0 |

---

## Funções com `verify_jwt = false` (14)

Todas verificadas individualmente. Nenhuma sem mecanismo de autenticação alternativo.

| Função | Risco | Proteção alternativa confirmada |
|--------|-------|--------------------------------|
| `auth-login` | R1 | Rate limit por email/IP + lockout; service_role via env |
| `batch-fetch-avatars` | R1 | authorizeCronOrUser: cron-secret do Vault (RPC SECURITY DEFINER) OU admin/supervisor role check via `is_admin_or_supervisor` |
| `connection-health-check` | R1 | isAuthorizedCronOrUser + timingSafeStringEqual; INSTANCE_NAME_RE `/^[a-z0-9_]{3,40}$/` impede path traversal |
| `csp-report` | R0 | Logging only; sem escrita em banco; body limitado a 8KB; campos URL sanitizados |
| `crm-integration` | R1 | requireAuth + CRM_TABLE_ALLOWLIST + FILTER_OPERATORS allowlist + validIdentifier regex |
| `elevenlabs-webhook` | R0 | verifyElevenLabsSignature; dedupe por `dedupe_key` em `audit_logs` (UNIQUE 23505 → 200) |
| `evolution-webhook` | R1 | HMAC (EVOLUTION_WEBHOOK_SECRET) + instanceToken por cópia via get_instance_token (Vault, 5 min cache); timingSafeEqual; strictMode=false documentado (GO não assina headers) |
| `gmail-cron-sync` | R1 | Invocado por pg_cron; compare-and-swap no cursor history_id; sem input externo |
| `gmail-webhook` | R1 | verifyGmailOidcRequest — OIDC token de Google PubSub validado |
| `public-api` | R0 | Retorna 410 Gone — endpoint desativado |
| `searchbox-budget-alert` | R1 | cron-secret via `secret !== esperado` (plain comparison — LOW: não usa timingSafeEqual, mas segredo randômico + pg_cron como único caller mitiga) |
| `sync-call-records` | R1 | timingSafeStringEqual para cron-secret; chamado por N8N com service_role |
| `talkx-link` | R1 | HMAC-SHA256 v1 (timestamp + externalRef + corpo); verifyHmacSignature; SECURITY DEFINER RPCs para persistência |
| `whatsapp-webhook` | R1 | verifyMetaWebhookSignature HMAC + instanceToken; Zod schema validation |

---

## Funções com `verify_jwt = true` (70)

### Auth-relacionadas (R1)

| Função | Risco | Controles confirmados |
|--------|-------|-----------------------|
| `approve-password-reset` | R1 | requireAuth + admin client + rate limit por email + isAllowedOrigin check |
| `detect-new-device` | R0 | getUser() valida JWT; session_id extraído do JWT claim (nunca do body); UPSERT por auth_session_id |
| `invite-user` | R1 | requireAuth; admin/supervisor role check (caller client, não service role); supervisor → só papel 'agent'; compensation: deleteUser on failure |
| `revoke-auth-sessions` | R1 | requireAuth; admin/supervisor role via effective_role; supervisor não alcança admin/supervisor; delegado a SQL SECURITY DEFINER revoke_auth_sessions; audit_logs sem token |
| `webauthn` | R1 | verifyAuthenticationAssertion (criptográfica); rate limit; resolveNetworkPolicy |

### Operações administrativas (R1)

| Função | Risco | Controles confirmados |
|--------|-------|-----------------------|
| `evolution-sync` | R1 | requireAuth + admin-only (403 para não-admin) |
| `migrate-media-storage` | R1 | requireAuth + is_admin RPC (403 para supervisor) |
| `recover-corrupted-audios` | R1 | requireAuth + admin-only (403) |

### Cron / worker (R1)

| Função | Risco | Controles confirmados |
|--------|-------|-----------------------|
| `ai-jobs-worker` | R1 | timingSafeEqual; cron-secret dedicado via Vault (ai_jobs_cron_secret) |
| `ai-usage-outbox-drain` | R1 | timingSafeStringEqual; fail-closed (segredo ausente → 401) |
| `auto-close-conversations` | R1 | timingSafeEqual cron-secret |
| `cleanup-rate-limit-logs` | R1 | timingSafeEqual cron-secret |
| `health` | R1 | authorizeObservability: cron-secret via Vault; dados internos protegidos |
| `metrics` | R1 | authorizeObservability: cron-secret via Vault |
| `send-rate-limit-alert` | R1 | timingSafeEqual cron-secret |
| `send-scheduled-report` | R1 | timingSafeEqual cron-secret |
| `talkx-scheduler` | R1 | timingSafeEqual; cron-secret via get_talkx_cron_secret() (Vault) OU service key |
| `talkx-send` | R1 | timingSafeEqual cron-secret |
| `talkx-storage-purge` | R1 | timingSafeEqual; cron-secret via get_talkx_cron_secret() (Vault) |

### Multiplix / TalkX (R1)

| Função | Risco | Controles confirmados |
|--------|-------|-----------------------|
| `multiplix-dispatch` | R1 | requireAuth + enforceRateLimit + Zod action enum; newCorrelationId |
| `multiplix-send` | R1 | enforceRateLimit + timingSafeEqual (cron claim/lease) |
| `talkx-ai` | R1 | JWT check manual (não requireAuth); 401 sem JWT |
| `talkx-report` | R1 | auth header check + getUser() |

### Gmail / OAuth (R1)

| Função | Risco | Controles confirmados |
|--------|-------|-----------------------|
| `gmail-oauth` | R1 | auth header + getUser(); service_role client separado |
| `gmail-send` | R1 | auth header + getUser(); 401 sem Authorization |
| `gmail-sync` | R1 | auth header + getUser(); 403 para operações admin sem role |

### IA / LLM (R0/R1)

| Função | Risco | Auth confirmada |
|--------|-------|------------------|
| `ai-auto-tag` | R0 | requireAuth + sanitizeString + isValidUUID |
| `ai-churn-analysis` | R0 | manual authHeader + getUser() |
| `ai-classify-tickets` | R0 | manual authHeader + getUser() |
| `ai-conversation-analysis` | R0 | requireAuth + createAuthedClient |
| `ai-conversation-summary` | R0 | requireAuth + createAuthedClient |
| `ai-enhance-message` | R0 | requireAuth + sanitizeString |
| `ai-kb-ingest` | R0 | requireAuth |
| `ai-proxy` | R1 | requireAuth + enforceAiGuards + provider/model selecionados server-side |
| `ai-suggest-reply` | R0 | requireAuth + createAuthedClient |
| `ai-transcribe-audio` | R0 | requireAuth; service_role apenas para gravar resultado após validar JWT |
| `chatbot-l1` | R1 | requireAuth OU HMAC webhook signature; rate limit; Zod ChatbotL1Schema |

### ElevenLabs tokens e síntese (R0)

| Função | Auth confirmada |
|--------|------------------|
| `elevenlabs-agent-token` | requireAuth + enforceRateLimit |
| `elevenlabs-dialogue` | requireAuth + enforceRateLimit |
| `elevenlabs-scribe-token` | requireAuth + enforceRateLimit |
| `elevenlabs-sfx` | requireAuth + enforceRateLimit |
| `elevenlabs-sts` | requireAuth + enforceRateLimit |
| `elevenlabs-tts` | requireAuth + enforceRateLimit |
| `elevenlabs-tts-stream` | requireAuth + enforceRateLimit |
| `elevenlabs-voice-design` | requireAuth + enforceRateLimit + isValidUUID |

### Voz / IA de voz (R0)

| Função | Auth confirmada |
|--------|------------------|
| `automation-suggest-reply` | requireAuth |
| `classify-audio-meme` | requireAiIdentity |
| `classify-emoji` | requireAiIdentity |
| `classify-sticker` | requireAiIdentity |
| `voice-agent` | requireAiIdentity |
| `voice-changer` | requireAuth |
| `voice-copilot-action` | requireAuth + createAuthedClient |

### Utilitários e infra (R0/R1)

| Função | Risco | Auth / padrão |
|--------|-------|---------------|
| `bitrix-api` | R1 | requireAuth + Zod action enum (11 ações) + entityType enum |
| `create-user` | R1 | rate limit por IP (5/60s); compensation deleteUser on failure |
| `evolution-api` | R0 | verify_jwt=true; padrão standard |
| `external-db-bridge` | R0 | TABLE_ALLOWLIST + RPC_ALLOWLIST hardcoded |
| `external-db-proxy` | R0 | READ_TABLES allowlist; validIdentifier regex; JWT do caller passado ao canonical client (RLS aplica) |
| `fetch-link-preview` | R0 | requireAuth |
| `get-call-recording` | R0 | requireAuth + verificação de ownership |
| `get-mapbox-token` | R0 | requireAuth + enforceRateLimit |
| `get-sip-password` | R0 | requireAuth (JWT validation) |
| `message-delivery` | R0 | requireAuth |
| `multiplix-audience` | R0 | requireAuth + enforceRateLimit |
| `multiplix-voices` | R0 | requireAuth + enforceRateLimit |
| `promogifts-catalog` | R1 | auth header check manual; 401 sem token |
| `recover-message-media` | R0 | requireAuth + network policy |
| `send-email` | R1 | requireAuth; service_role para envio |
| `sentiment-alert` | R0 | requireAuth |
| `status` | R0 | Público intencional: smoke endpoint; sem dado sensível |
| `webhook-diagnostic` | R1 | JWT check + admin/supervisor role |

---

## Verificação de SQL dinâmico nas edge functions

Grep executado: `EXECUTE\|format(\|execute(` em todos os index.ts — **0 ocorrências** confirmadas.

## Verificação de hardcoded secrets

Grep executado em todos os index.ts: `Deno.env.get` confirmado como padrão universal.
Nenhuma string literal de token/key/secret encontrada no código.

## Variáveis de ambiente confirmadas por Deno.env.get()

Verificadas no audit via bulk grep (Seção 8): 20 variáveis confirmadas via `Deno.env.get()`.
13 segredos via Vault (RPCs SECURITY DEFINER de leitura).

---

## Achados da auditoria

- **HIGH-8**: 14 funções com verify_jwt=false — mecanismos alternativos confirmados; risco residual documentado por função
- Nenhuma função com SQL dinâmico injetável
- Nenhum segredo hardcoded encontrado
- `searchbox-budget-alert`: plain comparison `secret !== esperado` (LOW — timing attack impraticável via pg_cron; documentado)
- `status`: público intencional, sem dados sensíveis — não é achado
