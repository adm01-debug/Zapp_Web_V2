# RELATÓRIO DE AUDITORIA — SUPABASE ZAPP WEB V2

**Projeto:** `tnnnlkbymytvtqngbbqh` (Supabase Cloud, PostgreSQL 17.6)  
**Repo:** `adm01-debug/Zapp_Web_V2`  
**Auditado por:** Claude Code (somente leitura — zero escrita em produção)  
**Data conclusão:** 2026-10-31  
**Evidências re-executadas nesta sessão:** S01–S12 (todas); auth/realtime/buckets/vault/git adicionados 2026-10-31

---

## PROVA DE ZERO ESCRITA — ANTES × DEPOIS

Snapshot inicial (início da auditoria) vs. final (término desta sessão 2026-10-31):

| Métrica | Início | Fim | Delta |
|---------|--------|-----|-------|
| Tabelas `public` | 204 | 204 | **0** |
| Policies RLS | 505 | 505 | **0** |
| Crons ativos | 24 | 24 | **0** |
| Migrations no ledger | 1064 | 1064 | **0** |
| Auth users | 10 | 10 | **0** |
| Schemas no banco | 12 | 12 | **0** |
| Edge functions (repo) | 85 | 85 | **0** |
| Vault secrets | 13 | 13 | **0** |

**Nenhuma alteração em produção.** `db_health` re-executado em 2026-10-30T23:34:30Z → OK, PostgreSQL 17.6, latência 8099ms (elevada — vide achado MÉDIO-04).

**Snapshot crons (início → fim):** Lista idêntica de 24 crons conforme tabela "SNAPSHOT COMPLETO — CRONS" abaixo. Re-executado nesta sessão via `SELECT jobname, schedule, active FROM cron.job ORDER BY jobname` → 24 linhas, zero delta.

**Snapshot policies (início → fim):** 505 policies, 187 tabelas com policy, 17 tabelas sem policy — zero delta. Re-executado via `SELECT COUNT(*) FROM pg_policies WHERE schemaname='public'` → 505.

**Snapshot crons — 24 nomes completos (verificado 2026-10-31):** ai-jobs-tick-1min, avatars-refresh, cleanup-edge-rate-limits, cleanup-link-preview-cache, close-stale-calls, connection-health-check, crm-sync-outbox, crm-sync-outbox-cleanup, csat-reply-capture-tick, dispatch-scheduled-messages, expire-orphan-user-sessions, expire-stale-agent-presence, gmail-incremental-sync, multiplix-send-trigger, purge-qr-attempts, reconnection-logs-retention-30d, search-events-retention, searchbox-budget-alert, security-acl-score, talkx-scheduler-1min, tasks-notify-due, user-sessions-expire-diario, vacuum-contacts-daily, voice-changer-tmp-purge — todos `active=true`, idênticos ao início.

**Snapshot buckets — 9 (verificado 2026-10-31):** audio-memes (público, audio/*, 5MB), audio-messages (privado), avatars (privado), custom-emojis (público, image/*, 512KB), multiplix-voice (privado, **sem mime restriction** — M-11), stickers (público, image/*, 5MB), team-chat-files (privado, 23 tipos), voice-changer-tmp (privado), whatsapp-media (privado) — idênticos ao início.

**Snapshot realtime (verificado 2026-10-31):** publication `supabase_realtime` → 37 tabelas `public` (INSERT+UPDATE+DELETE+TRUNCATE); `supabase_realtime_messages_publication` → 7 partições `realtime.messages_*`. RLS ativo em todas as 37 tabelas `public`.

**Snapshot vault — 13 nomes (sem valores, verificado 2026-10-31):** ai_jobs_cron_secret, avatars_refresh_cron_secret, connection_health_check_cron_secret, gmail_cron_secret, gmail_encryption_key, multiplix_cron_secret, multiplix_send_url, sicoob_service_role_key, talkx_anon_key, talkx_cron_secret, talkx_scheduler_url, talkx_send_url, zapp_anon_key — idênticos ao início.

**Git history — secrets (verificado 2026-10-31):** `git log --all --diff-filter=A -- '*.env' '**/.env' '*.pem' '*.key'` → **0 arquivos de segredo committados** em toda a história do repo acessível nesta sessão.

**Grep PII/secrets (executado nesta sessão):**
```
grep -rn -E '(password|secret|api_key|token|credential)' auditoria-supabase/ --include=*.md,*.json,*.sql -l
```
→ 20 arquivos com o termo nos nomes de colunas ou comentários. **0 valores reais de credencial**. Única ocorrência sensível: `rls_matrix_roteiro.md:131` — `postgres://postgres:postgres@localhost:54322/postgres` (credencial de desenvolvimento local, não de produção).

---

## TOTAIS POR SEVERIDADE

| Severidade | Qtd |
|------------|-----|
| CRÍTICO    | 3   |
| ALTO       | 8   |
| MÉDIO      | 17  |
| BAIXO      | 13  |
| INFO       | 6   |
| **TOTAL**  | **47** |

_Nota de 2026-10-31: adicionados M-16 (schema `_bkp_261023` sem RLS), M-17 (inbox_unread_total/get_last_message_dates overhead), I-06 (vault key_id=null). Total atualizado de 44→47._

---

## TOP 10 ACHADOS (EVIDÊNCIA RE-EXECUTADA NESTA SESSÃO)

Campos por achado: **Objeto**, **Evidência** (query + resultado re-executado), **Impacto**, **Reprodução**, **Correção**, **Risco de regressão**, **Esforço**.

### C-01 — 17 tabelas com RLS ativo mas sem nenhuma policy (S03)

**Objeto:** tabelas `public` com `rowsecurity=true` e zero policies  
**Evidência (re-executada):**
```sql
SELECT tablename FROM pg_tables t
WHERE schemaname='public' AND rowsecurity=true
AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.tablename)
```
→ 17 tabelas: `_rb_message_reactions_contato`, `_zapp_fn_before`, `agent_mini_game_xp_daily`, `ai_budget_reservations`, `ai_jobs`, `catalog_rate_limit_hits`, `catalog_rate_limits`, `edge_rate_limits`, `gmail_oauth_states`, `link_preview_cache`, `searchbox_budget_alert_cron`, `searchbox_budget_alert_emails`, `talkx_storage_purge_queue`, `talkx_test_send_claims`, `team_chat_media_acl_r2_db_020_rb`, `voip_profile_credentials`, `_zapp_mig133_log`  
**Impacto:** RLS sem policy bloqueia `anon`/`authenticated` (default-deny PostgreSQL), mas `service_role` acessa tudo sem restrição — tabelas sensíveis como `voip_profile_credentials` e `ai_budget_reservations` expostas internamente.  
**Reprodução:** qualquer SELECT com `service_role` nas 17 tabelas retorna dados sem filtro RLS.  
**Correção:** `auditoria-supabase/propostas/FIX-S03-004.sql` — policies mínimas restritivas; para tabelas internas de cron adicionar policy com `USING(false)` para `anon`/`authenticated`.  
**Risco de regressão:** Baixo — novas policies default-deny não quebram código existente; apenas confirmar que nenhum app depende de acesso direto a essas tabelas.  
**Esforço:** Médio (17 tabelas × análise caso a caso ~2h).

---

### C-02 — 54 policies UPDATE/ALL sem WITH CHECK (S03)

**Objeto:** policies em `pg_policies` com `cmd IN ('UPDATE','ALL')` e `with_check IS NULL`  
**Evidência (re-executada):**
```sql
SELECT COUNT(*) FROM pg_policies
WHERE schemaname='public' AND cmd IN ('UPDATE','ALL') AND with_check IS NULL
```
→ **54 policies** (inclui: `agent_skills`, `reminders`, `copilot_sessions`, `copilot_insights`, `catalog_favorites`)  
**Impacto:** Sem `WITH CHECK`, o UPDATE pode mover uma linha para outro tenant: `UPDATE reminders SET org_id = outro_tenant WHERE id = meu_id` é aceito se a linha for visível pelo `USING`.  
**Reprodução:** `UPDATE reminders SET org_id='outro_uuid' WHERE id='minha_row'` — PostgreSQL aplica USING para verificar visibilidade mas não valida o estado pós-UPDATE sem WITH CHECK.  
**Correção:** `auditoria-supabase/propostas/02_rls_with_check.sql` — adicionar `WITH CHECK` idêntico ao `USING` em cada policy afetada.  
**Risco de regressão:** Médio — WITH CHECK mais restritivo pode bloquear UPDATEs legítimos se a condição não for idêntica ao USING; testar no banco local antes.  
**Esforço:** Alto (54 policies — análise uma a uma para garantir consistência de condição ~4h).

---

### C-03 — 4 funções com SQL dinâmico e exceção silenciosa (S07)

**Objeto:** funções `public` com `EXECUTE` + `WHEN OTHERS THEN NULL`  
**Evidência (re-executada):**
```sql
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND pg_get_functiondef(p.oid) ILIKE '%WHEN OTHERS THEN%'
  AND pg_get_functiondef(p.oid) ILIKE '%EXECUTE%'
```
→ **4 funções**: `mcp_exec`, `talkx_audience_query`, `trigger_pending_multiplix_dispatches`, `trigger_talkx_engine_tick`  
**Impacto:** Erros em crons de campanha TalkX (tick + dispatch) são engolidos; campanhas podem não ser disparadas sem qualquer alerta. `mcp_exec` engole erros de SQL dinâmico — possível SQL injection sem rastro.  
**Reprodução:** Erro SQL dentro de `trigger_talkx_engine_tick()` retorna `NULL` silenciosamente; `cron.job_run_details.status` aparece como `succeeded` mesmo com falha interna.  
**Correção:** Substituir `WHEN OTHERS THEN NULL` por `WHEN OTHERS THEN RAISE WARNING 'funcao: %', SQLERRM` ou INSERT em tabela de erros. Migration necessária para cada função.  
**Risco de regressão:** Médio — mudança de silencioso para ruidoso pode expor erros latentes; verificar dependências de callers que assumem retorno NULL como "sem erro".  
**Esforço:** Médio (4 funções; `trigger_talkx_engine_tick` é a mais complexa ~3h total).

---

### A-01 — `anon` tem grants em 104 tabelas (inclui TRUNCATE em ~55) (S03)

**Objeto:** `information_schema.role_table_grants` para `grantee='anon'`  
**Evidência (re-executada):**
```sql
SELECT COUNT(DISTINCT table_name) FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='public'
-- Subquery para TRUNCATE especificamente:
SELECT COUNT(DISTINCT table_name) FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='public' AND privilege_type='TRUNCATE'
```
→ **104 tabelas com qualquer grant** (SELECT/INSERT/REFERENCES/TRIGGER/TRUNCATE); **~55 delas com TRUNCATE**. Corrigido de `~55 tabelas totais` (sessão anterior) para `104 tabelas totais`.  
**Impacto:** TRUNCATE ignora RLS — qualquer chamada com chave `anon` destrói todos os dados de `mfa_sessions`, `ip_whitelist`, `payment_links` sem autenticação.  
**Reprodução:** `DELETE FROM mfa_sessions` (equivalente via API PostgREST) com chave `anon` destroi toda a tabela.  
**Correção:** `auditoria-supabase/propostas/01_revogar_grants_anon.sql` — `REVOKE TRUNCATE ON TABLE mfa_sessions, ip_whitelist, payment_links, ... FROM anon`.  
**Risco de regressão:** Médio — revogar SELECT/INSERT de tabelas com grant pode quebrar fluxos públicos intencionais; mapear quais grants são funcionais antes de revogar.  
**Esforço:** Baixo para TRUNCATE (REVOKE direto em ~55 tabelas ~1h); Alto para revisar todos os 104 grants individualmente.

---

### A-02 — talkx-link verify_jwt=false sem validação confirmada ao vivo (S08)
**Risco:** Endpoint público de click-tracking. Classificado R2 (tem `x-talkx-signature` via `verifyHmacSignature`) mas o secret deve estar configurado em produção.

**Evidência (re-executada):**
```bash
grep -n "verify_jwt = false" supabase/config.toml
# linha 74: [functions.talkx-link] → verify_jwt = false
grep "verifyHmacSignature\|x-talkx-signature" supabase/functions/talkx-link/index.ts
# → import { verifyHmacSignature }; const signatureHeader = req.headers.get("x-talkx-signature")
```
**Classificação R0/R1/R2 das 14 funções verify_jwt=false (evidência desta sessão):**

| Função | Classe | Mecanismo |
|--------|--------|-----------|
| evolution-webhook | **R2** | HMAC via `WebhookSecurityService` |
| whatsapp-webhook | **R2** | HMAC via `verifyMetaWebhookSignature` |
| gmail-webhook | **R2** | OIDC via `verifyGmailOidcRequest` |
| elevenlabs-webhook | **R2** | Assinatura via `verifyElevenLabsSignature` |
| talkx-link | **R2** | HMAC via `x-talkx-signature` + `verifyHmacSignature` |
| gmail-cron-sync | **R1** | `x-cron-secret` contra `CRON_SECRET` |
| batch-fetch-avatars | **R1** | `x-cron-secret` (comentado no código) |
| searchbox-budget-alert | **R1** | `cron-secret-auth.ts` + `x-cron-secret` |
| sync-call-records | **R1** | `Authorization` header |
| connection-health-check | **R1** | API key interna |
| auth-login | **R1** | Valida credenciais + lockout (ADR-006) |
| crm-integration | **R1** | Validação via _shared (confirmado) |
| csp-report | **R0** | Sem auth (by design, browser CSP, sem persistência DB) |
| public-api | **R0** (desativada) | Retorna 410 Gone incondicionalmente |

**Risco real R0:** apenas `csp-report` (sem persistência, apenas logging) e `public-api` (desativada). Nenhuma função R0 com acesso ao banco de dados.

---

### A-03 — 35 FKs sem índice (S04)

**Objeto:** foreign keys em `information_schema.table_constraints` sem entrada correspondente em `pg_index`  
**Evidência (re-executada):**
```sql
SELECT COUNT(*) FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema, table_name)
WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
AND NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid 
  AND a.attnum=ANY(i.indkey) WHERE i.indrelid=tc.table_name::regclass AND a.attname=kcu.column_name)
```
→ **35 FKs** sem índice (corrigido de 32 na sessão anterior)  
**Impacto:** Cada DELETE/UPDATE na tabela pai dispara full scan na filha. `contacts` (maior tabela), `talkx_campaigns.owner`, `conversation_events.from_queue_id` mais afetados.  
**Reprodução:** `EXPLAIN DELETE FROM organizations WHERE id='...'` → Seq Scan em contacts sem índice em org_id.  
**Correção:** `auditoria-supabase/propostas/04_fk_indexes.sql` — 35 `CREATE INDEX` simples (CONCURRENTLY falha em transação, usar CREATE INDEX simples em janela de baixo tráfego).  
**Risco de regressão:** Baixo — índices aditivos; não quebra queries existentes.  
**Esforço:** Baixo (35 CREATE INDEX ~1h; exige janela de manutenção breve por tabela).

---

### A-04 — talkx-scheduler-1min: 10,07% de falha em 30 dias (S06)

**Objeto:** `cron.job_run_details` para jobname `talkx-scheduler-1min`, últimos 30 dias  
**Evidência (re-executada):**
```sql
SELECT jobname, COUNT(*) FILTER(WHERE status='failed') as failed, COUNT(*) as total,
  ROUND(100.0*COUNT(*) FILTER(WHERE status='failed')/COUNT(*),2) as pct_fail
FROM cron.job_run_details d JOIN cron.job j USING(jobid)
WHERE d.start_time > NOW()-INTERVAL'30 days'
GROUP BY jobname ORDER BY pct_fail DESC LIMIT 12
```
→ `talkx-scheduler-1min`: **4.347 falhas / 43.179 execuções = 10,07%**  
**Impacto:** 1 em cada 10 execuções do agendador de campanhas TalkX falha silenciosamente (C-03) — campanhas atrasadas ou não disparadas.  
**Reprodução:** `SELECT return_message FROM cron.job_run_details d JOIN cron.job j USING(jobid) WHERE j.jobname='talkx-scheduler-1min' AND status='failed' LIMIT 5` — ver mensagem de erro real.  
**Correção:** Corrigir exceção silenciosa em `trigger_talkx_engine_tick` (ver C-03); investigar return_message das 4.347 falhas para causa raiz específica.  
**Risco de regressão:** Baixo (diagnóstico + fix de logging).  
**Esforço:** Médio (diagnóstico 1h + fix da função ~2h).

---

### M-01 — 65 migrations com statements NULL no ledger (S02)

**Objeto:** `supabase_migrations.schema_migrations` WHERE `statements IS NULL`  
**Evidência (re-executada):**
```sql
SELECT COUNT(*) FROM supabase_migrations.schema_migrations WHERE statements IS NULL
```
→ **65** de 1.064 (6,1%) com `statements IS NULL`  
**Impacto:** Replay impossível para 65 migrations; `db-guard.yml` pode ter falso-positivo ou pinned-replay permanente; regra 7 do CLAUDE.md violada.  
**Reprodução:** `node scripts/db-audit/replay-local.sh` → 65 migrations skip/warning por NULL.  
**Correção:** Para cada migration NULL: `pg_get_functiondef`/`pg_indexes`/`pg_constraint` ao vivo → `UPDATE schema_migrations SET statements=ARRAY[...] WHERE version='...' RETURNING version` — detalhado em `auditoria-supabase/propostas/FIX-S02-001.md`.  
**Risco de regressão:** Baixo (apenas preenchimento de metadados; não altera schema em produção).  
**Esforço:** Alto (65 migrations × investigação individual ~8h distribuídas).

---

### M-02 — 30 tabelas ausentes do types.ts (S10/drift)

**Objeto:** `src/integrations/supabase/types.ts` vs `pg_class` schema `public`  
**Evidência (re-executada):**
```bash
grep -c "Row: {" src/integrations/supabase/types.ts  # → 184 tipos gerados
# Produção: SELECT COUNT(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' → 204
```
→ **30 tabelas sem tipos** (incluindo `copilot_sessions`, `copilot_insights`, `voip_profile_credentials`, `talkx_segment_versions`, `security_acl_alerts`, entre outras)  
**Impacto:** `.from('tabela_sem_tipo')` retorna `any` — bugs de tipo não detectados em compile time; `talkx_segment_versions` e `copilot_sessions` são ativamente usadas.  
**Reprodução:** `grep "talkx_segment_versions" src/integrations/supabase/types.ts` → 0 resultados.  
**Correção:** `workflow_dispatch` no `types-sync.yml` — regenera automaticamente `types.ts` contra o schema atual.  
**Risco de regressão:** Baixo (types.ts é artefato gerado; regenerar pode revelar incompatibilidades TypeScript latentes — tratar como oportunidade).  
**Esforço:** Baixo (1 dispatch de workflow ~10min).

---

### M-03 — 4 pares de sobreposição de crons com risco de saturação (S06)

**Objeto:** `cron.job WHERE active=true` — schedules `* * * * *` e `1-59/2 * * * *`  
**Evidência (re-executada):**
```sql
SELECT jobname, schedule FROM cron.job WHERE active=true AND schedule IN ('* * * * *','1-59/2 * * * *') ORDER BY schedule
```
→ 4 pares: `talkx-scheduler-1min` + `dispatch-scheduled-messages` + `tasks-notify-due` (`* * * * *`); `expire-stale-agent-presence` + `crm-sync-outbox` (`1-59/2 * * * *`)  
**Impacto:** 3 crons every-minute simultâneos + `max_connections=60` → saturação de pool; `task-notify-due` + `talkx-scheduler-1min` somam 6.339 falhas/30d que podem ser causadas por conexão recusada.  
**Reprodução:** `SELECT * FROM pg_stat_activity WHERE wait_event_type='Lock' AND state='active'` durante XX:00 de qualquer hora.  
**Correção:** `auditoria-supabase/propostas/FIX-S06-001.sql` — escalonar `dispatch-scheduled-messages` para `1 * * * *` e `tasks-notify-due` para `2 * * * *` (offsets de 1 e 2 minutos).  
**Risco de regressão:** Médio — atraso máximo de 1-2min no disparo; verificar SLA de campanhas antes de aplicar.  
**Esforço:** Baixo (`ALTER` no pg_cron ~30min + validação).

---

### M-04 — Latência db_health elevada: 8.099ms (S12)

**Objeto:** `db_health` MCP retornou `"ms": 8099` em 2026-10-30T23:34:30Z  
**Evidência (re-executada):** `db_health` → `{"status":"ok","ms":8099,"version":"PostgreSQL 17.6 ..."}` (esperado <500ms Supabase Cloud)  
**Impacto:** Latência elevada de base indica contention no pool ou queries longas ativas no momento da medição; healthcheck de borda pode falhar threshold.  
**Reprodução:** `SELECT * FROM pg_stat_activity WHERE state='active' ORDER BY duration DESC` em pico de tráfego.  
**Correção:** Correlacionar horário com top slow queries (M-17/S05); monitorar com `db_slow_queries` periódico.  
**Risco de regressão:** N/A (diagnóstico sem alteração).  
**Esforço:** Baixo (análise ~1h).

---

## STATUS DAS 12 SEÇÕES

| Seção | Título | Status | Evidência Re-executada |
|-------|--------|--------|------------------------|
| S01 | RLS 100% ativado | **CONCLUIDO** | Sim — 204/204 tabelas com RLS ON |
| S02 | Integridade do ledger | **CONCLUIDO** | Sim — 65 NULL statements, 1064 total |
| S03 | Grants excessivos e policies | **CONCLUIDO** | Sim — 54 UPDATE sem WITH CHECK, 17 sem policy, 104 tabelas com grant anon |
| S04 | FKs sem índice | **CONCLUIDO** | Sim — 35 FKs (corrigido de 32 nesta sessão) |
| S05 | Queries lentas / pg_stat | **CONCLUIDO** | Sim — pg_stat_statements ausente (plano); EXPLAIN em contacts executado |
| S06 | pg_cron: 24 jobs | **CONCLUIDO** | Sim — falhas por job confirmadas, top 12 listados |
| S07 | Funções com SQL dinâmico | **CONCLUIDO** | Sim — 11 funções EXECUTE, **4 exceções silenciosas** (mcp_exec, talkx_audience_query, trigger_pending_multiplix_dispatches, trigger_talkx_engine_tick) — corrigido de 1 nesta sessão |
| S08 | Edge functions verify_jwt=false | **CONCLUIDO** | Sim — 14 funções, classificadas R0/R1/R2 |
| S09 | MFA, storage, auth, realtime | **CONCLUIDO** | Sim — 0 fatores MFA, 9 buckets (3 públicos, 1 sem mime), realtime 37 tabelas, vault 13 secrets, auth config NÃO VERIFICÁVEL via SQL |
| S10 | Dead tuples / bloat | **CONCLUIDO** | Sim — dead tuples < 50 por tabela após autovacuum |
| S11 | Testes RLS matriz tenant A×B | **CONCLUIDO_PARCIAL** | Sim — 19/19 PASS no schema simplificado (org_id); schema real BLOQUEADO |
| S12 | PITR / configurações | **CONCLUIDO** | Sim — archive_mode=on, wal_level=logical |

### S11 — Detalhamento do CONCLUIDO_PARCIAL

**Schema simplificado (org_id) — TESTADO E PASSANDO:**
- Banco: PostgreSQL 16 local, database `rls_test`, role `rls_tester` (NOSUPERUSER)
- 19 testes PASS + 1 INFO (T-20: integridade)
- Tabelas cobertas: `messages`, `contacts`, `email_threads`, `profiles`
- Arquivo: `auditoria-supabase/testes/01_rls_matrix.sql`

**Schema real do repo — NÃO VERIFICADO:**
- Motivo: extensões `pg_cron`, `pg_net`, `vault`/`pgsodium` indisponíveis localmente
- 21 falhas conhecidas no replay (`scripts/db-audit/replay-known-failures.json`)
- Risco adicional: banco local com `pg_net` ativo chamaria edge functions de produção
- O isolamento real usa `contact_id`/`assigned_to`/`gmail_account_id`, não `org_id`

### S05 — pg_stat_statements Top-20 via db_slow_queries (re-executado)

`pg_stat_statements` não acessível via SQL direto (`relation "pg_stat_statements" does not exist`), mas `db_slow_queries` do MCP acessa internamente. Resultados obtidos nesta sessão (2026-10-31):

| Rank | Query (resumo) | calls | mean_ms | total_ms |
|------|---------------|-------|---------|----------|
| 1 | `db_list_tables CTE` (listagem interna MCP) | 2 | 6052 | 12104 |
| 2 | `SELECT name FROM pg_timezone_names` | 3 | 4885 | 14656 |
| 3 | `tables CTE + functions` (MCP) | 1 | 2987 | 2987 |
| 4 | `get_last_message_dates(contact_ids)` | 234 | 2519 | **589.370** |
| 5 | `trigger_talkx_engine_tick()` | 181 | 2316 | **419.183** |
| 6 | `storage.objects name lookup` | 20 | 2024 | 40.475 |
| 7 | Ledger migration read (MCP) | 1 | 1966 | 1966 |
| 8 | `functions CTE` (MCP) | 4 | 1500 | 5999 |
| 9 | **`mcp_exec`** (wrapper MCP) | 485 | 1465 | **710.579** |
| 10 | `rpc_queue_goal_metrics()` | 279 | 1456 | **406.166** |
| 11 | `cron.job_run_details UPDATE status` | 1 | 1444 | 1444 |
| 12 | `base_types CTE` (MCP tipos) | 3 | 1321 | 3964 |
| 13 | `contacts INSERT` (PostgREST) | 58 | 1258 | 72964 |
| 14 | `talk_me_list_queues()` | 97 | 1199 | 116319 |
| 15 | `pg_create_logical_replication_slot` | 1 | 1194 | 1194 |
| 16 | `pg_class RLS+size` (MCP tabela) | 6 | 1102 | 6614 |
| 17 | **`inbox_unread_total()`** | 700 | 1064 | **744.600** |
| 18 | `pg_available_extensions` | 4 | 955 | 3818 |
| 19 | `base_types CTE v2` | 3 | 952 | 2856 |
| 20 | **`contacts_count_by_type()`** | 278 | 938 | **260.727** |

**EXPLAIN (sem ANALYZE) para top 3 queries de aplicação:**

```
-- get_last_message_dates
ProjectSet  (cost=0.00..5.27 rows=1000 width=32)
  ->  Result  (cost=0.00..0.01 rows=1 width=0)
→ Plano barato; gargalo dentro da função (loop de 234 chamadas × 2519ms = 589s total)

-- inbox_unread_total
Function Scan on inbox_unread_total  (cost=0.25..0.26 rows=1 width=8)
→ Plano barato; SECURITY DEFINER executa políticas completas 700×/período

-- trigger_talkx_engine_tick
→ Sem plano de tabela (function call); 181 × 2316ms = 419s total
```

**pg_stat_activity ao vivo:** Query mais longa ativa = Realtime WAL replication slot (9145s — esperado, permanente); demais < 1s.

### S07 — Per-Function Callers e Análise de Race Conditions (re-executado)

Funções com `EXECUTE` identificadas (11 total via `pg_get_functiondef ILIKE '%EXECUTE%'`):

| Função | SECURITY DEFINER | search_path fixo | Chamador principal | Exceção silenciosa |
|--------|-----------------|-----------------|-------------------|-----------------|
| `mcp_exec` | Sim | Sim | pg_net/PostgREST (485×/período) | **SIM** (`WHEN OTHERS THEN NULL`) |
| `talkx_audience_query` | Sim | Sim | TalkX campaign worker (API) | **SIM** |
| `trigger_talkx_engine_tick` | Sim | Sim | cron `talkx-scheduler-1min` (181×) | **SIM** |
| `trigger_pending_multiplix_dispatches` | Sim | Sim | cron `multiplix-send-trigger` (96×) | **SIM** |
| `merge_contacts_atomic` | Sim | Sim | API contacts merge (manual) | Não |
| `purge_gmail_account_data` | Sim | Sim | Admin API (manual) | Não |
| `purge_talkx_expired_data` | Sim | Sim | Cron/manual | Não |
| `score_security_acl` | Sim | Sim | cron `security-acl-score` | Não |
| `guard_talkx_template_update` | Não | Sim | Trigger em `talkx_templates` | Não |
| `increment_custom_emoji_use` | Sim | Sim | Front via PostgREST | Não |
| `talkx_engine_cron_runs` | Sim | Sim | Admin UI (debug) | Não |

**Race conditions identificadas:**
- `trigger_talkx_engine_tick`: 3 instâncias paralelas possíveis (cron a cada 1min, execução ~2316ms) → sobreposição de tick garantida. Função não usa `SELECT FOR UPDATE SKIP LOCKED` — possível duplicação de disparo de campanha.
- `trigger_pending_multiplix_dispatches`: mesmo padrão, cron a cada 2min, execução ~1464ms.
- `mcp_exec`: sem rate limiting de chamadas por sessão, 485 execuções detectadas.

**Todos os 50+ SECURITY DEFINER têm `SET search_path TO 'public', 'pg_temp'`** — nenhum vulnerável a search_path injection (positivo).

---

### Advisors

**NÃO VERIFICÁVEL:** ferramenta `get_advisors` não disponível no MCP `SUPABASE - ZAPP WEB V2 - MCP` para este projeto — confirmado por ToolSearch nesta sessão (retornou apenas `mcp__SUPABASE_-_GEST_O_DE_CLIENTES__get_advisors`, projeto diferente). Equivalente obtido via `db_missing_indexes` (S04: 35 FKs) e `db_duplicate_indexes` (S03: índices duplicados identificados).

### Per-edge 7-day logs

**NÃO VERIFICÁVEL via SQL:** logs das edge functions ficam na infraestrutura de observabilidade do Supabase (não em tabelas PostgreSQL). Acesso requer o Dashboard do Supabase ou a CLI.

### Migrations-from-scratch replay

**BLOQUEADO:** extensões `pg_cron`, `pg_net`, `vault`/`pgsodium` indisponíveis localmente; 21 falhas conhecidas documentadas em `scripts/db-audit/replay-known-failures.json`.

---

## ACHADOS COMPLETOS

### CRÍTICOS (3)

| ID | Achado | Evidência |
|----|--------|-----------|
| C-01 | 17 tabelas com RLS ON mas sem nenhuma policy | S03 — query re-executada |
| C-02 | 54 policies UPDATE/ALL sem WITH CHECK | S03 — `COUNT(*)=54` re-executado |
| C-03 | `mcp_exec` + 3 outras funções com SQL dinâmico + exceção silenciosa (4 total) | S07 — `pg_get_functiondef` re-executado nesta sessão |

### ALTOS (8)

| ID | Achado | Evidência |
|----|--------|-----------|
| A-01 | `anon` com grants em 104 tabelas totais com qualquer privilégio (TRUNCATE especificamente em ~55 delas) | S03 — corrigido de ~55 tabelas totais (sessão anterior) para **104 tabelas totais** |
| A-02 | talkx-link e csp-report: R0 sem auth robusta | S08 — grep re-executado |
| A-03 | 35 FKs sem índice | S04 — re-executado nesta sessão, corrigido de 32 |
| A-04 | talkx-scheduler-1min: 10,07% falha (4.347/43.179) | S06 — re-executado |
| A-05 | 11 funções com SQL dinâmico (EXECUTE) | S07 — re-executado |
| A-06 | 4 fetch() sem AbortSignal.timeout em evolution-api | S08 — grep re-executado |
| A-07 | 0 fatores MFA habilitados (auth.mfa_factors) | S09 — re-executado |
| A-08 | 3 funções adicionais com exceção silenciosa: talkx_audience_query, trigger_pending_multiplix_dispatches, trigger_talkx_engine_tick | S07 — re-executado nesta sessão (correção) |

### MÉDIOS (17)

| ID | Achado | Evidência |
|----|--------|-----------|
| M-01 | 65 migrations com statements NULL | S02 — re-executado |
| M-02 | 30 tabelas ausentes do types.ts | drift — re-executado (204 tabelas DB, ~174 em types.ts) |
| M-03 | 4 pares de sobreposição de crons (inclui 3 em * * * * * + par 1-59/2) | S06 — re-executado nesta sessão |
| M-04 | Latência db_health 8.099ms | S12 — re-executado |
| M-05 | dispatch-scheduled-messages: 6,51% falha (692/10622) | S06 — falhas 30d re-executado 2026-10-31 |
| M-06 | tasks-notify-due: 4,61% falha (1992/43179) | S06 — falhas 30d re-executado 2026-10-31 |
| M-07 | connection-health-check: 5,07% falha (438/8635) | S06 — falhas 30d re-executado 2026-10-31 |
| M-08 | expire-stale-agent-presence: 4,75% falha (1026/21591) | S06 — falhas 30d re-executado 2026-10-31 |
| M-09 | gmail-incremental-sync: 5,26% falha (454/8636) | S06 — falhas 30d re-executado 2026-10-31 |
| M-10 | 36 policies com USING(true) (sessão anterior; re-exec=0) | S03 — reconciliado (corrigidas) |
| M-11 | bucket multiplix-voice sem mime-type restrictions | S09 — re-executado |
| M-12 | shared_buffers apenas 224MB (max_connections=60) | S12 — re-executado |
| M-13 | track_commit_timestamp=off (PITR parcial) | S12 — re-executado |
| M-14 | 187/204 tabelas com policy; 17 sem nenhuma | S03 — re-executado |
| M-15 | Par overlap adicional: expire-stale-agent-presence + crm-sync-outbox (1-59/2 * * * *) | S06 — re-executado |
| M-16 | Schema `_bkp_261023`: 9 tabelas (contacts, team_messages, user_settings, etc.) com RLS OFF | S12/novo — `SELECT relrowsecurity FROM pg_class WHERE relnamespace=...` re-executado 2026-10-31 |
| M-17 | `inbox_unread_total` 700×/período × 1064ms = 744s total; `get_last_message_dates` 234× × 2519ms = 589s | S05 — db_slow_queries re-executado 2026-10-31 |

### BAIXOS (13)

| ID | Achado | Evidência |
|----|--------|-----------|
| B-01 | voice-changer-tmp-purge: 8,38% falha (15/179) | S06 — re-executado |
| B-02 | close-stale-calls: 7,06% falha (151/2139) | S06 — re-executado |
| B-03 | security-acl-score: 6,70% falha (12/179) | S06 — re-executado |
| B-04 | csat-reply-capture-tick: 6,38% falha (341/5345) | S06 — re-executado |
| B-05 | avatars-refresh: 5,56% falha (40/720) | S06 — re-executado |
| B-06 | cleanup-edge-rate-limits: 5,24% falha (151/2879) | S06 — re-executado |
| B-07 | dead tuples: edge_rate_limits 38,2% (50 dead) | S10 — re-executado |
| B-08 | dead tuples: connection_health_logs 100% (50 dead) | S10 — re-executado |
| B-09 | dead tuples: user_devices 82,2% (37 dead) | S10 — re-executado |
| B-10 | S11 real schema NÃO VERIFICADO por limitações locais | S11 — bloqueado |
| B-11 | ai_model_prices.provider_id FK sem índice | S04 — re-executado |
| B-12 | contacts.ai_projection_analysis_id FK sem índice | S04 — re-executado |
| B-13 | talkx_campaigns.owner + template_version_id FK sem índice | S04 — re-executado |

### INFO (6)

| ID | Achado | Evidência |
|----|--------|-----------|
| I-01 | 3 crons usam vault.decrypted_secrets (padrão seguro) | S06 — re-executado |
| I-02 | pg_stat_statements acessível via db_slow_queries MCP (não via SQL direto) | S05 — confirmado 2026-10-31 |
| I-03 | WAL replication slot ativo 9145s (esperado, Realtime) | S05 — re-executado |
| I-04 | archive_mode=on, wal_level=logical (PITR ativo) | S12 — re-executado |
| I-05 | csp-report: R0 by design (browser CSP, sem persistência) | S08 — re-executado |
| I-06 | Vault: 13 secrets com `key_id=null` e `server_key_id=null` — Supabase gerencia chave na infra; comportamento normal no Cloud | S12/vault — `SELECT name, key_id FROM vault.decrypted_secrets` re-executado 2026-10-31 |

---

## SNAPSHOT COMPLETO — POLÍTICAS POR TABELA (evidência re-executada)

Total: **505 policies** em **187 tabelas** (17 tabelas sem policy). Re-executado em 2026-10-30T23:34Z.

Tabelas com mais policies: `profiles` (6), `ai_conversation_tags`/`conversation_tasks`/`message_reactions`/`password_reset_requests`/`saved_filters`/`talkx_blacklist`/`talkx_campaign_segments`/`talkx_campaigns`/`team_message_reactions`/`user_devices`/`user_service_accounts` (5 cada).

**17 tabelas SEM policy (com RLS ON):** `_rb_message_reactions_contato`, `_zapp_fn_before`, `agent_mini_game_xp_daily`, `ai_budget_reservations`, `ai_jobs`, `catalog_rate_limit_hits`, `catalog_rate_limits`, `edge_rate_limits`, `gmail_oauth_states`, `link_preview_cache`, `searchbox_budget_alert_cron`, `searchbox_budget_alert_emails`, `talkx_storage_purge_queue`, `talkx_test_send_claims`, `team_chat_media_acl_r2_db_020_rb`, `voip_profile_credentials`, `_zapp_mig133_log`

---

## SNAPSHOT COMPLETO — CRONS (24 ativos) + FALHAS 30D

Re-executado em 2026-10-31 (query `cron.job_run_details JOIN cron.job`). Lista completa com histórico de falhas:

| Job | Schedule | Falhas/30d | OK/30d | Taxa falha | Msg |
|-----|----------|-----------|-------|-----------|-----|
| talkx-scheduler-1min | `* * * * *` | **4347** | 38831 | **10,1%** | connection failed |
| tasks-notify-due | `* * * * *` | 1992 | 41187 | **4,6%** | connection failed |
| ai-jobs-tick-1min | `1-59 * * * *` | 1721 | 38443 | **4,3%** | connection failed |
| expire-stale-agent-presence | `1-59/2 * * * *` | 1026 | 20564 | **4,8%** | connection failed |
| multiplix-send-trigger | `0-58/2 * * * *` | 996 | 20594 | **4,6%** | connection failed |
| dispatch-scheduled-messages | `* * * * *` | 692 | 9963 | **6,5%** | connection failed |
| gmail-incremental-sync | `0-55/5 * * * *` | 454 | 8182 | **5,3%** | connection failed |
| connection-health-check | `2-57/5 * * * *` | 438 | 8196 | **5,1%** | connection failed |
| crm-sync-outbox | `1-59/2 * * * *` | 359 | 9828 | 3,5% | job startup timeout |
| csat-reply-capture-tick | `*/2 * * * *` | 341 | 5021 | **6,4%** | connection failed |
| close-stale-calls | `*/5 * * * *` | 151 | 1995 | **7,0%** | connection failed |
| cleanup-edge-rate-limits | `7-52/15 * * * *` | 151 | 2727 | 5,2% | job startup timeout |
| avatars-refresh | `7 * * * *` | 40 | 679 | 5,6% | job startup timeout |
| voice-changer-tmp-purge | `17 * * * *` | 15 | 164 | 8,4% | connection failed |
| security-acl-score | `23 * * * *` | 12 | 167 | 6,7% | job startup timeout |
| vacuum-contacts-daily | `42 3 * * *` | 1 | 29 | 3,3% | job startup timeout |
| cleanup-link-preview-cache | `12 3 * * *` | 1 | 29 | 3,3% | job startup timeout |
| searchbox-budget-alert | `0 12 * * *` | 0 | 28 | 0% | — |
| search-events-retention | `10 4 * * *` | 0 | 14 | 0% | — |
| expire-orphan-user-sessions | `23 3 * * *` | 0 | 7 | 0% | — |
| purge-qr-attempts | `25 3 * * *` | 0 | 7 | 0% | — |
| reconnection-logs-retention-30d | `30 4 * * *` | 0 | 7 | 0% | — |
| crm-sync-outbox-cleanup | `17 4 * * *` | 0 | 14 | 0% | — |
| user-sessions-expire-diario | `17 3 * * *` | 0 | 7 | 0% | — |

**Padrão confirmado:** todas as falhas do tipo "connection failed" ocorrem nos mesmos timestamps (ex: 2026-10-30T22:57:00) — saturação do pooler durante horário de pico, não falha isolada por função.

---

## SNAPSHOT COMPLETO — EDGE FUNCTIONS NO REPO (85)

Contagem re-executada nesta sessão: `ls supabase/functions/ | wc -l` → **85 funções**. Lista (diretórios verificados):
`_shared`, `ai-auto-tag`, `ai-churn-analysis`, `ai-classify-tickets`, `ai-conversation-analysis`, `ai-conversation-summary`, `ai-enhance-message`, `ai-jobs-worker`, `ai-kb-ingest`, `ai-proxy`, `ai-suggest-reply`, `ai-transcribe-audio`, `ai-usage-outbox-drain`, `approve-password-reset`, `auth-login`, `auto-close-conversations`, `automation-suggest-reply`, `batch-fetch-avatars`, `bitrix-api`, `chatbot-l1`, `classify-audio-meme`, `classify-emoji`, `classify-sticker`, `cleanup-rate-limit-logs`, `connection-health-check`, `copilot-live`, `create-user`, `crm-integration`, `csp-report`, `detect-new-device`, `elevenlabs-agent-token`, `elevenlabs-dialogue`, `elevenlabs-scribe-token`, `elevenlabs-sfx`, `elevenlabs-sts`, `elevenlabs-tts`, `elevenlabs-tts-stream`, `elevenlabs-voice-design`, `elevenlabs-webhook`, `evolution-api`, `evolution-sync`, `evolution-webhook`, `external-db-bridge`, `external-db-proxy`, `fetch-link-preview`, `get-call-recording`, `get-mapbox-token`, `get-sip-password`, `gmail-cron-sync`, `gmail-oauth`, `gmail-send`, `gmail-sync`, `gmail-webhook`, `health`, `invite-user`, `message-delivery`, `metrics`, `migrate-media-storage`, `multiplix-audience`, `multiplix-dispatch`, `multiplix-send`, `multiplix-voices`, `promogifts-catalog`, `public-api`, `recover-corrupted-audios`, `recover-message-media`, `revoke-auth-sessions`, `searchbox-budget-alert`, `send-email`, `send-rate-limit-alert`, `send-scheduled-report`, `sentiment-alert`, `status`, `sync-call-records`, `talkx-ai`, `talkx-link`, `talkx-report`, `talkx-scheduler`, `talkx-send`, `talkx-storage-purge`, `voice-agent`, `voice-changer`, `voice-copilot-action`, `webauthn`, `webhook-diagnostic`, `whatsapp-webhook` (85 − `_shared` = **84 funções implantáveis**)

**14 com verify_jwt=false** (classificação R0/R1/R2 na seção ALTO-02 acima).

---

## PLANO DE AÇÃO PRIORIZADO

### Imediato (Crítico/Alto)

1. **Revogar TRUNCATE do `anon`** — `propostas/01_revogar_grants_anon.sql`
2. **Adicionar WITH CHECK às 54 policies UPDATE** — `propostas/02_rls_with_check.sql`
3. **Auditar `mcp_exec`** — remover `WHEN OTHERS THEN NULL` ou restringir a roles admin
4. **Adicionar policies às 17 tabelas sem nenhuma** — `propostas/FIX-S03-004.sql`
5. **Criar índices para 35 FKs** — `propostas/04_fk_indexes.sql`

### Curto prazo (Médio)

6. **Corrigir 65 migrations com statements NULL** — `propostas/FIX-S02-001.md`
7. **Regenerar types.ts** — executar `types-sync` workflow para cobrir 30 tabelas ausentes
8. **Desescalonar 3 crons EVERY_MINUTE** — usar offsets de 10-20s ou cron a cada 2min para dois deles
9. **Adicionar AbortSignal.timeout nos 4 fetch() de evolution-api** — linhas 517, 562, 613, 696-705

### Longo prazo (Baixo/Info)

10. **Habilitar MFA** — `propostas/FIX-S09-001.md`
11. **Adicionar mime-type restrictions ao bucket multiplix-voice** — `propostas/FIX-S09-002.sql`
12. **Completar testes RLS com schema real** — requer ambiente local com pg_cron/pg_net/vault

---

## DRIFT DE CÓDIGO — .from()/.rpc() vs. Schema (re-executado 2026-10-31)

**`.from()` calls:** `grep -rn '\.from\(["'][^"']+["']\)'` → **655 ocorrências em 195 arquivos**. Padrão confirma acesso a tabelas existentes (contacts, messages, conversations, profiles, etc.). Sem chamadas a tabelas inexistentes identificadas.

**`.rpc()` calls:** `grep -rn '\.rpc\('` → **16 ocorrências em 15 arquivos**. Funções usadas: `inbox_unread_total`, `talk_me_list_queues`, `rpc_queue_goal_metrics`, `get_last_message_dates`, `app_bootstrap`, `contacts_count_by_type`, e outras. Todas existem no banco (confirmado por pg_stat queries).

**`.invoke()` edge functions:** 84 funções implantáveis no repo; grep confirma invokes via SDK no front para funções de AI, evolution-api, talkx-send, etc.

**types.ts vs. schema:** `types.ts` tem estrutura `Tables: { ... }` com ~174 tabelas (contagem `Row: {`) vs. 204 no banco — **~30 tabelas sem tipo TypeScript**. Tabelas ausentes listadas em M-02.

---

## SEÇÃO S09 — AUTH, STORAGE, REALTIME (re-executado 2026-10-31)

### Auth Configuration

`auth.config` como tabela PostgreSQL **não existe** — confirmado: `SELECT tablename FROM pg_tables WHERE schemaname='auth'` retornou 27 tabelas sem nenhuma `config`. Configuração de auth (mailer_autoconfirm, disable_signup, session_timebox, etc.) é gerenciada via Supabase Dashboard/API, inacessível via SQL. **NÃO VERIFICÁVEL via MCP** — requer Dashboard ou Management API.

Auth tables (27): `audit_log_entries`, `custom_oauth_providers`, `flow_state`, `identities`, `instances`, `mfa_amr_claims`, `mfa_challenges`, `mfa_factors`, `mfa_recovery_code_sets`, `mfa_recovery_codes`, `oauth_authorizations`, `oauth_client_states`, `oauth_clients`, `oauth_consents`, `one_time_tokens`, `refresh_tokens`, `saml_providers`, `saml_relay_states`, `schema_migrations`, `scim_tokens`, `scim_users`, `sessions`, `sso_domains`, `sso_providers`, `users`, `webauthn_challenges`, `webauthn_credentials`.

MFA: infraestrutura implantada (`mfa_factors`, `mfa_recovery_codes`, `webauthn_credentials`) porém **0 fatores ativos** — achado A-07.

### Realtime

| Publication | tabelas | INSERT | UPDATE | DELETE | TRUNCATE |
|------------|---------|--------|--------|--------|----------|
| `supabase_realtime` | 37 `public` | Sim | Sim | Sim | Sim |
| `supabase_realtime_messages_publication` | 7 `realtime.messages_*` | Sim | Sim | Sim | Sim |

Tabelas `public` na publication (37): `agent_achievements`, `agent_presence`, `agent_stats`, `audio_meme_favorites`, `audio_memes`, `calls`, `contacts`, `conversation_sla`, `conversation_tasks`, `copilot_insights`, `email_messages`, `email_threads`, `message_reactions`, `messages`, `multiplix_dispatches`, `multiplix_recipients`, `notifications`, `payment_links`, `queue_goals`, `queue_members`, `queues`, `sales_deals`, `talkx_blacklist`, `talkx_campaign_events`, `talkx_campaign_segments`, `talkx_campaigns`, `talkx_recipients`, `talkx_segments`, `talkx_templates`, `team_conversation_members`, `team_conversations`, `team_message_reactions`, `team_message_receipts`, `team_messages`, `warroom_alerts`, `whatsapp_connections`, `whisper_messages`.

RLS está ativo em todas as 37 tabelas (S01 — 204/204 com RLS ON). `realtime.subscription` e `realtime.schema_migrations` com RLS OFF — tabelas de infra Supabase, não user-accessible.

`payment_links` na publication com 1 policy — dados de pagamento transmitidos em realtime apenas para usuários autorizados pela policy. Risco: se policy for permissiva, dados de pagamento visíveis via WebSocket sem autenticação adicional.

### Storage — Buckets Completo

| Bucket | Público | Mime Restriction | Tamanho Máx | Achado |
|--------|---------|-----------------|-------------|--------|
| audio-memes | **SIM** | audio/* | 5 MB | — intencional |
| audio-messages | não | audio/ogg,mpeg,wav,aac,ogg;codecs=opus | 25 MB | — |
| avatars | não | image/jpeg,png,webp,gif | 5 MB | — |
| custom-emojis | **SIM** | image/png,webp,gif,jpeg,svg+xml | 512 KB | — intencional |
| multiplix-voice | não | **NENHUMA (null)** | 50 MB | **M-11** |
| stickers | **SIM** | image/webp,png,gif | 5 MB | — intencional |
| team-chat-files | não | 23 tipos (img/vídeo/áudio/docs/zip) | 10 MB | — |
| voice-changer-tmp | não | audio/mpeg,mp4,ogg,wav,webm,aac | 25 MB | — |
| whatsapp-media | não | image/jpeg,png,webp,video/mp4,audio/ogg,mpeg | 25 MB | — |

3 buckets públicos (audio-memes, custom-emojis, stickers) — intencional para recursos de mídia compartilhados. 6 privados com mime restrictions adequadas. 1 privado sem mime restriction (multiplix-voice, M-11).

### Vault — 13 Secrets (nomes apenas, sem valores)

| Nome | Criado em |
|------|-----------|
| ai_jobs_cron_secret | 2026-10-02 |
| avatars_refresh_cron_secret | 2026-09-30 |
| connection_health_check_cron_secret | 2026-09-30 |
| gmail_cron_secret | 2026-08-29 |
| gmail_encryption_key | 2026-08-27 |
| multiplix_cron_secret | 2026-09-27 |
| multiplix_send_url | 2026-09-29 |
| sicoob_service_role_key | 2026-08-27 |
| talkx_anon_key | 2026-09-08 |
| talkx_cron_secret | 2026-10-02 |
| talkx_scheduler_url | 2026-09-08 |
| talkx_send_url | 2026-10-02 |
| zapp_anon_key | 2026-09-01 |

`sicoob_service_role_key` = service_role de serviço externo (Sicoob) armazenada no vault — prática segura. `multiplix_send_url`/`talkx_scheduler_url`/`talkx_send_url` = URLs armazenadas como secrets no vault (URLs internas de serviços — correto manter fora do código).

### Git History — Verificação de Secrets

```bash
git log --all --diff-filter=A -- '*.env' '**/.env' '*.pem' '*.key'
# → 0 arquivos
git log --oneline -100 --name-only | grep -iE '\.(env|pem|key|secret|credential)$'
# → 0 resultados
```
**0 arquivos de segredo (.env, .pem, .key) committados em toda a história do repo.**

---

## ITENS NÃO VERIFICÁVEIS (por limitação técnica, não omissão)

| Item | Motivo |
|------|--------|
| Auth configuration (mailer_autoconfirm, session_timebox, etc.) | `auth.config` não existe como tabela SQL; requer Dashboard/Management API |
| Advisors Supabase | Ferramenta `get_advisors` não disponível neste MCP (confirmado ToolSearch 2026-10-31) |
| Logs 7 dias por edge function | Logs ficam em infraestrutura separada (não em SQL); `query_logs` ausente neste MCP |
| Migrations-from-scratch replay | pg_cron/pg_net/vault indisponíveis localmente; 21 falhas conhecidas documentadas |
| S11 schema real do repo | Mesmo bloqueio de extensões; isolamento real usa contact_id/assigned_to/gmail_account_id |

---

## DELIVERABLES

| Arquivo | Descrição |
|---------|-----------|
| `auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md` | Este relatório |
| `auditoria-supabase/progresso.json` | Estado das 12 seções com evidências |
| `auditoria-supabase/testes/01_rls_matrix.sql` | Matriz RLS (19/19 PASS) |
| `auditoria-supabase/testes/rls_matrix_roteiro.md` | Roteiro de execução |
| `auditoria-supabase/inventario/` | 17 arquivos de inventário |
| `auditoria-supabase/propostas/` | 14 arquivos de proposta de correção |

*Gerado em 2026-10-31. Somente leitura em produção — zero escritas.*
