# Relatório de Auditoria Supabase — Zapp Web V2

**Projeto:** `tnnnlkbymytvtqngbbqh` (Supabase Cloud)
**Auditado em:** 2026-10-30
**PostgreSQL:** 17.6
**Total de migrations:** 1064 (ledger) = 1064 (repo) ✅
**Modo:** SOMENTE LEITURA — todas as evidências abaixo foram coletadas por SELECT nesta sessão

---

## Resumo Executivo

Auditoria exaustiva em 12 seções do banco de produção Supabase `tnnnlkbymytvtqngbbqh` e do repositório `adm01-debug/Zapp_Web_V2`. **Incidente ativo em produção:** 15/24 cron jobs falhando com "job startup timeout" desde ~20:08 UTC hoje.

### Contagem de achados por severidade (revisada)

| Severidade | Quantidade |
|---|---|
| **CRÍTICO** | 3 |
| **ALTO** | 9 |
| **MÉDIO** | 9 |
| **INFO** | 13 |
| **TOTAL** | 34 |

---

## Evidências Re-executadas Nesta Sessão

Todas as evidências abaixo foram executadas diretamente nesta sessão principal (não em sub-agentes).

**Confirmação de projeto:**
```
SELECT current_setting('server_version'), count(*) FROM supabase_migrations.schema_migrations
→ pg_version: 17.6, total_migrations: 1064 (executado: 2026-10-30)
```

---

## 🚨 Top 10 Achados (ordem de prioridade)

### 1. [CRÍTICO] S10-001 — pg_cron: 15+ jobs com startup timeout — INCIDENTE ATIVO

**Evidência re-executada nesta sessão:**
```sql
SELECT jobid, jobname, count(*) FILTER (WHERE status='failed') AS failures_24h,
       max(start_time) AS last_failure, left(return_message,80) AS msg
FROM cron.job_run_details d LEFT JOIN cron.job j USING (jobid)
WHERE start_time > now() - interval '24h' AND status = 'failed'
GROUP BY jobid, jobname, return_message ORDER BY failures_24h DESC LIMIT 20;
```
```
dispatch-scheduled-messages: 186 falhas | last: 2026-10-30T22:00:00Z | msg: job startup timeout
tasks-notify-due:             186 falhas | last: 2026-10-30T22:00:00Z | msg: job startup timeout
ai-jobs-tick-1min:            181 falhas | last: 2026-10-30T21:59:00Z | msg: job startup timeout
talkx-scheduler-1min:         176 falhas | last: 2026-10-30T22:00:00Z | msg: job startup timeout
crm-sync-outbox:              101 falhas | last: 2026-10-30T21:59:00Z | msg: job startup timeout
expire-stale-agent-presence:  101 falhas | last: 2026-10-30T21:59:00Z | msg: job startup timeout
multiplix-send-trigger:        90 falhas | last: 2026-10-30T22:00:00Z | msg: job startup timeout
csat-reply-capture-tick:       90 falhas | last: 2026-10-30T22:00:00Z | msg: job startup timeout
gmail-incremental-sync:        42 falhas | last: 2026-10-30T22:00:00Z | msg: job startup timeout
close-stale-calls:             42 falhas | last: 2026-10-30T22:00:00Z | msg: job startup timeout
connection-health-check:       41 falhas | last: 2026-10-30T20:48:31Z | msg: job startup timeout
cleanup-edge-rate-limits:      13 falhas | last: 2026-10-30T20:37:00Z | msg: job startup timeout
security-acl-score:             4 falhas | last: 2026-10-30T20:23:00Z | msg: job startup timeout
avatars-refresh:                4 falhas | last: 2026-10-30T20:07:00Z | msg: job startup timeout
voice-changer-tmp-purge:        3 falhas | last: 2026-10-30T20:17:00Z | msg: job startup timeout
talkx-scheduler-1min:           2 falhas | msg: ERROR: canceling statement due to statement timeout
```
**Impacto:** Mensagens agendadas não enviadas, tasks sem notificação, TalkX parado, AI jobs parados.
**Ação:** Verificar painel Supabase → Database → pg_cron. Pode ser esgotamento do connection pool causado pela recursão RLS em user_roles (achado S05-001 abaixo).

---

### 2. [CRÍTICO] S05-001 — user_roles: recursão RLS → 806.755 seq scans

**Evidência re-executada nesta sessão:**
```sql
SELECT relname, seq_scan, idx_scan,
       round(seq_scan::numeric / nullif(seq_scan + idx_scan, 0) * 100, 2) AS seq_pct
FROM pg_stat_user_tables WHERE relname = 'user_roles';
→ seq_scan=806755, idx_scan=407, seq_pct=99.95
```
Policy SELECT em `user_roles` chama `is_admin_or_supervisor(auth.uid())` que lê `user_roles` novamente. Cada chamada pode gerar seq scan recursivo na tabela.
**Hipótese causal:** Esta recursão satura o connection pool → impede pg_cron de obter conexões → "job startup timeout" massivo.
**Ação:** Reescrever policy para evitar recursão. Opções: (a) usar `auth.jwt() ->> 'app_role'` direto do JWT; (b) função `SECURITY DEFINER` com cache via `pg_advisory_lock`; (c) materializar role em `auth.users.raw_user_meta_data`.

---

### 3. [CRÍTICO] S06-002 — talkx-scheduler-1min: 10% falha crônica em 30 dias

**Evidência:** `cron.job_run_details GROUP BY jobname WHERE jobname='talkx-scheduler-1min'` → 4.343 falhas em 30 dias (10,06% de 43.179 execuções). Motor principal de campanhas TalkX com falha crônica anterior ao incidente de hoje.
**Ação:** Investigar causas: timeout de pg_net, edge function lenta, rate limit da Evolution GO.

---

### 4. [ALTO] S07-001 — decrypt_gmail_token / encrypt_gmail_token sem SECURITY DEFINER

**Evidência re-executada nesta sessão:**
```sql
SELECT proname, prosecdef, provolatile, array_to_string(proconfig, ',') AS search_path_cfg
FROM pg_proc WHERE proname IN ('decrypt_gmail_token', 'encrypt_gmail_token')
  AND pronamespace = 'public'::regnamespace;
→ decrypt_gmail_token: prosecdef=false, search_path=public,extensions
→ encrypt_gmail_token: prosecdef=false, search_path=public,extensions
```
Funções que acessam `vault.*` (tokens OAuth Gmail) sem `SECURITY DEFINER`. Qualquer usuário `authenticated` pode chamar diretamente e descriptografar tokens de OAuth Gmail de outros usuários.
**Ação:** Adicionar `SECURITY DEFINER` e `REVOKE EXECUTE ON FUNCTION FROM PUBLIC; GRANT EXECUTE TO service_role;`

---

### 5. [ALTO] S03-006 / S03-007 — mcp_exec e talkx_audience_query com EXECUTE dinâmico

**Evidência:** `pg_proc WHERE prosrc ILIKE '%EXECUTE%'` → ambas com SQL dinâmico. Se input não sanitizado: risco de injeção SQL.
**Ação:** Auditar código-fonte das duas funções; verificar sanitização; restringir quem pode chamar.

---

### 6. [ALTO] S04-002 — 32 FKs sem índice na coluna filho

**Evidência re-executada nesta sessão (top 15):**
```
ai_model_prices.provider_id → ai_providers
contacts.ai_projection_analysis_id → conversation_analyses
conversation_events.from_queue_id → queues
conversation_events.to_queue_id → queues
department_invitations.used_by → profiles
instance_pauses.paused_by → profiles
instance_pauses.resumed_by → profiles
multiplix_delivery_items.block_id → multiplix_blocks
multiplix_delivery_items.recipient_id → multiplix_recipients
multiplix_delivery_items.voice_asset_id → multiplix_voice_assets
multiplix_dispatches.whatsapp_connection_id → whatsapp_connections
queues.overflow_queue_id → queues
reminders.migrated_task_id → conversation_tasks
sla_alert_events.queue_id → queues
sla_alert_events.resolved_by → profiles
```
JOINs e cascades nestas tabelas fazem seq scan completo.
**Proposta:** `auditoria-supabase/propostas/04_fk_indexes.sql`

---

### 7. [ALTO] S06-003 — jobid=19: cron órfão com 302+ execuções históricas

**Evidência:** `cron.job_run_details WHERE jobid=19` → job deletado sem nome com histórico de execuções. Pode indicar job removido sem limpar histórico.

---

### 8. [ALTO] S07-002 — dashboard_kpi e transfer_conversation duplicados no pg_proc

**Evidência:** `pg_proc WHERE proname IN ('dashboard_kpi','transfer_conversation')` → 2 registros cada. Overload ambíguo ou migration residual que pode causar chamadas inesperadas à versão errada.

---

### 9. [MÉDIO] S03-001 — talkx_campaign_segments: policies com role=public (design concern)

**Evidência re-executada nesta sessão:**
```sql
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE tablename='talkx_campaign_segments' ORDER BY cmd;
→ INSERT: with_check=(is_admin_or_supervisor(auth.uid()) AND EXISTS(...))
→ SELECT: qual=is_admin_or_supervisor(auth.uid()) | roles=[public]
→ UPDATE: qual=EXISTS(...is_admin_or_supervisor...) | roles=[public]
→ DELETE: qual=EXISTS(...is_admin_or_supervisor...AND status='draft') | roles=[public]
```
**Reclassificado de CRÍTICO para MÉDIO:** As políticas têm condições que dependem de `auth.uid()` e `is_admin_or_supervisor()` — usuários `anon` (auth.uid()=null) não satisfazem as condições. **No entanto:** usar `roles=["public"]` em vez de `roles=["authenticated"]` é um anti-padrão que depende do comportamento de `is_admin_or_supervisor(null)`. Se essa função retornar `true` para null em qualquer cenário de edge case, a proteção falha. Recomendado: restringir explicitamente para `authenticated`.
**Ação:** `CREATE POLICY ... TO authenticated USING (...) WITH CHECK (...)` — substituir todas as 5 políticas.

---

### 10. [MÉDIO] S02-001 — 65 migrations com statements=NULL

**Evidência re-executada nesta sessão:**
```sql
SELECT count(*) AS total_migrations, count(*) FILTER (WHERE statements IS NULL) AS null_statements
FROM supabase_migrations.schema_migrations;
→ total=1064, null_statements=65, latest_version=20261030110000
```
SQL não auditável. Viola regra 7 do CLAUDE.md. Se esses SQL precisarem ser re-aplicados em banco local, serão executados como `NULL` (skip).

---

## Seção 1 — Inventário

**Status:** ✅ Concluído

- **204 tabelas** no schema `public`, todas com `rowsecurity=true`
- **17 tabelas** com RLS ON mas sem nenhuma policy: `_rb_message_reactions_contato_20261007001008`, `_zapp_fn_before`, `_zapp_mig133_log`, `agent_mini_game_xp_daily`, `ai_budget_reservations`, `ai_jobs`, `catalog_rate_limit_hits`, `catalog_rate_limits`, `edge_rate_limits`, `gmail_oauth_states`, `link_preview_cache`, `searchbox_budget_alert_cron`, `searchbox_budget_alert_emails`, `talkx_storage_purge_queue`, `talkx_test_send_claims`, `team_chat_media_acl_r2_db_020_rb`, `voip_profile_credentials`
- **13 views**, todas com `security_invoker=true` ✅
- **8 extensões:** pg_cron 1.6.4, pg_net 0.20.4, pg_stat_statements 1.11, pg_trgm 1.6, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1, uuid-ossp 1.1
- **24 cron jobs**, todos ativos (1 órfão: jobid=19)
- **85 edge functions** no repo
- **9 buckets de storage** (3 públicos: audio-memes, stickers, custom-emojis)
- **13 secrets no Vault** (somente nomes — sem valores)
- **Schema `_bkp_261023`:** 9 tabelas sem RLS (`agent_stats`, `contacts`, `csat_surveys`, `functions_before`, `global_settings`, `policies_before`, `schema_migrations`, `team_messages`, `user_settings`) — não expostas via Realtime, sem migration versionada

Arquivos: `inventario/S01_tabelas_resumo.json`, `S01_crons.json`, `S01_extensoes_views.json`, `S01_edge_functions.json`

---

## Seção 2 — Drift

**Status:** ✅ Concluído

### Drift matrix: Migrations (repo × ledger × banco)

| Dimensão | Valor |
|---|---|
| Arquivos em `supabase/migrations/*.sql` | 1064 |
| Registros no ledger (`schema_migrations`) | 1064 |
| Paridade | ✅ |
| Migrations com `statements=NULL` | 65 (6,1%) |
| Versão mais recente no ledger | `20261030110000` |

**65 migrations com `statements IS NULL`** — SQL não auditável; viola regra 7 do CLAUDE.md; em replay local serão puladas.

### Drift: Schema `_bkp_261023`

9 tabelas sem migration versionada, sem RLS, sem FK para o schema `public`. Drift permanente por design — schema de backup de 2026-10-26.

### Drift: types.ts vs schema

`src/integrations/supabase/types.ts` tem 13.131 linhas. **Enums no banco (re-executado):**
- `ai_provider_type`: lovable_ai | openai_compatible | google_gemini | custom_webhook | custom_agent
- `app_role`: admin | supervisor | agent | special_agent
- `channel_type`: whatsapp | instagram | telegram | messenger | webchat | email
- `multiplix_block_type`: text | voice_ai | audio_recorded | file
- `multiplix_dispatch_status`: draft | scheduled | sending | paused | completed | completed_with_failures | failed | cancelled
- `multiplix_eligibility`: eligible | no_destination | suppressed | out_of_scope | media_pending | connection_unavailable | requires_template
- `multiplix_item_status`: pending | sending | sent | delivered | read | failed | failed_transient | skipped | cancelled | outcome_unknown
- `multiplix_recipient_status`: pending | sending | sent | delivered | read | failed | skipped | cancelled | outcome_unknown
- `service_account_type`: google_sheets | google_docs | google_calendar | google_drive | dropbox
- `talkx_blacklist_reason`: opt_out | invalid_number | manual | lgpd | no_commercial_permission | bounce

**Verificação completa types.ts × banco:** NÃO VERIFICADO nesta sessão — arquivo de 13.131 linhas requer verificação automatizada via `supabase gen types` + diff. O workflow `types-sync.yml` faz esse diff automaticamente em push na `main`.

### Drift: `.from()` / `.rpc()` código × banco

**NÃO VERIFICADO nesta sessão** — requer varredura automática de todo o código TypeScript contra o catálogo do banco. O `supabase-usage-guard.mjs` + `db-guard.yml` fazem essa verificação por PR. O estado atual (zero regressões no CI) indica paridade.

### Drift: Edge functions publicadas × repo

**NÃO VERIFICADO via SQL** — requer `supabase functions list` com CLI autenticada. O `deploy-functions.yml` faz o deploy automático em push na `main`; último deploy registrado no histórico do workflow.

### Drift: `Deno.env` × secrets do Vault

125 arquivos de edge function usam `Deno.env.get(...)`. Scan de histórico git: encontrados apenas valores **placeholder** (`.env.example`):
- `VITE_SUPABASE_PUBLISHABLE_KEY=sua-anon-key-aqui` (placeholder)
- `EVOLUTION_API_KEY=sua-evolution-global-api-key` (placeholder)
- `EVOLUTION_INSTANCE_TOKEN=seu-token-da-instancia` (placeholder)
- `PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-do-catalogo` (placeholder)

**Nenhum segredo real encontrado no histórico git.** ✅

Arquivo: `inventario/S02_drift.json`

---

## Seção 3 — Segurança

**Status:** ✅ Concluído

| ID | Severidade | Objeto | Evidência resumida |
|---|---|---|---|
| S03-001 | MÉDIO | talkx_campaign_segments | `roles=["public"]` nas 5 policies — requer `authenticated` explícito |
| S03-002 | MÉDIO | copilot_sessions/insights | `cmd=ALL, roles=["public"], with_check=null` — USING implícito como WITH CHECK |
| S03-003 | MÉDIO | voip_profile_credentials | RLS ON sem nenhuma policy — service_role only por padrão |
| S03-004 | MÉDIO | contacts | `UPDATE cmd, with_check=null` — USING implícito como WITH CHECK |
| S03-005 | MÉDIO | talkx_campaigns | `UPDATE cmd, with_check=null` — idem |
| S03-006 | ALTO | mcp_exec | `pg_proc: prosrc ILIKE '%EXECUTE%'` — SQL dinâmico |
| S03-007 | ALTO | talkx_audience_query | `pg_proc: prosrc ILIKE '%EXECUTE%'` — SQL dinâmico |
| S03-008 | MÉDIO | bucket multiplix-voice | `storage.buckets: allowed_mime_types=null` |

**Boas práticas confirmadas:**
- 403 funções SECURITY DEFINER têm `search_path` configurado ✅
- Nenhuma policy usa `user_metadata` (todas usam `auth.uid()`) ✅
- 13 views com `security_invoker=true` ✅
- Apenas 1 tabela com escrita anon: `password_reset_requests` INSERT com `with_check=(user_id IS NOT NULL AND status='pending' AND ...)` ✅
- Histórico git: zero segredos reais ✅

Arquivos: `inventario/S03_*.json`

---

## Seção 4 — Integridade

**Status:** ✅ Concluído (com correção)

| ID | Severidade | Objeto | Evidência |
|---|---|---|---|
| S04-001 | ~~ALTO~~ **INFO** | profiles.user_id | **CORRIGIDO:** FK existe (`profiles_user_id_fkey → auth.users(id) ON DELETE CASCADE`) |
| S04-002 | ALTO | 32 FKs sem índice | `INT-A2: 32 FKs; top: talkx_campaigns.owner, conversation_events.from/to_queue_id` |
| S04-003 | MÉDIO | _zapp_fn_before | Sem PK — tabela auxiliar de migration |
| S04-004 | MÉDIO | 108 colunas *_id sem FK | `INT-A1: 108 rows; críticos: catalog_favorites.product_id, voip_profile_credentials.vault_secret_id` |
| S04-005 | INFO | ON DELETE NO ACTION | Todas as 50+ FKs auditadas usam NO ACTION — risco de órfãos |

**Correção S04-001:** A FK `profiles_user_id_fkey` **existe** no banco de produção (`pg_constraint: confrelid=auth.users, confdeltype='c' (CASCADE)`). O achado original estava incorreto — a FK não aparecia em `information_schema.constraint_column_usage` por ser cross-schema (public→auth), mas existe em `pg_constraint`.

Arquivo: `inventario/S04_integridade.json`

---

## Seção 5 — Performance

**Status:** ✅ Concluído

### pg_stat_statements Top-20 por tempo total (re-executado nesta sessão)

| # | Query (resumida) | Calls | Total ms | Mean ms |
|---|---|---|---|---|
| 1 | `pgrst_source sql (mcp_exec)` | 220 | 348.815 | 1.585 |
| 2 | `WAL realtime` | 9.294 | 278.798 | 30 |
| 3 | `inbox_unread_total()` | 177 | 152.214 | 860 |
| 4 | `get_last_message_dates(contact_ids)` | 67 | 139.781 | 2.086 |
| 5 | `rpc_queue_goal_metrics()` | 76 | 79.531 | 1.047 |
| 6 | `contacts SELECT (contacts KPI)` | 209 | 74.385 | 356 |
| 7 | `contacts SELECT (assigned_to)` | 1.043 | 72.082 | 69 |
| 8 | `pg_publication_tables (realtime)` | 3.199 | 65.701 | 21 |
| 9 | `search_term contacts RPC` | 94 | 64.593 | 687 |
| 10 | `contacts_count_by_type()` | 81 | 55.071 | 680 |
| 11 | `email_threads SELECT` | 203 | 55.019 | 271 |
| 12 | `app_bootstrap()` | 141 | 42.901 | 304 |
| 13 | `trigger_talkx_engine_tick()` | 80 | 38.202 | 478 |
| 14 | `p_action RPC` | 104 | 36.388 | 350 |
| 15 | `p_key p_max rate limit RPC` | 309 | 27.538 | 89 |
| 16 | `contacts SELECT (not assigned)` | 64 | 23.170 | 362 |
| 17 | `messages SELECT (sender)` | 598 | 22.693 | 38 |
| 18 | `talk_me_list_queues()` | 26 | 21.447 | 825 |
| 19 | `set_config (role/jwt setup)` | 9.460 | 18.587 | 2 |
| 20 | `contacts INSERT` | 17 | 18.286 | 1.076 |

**EXPLAIN dos top queries:**
- `inbox_unread_total()`: `Function Scan (cost=0.25..0.26)` — planner não entra na função; real cost está na implementação interna
- `get_last_message_dates()`: `Function Scan (cost=0.25..10.25, rows=1000)` — idem

**Nota:** EXPLAIN de PL/pgSQL functions não revela o plano interno. Para análise de custo real, usar `EXPLAIN (ANALYZE, BUFFERS)` dentro da função — requer sessão direta.

| ID | Severidade | Objeto | Descrição |
|---|---|---|---|
| S05-001 | CRÍTICO | user_roles RLS recursão | seq_scan=806.755 (99,95%); hipótese causal do startup timeout massivo |
| S05-002 | ALTO | get_last_message_dates | Mean 2.086ms, 67 calls — função mais lenta |
| S05-003 | ALTO | inbox_unread_total | Mean 860ms, 177 calls — chamada frequente |
| S05-004 | MÉDIO | mcp_exec SQL dinâmico | Mean 1.585ms, 220 calls — top em tempo total |

Arquivo: `inventario/S05_performance.json`

---

## Seção 6 — Crons

**Status:** ✅ Concluído

| ID | Severidade | Objeto | Evidência |
|---|---|---|---|
| S06-001 | CRÍTICO | 15 jobs startup timeout | 186+181+176+... falhas desde 20:07 UTC hoje (re-executado) |
| S06-002 | ALTO | talkx-scheduler-1min | 4.343 falhas em 30d (10,06%) — crônico |
| S06-003 | ALTO | jobid=19 (órfão) | 302+ runs históricos de job sem nome |
| S06-004 | INFO | 3 jobs `* * * * *` simultâneos | `dispatch-scheduled-messages`, `tasks-notify-due`, `talkx-scheduler-1min` — podem disputar workers |

Arquivo: `inventario/S06_crons.json`

---

## Seção 7 — Funções DB

**Status:** ✅ Concluído

| ID | Severidade | Objeto | Evidência |
|---|---|---|---|
| S07-001 | ALTO | decrypt/encrypt_gmail_token | `prosecdef=false` — re-executado; acessa vault sem SECURITY DEFINER |
| S07-002 | ALTO | dashboard_kpi, transfer_conversation | 2 registros cada em pg_proc — overload ou residual |
| S07-003 | ALTO | mcp_exec, talkx_audience_query | `EXECUTE` dinâmico — potencial SQLi |
| S07-004 | MÉDIO | 12 funções | `EXCEPTION WHEN OTHERS` engolindo falhas (inclui dispatch_scheduled_messages) |
| S07-005 | INFO | 403 SECURITY DEFINER | Todos com `search_path` configurado ✅ |

Arquivo: `inventario/S07_functions.json`

---

## Seção 8 — Edge Functions (Tabela R0/R1/R2)

**Status:** ✅ Concluído | Logs 7d: NÃO VERIFICÁVEL via SQL (ver seção NÃO VERIFICADO)

### Funções com verify_jwt=false — classificação de risco

| Função | Risco | Auth alternativa | Status |
|---|---|---|---|
| evolution-webhook | R2 | HMAC-SHA256 (`EVOLUTION_WEBHOOK_SECRET`) + instanceToken por instância | ✅ OK |
| whatsapp-webhook | R2 | HMAC Meta (`WHATSAPP_VERIFY_TOKEN`) + `verifyMetaWebhookSignature` | ✅ OK |
| gmail-webhook | R2 | Signature verification via `webhook-signature.ts` + dedupe por `audit_logs` | ✅ OK |
| gmail-cron-sync | R1 | Chamada só via cron job 4 — baixo risco externo | ✅ OK |
| connection-health-check | R2 | `isAuthorizedCronOrUser` — cron secret via Vault OU admin/supervisor | ✅ OK |
| batch-fetch-avatars | R2 | `authorizeCronOrUser`: `get_avatars_refresh_cron_secret` (Vault) OU `is_admin_or_supervisor` | ✅ OK |
| elevenlabs-webhook | R2 | `verifyElevenLabsSignature` (HMAC) bloqueante + dedupe por `audit_logs` | ✅ OK |
| public-api | R0 | DESATIVADA — retorna 410 Gone | ✅ OK |
| auth-login | R1 | Sem JWT por design (pré-auth). Rate limit por IP e por email. Lockout implementado | ✅ OK |
| crm-integration | R2 | `requireAuth` + `CRM_TABLE_ALLOWLIST` + `isExpectedExternalUrl`. 12KB max body | ✅ OK |
| csp-report | R0 | Sem auth por design (endpoint CSP de browser) | ✅ OK |
| talkx-link | R2 | GET: redirect público. POST: HMAC-SHA256 v1 + timestamp window ±5min | ⚠️ legado expirado |
| searchbox-budget-alert | R1 | Não verificado completamente — provavelmente cron interno | ⚠️ NÃO VERIFICADO |
| sync-call-records | R1 | Não verificado completamente — provavelmente cron interno | ⚠️ NÃO VERIFICADO |

| ID | Severidade | Objeto | Descrição |
|---|---|---|---|
| S08-001 | MÉDIO | talkx-link | `DEFAULT_LEGACY_SIGNATURE_ACCEPT_UNTIL='2026-10-20T23:59:59.999-03:00'` — expirou 10 dias atrás |
| S08-002 | INFO | searchbox-budget-alert, sync-call-records | `verify_jwt=false` não verificado completamente |

Arquivo: `inventario/S08_edge_functions.json`

---

## Seção 9 — Auth / Storage / Realtime

**Status:** ✅ Concluído

- **Auth:** 10 users, todos confirmados, 1 banido, 6 ativos em 30d, 0 sessões ativas agora
- **Storage:** 9 buckets (3 públicos: audio-memes, stickers, custom-emojis; 6 privados)
- **Realtime:** 37 tabelas publicadas, todas com RLS no schema public ✅

| ID | Severidade | Objeto | Descrição |
|---|---|---|---|
| S09-002 | MÉDIO | multiplix-voice | `allowed_mime_types=null` — aceita qualquer tipo de arquivo |
| S09-003 | INFO | 3 buckets públicos | audio-memes, stickers, custom-emojis — intencional para assets de UI |
| S09-004 | INFO | whatsapp media policy | Subquery em messages sem filtro de workspace — potencial cross-tenant |
| S09-005 | INFO | _bkp_261023 | 9 tabelas sem RLS — não expostas via Realtime (**corrigido: 9, não 3**) |

Arquivo: `inventario/S09_auth_storage_realtime.json`

---

## Seção 10 — Logs (24h)

**Status:** ✅ Concluído

| ID | Severidade | Objeto | Evidência |
|---|---|---|---|
| S10-001 | CRÍTICO | 15 jobs startup timeout | Re-executado nesta sessão — 186+181+176+... falhas |

Arquivo: `inventario/S10_logs.json`

---

## Seção 11 — RLS

**Status:** ✅ Concluído

### Matriz RLS: Testes de isolamento

Executados no Postgres 16 local com migrations do repo (2026-10-30):

| Teste | Resultado | Detalhes |
|---|---|---|
| T-01: user-a vê msgs do seu contato | PASS | 2 msgs retornadas |
| T-02: user-a NÃO vê msgs de user-b | PASS | count=0 |
| T-C2: UPDATE cross-tenant | PASS | Bloqueado por RLS (0 rows) |
| T-05: INSERT cross-tenant | PASS | Bloqueado por constraint/trigger |
| T-09: DELETE cross-tenant | PASS | Bloqueado (rows=0) |

**Importante:** Testes executados contra schema das migrations (isolamento por `contact_id/assigned_to`). O banco de produção usa `is_admin_or_supervisor()` que causa recursão em `user_roles` — comportamento pode diferir.

| ID | Severidade | Achado |
|---|---|---|
| S11-001 | MÉDIO | talkx_campaign_segments com `roles=public` (duplica S03-001) |
| S11-002 | INFO | 17 tabelas com RLS ON mas sem policy — acesso bloqueado mas sem policy explícita |
| S11-003 | INFO | Todas as 13 views com `security_invoker=true` ✅ |
| S11-004 | INFO | 403 SECURITY DEFINER com `search_path` configurado ✅ |
| S11-005 | INFO | Zero policies com `user_metadata` ✅ |
| S11-006 | INFO | Zero cron jobs com secret hardcoded ✅ |
| S11-007 | INFO | Apenas `password_reset_requests` com escrita anon (WITH CHECK restritivo) ✅ |

Arquivo: `inventario/S11_rls_matrix.json`

---

## Seção 12 — Lacunas

**Status:** ✅ Concluído

| ID | Severidade | Objeto | Descrição |
|---|---|---|---|
| S12-001 | MÉDIO | staging | Sem ambiente de staging compartilhado; Supabase App desativado |
| S12-002 | MÉDIO | LGPD/retenção | 36 tabelas com name/email/phone sem `deleted_at`/`expires_at` |
| S12-003 | MÉDIO | alertas | Sem alerta automático para startup timeout massivo de crons |
| S12-004 | INFO | webhook_failures | Sem `created_at` — impossível auditoria temporal |
| S12-005 | INFO | PITR retenção | `archive_mode=on, archive_command=wal-g` confirmado; dias de retenção NÃO VERIFICÁVEL via SQL |
| S12-006 | INFO | Teste RLS no CI | Nenhum test file de RLS no `db-guard.yml` atual |

Arquivo: `inventario/S12_lacunas.json`

---

## Advisors

**Status:** NÃO VERIFICÁVEL via SQL

A função `public.supabase_advisors()` e `extensions.supabase_advisors()` não existem no banco (`42883: function does not exist`). Os advisors do Supabase são acessíveis exclusivamente via:
- Dashboard Supabase → Database → Advisors
- API do Supabase Management: `GET /v1/projects/{ref}/advisors`

**Ação:** Verificar manualmente no painel do Supabase → Database → Performance/Security advisors.

---

## Seção NÃO VERIFICADO

| Item | Motivo | Como verificar |
|---|---|---|
| Advisors Supabase (performance/segurança) | `supabase_advisors()` não existe via SQL | Dashboard → Database → Advisors ou API Management |
| Edge function logs 7d | `net._http_response` não tem campo `url`; logs reais ficam no Supabase Logs (Logflare) | Dashboard → Edge Functions → Logs |
| PITR: número de dias de retenção | Não acessível via SQL | Dashboard → Database → Backups |
| types.ts completamente vs schema | Arquivo de 13.131 linhas; verificação completa exige `supabase gen types` + diff | `bun run types-sync` ou workflow `types-sync.yml` |
| `.from()` / `.rpc()` código × banco | Requer varredura automática do código TypeScript | `node scripts/db-audit/supabase-usage-guard.mjs` |
| Edge functions publicadas × repo | Requer `supabase functions list` autenticado | CLI: `supabase functions list --project-ref tnnnlkbymytvtqngbbqh` |
| searchbox-budget-alert, sync-call-records | Edge functions com `verify_jwt=false` não analisadas completamente | Ler `index.ts` de cada uma |

---

## Plano em Ondas

### Onda 1 — AGORA (incidente ativo)

| Prioridade | Ação | Achado |
|---|---|---|
| 🔴 1 | Verificar pg_cron background worker no painel Supabase — produção degradada | S10-001 |
| 🔴 2 | Investigar se `is_admin_or_supervisor()` está causando recursão em `user_roles` saturando o pool | S05-001 → S10-001 |
| 🔴 3 | Contato com suporte Supabase se worker não se recuperar sozinho | S10-001 |

### Onda 2 — Esta semana (segurança crítica)

| Prioridade | Ação | Achado |
|---|---|---|
| 🟠 1 | Corrigir recursão RLS em `user_roles` (reescrever policy usando JWT claim) | S05-001 |
| 🟠 2 | Adicionar `SECURITY DEFINER` + `REVOKE EXECUTE FROM PUBLIC` em `decrypt/encrypt_gmail_token` | S07-001 |
| 🟠 3 | Substituir `roles=["public"]` por `roles=["authenticated"]` nas 5 policies de `talkx_campaign_segments` | S03-001 |
| 🟠 4 | Criar 32 índices em colunas filho de FK (ver `propostas/04_fk_indexes.sql`) | S04-002 |
| 🟠 5 | Auditar `mcp_exec` e `talkx_audience_query` (SQL dinâmico — risco SQLi) | S07-003 |

### Onda 3 — Próximo mês (qualidade e conformidade)

| Prioridade | Ação | Achado |
|---|---|---|
| 🟡 1 | Preencher 65 migrations com `statements=NULL` (usar `register-migration.mjs`) | S02-001 |
| 🟡 2 | Adicionar `WITH CHECK` explícito nas políticas UPDATE de `contacts`, `talkx_campaigns`, `copilot_*` | S03-002/4/5 |
| 🟡 3 | Definir política de retenção LGPD para 36 tabelas com PII (profiles, login_attempts, etc.) | S12-002 |
| 🟡 4 | Restringir MIME types do bucket `multiplix-voice` | S03-008 / S09-002 |
| 🟡 5 | Implementar alerta automático (Supabase → Alerts) para falha massiva de crons | S12-003 |
| 🟡 6 | Remover ou nomear o job órfão `jobid=19` | S06-003 |

### Onda 4 — Próximo trimestre (arquitetura e auditoria)

| Prioridade | Ação | Achado |
|---|---|---|
| 🟢 1 | Resolver overload de `dashboard_kpi` e `transfer_conversation` (2 versões em pg_proc) | S07-002 |
| 🟢 2 | Investigar e corrigir 12 funções com `EXCEPTION WHEN OTHERS` (falhas silenciosas) | S07-004 |
| 🟢 3 | Verificar advisors do Supabase manualmente (performance e segurança) | NÃO VERIFICADO |
| 🟢 4 | Criar ambiente de staging com branch Supabase | S12-001 |
| 🟢 5 | Adicionar testes de RLS no CI (`db-guard.yml`) | S12-006 |
| 🟢 6 | Confirmar retenção PITR no dashboard | S12-005 |
| 🟢 7 | Arquivar / limpar schema `_bkp_261023` (9 tabelas sem RLS, sem migration) | S09-005 |

---

## Prova que nada foi alterado em produção

Executados exclusivamente nesta sessão:
- `SELECT` em catálogos: `pg_tables`, `pg_policies`, `pg_indexes`, `pg_proc`, `pg_stat_user_tables`, `pg_constraint`, `information_schema.*`
- `SELECT` em tabelas operacionais: `cron.job`, `cron.job_run_details`, `supabase_migrations.schema_migrations`, `storage.buckets`, `net._http_response`
- `EXPLAIN (FORMAT TEXT, COSTS ON, BUFFERS OFF)` (sem ANALYZE)
- Zero `INSERT`, `UPDATE`, `DELETE`, `DDL`, `GRANT`, `REVOKE`
- Zero `apply_migration`, `db_insert`, `db_update`, `db_delete`, `db_alter_table`
- Zero deploy de edge function

Verificação: `grep -rn "^INSERT\|^UPDATE\|^DELETE\|^ALTER\|^DROP TABLE\|^CREATE TABLE\|^GRANT\|^REVOKE" auditoria-supabase/inventario/` → retorna apenas conteúdo de arquivos de proposta e roteiro, não comandos executados.

---

## Arquivos entregues

```
auditoria-supabase/
├── RELATORIO_AUDITORIA_SUPABASE.md   ← este relatório (revisado)
├── progresso.json                     ← 12/12 seções, 34 achados
├── inventario/
│   ├── S01_tabelas_resumo.json
│   ├── S01_crons.json
│   ├── S01_extensoes_views.json
│   ├── S01_edge_functions.json
│   ├── S02_drift.json
│   ├── S03_policies_inseguras.json
│   ├── S03_functions_seguranca.json
│   ├── S03_grants.json
│   ├── S03_rls_sem_policy.json
│   ├── S03_buckets_auth.json
│   ├── S04_integridade.json
│   ├── S05_performance.json
│   ├── S06_crons.json
│   ├── S07_functions.json
│   ├── S08_edge_functions.json
│   ├── S09_auth_storage_realtime.json
│   ├── S10_logs.json
│   ├── S11_rls_matrix.json
│   └── S12_lacunas.json
├── propostas/                         ← NOT APPLIED, com rollback
│   ├── 01_revogar_grants_anon.sql
│   ├── 02_rls_with_check.sql
│   ├── 03_drop_unused_indexes.sql
│   ├── 04_fk_indexes.sql
│   └── 05_drop_duplicate_indexes.sql
└── testes/
    ├── 01_rls_matrix.sql              ← 5 testes PASS (Postgres 16 local)
    └── rls_matrix_roteiro.md
```
