# IA-007 — Reaproveitamento da infraestrutura existente

**Etapa do plano:** `IA-007` `[V]` *Reaproveitar infraestrutura existente* — "Inspecionar fila de
mensagens, leases, outbox, autenticação e componentes existentes antes de propor novas estruturas;
integrar planos paralelos de TalkX e Multiplix."

**Aceite:** decisões de reutilização documentadas; **nenhuma fila concorrente ou tabela duplicada
criada sem justificativa**.

| Item | Valor |
|---|---|
| Repositório lido (somente leitura) | `/home/joaquim_ataides/projetos/Zapp_Web_V2` |
| Referência congelada do Bloco 01 | `0ab84095d34548124d0feefb6cdec0dedda7c5fe` (ver `IA-001`) |
| Banco de produção | **não consultado** (nenhuma query; só código, migrations e docs) |
| Comandos proibidos | nenhum `git`, `supabase` CLI ou chamada de rede foi executado |
| Secrets | nenhum valor lido ou impresso — só nomes de variáveis |

> Documento complementar: `docs/ia/inventario-functions-ia.md` (inventário por função de IA, mesma
> sessão). Aqui o foco é **infraestrutura compartilhada e decisão de reuso**.

---

## 1. O que já existe (verificado no código)

### 1.1 Filas, outbox, leases, retry e dead-letter

Existem **quatro** implementações maduras do mesmo padrão (claim → lease → complete/fail →
backoff → dead-letter). Elas são o ativo reaproveitável; o padrão é idêntico, as tabelas não.

| Estrutura | Tabela | Claim / lease | Evidência |
|---|---|---|---|
| Outbox de sincronização com o CRM externo | `crm_sync_outbox` | `lease_token uuid` + constraint `crm_sync_outbox_lease_state`; `claim_crm_sync_outbox(p_worker, p_limit)` com `FOR UPDATE SKIP LOCKED`; completo/falha exigem o `lease_token` (fencing) | tabela `supabase/migrations/20260908180000_crm_contact_links_and_sync_outbox.sql:32`; hardening `supabase/migrations/20260908220000_harden_crm_sync_outbox_leases.sql:5-6,35-39,100,136,166,188` |
| Entrega de mensagem de saída (WhatsApp) | `messages` (colunas de claim) | `delivery_claim_token`, `delivery_claimed_at`, `delivery_claim_expires_at`, `delivery_claimed_by`, `delivery_attempt_count`, `delivery_last_claim_token`; `claim_outbound_message(p_message_id, p_agent_id, p_worker, p_lease_seconds DEFAULT 90)` | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql:13-25` (colunas/constraint), `:162` enqueue, `:266` claim, `:360` complete, `:419` fail |
| Campanha TalkX | `talkx_recipients` | mesmas 6 colunas de claim; `claim_talkx_recipient(p_campaign_id, p_recipient_id, p_worker, p_lease_seconds DEFAULT 90)` — valida `p_worker` por regex e `p_lease_seconds` entre 30 e 300; exige `service_role` | `supabase/migrations/20260911130000_add_talkx_recipient_delivery_leases.sql:6-13,44` |
| Campanha Multiplix | `multiplix_recipients` | `claim_multiplix_recipient` + `multiplix_dispatches`; cron dispara o worker | `supabase/migrations/20260926180000_multiplix_send_engine.sql`; cron em `supabase/migrations/20260927320000_multiplix_cron_scheduler.sql:81-84` |

Detalhes do contrato que se repetem nas quatro e podem ser copiados sem redesenho:

- **Idempotência de entrada:** `crm_sync_outbox.idempotency_key text NOT NULL UNIQUE`
  (`20260908180000:36`); `messages` → `ux_messages_contact_client_message_id`
  (`20260909220000:43-45`) e `enqueue_outbound_message` recebendo `p_client_message_id`.
- **Backoff exponencial com teto:** `fail_crm_sync_outbox` →
  `LEAST(3600, power(2, LEAST(attempt_count, 10)) * 30)` segundos
  (`20260908220000:200`). **Sem jitter** (a IA-042 pede "variação aleatória").
- **Dead-letter:** status `dead_letter` em `crm_sync_outbox` (`20260908180000:40`) e tabela
  separada `webhook_failures` para webhooks que explodem no parse
  (`supabase/migrations/20260830153000_webhook_failures_dead_letter.sql:2`, com
  `payload_truncated`, `payload_sha256`, `retry_count`, `resolved`).
- **Stale-lease reclaim:** o candidato inclui `status = 'processing' AND locked_at < now() - interval '5 minutes'`
  (`20260908220000:119`) e a linha expirada que já esgotou tentativas vira `dead_letter` com
  `last_error_code = 'LEASE_EXPIRED_MAX_ATTEMPTS'` (`:108-112`).
- **Saúde da fila como RPC:** `get_crm_sync_health()` devolve `pending/processing/failed/dead_letter/
  succeeded_24h/oldest_ready_age_seconds` (`20260908220000:219-263`).
- **ACL:** as quatro famílias revogam `PUBLIC, anon, authenticated` e concedem só a `service_role`
  (ex.: `20260908180000:191-198`, `20260909220000:262,357,416,475`, `20260911130000:44+`).

**O que NÃO existe:**

- **Nenhuma tabela de fila genérica de jobs.** Não há `jobs`, `ai_jobs`, `task_queue` ou equivalente.
  As quatro filas acima são **de domínio** (CRM, mensagem, TalkX, Multiplix).
- **Nenhum heartbeat.** A lease é janela fixa e a reocupação se dá por expiração (`locked_at < now() - 5min`
  ou `delivery_claim_expires_at < now()`). Não existe função de renovação/`heartbeat` em nenhuma das
  quatro — a IA-045 pede heartbeat explicitamente.
- **Nenhum sweeper dedicado para IA.** As funções de varredura existentes são
  `expire_stale_agent_presence()` (presença de agente) e `cleanup_expired_challenges()` (desafios
  WebAuthn); `grep` por `sweep|stuck|reap` em `supabase/migrations/` não devolve varredor de fila.
  No Multiplix o sweeper está **planejado e ainda não implementado** (`docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md:31`, item `F11`).

### 1.2 Controle de consumo e rate limit

| Mecanismo | Onde | Escopo real |
|---|---|---|
| Rate limit **em memória**, por isolate | `supabase/functions/_shared/validation.ts:181-210` (`checkRateLimit`), `status` documentado no próprio arquivo: *"per-isolate, resets on cold start"* | Não distribui entre isolates — é este o achado que a IA-043 corrige |
| Rate limit **persistente** (fonte de verdade) | tabela `public.edge_rate_limits` (`supabase/migrations/20260905020000_edge_rate_limits.sql:6`) + RPC atômico `consume_rate_limit(p_key, p_max, p_window_seconds)` (`:19`) | `service_role` apenas; upsert com virada de janela no próprio `INSERT ... ON CONFLICT` |
| Wrapper que combina os dois | `enforceRateLimit(key, max, windowMs)` em `_shared/validation.ts:233-259` — tenta o RPC e faz **fail-open** com `console.warn` se o RPC falhar | Padrão já pronto para IA-043 |
| Guard de IA | `_shared/ai-guards.ts:24` (`enforceAiGuards`) | Passo 1: `checkRateLimit` **em memória** (`:30`, default 30/min). Passo 2: quota diária por `count()` em `ai_usage_logs` (`:43-48`, default 500/dia, "fail open" em erro) |
| Rate limit de webhook | `public.webhook_rate_limits` (`supabase/migrations/20260319134046_ca0c2740-67fa-495d-be04-62114b42b479.sql:31`) | específico de webhook |
| Configuração/logs administrativos | `public.rate_limit_configs` (`supabase/migrations/20251231115910_4da9c2d9-f6a8-4dc8-90ad-6efa0e1c9de0.sql:6`), `public.rate_limit_logs` (`:19`), `public.blocked_ips` (`:27`) | painel de segurança (`src/components/security/RateLimitConfigPanel.tsx`, `src/hooks/system/useRateLimitLogs.ts`, `cleanup-rate-limit-logs`) — **não** é lido pelas Edge Functions |
| Alerta de estouro | Edge `send-rate-limit-alert` (exige header `X-Internal-Secret`) | já existe canal de alerta |

**Ledger e custo de IA:**

| Item | Onde | Estado |
|---|---|---|
| Registro de uso | tabela `public.ai_usage_logs` (`supabase/migrations/20260406201803_ec21c5e7-dbc5-460d-9404-1483e5c60568.sql:3`) — `user_id`, `profile_id`, `function_name`, `model`, `input_tokens`, `output_tokens`, `total_tokens` (gerado), `duration_ms`, `status`, `error_message`, `metadata jsonb` | existe; **não tem** `provider`, `modality`, `purpose`, `versions`, `attempt_id` |
| Escrita | `logAiUsage(entry)` em `_shared/ai-usage.ts:71-98` — *fire-and-forget*, engole erro | existe |
| Escrita por wrapper | `callAiWithTracking()` em `_shared/ai-usage.ts:101-171` — fetch para `https://ai.gateway.lovable.dev/v1/chat/completions` (`:115`) com `AbortController` de 30 s (`:109-112`) | existe, mas **endpoint fixo** (achado da IA-032) |
| Retenção/atribuição | `user_id` e `query_telemetry.user_id` reversionados para `ON DELETE SET NULL` para não perder histórico de cobrança (`supabase/migrations/20260926420000_ai_usage_query_telemetry_set_null.sql`) | existe |
| **Tabela de preços versionada** | — | **não existe** (IA-055 exige criar) |
| Agregação de período no servidor | `src/hooks/analytics/useAIUsageDashboard.ts:68-70` faz `select('*').order(...).limit(1000)` **no cliente** | é o achado da IA-056 |

### 1.3 Ledger de execuções de IA e telemetria

| Estrutura | Tabela | Conteúdo | Evidência |
|---|---|---|---|
| Uso de IA (custos) | `ai_usage_logs` | ver 1.2 | `20260406201803:3` |
| Telemetria de consultas | `public.query_telemetry` | `operation`, `table_name`, `rpc_name`, `duration_ms`, `record_count`, `severity`, `error_message`, `user_id` | `supabase/migrations/20260323120607_76fb16b0-c83c-4e29-9152-fdf9568e159b.sql:2-16` |
| Auditoria de ações humanas | `public.audit_logs` | `action`, `entity_type`, `entity_id`, `details jsonb`, `ip_address`, `user_agent` | `supabase/migrations/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql:56-66` |
| Execução de chatbot | `public.chatbot_executions` | `flow_id`, `contact_id`, `current_node_id`, `status ('running','completed','failed','paused','cancelled')`, `variables`, `started_at`, `completed_at`, `error_message` | `supabase/migrations/20260315151618_8e3fca18-74ac-4877-84f4-d2a02cfaf24f.sql:60-71` |
| Auditoria de webhook que falhou | `public.webhook_failures` | ver 1.1 | `20260830153000:2` |
| Logs estruturados das edges | classe `Logger` em `_shared/validation.ts:25-66` | nível, contexto, `log.done(status, meta)` | — |

**Lacuna verificada:** `grep` por `request_id|correlation_id|attempt_id|job_id` nas tabelas de
telemetria não encontra coluna dedicada. A correlação ponta a ponta da IA-051 não tem campo hoje
(existe apenas `metadata jsonb` em `ai_usage_logs`, livre).

### 1.4 Flags, feature toggles e desligamento

| Mecanismo | Onde | Cobre o servidor? |
|---|---|---|
| Tabela `public.feature_flags` (`key`, `enabled`, `description`, `updated_at`, `updated_by`) + RLS admin-only de escrita | `supabase/migrations/20260905060000_feature_flags.sql:3-23`; FK `updated_by → auth.users` em `20260905070000_ingest_lock_feature_flags_audit_rate_limit_cleanup.sql:100` | **NÃO** — só o cliente lê (`src/hooks/system/useFeatureFlag.ts:16,37`, cache de 5 min, `fallback = false`). Prova e desenho completo estão na `IA-009` |
| Chave já semeada como kill switch | `('crm.integration', false, 'Kill switch runtime da integracao com o CRM externo')` em `supabase/migrations/20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql:7-9` | **modelo pronto** de como desligar por capacidade |
| Flags de código no cliente | `.env.example:70-75` (`VITE_ENABLE_ANALYTICS`, `VITE_ENABLE_DEBUG`, `VITE_ENABLE_GAMIFICATION`, `VITE_ENABLE_GMAIL_INTEGRATION`) e `:14` `VITE_CRM_INTEGRATION_ENABLED` | build-time, não é kill switch |
| Provedor ligado/desligado | `public.ai_providers.is_active` / `is_default` / `use_for[]` (`supabase/migrations/20260408194438_1ad57139-c089-4711-86e1-71d8f461e02d.sql:12-31`), com trigger `ensure_single_default_ai_provider` | **SIM**, se a função checar antes de chamar — este é o kill switch por provedor que a IA-039 pode usar |
| Fluxo de bot ligado/desligado | `public.chatbot_flows.is_active` (`20260315151618:45`) | **SIM**, se a seleção validar — e a IA-104 aponta que a seleção é global |
| Kill switch de endpoint | `public-api` respondendo `410` + comentário em `supabase/config.toml:23-27` | SIM, para um endpoint |
| `verify_jwt` por função | `supabase/config.toml:8-57`; resumo em `supabase/deployment-manifest.json` (`function_count: 69`, `verify_jwt_true: 59`, `verify_jwt_false: 10`) | SIM, mas exige deploy (que é automático no merge na `main`) |

### 1.5 Autenticação/CORS/validação reutilizável (`supabase/functions/_shared/`)

| Helper | Assinatura/papel | Arquivo:linha |
|---|---|---|
| `requireAuth(req)` | valida o JWT de verdade via `client.auth.getUser()`; devolve `401` em Response | `validation.ts:281-302` |
| `createAuthedClient(req)` | client PostgREST com o JWT do chamador (a RLS filtra por `auth.uid()`) | `validation.ts:304-313` |
| `getCorsHeaders(req)` / `corsHeaders` / `handleCors(req)` | allowlist de origens exatas + padrões + preflight | `validation.ts:67-119,158-164` |
| `errorResponse` / `internalErrorResponse` / `jsonResponse` | respostas padronizadas com headers de segurança | `validation.ts:122-156` |
| `sanitizeString` / `isValidUUID` | saneamento e checagem de UUID | `validation.ts:166-179` |
| `getClientIP(req)` | IP a partir de `x-forwarded-for` (último hop) / `x-real-ip` | `validation.ts:262-271` |
| `requireEnv(name)` | exige env var ou lança | `validation.ts:273-279` |
| `Logger` | log estruturado com nível e contexto | `validation.ts:25-66` |
| `verifyHmacSignature(...)`, `timingSafeEqual`, `extractSignatureFromHeaders`, `WebhookSecurityService`, `createWebhookValidator(secret, strictMode)`, `logWebhookAuthShadow`, `logElevenLabsAuthShadow`, `logGmailOidcAuthShadow` | verificação HMAC de webhook + **modo shadow** (observação sem bloquear) | `hmac-validation.ts:17,63,84,117,246,280,325,397` |
| `isBlockedIpAddress`, `parseApprovedStorageUrl` | anti-SSRF e allowlist de Storage | `ssrf.ts:29,72` |
| `getSecureEgressConfig`, `fetchPreviewViaSecureEgress` | egress por proxy seguro com allowlist | `secure-egress.ts:95,107` |
| `getContractVersion`, `deprecationHeaders`, `parseVersioned` | contratos versionados v1/v2 | `contracts.ts:10-40` |
| `schemas.ts` | schemas Zod por função (`AiSuggestReplySchema`, `AiEnhanceMessageSchema`, `AiConversationAnalysisSchema`, `AiAutoTagSchema`, `AiChurnAnalysisSchema`, `AiClassifyTicketsSchema`, `ElevenLabsTTSSchema`, …) + `parseBody`/`validationErrorResponse` | `schemas.ts:10-63+` |
| `notification-events.ts` | normalização de eventos de chamada/sentimento e builders de notificação | `notification-events.ts:17,22,28,44,70,84` |

**Estado de proteção das entradas de IA:** as funções `ai-*` estão todas com `verify_jwt = true` no
manifesto e chamam `requireAuth` + `enforceAiGuards` em código (ex.: `ai-auto-tag/index.ts:14,17`;
`ai-conversation-summary/index.ts:10,13`; `chatbot-l1/index.ts:26,29`;
`ai-suggest-reply/index.ts:10,13`; `ai-classify-tickets/index.ts:27`).

**Exceções declaradas (`verify_jwt = false`), 10 no manifesto, confirmadas em `supabase/config.toml:8-57`:**
`evolution-webhook`, `whatsapp-webhook`, `gmail-webhook`, `gmail-cron-sync`, `elevenlabs-webhook`,
`public-api` (410), `auth-login`, `crm-integration`, `csp-report`, `talkx-link`.
O `elevenlabs-webhook` **só importa o logger de shadow** (`logElevenLabsAuthShadow`) e não verifica
assinatura de forma bloqueante — é o achado da IA-013.

### 1.6 Módulos de chat/streaming

| Item | Onde |
|---|---|
| Único endpoint de IA com streaming SSE | `supabase/functions/ai-proxy/index.ts:204-207` (`stream` no schema `:22`, roteamento por provedor `:133-181`, resposta como `text/event-stream`) |
| TTS com streaming | `elevenlabs-tts-stream` |
| Consumidores do `ai-proxy` no front | `src/components/admin/SupervisorCopilot.tsx:54`; `src/components/settings/ai-providers/useAIProviders.ts:76`; `src/hooks/ui/useUniversityHelp.ts:104`; `src/hooks/inbox/useObjectionDetector.ts:70,130` |
| Painéis de chat/IA reutilizáveis | `src/components/inbox/chat/ChatToolPanels.tsx`, `ChatInputToolbars.tsx`, `ChatPanel.tsx`, `src/components/inbox/AIToolsPopover.tsx`, `src/components/inbox/ai-tools/AIResponseCard.tsx` |
| Painel de custo/uso | `src/hooks/analytics/useAIUsageDashboard.ts`, `src/hooks/analytics/useActiveAIProvider.ts`, `src/components/settings/ai-providers/AIProviderHealthPanel.tsx` (`:33` filtra `function_name = 'ai-proxy'`) |
| **Lacuna:** custo de streaming | o caminho `stream` do `ai-proxy` **não** chama `logAiUsage` (o consumo só é registrado no caminho não-stream) — é exatamente o achado da IA-053 |

### 1.7 Crons agendados (declarados em migrations)

> O estado **real** do `cron.job` no pg_cron do banco canônico **não foi consultado** nesta etapa
> (proibido acessar produção). Abaixo, o que está versionado no repositório.

| Job | Agenda | Ação | Arquivo:linha |
|---|---|---|---|
| `avatars-refresh` | `0 * * * *` | `net.http_post` → `batch-fetch-avatars` | `20260828200100_cron_avatars_refresh_hourly.sql:7-16` |
| `gmail-incremental-sync` | `*/5 * * * *` | `net.http_post` → `gmail-cron-sync` | `20260829110000_gmail_incremental_sync_cron.sql:14-19` |
| `connection-health-check` | `*/5 * * * *` | `net.http_post` → `connection-health-check` | `20260924100800_schedule_connection_health_check_cron.sql:11-16` |
| `cleanup-edge-rate-limits` | `*/15 * * * *` | `DELETE FROM edge_rate_limits WHERE updated_at < now() - interval '1 hour'` (a versão anterior, `15 4 * * *`, foi substituída) | `20260905070000_ingest_lock_feature_flags_audit_rate_limit_cleanup.sql:104` (antiga: `20260905020000:50`) |
| `expire-stale-agent-presence` | `*/2 * * * *` | `SELECT public.expire_stale_agent_presence()` | `20260925100542_agent_presence_server_ttl.sql:20-23` |
| `notify-due-reminders` | `* * * * *` | `SELECT public.notify_due_reminders()` | `20260925170100_add_notify_due_reminders.sql:63-66` |
| `talkx-scheduler-1min` | `* * * * *` | `net.http_post` com URL lida de `vault.decrypted_secrets` (nome `talkx_scheduler_url`) | `20260909000000_talkx_scheduler_cron.sql:13-23` |
| `multiplix-send-trigger` | `*/2 * * * *` | `SELECT public.trigger_pending_multiplix_dispatches()` (que faz `net.http_post` para `multiplix-send`) | `20260927320000_multiplix_cron_scheduler.sql:62-64,81-84` |
| `purge-processed-webhook-events` | `30 3 * * *` | `SELECT public.fn_purge_processed_webhook_events(30, 5000)` | `supabase/migrations/_foreign/20260612141500_purge_processed_webhook_events_cron.sql:88-91` |

Dois padrões a copiar: (a) cron **puro-SQL** chamando função do banco quando a varredura é no banco
(`expire-stale-agent-presence`, `notify-due-reminders`); (b) cron chamando **Edge Function** via
`net.http_post` quando o trabalho precisa de runtime externo (`connection-health-check`,
`gmail-cron-sync`, `avatars-refresh`). O `multiplix-send-trigger` é a referência direta de worker de
fila acionado por cron.

Fora de `pg_cron`, existe o workflow `.github/workflows/crm-sync-worker.yml`, que drena o
`crm_sync_outbox` — porém **desativado por padrão** (`schedule` comentado; gate em
`vars.CRM_SYNC_WORKER_ENABLED`, `:1-17`).

### 1.8 Planos paralelos — o que já propõem

| Plano | Estruturas/ decisões já propostas | Consequência para o plano de IA |
|---|---|---|
| **TalkX** — `docs/talkx/PLANO_IMPLEMENTACAO_TALKX_100.md`, `ARQUITETURA.md`, `OPERACAO.md` | claim com lease 90 s, snapshot antes do POST, `outcome_unknown` em timeout, backoff 30 s/2 min/10 min com dead-letter, supressão revalidada antes do POST, pausa por conexão, janela de horário (`docs/multiplix/CANAL.md:24-52` resume o mapa) | **é a implementação de referência** que a fila da IA deve seguir; o desenho de mensageria já foi extraído para `_shared/talkx-*` (`talkx-reply.ts`, `talkx-window.ts`, `talkx-delivery-connection.ts`) |
| **Multiplix** — `docs/multiplix/PLANO_IMPLEMENTACAO_MULTIPLIX_200_ETAPAS_2026-09-26.md`, `PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md`, `CANAL.md` | `E031/F32` nova tabela `multiplix_delivery_items` (item × bloco: `status`, `attempt_count`, `next_attempt_at`, `lease_token`, `lease_until`, `worker_id`, `external_id`, `idempotency_key UNIQUE`, `error_class`), com RPCs `*_multiplix_item*` espelhando as `*_multiplix_recipient*`; `F11` sweeper `sweep_multiplix_stuck_recipients()`; `F55` worker em lote com **heartbeat a cada 30 s**; `Fase 3` = **"extrair para `_shared/messaging/`"** (o próprio plano diz que "Fase 5 é parametrização, não construção", `PLANO_IMPLEMENTACAO...:450`) | **não criar uma quinta fila para IA.** O `_shared/messaging/` do Multiplix é o lugar natural para o núcleo compartilhado (claim/lease/backoff/dead-letter) que a IA-045 reusa |
| **Telefonia** — `docs/telefonia/CAPACIDADES.md`, `CONTRATO.md` | matriz de capacidades "o que existe × o que não foi comprovado"; gravação, transcrição e resumo por IA declarados **fora de escopo** por ausência de fonte | a IA de voz/multimodal não deve assumir gravação/duração que não existem; a matriz é o precedente de rótulo honesto de capacidade |
| **Busca/Mapa** — `docs/mapa/PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md` | `searchbox_session_budget_rpc` (`supabase/migrations/20260926120500_searchbox_session_budget_rpc.sql`) | precedente de **orçamento por sessão no servidor** — análogo ao que a IA-044 pede |
| **Plano de banco único** — `docs/audits/PLANO_BANCO_UNICO_200_ETAPAS_2026-09-24.md` | governança de migrations/ledger | não duplicar tabelas entre planos (regra do próprio plano de IA, seção "Prioridade e dependências") |

Regra explícita do plano de IA que este documento operacionaliza:
> "Não duplicar filas, tabelas ou módulos já cobertos por outros planos."
> — `docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md:27`

---

## 2. Capacidade necessária → estrutura existente → veredito

Legenda do veredito: **REUSAR** (usar como está) · **ESTENDER** (mesma estrutura/arquivo, evoluir) ·
**CRIAR** (não há nada equivalente — justificativa obrigatória).

| # | Capacidade que o plano de IA precisa | Estrutura existente (arquivo:linha / tabela) | Veredito | Justificativa |
|---|---|---|---|---|
| 1 | Fila de jobs para operações longas (**IA-045**) | 4 filas de domínio: `crm_sync_outbox` (`20260908180000:32`), `messages` claim (`20260909220000:266`), `talkx_recipients` (`20260911130000:44`), `multiplix_recipients` (`20260926180000`) | **REUSAR o padrão; CRIAR tabela só se o núcleo compartilhado não servir** | Não existe fila genérica de jobs. Criar uma 5ª fila só para IA **violaria o aceite**. Caminho correto: extrair o núcleo para `_shared/messaging/` (já previsto pela Fase 3 do Multiplix) e criar **uma** tabela `ai_jobs` **somente** se ficar demonstrado que nenhuma das quatro comporta o item de IA — registrando a justificativa na PR |
| 2 | Lease com fencing por token (**IA-045**, IA-047) | `crm_sync_outbox.lease_token` + `crm_sync_outbox_lease_state` (`20260908220000:5,35-39`); `messages.delivery_claim_token` (`20260909220000:13`); `talkx_recipients` (`20260911130000:6-13`) | **REUSAR** | Contrato completo e endurecido: `complete`/`fail` exigem o token e lançam `crm_sync_outbox_lease_lost` se a lease foi perdida (`20260908220000:180-183,203-207`). Copiar, não redesenhar |
| 3 | Heartbeat / renovação de lease (**IA-045**) | **não existe** — nem no outbox nem nas filas de mensagem/TalkX | **CRIAR (extensão do núcleo)** | A IA-045 exige heartbeat explicitamente e hoje a única proteção é expiração por janela fixa. Sem heartbeat, item longo expira e é reocupado enquanto ainda roda. Criar `heartbeat_*` no núcleo compartilhado (mesmo padrão de `multiplix F55`, "heartbeat a cada 30 s") |
| 4 | Retry com backoff + jitter (**IA-042**) | backoff exponencial com teto de 1 h (`20260908220000:200`); `webhook_failures.retry_count` (`20260830153000:2`); `withRetry` em `_shared/ai-providers.ts:87` | **ESTENDER** | Backoff existe; **jitter não existe** em nenhum ponto. Acrescentar jitter ao núcleo, não criar mecanismo paralelo |
| 5 | Classificação de falha permanente × transitória (**IA-042**) | `last_error_code text` + `CASE WHEN attempt_count >= max_attempts THEN 'dead_letter'` (`20260908180000:46,180`); `fail_outbound_message(..., p_retryable boolean)` (`20260909220000:419`) | **ESTENDER** | O conceito já existe (`p_retryable` em mensagem, `error_class` planejado no Multiplix `F32`); falta catálogo de códigos. Adotar o `error_class` já desenhado |
| 6 | Dead-letter consultável (**IA-042/045**) | status `dead_letter` + índices (`20260908220000:48-54`); tabela `webhook_failures` com `resolved`/`resolved_at` (`20260830153000:2-15`); `get_crm_sync_health()` (`20260908220000:219`) | **REUSAR** | Padrão duplo já validado: status na própria fila + tabela de inspeção para payload que não parseia |
| 7 | Rate limit compartilhado entre workers (**IA-043**) | `edge_rate_limits` + `consume_rate_limit` (`20260905020000:6,19`); `enforceRateLimit` (`validation.ts:233`) | **REUSAR** | É literalmente a correção do achado: comentário do próprio arquivo diz que o `checkRateLimit` em memória "vira só pré-filtro". Basta trocar `checkRateLimit` por `enforceRateLimit` em `ai-guards.ts:30` |
| 8 | Reserva de orçamento atômica antes da chamada (**IA-044**) | quota por `count()` em `ai_usage_logs` (`ai-guards.ts:43-48`); precedente de orçamento por sessão: `searchbox_session_budget_rpc` (`20260926120500`) | **ESTENDER** | O `count()` é leitura-seguida-de-decisão, não reserva atômica — não há `reserved`/`settled`. Criar RPC de reserva **no molde de `consume_rate_limit`** (upsert atômico com janela), sem tabela nova de contabilidade paralela |
| 9 | Ledger de uso de IA (tokens, modelo, duração, status) | `ai_usage_logs` (`20260406201803:3`) + `logAiUsage` (`ai-usage.ts:71`) | **ESTENDER** | A tabela e o writer existem e já sobrevivem ao delete de usuário. Faltam colunas da IA-052 (`provider`, `modality`, `purpose`, versões) e o agrupamento por tentativa da IA-054 — acrescentar colunas/relação, não criar segundo ledger |
| 10 | Catálogo de provedores/modelos e default por finalidade (**IA-031/034/035**) | `ai_providers` + enum `ai_provider_type` + `use_for[]` + trigger de default único (`20260408194438:3,12-31`) | **REUSAR** | Já tem `is_active`, `is_default`, `use_for` e garantia de um único default. É o substrato do roteamento central da IA-031 e do controle de modelo no servidor da IA-035 |
| 11 | Tabela de preços versionada (**IA-055**) | **não existe** | **CRIAR** | Nada no repositório associa preço/moeda/unidade/vigência a modelo. Justificativa: a IA-056 precisa de relatório histórico com a tarifa **vigente na época**, o que exige vigência; não há onde pendurar isso. Criar tabela nova é a única saída — e ela **não** é fila nem duplica ledger |
| 12 | Agregação de período no servidor (**IA-056**) | `useAIUsageDashboard.ts:68-70` (`limit(1000)` no cliente); precedente de RPC de agregação: `dashboard_leaderboard_rpc` (`20260926112500`) | **ESTENDER** | O dashboard existe e é reutilizável na UI; a agregação precisa virar RPC. Nada novo de tabela |
| 13 | Correlação requestId/jobId/attemptId (**IA-051**) | `ai_usage_logs.metadata jsonb` (`20260406201803:15`); `query_telemetry` (`20260323120607:2`) com `user_id`/`duration_ms` mas sem id de correlação | **ESTENDER** | Não há coluna de correlação em nenhuma tabela. `metadata jsonb` permite começar sem migration, mas para consulta/indexação a IA-051 deve promover colunas explícitas — extensão do ledger existente |
| 14 | Alertar consumo anômalo (**IA-058**) | `send-rate-limit-alert` (com `X-Internal-Secret`); `sentiment-alert`; `get_crm_sync_health()` como fonte de métrica | **REUSAR** | Canal de alerta e precedente de RPC de saúde já existem; falta só a regra/threshold por capacidade |
| 15 | Flags por capacidade/bot/provedor e desligamento imediato (**IA-009**) | `feature_flags` (`20260905060000:3`); chave modelo `crm.integration` (`20260909120000:7`); `useFeatureFlag` (`useFeatureFlag.ts:37`) | **REUSAR (tabela) + ESTENDER (leitura no servidor)** | A tabela é a estrutura correta e já tem escrita admin-only e auditoria de autor. A lacuna é que nenhuma Edge Function lê flag (ver `IA-009`). Não criar sistema de flags paralelo |
| 16 | Desligar **um** provedor sem matar a capacidade (**IA-039/050**)| `ai_providers.is_active` + `use_for` (`20260408194438:12-31`) | **REUSAR** | Já é exatamente "desligar o destino, manter a capacidade viva em outro" |
| 17 | Circuit breaker / degradação honesta (**IA-050**) | `AIProviderHealthPanel.tsx:33` (saúde medida a partir de `ai_usage_logs`) | **ESTENDER** | A base de dados para medir falha por provedor é o ledger existente; não há tabela de estado de circuito. Estender o ledger/flag, não criar subsistema |
| 18 | Autenticar toda entrada de IA (**IA-011**, IA-105) | `requireAuth` (`validation.ts:281`), `createAuthedClient` (`:304`), `verify_jwt` no `config.toml:8-57` | **REUSAR** | As `ai-*` já usam os dois e estão com `verify_jwt = true`. O trabalho da IA-011 é aplicar o **mesmo** helper às entradas que hoje não o usam (ex.: `elevenlabs-webhook`), não escrever autenticação nova |
| 19 | Assinatura de webhook obrigatória (**IA-013**) | `verifyHmacSignature` (`hmac-validation.ts:17`), `createWebhookValidator(secret, strictMode)` (`:246`), `logElevenLabsAuthShadow` (`:325`) | **REUSAR** | O verificador está pronto e o `elevenlabs-webhook` **já importa o shadow logger** — a correção é subir de shadow para `strictMode`, sem código novo de criptografia |
| 20 | Mitigar SSRF / restringir rede (**IA-016**) | `isBlockedIpAddress`, `parseApprovedStorageUrl` (`ssrf.ts:29,72`); `getSecureEgressConfig`, `fetchPreviewViaSecureEgress` (`secure-egress.ts:95,107`) | **REUSAR** | Helpers e proxy de egress com allowlist já existem |
| 21 | Validar entrada e saída do modelo (**IA-025**) | `_shared/schemas.ts` (Zod por função) + `parseBody`/`validationErrorResponse`; `_shared/contracts.ts` v1/v2 | **REUSAR** | Esquema por contrato já é o padrão do projeto; a IA-025 acrescenta o schema de **saída**, no mesmo arquivo |
| 22 | Idempotência de efeito (**IA-047**) | `crm_sync_outbox.idempotency_key UNIQUE` (`20260908180000:36`); `ux_messages_contact_client_message_id` (`20260909220000:43-45`); `ux_conversation_closures_contact_request` (`:51-54`); memo de `clientMessageId` em `src/services/outbound-message.service.ts` | **REUSAR** | Padrão de chave estável + constraint já é prática consolidada em três domínios |
| 23 | Vocabulário único de estados (**IA-046**) | `crm_sync_outbox.status IN ('pending','processing','succeeded','failed','dead_letter')` (`20260908180000:39-40`); `fail_outbound_message(..., p_retryable)`; `outcome_unknown` em TalkX/Multiplix (`20260911180000_quarantine_talkx_unknown_provider_outcomes.sql`, `20260926180000`) e `multiplix_item_status` com `ambiguo` | **ESTENDER** | Não há enum único; existem **quatro** vocabulários. O plano precisa **mapear** para um canônico (adotar a nomenclatura do outbox + `outcome_unknown`, que já é o termo usado nas filas de mensagem) em vez de inventar um terceiro |
| 24 | Prazos e cancelamento ponta a ponta (**IA-041**) | `callAiWithTracking` com `AbortController`/timeout de 30 s (`ai-usage.ts:109-112,166`); `withRetry` (`ai-providers.ts:87`) | **ESTENDER** | Timeout existe e é único (30 s fixo) para todas as capacidades; a IA-041 pede timeout **por capacidade** e propagação do cancelamento do cliente — evoluir o wrapper, não criar cliente novo |
| 25 | Contabilizar streaming e interrupções (**IA-053**) | `ai-proxy/index.ts:204-207` (único ponto de streaming) | **ESTENDER** | Canal único e já centralizado; falta registrar uso no ramo `stream`. Estender o `ai-proxy` + `logAiUsage`, sem outro gateway |
| 26 | Eliminar dependência fixa do gateway (**IA-032**) | endpoint hardcoded em `_shared/ai-providers.ts:21`, `_shared/ai-usage.ts:115`, `voice-agent/index.ts:108`, `classify-audio-meme/index.ts:38`, `classify-emoji/index.ts:45`, `classify-sticker/index.ts:33` | **ESTENDER** | O problema é literalmente chamadas fixas **em paralelo** ao roteamento configurável. O destino deve ser `ai_proxy`/`ai_providers`, que já existem |
| 27 | Etiquetas/categorias governadas (**IA-101/028**) | `tags`, `contact_tags`, `ai_conversation_tags` (`20260317214556_...:63`); aplicação em `ai-auto-tag/index.ts:145-160` (delete+insert) | **ESTENDER** | As tabelas existem; a troca atômica e o catálogo protegido da IA-028/101 evoluem essas tabelas. Não criar catálogo paralelo |
| 28 | Roteamento por fila com política (**IA-102/103**) | `queues`/`queue_members` (`20251220130243_14f0f8fe...:2,15`), `queue_positions` (`20260317214556_3c66fa42...:51`), `queue_skill_requirements` (`20260317212204_a83746c2...:22`), `whatsapp_connection_queues` (`20260315193759:3`), `contacts.queue_id`/`assigned_to` (índice `20260315163251_4cfe886d...:52`) | **REUSAR** | Toda a malha fila↔membro↔conexão já existe e é a que a IA-102 deve validar antes de sugerir |
| 29 | Bot isolado por conexão (**IA-104**) | `chatbot_flows.whatsapp_connection_id` (`20260315151618:51`) + `is_active` (`:45`) | **ESTENDER** | A coluna existe, mas a seleção hoje é global (achado da IA-104). Corrigir a **seleção**, não criar tabela de fluxo nova |
| 30 | Posse de conversa e pausa da automação (**IA-107/108**) | `contacts.assigned_to` (`20260315163251:52`), `contacts.queue_id`, `chatbot_executions.status` (`20260315151618:65`, inclui `paused`) | **ESTENDER** | A posse e o estado de execução já estão modelados; falta o predicado "atendente assumiu → bot para", que usa essas colunas. Não há necessidade de tabela de ownership |
| 31 | Persistência de registro crítico (**IA-049**) | `logAiUsage` é *fire-and-forget* (`ai-usage.ts:71-98`, engole erro); outbox durável existe como padrão | **ESTENDER** | O padrão "grava em tabela durável e drena depois" já é o outbox. A IA-049 deve aplicar isso ao ledger de IA, não confiar em `waitUntil` |
| 32 | Proteção contra concorrência por contato/conversa (**IA-102/109**) | `pg_advisory_xact_lock(hashtext('ingest_inbound_message:' \|\| v_canonical))` dentro de `public.ingest_inbound_message` (`supabase/migrations/20260905070000_ingest_lock_feature_flags_audit_rate_limit_cleanup.sql:33`, função em `:10`) | **REUSAR** | O projeto já usa advisory lock transacional por chave canônica como precedente — copiar para serializar bot × contato |

---

## 3. Estruturas duplicadas ou legadas que NÃO devem ser usadas

| Estrutura | Por que não usar |
|---|---|
| `public.rate_limit_configs` / `rate_limit_logs` / `blocked_ips` (`20251231115910:6,19,27`) como rate limit de IA | É o painel de segurança (IP/endpoint), **não** é consultado por nenhuma Edge Function (`grep` só encontra o painel e o `cleanup-rate-limit-logs`). A fonte de verdade para IA é `edge_rate_limits` + `consume_rate_limit` |
| `checkRateLimit` em memória (`validation.ts:193`) como mecanismo de proteção de IA | Por isolate, zerado no cold start — é o achado da IA-043. Só pode continuar como pré-filtro |
| `public.webhook_rate_limits` (`20260319134046:31`) | Escopo de webhook; usar `edge_rate_limits` para IA |
| `ai_usage_logs` como **orçamento** | Serve de ledger; a quota atual (`count()` sobre a tabela) não é atômica. Não é tabela de reserva |
| Segundo/terceiro vocabulário de status | Já existem quatro (`pending|processing|succeeded|failed|dead_letter`, status de `messages`, status de TalkX, `multiplix_item_status`). Criar um quinto para IA é regressão |
| Tabela de fila de IA própria | Nenhuma existente; criar uma 5ª fila sem justificativa viola o aceite da IA-007 (ver §2 #1) |
| `public.lid_audit_snapshot_20260902` | Snapshot de auditoria pontual (`"lid_audit_snapshot"`), não é estrutura operacional |
| `supabase/migrations/_foreign/*` | Migrations de outro repositório (há `README.md` na pasta); não são base para o desenho da IA (usar como referência histórica apenas) |
| `public.whatsapp_connection_queues` como fila de trabalho | É vínculo **conexão ↔ fila de atendimento** (roteamento de conversa), apesar do nome — não é fila assíncrona |
| `.github/workflows/crm-sync-worker.yml` como padrão de worker de IA | Drena o outbox **por GitHub Actions**, hoje desligado por gate (`vars.CRM_SYNC_WORKER_ENABLED`, `:1-17`). O padrão a seguir é cron `pg_cron` → Edge Function (`multiplix-send-trigger`), não Actions |
| Endpoint fixo `https://ai.gateway.lovable.dev/v1/chat/completions` (6 locais, §2 #26) | Chamada direta ao gateway **em paralelo** ao `ai_proxy` configurável — é o achado central da IA-032 |
| `public-api` | Endpoint legado mantido apenas para responder `410` (`supabase/config.toml:23-27`) |

---

## 4. Reaproveitamento imediato nos blocos 05, 06 e 11

### Bloco 05 — Execução resiliente, filas e controle de consumo (041–050)

| Etapa | Reaproveitar de imediato |
|---|---|
| IA-041 prazos | `callAiWithTracking` + `AbortController` (`ai-usage.ts:109-112`): parametrizar timeout por capacidade em vez de fixar 30 s |
| IA-042 retry | `fail_crm_sync_outbox` para backoff/dead-letter (`20260908220000:188-208`) + `p_retryable` de `fail_outbound_message` (`20260909220000:419`); acrescentar jitter |
| IA-043 rate limit | `consume_rate_limit` + `edge_rate_limits` (`20260905020000:19,6`) e `enforceRateLimit` (`validation.ts:233`): trocar `checkRateLimit` em `ai-guards.ts:30` |
| IA-044 orçamento | Molde atômico de `consume_rate_limit` (`20260905020000:19`) + precedente `searchbox_session_budget_rpc` (`20260926120500`); substituir o `count()` de `ai-guards.ts:43-48` por reserva/liquidação |
| IA-045 jobs | claim `FOR UPDATE SKIP LOCKED` + `lease_token` + léxico `dead_letter` (padrão das 4 filas); extrair para `_shared/messaging/` conforme Fase 3 do Multiplix; acrescentar heartbeat |
| IA-046 estados | Nomenclatura de `crm_sync_outbox` (`20260908180000:39-40`) + `outcome_unknown` já usado em TalkX/Multiplix |
| IA-047 idempotência | `idempotency_key UNIQUE` (`20260908180000:36`, `20260909220000:43-45`) e `clientMessageId` em `src/services/outbound-message.service.ts` |
| IA-048 cancelamento | `client_message_id`/`client_request_id` já persistidos (`20260909220000:13,42,47`) — reusar como "versão da solicitação" |
| IA-049 persistência | Padrão outbox durável de `crm_sync_outbox` em vez de `waitUntil`; corrigir o *fire-and-forget* de `logAiUsage` |
| IA-050 circuito | `ai_providers.is_active` (`20260408194438`) como desligamento de provedor; `get_crm_sync_health()` (`20260908220000:219`) como molde de RPC de saúde |

### Bloco 06 — Observabilidade, custos e resultados (051–060)

| Etapa | Reaproveitar de imediato |
|---|---|
| IA-051 correlação | `ai_usage_logs.metadata jsonb` (`20260406201803:15`) e `query_telemetry` (`20260323120607:2`) como destino da correlação; promover colunas depois |
| IA-052 uso real | Colunas existentes de `ai_usage_logs` (`model`, `duration_ms`, `status`); acrescentar `provider`/`modality`/`purpose`/versões |
| IA-053 streaming | `ai-proxy` (`ai-proxy/index.ts:204-207`) é o ponto único: instrumentar o ramo `stream` com `logAiUsage` |
| IA-054 ação × tentativa | `crm_sync_outbox.attempt_count`/`max_attempts` (`20260908180000:41-42`) como modelo de agrupamento |
| IA-055 versionar custo | **criar** tabela de preços (nada equivalente) — única criação justificada no Bloco 06 |
| IA-056 agregar no servidor | RPC novo **no lugar** do `limit(1000)` de `useAIUsageDashboard.ts:68-70`; molde de RPC de agregação `dashboard_leaderboard_rpc` (`20260926112500`) e `20260927130000_dashboard_rpc_composite_indices.sql` |
| IA-057 saúde | `AIProviderHealthPanel.tsx:33` + `ai_usage_logs` como amostra; distinguir "sem dados" |
| IA-058 alertas | Canal `send-rate-limit-alert` (`X-Internal-Secret`) e o modelo de `get_crm_sync_health()` |
| IA-059 log sensível | `Logger` (`validation.ts:25`) + `sanitizeString` (`:166`) + `payload_truncated`/`payload_sha256` de `webhook_failures` (`20260830153000:7-8`) como precedente de retenção mínima |
| IA-060 utilidade | Nenhuma infraestrutura de medição de aceitação existe: depende de evento de UI — avaliar em bloco próprio (`[N]`) |

### Bloco 11 — Classificação, filas e chatbot L1 (101–110)

| Etapa | Reaproveitar de imediato |
|---|---|
| IA-101 catalogar etiquetas | `tags`, `contact_tags`, `ai_conversation_tags` (`20260317214556:63`) |
| IA-102 política de roteamento | `queues`/`queue_members` (`20251220130243_14f0f8fe...:2,15`), `queue_skill_requirements` (`20260317212204_a83746c2...:22`), `queue_positions` (`20260317214556_3c66fa42...:51`), `whatsapp_connection_queues` (`20260315193759_ad5f45ba...:3`), `contacts.queue_id` |
| IA-103 escalonamento | `notify-due-reminders` + `notification-events.ts` (`:44,70`) como canal de decisão auditável; `conversation_events` para registro |
| IA-104 isolar por conexão | `chatbot_flows.whatsapp_connection_id` (`20260315151618:51`): corrigir a **seleção**, não a modelagem |
| IA-105 auth do chatbot | `requireAuth`/`createAuthedClient` (`validation.ts:281,304`) + `verifyHmacSignature` (`hmac-validation.ts:17`); `config.toml:8-57` para o estado real de `verify_jwt` |
| IA-106 contexto do bot | `chatbot_flows.nodes/variables` + `chatbot_executions.variables` + `ingest_inbound_message` (`20260905070000`) que já persiste a mensagem de entrada (evita duplicar) |
| IA-107 transferência | `contacts.assigned_to`/`queue_id` (índice `20260315163251:52`) + `chatbot_executions` (`20260315151618:60`) como registro da execução; `whatsapp_connection_queues` para validar o destino |
| IA-108 bot × atendente | `contacts.assigned_to` + `chatbot_executions.status` (`:65`, inclui `paused`); advisory lock de `ingest_inbound_message` como precedente de serialização |
| IA-109 loops | `messages.external_id` + `ux_messages_contact_client_message_id` (`20260909220000:43`) e a dedupe de `ingest_inbound_message` para filtrar evento repetido/próprio |
| IA-110 (fechamento) | `get_crm_sync_health()` como molde do painel de saúde da fila de classificação |

---

## 5. Não verificado nesta etapa

1. **Estado real do `pg_cron`** no banco canônico (`tnnnlkbymytvtqngbbqh`) — só foram lidas as
   migrations versionadas. Um job pode ter sido criado/removido fora delas (o próprio
   `20260909000000_talkx_scheduler_cron.sql:11` declara que o job foi criado "via MCP, jobid=11").
2. **Contagens/linhas reais** das filas e do ledger — nenhuma query foi executada.
3. **Existência de estruturas fora do repositório** (outros branches, serviços externos).
4. **Eficácia em produção** das constraints marcadas `NOT VALID` — a validação está nas migrations,
   mas não foi conferida no banco.
5. **Cobertura de teste** do núcleo de filas — existem scripts de auditoria de RLS citados nos planos
   (`scripts/db-audit/talkx-delivery-leases.test.sh`) mas eles não foram executados.
6. **`feature_flags` em uso real** — não foi consultado quais chaves existem no banco além das
   semeadas nas migrations (`crm.integration`).

## 6. Aceite da etapa

- [x] Fila de mensagens, leases, outbox, autenticação e componentes inventariados com arquivo:linha e
      nome de tabela reais (§1).
- [x] Tabela de decisão reusar/estender/criar com justificativa por capacidade (§2, 32 linhas).
- [x] Estruturas duplicadas/legadas que **não** devem ser usadas listadas com motivo (§3).
- [x] Reaproveitamento concreto mapeado para os Blocos 05, 06 e 11 (§4).
- [x] Planos paralelos (TalkX, Multiplix, Telefonia, Mapa, Banco único) integrados ao inventário (§1.8).
- [x] **Nenhuma fila concorrente nem tabela duplicada** proposta: as únicas criações justificadas são a
      tabela de preços (IA-055) e o heartbeat do núcleo compartilhado — nenhuma das duas é uma fila
      paralela.
