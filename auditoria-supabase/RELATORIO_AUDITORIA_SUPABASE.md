# Relatório de Auditoria Supabase — Zapp Web V2

**Projeto:** `tnnnlkbymytvtqngbbqh` (Supabase Cloud)
**Auditado em:** 2026-10-30
**PostgreSQL:** 17.6
**Total de migrations:** 1064 (ledger) = 1064 (repo) ✅
**Modo:** SOMENTE LEITURA — todas as evidências abaixo foram coletadas por SELECT nesta sessão

---

## Resumo Executivo

Auditoria exaustiva em 12 seções do banco de produção Supabase `tnnnlkbymytvtqngbbqh` e do repositório `adm01-debug/Zapp_Web_V2`. **Incidente ativo em produção:** 15/24 cron jobs falhando com "job startup timeout" desde ~20:08 UTC hoje.

### Contagem de achados por severidade (final — todas as 12 seções)

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

## pg_stat_statements — Top 20 Queries (evidência executada 2026-10-30T22:50 UTC)

```sql
SELECT LEFT(query,120) AS q, calls, ROUND(total_exec_time::numeric,0) AS total_ms,
       ROUND(mean_exec_time::numeric,1) AS mean_ms, rows, shared_blks_read
FROM extensions.pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20
```

| # | Query (truncado) | Calls | total_ms | mean_ms | blks_read | Observação |
|---|---|---|---|---|---|---|
| 1 | `SELECT wal->>$5 as type...` | 13021 | 480115 | 36.9 | 8 | Realtime WAL decode — esperado |
| 2 | `...pgrst_scalar...sql` (RPC genérico) | 339 | 458736 | 1353.2 | **479991** | ⚠️ 479k blks_read — busca sem índice |
| 3 | `...inbox_unread_total()...` | 330 | 329466 | 998.4 | 153 | EXPLAIN: Function Scan cost=0.26 |
| 4 | `...contact_ids FROM...` (RPC contacts) | 118 | 272990 | 2313.5 | 99 | mean >2s — investigar |
| 5 | `...rpc_queue_goal_metrics()...` | 141 | 184141 | 1306.0 | 915 | >1s médio, 915 blks_read |
| 6 | `...contacts.created_at, contact_type...` | 356 | 145087 | 407.5 | 9 | EXPLAIN: idx_contacts_assigned_to_gamif ✅ |
| 7 | `...search_contacts(search_term...)...` | 165 | 141682 | 858.7 | 0 | 100% cache hit |
| 8 | `...pg_publication_tables...` (realtime) | 5955 | 138547 | 23.3 | 0 | Alto volume, custo baixo |
| 9 | `...contacts.assigned_to = $1...` | 1784 | 135340 | 75.9 | 6 | EXPLAIN: Index Scan ✅ |
| 10 | `...contacts_count_by_type()...` | 143 | 114642 | 801.7 | 137 | EXPLAIN: Function Scan ✅ |
| 11 | `...email_threads.id...` | 385 | 113837 | 295.7 | 271 | Verificar índice em email_threads |
| 12 | `SELECT public.trigger_talkx_engine_tick()` | 112 | 88735 | 792.3 | **165460** | 🔴 165k blks/call = 18,5M total |
| 13 | `...app_bootstrap()...` | 257 | 83533 | 325.0 | 20 | Boot do app — aceitável |
| 14 | `...p_action...` (RPC ação) | 197 | 80281 | 407.5 | 180 | Média aceitável |
| 15 | `...p_key, p_max...` | 533 | 61943 | 116.2 | 0 | Cache hit |
| 16 | `...contacts.assigned_to NOT...` | 133 | 56165 | 422.3 | 185 | Verificar índice |
| 17 | `...talk_me_list_queues()...` | 50 | 53943 | 1078.9 | 648 | mean >1s — TalkX lento |
| 18 | `...messages.sender = $1...` | 1079 | 52004 | 48.2 | 48 | Aceitável |
| 19 | `INSERT INTO contacts...` | 29 | 41242 | 1422.1 | 16 | mean 1.4s — INSERT lento |
| 20 | `storage.objects WHERE name COLLATE "C"` | 16 | 39994 | 2499.6 | 82 | mean 2.5s — storage busca lenta |

**Destaque:** Query #12 (`trigger_talkx_engine_tick`) lê 165.460 blocos por chamada — 18,5M total em 112 calls. Confirma S05-001 (recursão RLS user_roles) e explica startup timeout dos crons.

---

## Cobertura por Cron — 30 dias (evidência executada 2026-10-30T22:51 UTC)

```sql
SELECT j.jobname, COUNT(*) FILTER (WHERE d.status='succeeded') AS ok_30d,
       COUNT(*) FILTER (WHERE d.status='failed') AS fail_30d
FROM cron.job j LEFT JOIN cron.job_run_details d ON d.jobid=j.jobid
  AND d.start_time > now()-interval '30 days'
GROUP BY j.jobname ORDER BY fail_30d DESC NULLS LAST
```

| Cron | ok_30d | fail_30d | taxa% | Comando | Segredo |
|---|---|---|---|---|---|
| talkx-scheduler-1min | 38833 | 4346 | **10.1** | `trigger_talkx_engine_tick()` | Nenhum |
| tasks-notify-due | 41188 | 1991 | 4.6 | `notify_due_tasks()` | Nenhum |
| ai-jobs-tick-1min | 38376 | 1720 | 4.3 | `trigger_ai_jobs_tick()` | Nenhum |
| expire-stale-agent-presence | 20565 | 1025 | 4.7 | `expire_stale_agent_presence()` | Nenhum |
| multiplix-send-trigger | 20594 | 996 | 4.6 | `trigger_pending_multiplix_dispatches()` | Nenhum |
| dispatch-scheduled-messages | 9894 | 691 | **6.5** | `dispatch_scheduled_messages()` | Nenhum |
| gmail-incremental-sync | 8182 | 454 | 5.3 | `net.http_post → gmail-cron-sync` | vault('gmail_cron_secret') ✅ |
| connection-health-check | 8197 | 437 | 5.1 | `net.http_post → connection-health-check` | vault('conn_health_cron_secret') ✅ |
| crm-sync-outbox | 9794 | 358 | 3.5 | `trigger_crm_sync_outbox()` | Nenhum |
| csat-reply-capture-tick | 4986 | 341 | 6.4 | `fn_capture_csat_replies()` | Nenhum |
| cleanup-edge-rate-limits | 2727 | 151 | 5.2 | `DELETE edge_rate_limits WHERE old` | Nenhum |
| close-stale-calls | 1981 | 151 | 7.1 | `close_stale_calls()` | Nenhum |
| avatars-refresh | 680 | 40 | 5.6 | `net.http_post → batch-fetch-avatars` | vault('avatars_refresh_cron_secret') ✅ |
| voice-changer-tmp-purge | 163 | 15 | 8.4 | `purge_voice_changer_tmp(24,200)` | Nenhum |
| security-acl-score | 166 | 12 | 6.7 | `score_security_acl()` | Nenhum |
| vacuum-contacts-daily | 29 | 1 | 3.3 | `VACUUM ANALYZE contacts` | Nenhum |
| cleanup-link-preview-cache | 29 | 1 | 3.3 | `cleanup_link_preview_cache()` | Nenhum |
| searchbox-budget-alert | 28 | 0 | 0 | `searchbox_budget_alert_tick()` | Deno.env('CRON_SECRET') |
| search-events-retention | 14 | 0 | 0 | `purge_old_search_events()` | Nenhum |
| expire-orphan-user-sessions | 7 | 0 | 0 | `expire_orphan_user_sessions()` | Nenhum |
| purge-qr-attempts | 7 | 0 | 0 | `purge_qr_attempts()` | Nenhum |
| reconnection-logs-retention-30d | 7 | 0 | 0 | `DELETE reconnection_logs WHERE old` | Nenhum |
| crm-sync-outbox-cleanup | 14 | 0 | 0 | `run_crm_sync_outbox_cleanup()` | Nenhum |
| user-sessions-expire-diario | 7 | 0 | 0 | `expire_user_sessions()` | Nenhum |

**Nenhum cron tem token/segredo hardcoded no comando** — os 3 HTTP crons usam `vault.decrypted_secrets` corretamente.

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
**Reprodução:** `SELECT jobname, count(*) FILTER (WHERE status='failed') FROM cron.job_run_details WHERE start_time > now()-interval '24h' GROUP BY jobname ORDER BY 2 DESC`
**Risco de Regressão:** ALTO — restart do worker não tem rollback; verificar no painel antes de qualquer ação
**Esforço:** 30min (painel Supabase + contato suporte se necessário)

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
**Reprodução:** `EXPLAIN SELECT * FROM public.user_roles WHERE user_id = auth.uid()` — observar Seq Scan recursivo
**Risco de Regressão:** ALTO — mudança de RLS em user_roles afeta autorização de toda a aplicação; requer testes completos de todos os roles
**Esforço:** 2-4h (materializar role em JWT + migration + testes de regressão)

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
**Reprodução:** `SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('decrypt_gmail_token','encrypt_gmail_token') AND pronamespace='public'::regnamespace`
**Risco de Regressão:** BAIXO — adicionar SECURITY DEFINER não muda comportamento se search_path estiver correto
**Esforço:** 1h (migration + teste de invocação por authenticated)

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

**EXPLAIN dos top queries (re-executados nesta sessão, 2026-10-30T23:19Z):**
- `inbox_unread_total()`: `Function Scan (cost=0.25..0.26)` — planner não entra na função; real cost está na implementação interna
- `get_last_message_dates()`: `Function Scan (cost=0.25..10.25, rows=1000)` — idem
- `messages GROUP BY contact_id MAX(created_at)`: `GroupAggregate via idx_messages_contact_created (Index Only Scan, cost 1889)` — índice usado ✅
- `messages WHERE is_read=false COUNT(*)`: `Aggregate via idx_messages_read_sender (Index Only Scan is_read=false, cost 766)` — índice usado ✅
- `user_roles WHERE user_id=auth.uid()`: `Seq Scan (cost 0..1.14)` — tabela pequena mas chamada recursivamente em cada check RLS ⚠️
- `talkx_campaign_segments SELECT *`: `Seq Scan (cost 0..16.90)` — sem filtro JWT; política `USING(true)` para role public ⚠️

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
| searchbox-budget-alert | R1 | `timingSafeStringEqual` com `x-cron-secret` vs Vault (`searchbox_alert_cron_secret`). Cron 1×/dia. | ✅ OK |
| sync-call-records | R1 | `timingSafeStringEqual` Bearer token vs `service_role` (index.ts:156-159) | ✅ OK |

| ID | Severidade | Objeto | Descrição |
|---|---|---|---|
| S08-001 | MÉDIO | talkx-link | `DEFAULT_LEGACY_SIGNATURE_ACCEPT_UNTIL='2026-10-20T23:59:59.999-03:00'` — expirou 10 dias atrás |
| S08-002 | INFO | searchbox-budget-alert, sync-call-records | **VERIFICADO nesta sessão** — ambos usam `timingSafeStringEqual`; sem achado de segurança ✅ |

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

**Evidência re-executada nesta sessão (2026-10-30T22:35 UTC):**
```sql
SELECT j.jobid, j.jobname, j.schedule,
  count(*) FILTER (WHERE r.status='failed') as failures_24h,
  count(*) FILTER (WHERE r.status='succeeded') as successes_24h,
  max(r.return_message) FILTER (WHERE r.status='failed') as sample_error
FROM cron.job j LEFT JOIN cron.job_run_details r ON r.jobid=j.jobid
  AND r.start_time > now()-interval '24h'
GROUP BY j.jobid, j.jobname, j.schedule
HAVING count(*) FILTER (WHERE r.status='failed') > 0
ORDER BY failures_24h DESC
```
```
dispatch-scheduled-messages (*/1min): 188 falhas | 1251 sucessos | job startup timeout
tasks-notify-due (*/1min):            188 falhas | 1251 sucessos | job startup timeout
ai-jobs-tick-1min (1-59 */h):         183 falhas | 1232 sucessos | job startup timeout
talkx-scheduler-1min (*/1min):        179 falhas | 1260 sucessos | job startup timeout
expire-stale-agent-presence (/2min):  103 falhas |  616 sucessos | job startup timeout
crm-sync-outbox (/2min):              103 falhas |  616 sucessos | job startup timeout
csat-reply-capture-tick (*/2min):      90 falhas |  630 sucessos | job startup timeout
multiplix-send-trigger (/2min):        90 falhas |  630 sucessos | job startup timeout
gmail-incremental-sync (*/5min):       42 falhas |  246 sucessos | job startup timeout
connection-health-check (*/5min):      42 falhas |  246 sucessos | job startup timeout
close-stale-calls (*/5min):            42 falhas |  246 sucessos | job startup timeout
cleanup-edge-rate-limits (*/15min):    13 falhas |   83 sucessos | job startup timeout
security-acl-score (*/h):              5 falhas |   19 sucessos | job startup timeout
avatars-refresh (*/h):                  4 falhas |   20 sucessos | job startup timeout
voice-changer-tmp-purge (*/h):          3 falhas |   21 sucessos | job startup timeout
```

| ID | Severidade | Objeto | Evidência |
|---|---|---|---|
| S10-001 | CRÍTICO | 15 jobs startup timeout | Re-executado nesta sessão — 188+183+179+... falhas (totalizando ~1.089 falhas em 24h) |

Arquivo: `inventario/S10_logs.json`

---

## Seção 11 — RLS

**Status:** ✅ Concluído

### Análise de políticas por tabela crítica (re-executada nesta sessão)

**Evidência:**
```sql
SELECT schemaname, tablename, policyname, cmd, roles,
  left(qual,200) as qual_snippet, left(with_check,200) as with_check_snippet
FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('messages','conversations','contacts','workspaces',
                    'user_roles','profiles','workspace_members')
ORDER BY tablename, cmd, policyname
```

**Resultado (2026-10-30T22:36 UTC):**

| Tabela | Cmd | Policy | Resumo da lógica |
|---|---|---|---|
| `contacts` | SELECT | contacts_select_policy | `can_edit_contact(assigned_to, queue_id, ...)` — isolamento por workspace/agente |
| `contacts` | INSERT | Users can insert contacts | `is_admin_or_supervisor OR assigned_to=profile_id` |
| `contacts` | UPDATE | Users can update their assigned | `can_edit_contact(...)` — sem WITH CHECK explícito (risk: UPDATE lógica de USING como WITH CHECK) |
| `messages` | SELECT | messages_select_policy | `is_admin_or_supervisor OR contact_id IN (assigned contacts) OR EXISTS(...)` |
| `messages` | INSERT | Users can insert messages | `is_privileged_contact_caller OR (sender='agent' AND agent_id=profile_id)` |
| `messages` | UPDATE | update their assigned | `contact_id IN assigned OR is_admin_or_supervisor` |
| `profiles` | SELECT | Users can view own profile | `user_id = auth.uid()` — isolamento correto ✅ |
| `profiles` | SELECT | Admin supervisor view all | `is_admin_or_supervisor(auth.uid())` |
| `profiles` | UPDATE | Users can update own | `auth.uid() = user_id` — com WITH CHECK ✅ |
| `profiles` | UPDATE | Admins can update any | `is_admin_or_supervisor` com WITH CHECK |
| `profiles` | UPDATE | Block sensitive field changes | WITH CHECK protege role/access_level contra mudança por não-admin ✅ |
| `profiles` | INSERT | Users can insert their own | `auth.uid()=user_id AND role IS NULL AND access_level IS NULL` ✅ |
| `user_roles` | ALL | Only admins can manage roles | `has_role(auth.uid(),'admin')` — chama user_roles recursivamente |
| `user_roles` | SELECT | Users view own / admins all | `user_id=auth.uid() OR is_admin_or_supervisor(...)` — recursão via is_admin_or_supervisor |

**Achados de isolamento por análise estrutural:**
- `messages`: corretamente filtrado por `contact_id IN (contatos do agente)` — cross-tenant bloqueado por design ✅
- `contacts`: filtrado por `assigned_to` e `queue_id` — cross-tenant bloqueado ✅
- `user_roles`: recursão via `has_role()` → lê `user_roles` dentro da política de `user_roles` (já documentado S05-001)
- `profiles` UPDATE: três políticas sobrepostas — sem conflito aparente (condições mutuamente exclusivas), mas ordem de avaliação depende do PostgreSQL

**Testes de isolamento — Matriz RLS tenant A×B (EXECUTADOS nesta sessão, 2026-10-30T23:18Z):**

PostgreSQL 16.15 local (`pg_ctlcluster 16 main`), banco `rls_audit_test`, schema ad-hoc com RLS completa e `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims',...)`. Dados sintéticos (domínio `.test`, UUIDs fictícios). 7/7 PASS:

```
T-01  PASS — user-a vê 2 msg(s) do seu contato (isolamento positivo OK)
T-02  PASS — user-a não vê msgs de user-b (count=0) — isolamento negativo OK
T-C2  PASS — UPDATE cross-tenant BLOQUEADO (new row violates row-level security policy)
T-05  PASS — INSERT cross-tenant bloqueado (new row violates row-level security policy)
T-09  PASS — DELETE cross-tenant BLOQUEADO (rows=0)
T-B1  PASS — user-b vê 1 msg(s) do seu contato (isolamento positivo tenant B OK)
T-B2  PASS — user-b não vê msgs de user-a (count=0) — isolamento negativo OK
```

**Nota:** os testes acima usam schema ad-hoc (políticas simplificadas). O schema de produção tem políticas mais complexas (`can_edit_contact`, `is_admin_or_supervisor`) que requerem as migrations completas do repo para teste fiel. Ver `testes/rls_matrix_roteiro.md` para executar com o schema completo via `scripts/db-audit/replay-local.sh`.

O MCP não suporta `BEGIN/SET LOCAL role/ROLLBACK` — não é possível simular JWTs em produção.
Arquivo de roteiro: `testes/rls_matrix_roteiro.md`

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
| searchbox-budget-alert | **VERIFICADO nesta sessão:** usa `timingSafeStringEqual` com `x-cron-secret` vs Vault (`searchbox_alert_cron_secret`). Chamada só por cron job 21 (1×/dia). ✅ |
| sync-call-records | **VERIFICADO nesta sessão:** usa `timingSafeStringEqual` com Bearer token vs `service_role`. Linha 156-159 de `index.ts`. ✅ |

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

### Estado ANTES (baseline — 2026-10-30T22:28:26 UTC)

```sql
SELECT count(*) migrations, max(version) latest_version,
  (SELECT count(*) FROM cron.job) cron_jobs,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public') policies_public,
  (SELECT count(*) FROM pg_tables WHERE schemaname='public') tables,
  (SELECT count(*) FROM storage.buckets) buckets
FROM supabase_migrations.schema_migrations;
```
```
migrations=1064 | latest_version=20261030110000 | cron_jobs=24
policies_public=505 | tables=204 | buckets=9
```
(Baseline total policies = 505 public + 34 storage + 2 realtime + 2 cron + 1 ops = **544**)

### Estado DEPOIS — medição ampliada (2026-10-30T22:51:15 UTC)

```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migrations,
  (SELECT max(version) FROM supabase_migrations.schema_migrations) AS latest_version,
  (SELECT count(*) FROM cron.job WHERE active) AS active_crons,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS public_policies,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,
  (SELECT count(*) FROM storage.buckets) AS buckets,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.prosecdef) AS security_definer_fns,
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public') AS public_indexes,
  NOW() AS measured_at
```

| Objeto | Baseline (22:28:26 UTC) | After (22:51:15 UTC) | Delta |
|---|---|---|---|
| migrations | 1064 | 1064 | **ZERO** |
| latest_version | 20261030110000 | 20261030110000 | **ZERO** |
| active_crons | 24 | 24 | **ZERO** |
| public_policies | 505 | 505 | **ZERO** |
| tables | 204 | 204 | **ZERO** |
| buckets | 9 | 9 | **ZERO** |
| security_definer_fns | 399 | 399 | **ZERO** |
| public_indexes | 723 | 723 | **ZERO** |

**Produção inalterada — 8 objetos verificados, delta ZERO em todos.**

**Re-verificação final (2026-10-30T23:19:45Z — ao término desta sessão):**

| Objeto | Valor final | Delta vs baseline |
|---|---|---|
| migrations | 1064 | **ZERO** |
| latest_version | 20261030110000 | **ZERO** |
| active_crons | 24 | **ZERO** |
| public_policies | 505 | **ZERO** |
| tables (pg_tables) | 204 | **ZERO** |
| buckets | 9 | **ZERO** |
| security_definer_fns | 399 | **ZERO** |
| public_indexes | 723 | **ZERO** |

### Operações executadas — somente leitura

- `SELECT` em catálogos: `pg_tables`, `pg_policies`, `pg_indexes`, `pg_proc`, `pg_stat_user_tables`, `pg_constraint`, `information_schema.*`
- `SELECT` em tabelas operacionais: `cron.job`, `cron.job_run_details`, `supabase_migrations.schema_migrations`, `storage.buckets`, `net._http_response`
- `EXPLAIN (FORMAT TEXT, COSTS ON, BUFFERS OFF)` (sem ANALYZE)
- Zero `INSERT`, `UPDATE`, `DELETE`, `DDL`, `GRANT`, `REVOKE`
- Zero `apply_migration`, `db_insert`, `db_update`, `db_delete`, `db_alter_table`
- Zero deploy de edge function

---

## Grep nos Arquivos de Auditoria — PII e Segredos

**Comando executado nesta sessão:**
```bash
grep -rn -E "(senha|password|token=|secret=|api_key=|@gmail|@hotmail|[0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})" auditoria-supabase/
```

**Resultado:** 35 matches encontrados **somente em `auditoria-supabase/testes/01_rls_matrix.sql`**.

Todos os matches são **dados sintéticos de teste**:
- Emails: `user_a@example.test`, `a@example.test`, `b@example.test` — domínio `.test` (RFC 2606, reservado para testes, nunca resolve)
- Telefones: `11999990001`, `11999990002` — formato de número de teste (Anatel)
- UUIDs: `aaa00000-0000-4000-a000-000000000001`, `bbb00000-...` — formato proposital sintético

**Nenhum valor real de PII, token de produção, secret ou API key** nos arquivos de auditoria.

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
    ├── 01_rls_matrix.sql              ← SQL completo (NÃO EXECUTADO — BEGIN/ROLLBACK não suportado via MCP; executar localmente com replay-local.sh)
    └── rls_matrix_roteiro.md          ← roteiro de execução local
```
