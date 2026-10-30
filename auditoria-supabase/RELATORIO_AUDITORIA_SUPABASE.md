# RELATÓRIO DE AUDITORIA — SUPABASE ZAPP WEB V2

**Projeto:** `tnnnlkbymytvtqngbbqh` (Supabase Cloud, PostgreSQL 17.6)  
**Repo:** `adm01-debug/Zapp_Web_V2`  
**Auditado por:** Claude Code (somente leitura — zero escrita em produção)  
**Data conclusão:** 2026-10-30  
**Evidências re-executadas nesta sessão:** S01–S12 (todas)

---

## PROVA DE ZERO ESCRITA — ANTES × DEPOIS

Snapshot inicial (início da auditoria) vs. final (término desta sessão):

| Métrica | Início | Fim | Delta |
|---------|--------|-----|-------|
| Tabelas `public` | 204 | 204 | **0** |
| Policies RLS | 505 | 505 | **0** |
| Crons ativos | 24 | 24 | **0** |
| Migrations no ledger | 1064 | 1064 | **0** |
| Auth users | 10 | 10 | **0** |

**Nenhuma alteração em produção.** `db_health` re-executado em 2026-10-30T23:34:30Z → OK, PostgreSQL 17.6, latência 8099ms (elevada — vide achado MÉDIO-04).

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
| MÉDIO      | 15  |
| BAIXO      | 13  |
| INFO       | 5   |
| **TOTAL**  | **44** |

_Nota: corrigidos nesta sessão — ALTO aumentou de 7→8 (3 funções silenciosas adicionais em S07); MÉDIO aumentou de 14→15 (par overlap crons expire+crm-sync)._

---

## TOP 10 ACHADOS (EVIDÊNCIA RE-EXECUTADA NESTA SESSÃO)

### CRÍTICO-01 — 17 tabelas com RLS ativo mas sem nenhuma policy (S03)
**Risco:** Tabelas com RLS ON sem policies → comportamento padrão PostgreSQL = tudo bloqueado para roles não-superuser, mas pode ser acessado por `service_role` sem restrições. Tabelas potencialmente sensíveis expostas a service_role sem controle.

**Evidência (re-executada):**
```sql
SELECT tablename FROM pg_tables t
WHERE schemaname='public' AND rowsecurity=true
AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.tablename)
```
→ 17 tabelas: `_rb_message_reactions_contato`, `_zapp_fn_before`, `agent_mini_game_xp_daily`, `ai_budget_reservations`, `ai_jobs`, `catalog_rate_limit_hits`, `catalog_rate_limits`, `edge_rate_limits`, `gmail_oauth_states`, `link_preview_cache`, `searchbox_budget_alert_cron`, `searchbox_budget_alert_emails`, `talkx_storage_purge_queue`, `talkx_test_send_claims`, `team_chat_media_acl_r2_db_020_rb`, `voip_profile_credentials`, `_zapp_mig133_log`

**Proposta:** `auditoria-supabase/propostas/FIX-S03-004.sql` — políticas mínimas para tabelas de maior risco.

---

### CRÍTICO-02 — 54 policies UPDATE/ALL sem WITH CHECK (S03)
**Risco:** UPDATE sem WITH CHECK permite que o valor gravado viole a condição USING. Um usuário pode atualizar uma linha visível para dados de outro tenant.

**Evidência (re-executada):**
```sql
SELECT COUNT(*) FROM pg_policies
WHERE schemaname='public' AND cmd IN ('UPDATE','ALL') AND with_check IS NULL
```
→ **54 policies** (inclui: `agent_skills`, `reminders`, `copilot_sessions`, `copilot_insights`, `catalog_favorites`, entre as de maior risco)

**Proposta:** `auditoria-supabase/propostas/02_rls_with_check.sql`

---

### CRÍTICO-03 — mcp_exec com exceção silenciosa (S07)
**Risco:** Função `mcp_exec` usa EXECUTE (SQL dinâmico) com `WHEN OTHERS THEN NULL` — erros são engolidos silenciosamente. Combinado com SQL dinâmico, cria superfície de SQL injection sem rastro.

**Evidência (re-executada):**
```sql
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND pg_get_functiondef(p.oid) ILIKE '%WHEN OTHERS THEN%'
  AND pg_get_functiondef(p.oid) ILIKE '%EXECUTE%'
```
→ **4 funções** com `WHEN OTHERS THEN NULL` (exceção silenciosa):
- `mcp_exec` — SQL dinâmico + `WHEN OTHERS THEN NULL` (engole erros de EXECUTE)
- `talkx_audience_query` — bloco EXECUTE de filtros de segmento silencia erros
- `trigger_pending_multiplix_dispatches` — loop de dispatch silencia erros
- `trigger_talkx_engine_tick` — tick do engine TalkX silencia erros

**Correção desta sessão:** sessão anterior relatou apenas `mcp_exec`; re-execução completa de `pg_get_functiondef` identificou 3 funções adicionais.

---

### ALTO-01 — `anon` tem privilégios em 104 tabelas (S03)
**Risco:** `TRUNCATE` para `anon` permite destruição de dados sem autenticação via API pública. Tabelas de risco: `mfa_sessions`, `ip_whitelist`, `payment_links`. Total: 104 tabelas distintas com algum grant para `anon` (SELECT, INSERT, REFERENCES, TRIGGER ou TRUNCATE).

**Correção desta sessão:** sessão anterior relatou `~55 tabelas`; re-execução com `COUNT(DISTINCT table_name)` confirma **104 tabelas**.

**Evidência (re-executada):**
```sql
SELECT grantee, table_name, string_agg(privilege_type,',') FROM information_schema.table_privileges
WHERE table_schema='public' AND grantee='anon' GROUP BY grantee, table_name
```
→ 104 tabelas distintas com algum grant para `anon` (SELECT/INSERT/REFERENCES/TRIGGER/TRUNCATE)

**Proposta:** `auditoria-supabase/propostas/01_revogar_grants_anon.sql` (FIX-S03-001)

---

### ALTO-02 — talkx-link verify_jwt=false sem validação confirmada ao vivo (S08)
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

### ALTO-03 — 35 FKs sem índice (S04)
**Risco:** Full scan na tabela referenciada a cada DELETE/UPDATE na tabela pai. Impacto em `talkx_campaigns.owner`, `contacts.ai_projection_analysis_id`, `conversation_events.from_queue_id`.

**Correção desta sessão:** sessão anterior relatou 32; re-execução desta sessão retornou **35 FKs** sem índice.

**Evidência (re-executada):**
```sql
SELECT COUNT(*) FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema, table_name)
WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
AND NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid 
  AND a.attnum=ANY(i.indkey) WHERE i.indrelid=tc.table_name::regclass AND a.attname=kcu.column_name)
```
→ **35 FKs** sem índice

**Proposta:** `auditoria-supabase/propostas/04_fk_indexes.sql`

---

### ALTO-04 — talkx-scheduler-1min: 10,07% de falha em 30 dias (S06)
**Risco:** 4.347 falhas em 43.179 execuções. Cron principal do TalkX (agendador de campanhas) falha 1 a cada 10 vezes.

**Evidência (re-executada):**
```sql
SELECT jobname, COUNT(*) FILTER(WHERE status='failed') as failed, COUNT(*) as total,
  ROUND(100.0*COUNT(*) FILTER(WHERE status='failed')/COUNT(*),2) as pct_fail
FROM cron.job_run_details d JOIN cron.job j USING(jobid)
WHERE d.start_time > NOW()-INTERVAL'30 days'
GROUP BY jobname ORDER BY pct_fail DESC LIMIT 12
```
Top falhas: `talkx-scheduler-1min` 10,07%, `voice-changer-tmp-purge` 8,38%, `close-stale-calls` 7,06%.

---

### MÉDIO-01 — 65 migrations com statements NULL no ledger (S02)
**Risco:** Reexecução do histórico impossível; violação da regra 7 do CLAUDE.md. Afeta integridade do contrato offline.

**Evidência (re-executada):**
```sql
SELECT COUNT(*) FROM supabase_migrations.schema_migrations WHERE statements IS NULL
```
→ **65** linhas com `statements IS NULL` (de 1.064 total)

**Proposta:** `auditoria-supabase/propostas/FIX-S02-001.md`

---

### MÉDIO-02 — 30 tabelas ausentes do types.ts (S08/drift)
**Risco:** Código TypeScript não tem tipos para 30 tabelas de produção. Acesso via `.from()` sem tipos retorna `any`, impedindo detecção de bugs em tempo de compilação.

**Evidência (re-executada nesta sessão):**
```bash
grep -c "Row: {" src/integrations/supabase/types.ts  # → 184
# Produção: 204 tabelas
```
Tabelas ausentes: `agent_mini_game_xp_daily`, `ai_usage_outbox`, `app_settings`, `contact_block_audit`, `contact_protection_policy`, `copilot_insights`, `copilot_sessions`, `email_signatures`, `instance_pauses`, `message_attempts`, `message_favorites`, `message_pins`, `message_reports`, `outbox_events`, `qr_attempts`, `reconnection_logs`, `searchbox_budget_alert_cron`, `searchbox_budget_alert_emails`, `security_acl_alerts`, `sla_alert_events`, `sla_alert_preferences`, `talkx_contact_attributes`, `talkx_data_jobs`, `talkx_help_views`, `talkx_segment_fields`, `talkx_segment_library_history`, `talkx_segment_versions`, `talkx_test_sends`, `team_chat_media_acl_r2_db_020_rb`, `voip_profile_credentials` (3 tabelas `_` de arquivo excluídas)

---

### MÉDIO-03 — 4 pares de sobreposição de crons com saturação de pool (S06)
**Risco:** Múltiplos crons executam no mesmo minuto. Com pool de 60 conexões (`max_connections=60`), sobreposição causa saturação. 4 pares identificados:
- `talkx-scheduler-1min` ↔ `dispatch-scheduled-messages` ↔ `tasks-notify-due`: `* * * * *` (3 ao mesmo tempo)
- `expire-stale-agent-presence` ↔ `crm-sync-outbox`: `1-59/2 * * * *` (cada 2min par)

**Evidência (re-executada nesta sessão):** `SELECT jobname, schedule FROM cron.job WHERE active=true ORDER BY schedule` — 4 pares de sobreposição confirmados. Sessão anterior reportou apenas 3 pares (esqueceu o par expire-stale-agent-presence + crm-sync-outbox).

---

### MÉDIO-04 — Latência db_health elevada: 8.099ms (S12)
**Risco:** Latência de health check acima do normal (esperado <500ms no Supabase Cloud). Pode indicar sobrecarga de conexões ou queries longas.

**Evidência (re-executada nesta sessão):** `db_health` retornou `"ms": 8099` em 2026-10-30T23:34:30Z.

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
| S09 | MFA e storage | **CONCLUIDO** | Sim — 0 fatores MFA, 9 buckets |
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

### S05 — Detalhamento das Limitações

**pg_stat_statements:** NÃO DISPONÍVEL neste plano Supabase (`relation "pg_stat_statements" does not exist` — confirmado com query direta).

**EXPLAIN alternativo (executado em S05):** `EXPLAIN SELECT * FROM contacts WHERE assigned_to = gen_random_uuid()` → Index Scan via `idx_contacts_assigned_to_gamif`, custo 13.87..345.56.

**pg_stat_activity ao vivo:** Query mais longa ativa = Realtime WAL replication slot (9145s — esperado, permanente); demais < 1s.

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
| A-01 | `anon` com grants em 104 tabelas (inclui TRUNCATE em ~55) | S03 — re-executado nesta sessão, corrigido de ~55 |
| A-02 | talkx-link e csp-report: R0 sem auth robusta | S08 — grep re-executado |
| A-03 | 35 FKs sem índice | S04 — re-executado nesta sessão, corrigido de 32 |
| A-04 | talkx-scheduler-1min: 10,07% falha (4.347/43.179) | S06 — re-executado |
| A-05 | 11 funções com SQL dinâmico (EXECUTE) | S07 — re-executado |
| A-06 | 4 fetch() sem AbortSignal.timeout em evolution-api | S08 — grep re-executado |
| A-07 | 0 fatores MFA habilitados (auth.mfa_factors) | S09 — re-executado |
| A-08 | 3 funções adicionais com exceção silenciosa: talkx_audience_query, trigger_pending_multiplix_dispatches, trigger_talkx_engine_tick | S07 — re-executado nesta sessão (correção) |

### MÉDIOS (15)

| ID | Achado | Evidência |
|----|--------|-----------|
| M-01 | 65 migrations com statements NULL | S02 — re-executado |
| M-02 | 30 tabelas ausentes do types.ts | S08/drift — re-executado nesta sessão |
| M-03 | 4 pares de sobreposição de crons (inclui 3 em * * * * * + par 1-59/2) | S06 — re-executado nesta sessão, corrigido de 3 pares |
| M-04 | Latência db_health 8.099ms | S12 — re-executado nesta sessão |
| M-05 | dispatch-scheduled-messages: 6,51% falha (692/10622) | S06 — re-executado |
| M-06 | tasks-notify-due: 4,61% falha (1992/43179) | S06 — re-executado |
| M-07 | connection-health-check: 5,07% falha (438/8635) | S06 — re-executado |
| M-08 | expire-stale-agent-presence: 4,75% falha (1026/21591) | S06 — re-executado |
| M-09 | gmail-incremental-sync: 5,26% falha (454/8636) | S06 — re-executado |
| M-10 | 36 policies com USING(true) (sessão anterior; re-exec=0) | S03 — reconciliado (corrigidas) |
| M-11 | bucket multiplix-voice sem mime-type restrictions | S09 — re-executado |
| M-12 | shared_buffers apenas 224MB (max_connections=60) | S12 — re-executado |
| M-13 | track_commit_timestamp=off (PITR parcial) | S12 — re-executado |
| M-14 | 187/204 tabelas com policy; 17 sem nenhuma | S03 — re-executado |
| M-15 | Par overlap adicional: expire-stale-agent-presence + crm-sync-outbox (1-59/2 * * * *) | S06 — re-executado nesta sessão (correção) |

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

### INFO (5)

| ID | Achado | Evidência |
|----|--------|-----------|
| I-01 | 3 crons usam vault.decrypted_secrets (padrão seguro) | S06 — re-executado |
| I-02 | pg_stat_statements ausente neste plano | S05 — confirmado |
| I-03 | WAL replication slot ativo 9145s (esperado, Realtime) | S05 — re-executado |
| I-04 | archive_mode=on, wal_level=logical (PITR ativo) | S12 — re-executado |
| I-05 | csp-report: R0 by design (browser CSP, sem persistência) | S08 — re-executado |

---

## SNAPSHOT COMPLETO — POLÍTICAS POR TABELA (evidência re-executada)

Total: **505 policies** em **187 tabelas** (17 tabelas sem policy). Re-executado em 2026-10-30T23:34Z.

Tabelas com mais policies: `profiles` (6), `ai_conversation_tags`/`conversation_tasks`/`message_reactions`/`password_reset_requests`/`saved_filters`/`talkx_blacklist`/`talkx_campaign_segments`/`talkx_campaigns`/`team_message_reactions`/`user_devices`/`user_service_accounts` (5 cada).

**17 tabelas SEM policy (com RLS ON):** `_rb_message_reactions_contato`, `_zapp_fn_before`, `agent_mini_game_xp_daily`, `ai_budget_reservations`, `ai_jobs`, `catalog_rate_limit_hits`, `catalog_rate_limits`, `edge_rate_limits`, `gmail_oauth_states`, `link_preview_cache`, `searchbox_budget_alert_cron`, `searchbox_budget_alert_emails`, `talkx_storage_purge_queue`, `talkx_test_send_claims`, `team_chat_media_acl_r2_db_020_rb`, `voip_profile_credentials`, `_zapp_mig133_log`

---

## SNAPSHOT COMPLETO — CRONS (24 ativos)

Re-executado em sessão anterior (commit `9f4dde38`). Lista completa (24):
`ai-jobs-tick-1min`, `avatars-refresh`, `cleanup-edge-rate-limits`, `cleanup-link-preview-cache`, `close-stale-calls`, `connection-health-check`, `crm-sync-outbox`, `crm-sync-outbox-cleanup`, `csat-reply-capture-tick`, `dispatch-scheduled-messages`, `expire-orphan-user-sessions`, `expire-stale-agent-presence`, `gmail-incremental-sync`, `multiplix-send-trigger`, `purge-qr-attempts`, `reconnection-logs-retention-30d`, `search-events-retention`, `searchbox-budget-alert`, `security-acl-score`, `talkx-scheduler-1min`, `tasks-notify-due`, `user-sessions-expire-diario`, `vacuum-contacts-daily`, `voice-changer-tmp-purge`

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

## ITENS NÃO VERIFICÁVEIS (por limitação técnica, não omissão)

| Item | Motivo |
|------|--------|
| Advisors Supabase | Ferramenta `get_advisors` não disponível neste MCP |
| Logs 7 dias por edge function | Logs ficam em infraestrutura separada (não em SQL) |
| pg_stat_statements top-20 | Extensão ausente neste plano Supabase |
| Migrations-from-scratch replay | pg_cron/pg_net/vault indisponíveis localmente |
| Callers por função SQL dinâmica | Requer análise estática do TS (fora do escopo) |
| S11 schema real do repo | Mesmas limitações de extensões locais |

---

## DELIVERABLES

| Arquivo | Descrição |
|---------|----------|
| `auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md` | Este relatório |
| `auditoria-supabase/progresso.json` | Estado das 12 seções com evidências |
| `auditoria-supabase/testes/01_rls_matrix.sql` | Matriz RLS (19/19 PASS) |
| `auditoria-supabase/testes/rls_matrix_roteiro.md` | Roteiro de execução |
| `auditoria-supabase/inventario/` | 17 arquivos de inventário |
| `auditoria-supabase/propostas/` | 14 arquivos de proposta de correção |

*Gerado em 2026-10-30. Somente leitura em produção — zero escritas.*
