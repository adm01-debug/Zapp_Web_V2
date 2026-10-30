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
| ALTO       | 7   |
| MÉDIO      | 14  |
| BAIXO      | 13  |
| INFO       | 5   |
| **TOTAL**  | **42** |

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
→ `mcp_exec` (única função com as duas características combinadas)

---

### ALTO-01 — `anon` tem SELECT + TRUNCATE em ~55 tabelas (S03)
**Risco:** `TRUNCATE` para `anon` permite destruição de dados sem autenticação via API pública. Tabelas de risco: `mfa_sessions`, `ip_whitelist`, `payment_links`.

**Evidência (re-executada):**
```sql
SELECT grantee, table_name, string_agg(privilege_type,',') FROM information_schema.table_privileges
WHERE table_schema='public' AND grantee='anon' GROUP BY grantee, table_name
```
→ 60 linhas; anon tem SELECT+TRUNCATE em ~55 tabelas

**Proposta:** `auditoria-supabase/propostas/01_revogar_grants_anon.sql` (FIX-S03-001)

---

### ALTO-02 — 14 funções verify_jwt=false: classificação R0/R1/R2 (S08)
**Risco:** Funções sem validação JWT podem ser chamadas por qualquer pessoa. A classificação determina o risco residual.

**Evidência (re-executada nesta sessão):**
```bash
grep -B5 "verify_jwt = false" supabase/config.toml | grep -E "^\[functions\.|verify_jwt"
# → 14 seções [functions.X] com verify_jwt = false
grep "HMAC\|verifyHmac\|x-cron-secret\|CRON_SECRET\|Authorization" supabase/functions/*/index.ts
```

| Função | Classe | Mecanismo |
|--------|--------|-----------|
| evolution-webhook | **R2** | HMAC via `WebhookSecurityService` |
| whatsapp-webhook | **R2** | HMAC via `verifyMetaWebhookSignature` |
| gmail-webhook | **R2** | OIDC via `verifyGmailOidcRequest` |
| elevenlabs-webhook | **R2** | Assinatura via `verifyElevenLabsSignature` |
| talkx-link | **R2** | HMAC via `x-talkx-signature` + `verifyHmacSignature` |
| gmail-cron-sync | **R1** | `x-cron-secret` contra `CRON_SECRET` |
| batch-fetch-avatars | **R1** | `x-cron-secret` (L5 cron credential) |
| searchbox-budget-alert | **R1** | `cron-secret-auth.ts` + `x-cron-secret` |
| sync-call-records | **R1** | `Authorization` header |
| connection-health-check | **R1** | API key interna |
| auth-login | **R1** | Valida credenciais + lockout (ADR-006) |
| crm-integration | **R1** | Validação via _shared (confirmado) |
| csp-report | **R0** | Sem auth (by design, browser CSP, sem persistência DB) |
| public-api | **R0** (desativada) | Retorna 410 Gone incondicionalmente |

**Risco real R0:** apenas `csp-report` (sem persistência, apenas logging) e `public-api` (desativada). Nenhuma função R0 com acesso ao banco de dados.

---

### ALTO-03 — 32 FKs sem índice (S04)
**Risco:** Full scan na tabela referenciada a cada DELETE/UPDATE na tabela pai. Impacto em `talkx_campaigns.owner`, `contacts.ai_projection_analysis_id`, `conversation_events.from_queue_id`.

**Evidência (re-executada):** query S04 → **32 FKs** sem índice

**Proposta:** `auditoria-supabase/propostas/04_fk_indexes.sql`

---

### ALTO-04 — talkx-scheduler-1min: 10,07% de falha em 30 dias (S06)
**Risco:** 4.347 falhas em 43.179 execuções. Cron principal do TalkX falha 1 a cada 10 vezes.

**Evidência (re-executada):**
```sql
SELECT jobname, COUNT(*) FILTER(WHERE status='failed') as failed, COUNT(*) as total,
  ROUND(100.0*COUNT(*) FILTER(WHERE status='failed')/COUNT(*),2) as pct_fail
FROM cron.job_run_details d JOIN cron.job j USING(jobid)
WHERE d.start_time > NOW()-INTERVAL'30 days'
GROUP BY jobname ORDER BY pct_fail DESC LIMIT 12
```
Top: `talkx-scheduler-1min` 10,07%, `voice-changer-tmp-purge` 8,38%, `close-stale-calls` 7,06%.

---

### MÉDIO-01 — 65 migrations com statements NULL no ledger (S02)
**Risco:** Reexecução do histórico impossível; violação da regra 7 do CLAUDE.md.

**Evidência (re-executada):**
```sql
SELECT COUNT(*) FROM supabase_migrations.schema_migrations WHERE statements IS NULL
```
→ **65** linhas (de 1.064 total)

---

### MÉDIO-02 — 30 tabelas ausentes do types.ts (drift)
**Risco:** Acesso via `.from()` sem tipos retorna `any`, impedindo detecção de bugs em compilação.

**Evidência (re-executada nesta sessão):**
```bash
grep -c "Row: {" src/integrations/supabase/types.ts  # → 184
# Produção: 204 tabelas → drift de ~20 tabelas reais
```
Tabelas ausentes (30): `agent_mini_game_xp_daily`, `ai_usage_outbox`, `app_settings`, `contact_block_audit`, `contact_protection_policy`, `copilot_insights`, `copilot_sessions`, `email_signatures`, `instance_pauses`, `message_attempts`, `message_favorites`, `message_pins`, `message_reports`, `outbox_events`, `qr_attempts`, `reconnection_logs`, `searchbox_budget_alert_cron`, `searchbox_budget_alert_emails`, `security_acl_alerts`, `sla_alert_events`, `sla_alert_preferences`, `talkx_contact_attributes`, `talkx_data_jobs`, `talkx_help_views`, `talkx_segment_fields`, `talkx_segment_library_history`, `talkx_segment_versions`, `talkx_test_sends`, `team_chat_media_acl_r2_db_020_rb`, `voip_profile_credentials`

---

### MÉDIO-03 — 3 crons EVERY_MINUTE simultâneos (S06)
**Risco:** Saturação do pool de 60 conexões com 3 crons concorrentes todo minuto.

**Evidência:** `talkx-scheduler-1min`, `dispatch-scheduled-messages`, `tasks-notify-due` — todos com schedule `* * * * *`.

---

## STATUS DAS 12 SEÇÕES

| Seção | Título | Status | Evidência Re-executada |
|-------|--------|--------|------------------------|
| S01 | RLS 100% ativado | **CONCLUIDO** | Sim — 204/204 tabelas com RLS ON |
| S02 | Integridade do ledger | **CONCLUIDO** | Sim — 65 NULL statements, 1064 total |
| S03 | Grants excessivos e policies | **CONCLUIDO** | Sim — 54 UPDATE sem WITH CHECK, 17 sem policy, 60 grants anon |
| S04 | FKs sem índice | **CONCLUIDO** | Sim — 32 FKs |
| S05 | Queries lentas / pg_stat | **CONCLUIDO** | Sim — pg_stat ausente (plano); EXPLAIN contacts executado |
| S06 | pg_cron: 24 jobs | **CONCLUIDO** | Sim — falhas por job confirmadas, top 12 listados |
| S07 | Funções com SQL dinâmico | **CONCLUIDO** | Sim — 11 EXECUTE, mcp_exec com exceção silenciosa |
| S08 | Edge functions verify_jwt=false | **CONCLUIDO** | Sim — 14 funções, R0/R1/R2 classificadas |
| S09 | MFA e storage | **CONCLUIDO** | Sim — 0 fatores MFA, 9 buckets |
| S10 | Dead tuples / bloat | **CONCLUIDO** | Sim — < 50 dead tuples por tabela |
| S11 | Testes RLS matriz tenant A×B | **CONCLUIDO_PARCIAL** | Sim — 19/19 PASS schema simplificado; real BLOQUEADO |
| S12 | PITR / configurações | **CONCLUIDO** | Sim — archive_mode=on, wal_level=logical |

### S11 — Detalhamento do CONCLUIDO_PARCIAL

**Schema simplificado (org_id) — TESTADO E PASSANDO:**
- Banco: PostgreSQL 16 local, database `rls_test`, role `rls_tester` (NOSUPERUSER)
- 19 testes PASS + 1 INFO; tabelas: `messages`, `contacts`, `email_threads`, `profiles`
- Arquivo: `auditoria-supabase/testes/01_rls_matrix.sql`

**Schema real do repo — NÃO VERIFICADO:**
- Motivo: `pg_cron`, `pg_net`, `vault`/`pgsodium` indisponíveis localmente; 21 falhas conhecidas
- O isolamento real usa `contact_id`/`assigned_to`/`gmail_account_id`, não `org_id`

### S05 — Limitação confirmada

**pg_stat_statements:** ausente neste plano (`relation "pg_stat_statements" does not exist`).  
**EXPLAIN:** executado em `contacts` → Index Scan via `idx_contacts_assigned_to_gamif`, custo 13.87..345.56.  
**pg_stat_activity:** query mais longa = Realtime WAL slot (9145s, esperado); demais < 1s.

---

## ITENS NÃO VERIFICÁVEIS (limitação técnica, não omissão)

| Item | Motivo |
|------|--------|
| Advisors Supabase | `get_advisors` não disponível neste MCP |
| Logs 7 dias por edge function | Infraestrutura de logs separada (não SQL) |
| pg_stat_statements top-20 | Extensão ausente neste plano |
| Migrations-from-scratch replay | pg_cron/pg_net/vault indisponíveis localmente |
| Callers por função SQL dinâmica | Requer análise estática TypeScript (fora do escopo) |
| S11 schema real do repo | Mesmas limitações de extensões |

---

## ACHADOS COMPLETOS

### CRÍTICOS (3)

| ID | Achado | Evidência |
|----|--------|-----------|
| C-01 | 17 tabelas com RLS ON mas sem nenhuma policy | S03 — re-executada |
| C-02 | 54 policies UPDATE/ALL sem WITH CHECK | S03 — `COUNT(*)=54` re-executado |
| C-03 | `mcp_exec` com SQL dinâmico + exceção silenciosa | S07 — `pg_get_functiondef` re-executado |

### ALTOS (7)

| ID | Achado | Evidência |
|----|--------|-----------|
| A-01 | `anon` com TRUNCATE em ~55 tabelas | S03 — re-executado |
| A-02 | 2 funções R0 (csp-report sem persistência; public-api desativada) | S08 — grep re-executado |
| A-03 | 32 FKs sem índice | S04 — re-executado |
| A-04 | talkx-scheduler-1min: 10,07% falha/30d | S06 — re-executado |
| A-05 | 11 funções com SQL dinâmico (EXECUTE) | S07 — re-executado |
| A-06 | 4 fetch() sem AbortSignal.timeout em evolution-api | S08 — grep re-executado |
| A-07 | 0 fatores MFA habilitados | S09 — re-executado |

### MÉDIOS (14)

| ID | Achado | Evidência |
|----|--------|-----------|
| M-01 | 65 migrations com statements NULL | S02 — re-executado |
| M-02 | 30 tabelas ausentes do types.ts | Drift — re-executado nesta sessão |
| M-03 | 3 crons simultâneos EVERY_MINUTE | S06 — re-executado |
| M-04 | Latência db_health 8.099ms (elevada) | S12 — re-executado |
| M-05 | dispatch-scheduled-messages: 6,51% falha | S06 — re-executado |
| M-06 | tasks-notify-due: 4,61% falha | S06 — re-executado |
| M-07 | connection-health-check: 5,07% falha | S06 — re-executado |
| M-08 | expire-stale-agent-presence: 4,75% falha | S06 — re-executado |
| M-09 | gmail-incremental-sync: 5,26% falha | S06 — re-executado |
| M-10 | 36 USING(true) em sessão anterior (agora 0 — corrigidas) | S03 — reconciliado |
| M-11 | bucket multiplix-voice sem mime-type restrictions | S09 — re-executado |
| M-12 | shared_buffers 224MB / max_connections=60 | S12 — re-executado |
| M-13 | track_commit_timestamp=off | S12 — re-executado |
| M-14 | 187/204 tabelas com policy; 17 sem nenhuma | S03 — re-executado |

### BAIXOS (13)

| ID | Achado |
|----|--------|
| B-01 | voice-changer-tmp-purge: 8,38% falha |
| B-02 | close-stale-calls: 7,06% falha |
| B-03 | security-acl-score: 6,70% falha |
| B-04 | csat-reply-capture-tick: 6,38% falha |
| B-05 | avatars-refresh: 5,56% falha |
| B-06 | cleanup-edge-rate-limits: 5,24% falha |
| B-07 | dead tuples: edge_rate_limits 38,2% |
| B-08 | dead tuples: connection_health_logs 100% |
| B-09 | dead tuples: user_devices 82,2% |
| B-10 | S11 schema real NÃO VERIFICADO |
| B-11 | ai_model_prices.provider_id FK sem índice |
| B-12 | contacts.ai_projection_analysis_id FK sem índice |
| B-13 | talkx_campaigns.owner + template_version_id FK sem índice |

### INFO (5)

| ID | Achado |
|----|--------|
| I-01 | 3 crons usam vault.decrypted_secrets (padrão seguro) |
| I-02 | pg_stat_statements ausente neste plano |
| I-03 | WAL replication slot ativo 9145s (esperado, Realtime) |
| I-04 | archive_mode=on, wal_level=logical (PITR ativo) |
| I-05 | csp-report: R0 by design (sem persistência no DB) |

---

## SNAPSHOT COMPLETO — POLÍTICAS POR TABELA

Re-executado em 2026-10-30T23:34Z. **505 policies** em **187 tabelas** (17 sem policy).

**17 tabelas SEM policy (com RLS ON):** `_rb_message_reactions_contato`, `_zapp_fn_before`, `agent_mini_game_xp_daily`, `ai_budget_reservations`, `ai_jobs`, `catalog_rate_limit_hits`, `catalog_rate_limits`, `edge_rate_limits`, `gmail_oauth_states`, `link_preview_cache`, `searchbox_budget_alert_cron`, `searchbox_budget_alert_emails`, `talkx_storage_purge_queue`, `talkx_test_send_claims`, `team_chat_media_acl_r2_db_020_rb`, `voip_profile_credentials`, `_zapp_mig133_log`

---

## SNAPSHOT COMPLETO — CRONS (24 ativos)

`ai-jobs-tick-1min`, `avatars-refresh`, `cleanup-edge-rate-limits`, `cleanup-link-preview-cache`, `close-stale-calls`, `connection-health-check`, `crm-sync-outbox`, `crm-sync-outbox-cleanup`, `csat-reply-capture-tick`, `dispatch-scheduled-messages`, `expire-orphan-user-sessions`, `expire-stale-agent-presence`, `gmail-incremental-sync`, `multiplix-send-trigger`, `purge-qr-attempts`, `reconnection-logs-retention-30d`, `search-events-retention`, `searchbox-budget-alert`, `security-acl-score`, `talkx-scheduler-1min`, `tasks-notify-due`, `user-sessions-expire-diario`, `vacuum-contacts-daily`, `voice-changer-tmp-purge`

---

## SNAPSHOT COMPLETO — EDGE FUNCTIONS (85 diretórios no repo)

Re-executado nesta sessão: `ls supabase/functions/` → 85 entradas (84 funções implantáveis + `_shared`).

**14 com verify_jwt=false** (lista e classificação na seção ALTO-02 acima).

---

## PLANO DE AÇÃO PRIORIZADO

### Imediato (Crítico/Alto)
1. **Revogar TRUNCATE do `anon`** — `propostas/01_revogar_grants_anon.sql`
2. **Adicionar WITH CHECK às 54 policies UPDATE** — `propostas/02_rls_with_check.sql`
3. **Auditar `mcp_exec`** — remover exceção silenciosa ou restringir a roles admin
4. **Policies para 17 tabelas sem nenhuma** — `propostas/FIX-S03-004.sql`
5. **Criar índices para 32 FKs** — `propostas/04_fk_indexes.sql`

### Curto prazo (Médio)
6. **Corrigir 65 migrations NULL** — `propostas/FIX-S02-001.md`
7. **Regenerar types.ts** — executar `types-sync` para cobrir 30 tabelas ausentes
8. **Desescalonar 3 crons simultâneos** — offsets de 10-20s para dois deles
9. **Adicionar AbortSignal.timeout nos 4 fetch() em evolution-api** — linhas 517, 562, 613, 696-705

### Longo prazo (Baixo/Info)
10. **Habilitar MFA** — `propostas/FIX-S09-001.md`
11. **Restrições mime-type no bucket multiplix-voice** — `propostas/FIX-S09-002.sql`
12. **Testes RLS com schema real** — requer ambiente com pg_cron/pg_net/vault

---

## DELIVERABLES

| Arquivo | Descrição |
|---------|----------|
| `auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md` | Este relatório |
| `auditoria-supabase/progresso.json` | Estado das 12 seções |
| `auditoria-supabase/testes/01_rls_matrix.sql` | Matriz RLS (19/19 PASS) |
| `auditoria-supabase/inventario/` | 17 arquivos de inventário |
| `auditoria-supabase/propostas/` | 14 arquivos de proposta de correção |

*Gerado em 2026-10-30. Somente leitura em produção — zero escritas.*
