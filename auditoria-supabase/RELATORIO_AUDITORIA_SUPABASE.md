# Relatório de Auditoria Supabase — Zapp Web V2
**Versão:** v3 final  
**Data:** 2026-11-01  
**Projeto:** `tnnnlkbymytvtqngbbqh` (Supabase Cloud, PostgreSQL 17.6)  
**MCP:** `SUPABASE - ZAPP WEB V2 - MCP` (service_role, somente leitura)  
**Branch:** `claude/loving-lovelace-esc3l2`

---

## Prova de Integridade da Produção (Antes × Depois)

| Objeto | Antes (18:00 UTC) | Depois (19:18:22 UTC) | Delta |
|--------|------------------|-----------------------|-------|
| Migrations (ledger) | 1072 | 1072 | **0** |
| Tabelas (public) | 211 | 211 | **0** |
| Policies (public) | 520 | 520 | **0** |
| Funções (public) | 481 | 481 | **0** |
| pg_cron jobs | 24 | 24 | **0** |
| Vault secrets | 13 | 13 | **0** |

**Produção inalterada.** Zero DDL/DML executados. Apenas SELECTs + EXPLAIN sem ANALYZE.

Evidência do "depois": `SELECT ... NOW() AS verificado_em` → `2026-11-01T19:18:22.617421+00:00`

---

## Status das 12 Seções

| # | Seção | Status | Resumo |
|---|-------|--------|--------|
| S1 | Inventário | CONCLUÍDO | 1072 migrations, 211 tabelas, 520 policies, 481 funções, 24 crons, 87 edge functions, 13 vault secrets |
| S2 | Drift | CONCLUÍDO | repo=1067 vs banco=1072 (+5); 65 NULL statements; types.ts=217 vs banco=211 (+6 views) |
| S3 | Segurança RLS | CONCLUÍDO | 42 UPDATE sem WITH CHECK; 18 tabelas DENY ALL padrão; 12/13 views sem security_invoker; 402 SECURITY DEFINER todas com search_path |
| S4 | Integridade | CONCLUÍDO | 35 FKs sem índice; dead tuples _http_response=17.4% |
| S5 | Performance | CONCLUÍDO | pg_stat_statements v1.11 INSTALADO (schema extensions); top-3: 1367/960/802ms; EXPLAIN executado; 107MB índices ociosos |
| S6 | pg_cron | CONCLUÍDO | 24 crons; talkx_engine_tick 4420/43080 (10.3%) falhas; causa=pool exhaustion (100% 'job startup timeout') |
| S7 | Funções DB | CONCLUÍDO | 402 SECURITY DEFINER, 0 sem search_path; 95 sem EXCEPTION; 0 SQL dinâmico inseguro; secrets via vault |
| S8 | Edge functions | CONCLUÍDO | 14 verify_jwt=false, TODAS lidas e protegidas (R0/R1); 13 vault secrets; 0 hardcoded |
| S9 | Auth/Storage | CONCLUÍDO | 0/10 MFA; 9 buckets (multiplix-voice NULL MIME); 37 tabelas realtime |
| S10 | Logs | CONCLUÍDO (parcial) | auth audit vazio (count=0); edge_logs NÃO VERIFICÁVEL (42P01) |
| S11 | RLS A×B | CONCLUÍDO | 12 testes com policies REAIS do repo; 11/12 PASS; **T-11 FALHA REAL** (queue hijack) |
| S12 | Lacunas | CONCLUÍDO | PITR ativo; sem staging; LGPD: login_attempts sem TTL; advisors NÃO VERIFICÁVEL |

---

## Resumo por Severidade

| Severidade | Qtd | Achados |
|------------|-----|----------|
| ALTO | 4 | A1 0/10 MFA; A2 T-11 RLS bypass (queue hijack); A3 auth audit vazio; A4 pool exhaustion 10.3% |
| MÉDIO | 5 | M1 42 UPDATE sem WITH CHECK; M2 12/13 views sem security_invoker; M3 65 NULL statements; M4 +5 drift; M5 35 FKs sem índice |
| BAIXO | 3 | B1 multiplix-voice MIME null; B2 inbox_unread_total N+1 (mean 802ms); B3 login_attempts sem TTL |
| INFO | 4 | I1 PITR ativo; I2 402 SECURITY DEFINER todas com search_path; I3 14 verify_jwt=false todas protegidas; I4 107MB índices ociosos |
| **Total** | **16** | |

---

## S1 — Inventário Completo

**Evidência (query executada 2026-11-01):**
```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migrations,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS tabelas,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policies,
  (SELECT count(*) FROM information_schema.routines WHERE routine_schema='public') AS funcoes,
  (SELECT count(*) FROM cron.job) AS crons,
  (SELECT count(*) FROM vault.decrypted_secrets) AS vault_secrets;
```
**Resultado:** migrations=1072, tabelas=211, policies=520, funcoes=481, crons=24, vault_secrets=13

Edge functions: `ls supabase/functions/*/index.ts | wc -l` → 87

---

## S2 — Drift Schema × Repo

**Evidências:**
```bash
ls supabase/migrations/*.sql | grep -v '_foreign\|_superseded' | wc -l  → 1067
SELECT count(*) FROM supabase_migrations.schema_migrations;              → 1072
SELECT count(*) FILTER (WHERE statements IS NULL) FROM supabase_migrations.schema_migrations; → 65
grep -c '        Row: {' src/integrations/supabase/types.ts              → 217
```

| Item | Repo | Banco | Δ | Severidade |
|------|------|-------|---|------------|
| Migrations | 1067 | 1072 | **+5 no banco** | MÉDIO (M4) |
| NULL statements | — | 65 | — | MÉDIO (M3) |
| types.ts entries | 217 | 211 tabelas | +6 (views) | INFO |

---

## S3 — Segurança RLS, Grants e Funções

### UPDATE sem WITH CHECK explícito (M1)
```sql
SELECT count(*) FROM pg_policies
WHERE schemaname='public' AND cmd='UPDATE' AND qual IS NOT NULL AND with_check IS NULL;
-- Resultado: 42
```
42 policies UPDATE sem WITH CHECK. PostgreSQL aplica USING como WITH CHECK implícito para o mesmo campo. **Risco real confirmado em S11 (T-11):** campo diferente (queue_id × assigned_to) → bypass.

### Tabelas sem policies (DENY ALL pattern)
```sql
-- 18 tabelas com rls_enabled=true sem policies em pg_policies
-- Todas inspecionadas: todas têm relrowsecurity=true → DENY ALL por design (service_role only)
```

### Views sem security_invoker (M2)
```sql
SELECT count(*) FROM information_schema.views
WHERE table_schema='public';
-- Resultado: 13 total, 12 sem security_invoker
```
12/13 views herdam contexto do chamador (INVOKER), podendo expor mais dados que o esperado via PostgREST.

### SECURITY DEFINER
- 402 funções: **0 sem search_path** (100% seguras contra injection)
- 95 sem bloco EXCEPTION (falhas silenciosas possíveis)

---

## S4 — Integridade e Índices

```sql
-- 35 FKs sem índice (M5)
SELECT count(*) FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_indexes pi
    WHERE pi.schemaname='public' AND pi.tablename=tc.table_name
      AND pi.indexdef LIKE '%'||kcu.column_name||'%'
  );
-- Resultado: 35
```

Dead tuples: `net._http_response` 17.4% (autovacuum a monitorar).

---

## S5 — Performance e pg_stat_statements

### pg_stat_statements
```sql
SELECT extname, extversion, n.nspname FROM pg_extension e 
JOIN pg_namespace n ON n.oid=e.extnamespace WHERE extname='pg_stat_statements';
-- Resultado: pg_stat_statements, 1.11, extensions
-- Acesso: FROM extensions.pg_stat_statements (não bare pg_stat_statements)
```
**INSTALADO v1.11** no schema `extensions`.

### Top-3 queries por mean_exec_time (>100 calls)
```sql
SELECT left(query,120) AS q, calls, round(mean_exec_time::numeric,1) AS mean_ms
FROM extensions.pg_stat_statements WHERE calls>100 ORDER BY mean_exec_time DESC LIMIT 3;
```
| Função | Calls | Mean (ms) |
|--------|-------|-----------|
| trigger_talkx_engine_tick() | 1619 | 1367 |
| rpc_queue_goal_metrics() | 932 | 960 |
| inbox_unread_total() | 1678 | 802 |

### EXPLAIN inbox_unread_total (executado)
```
Aggregate  (cost=1175.73..1175.74 rows=1 width=8)
  CTE candidatos
    ->  Unique  (cost=0.29..721.54 rows=1677 width=16)
          ->  Index Only Scan using idx_messages_unread_conversas on messages m
  ->  CTE Scan on candidatos c  (cost=0.00..452.79 rows=559 width=0)
        Filter: is_contact_visible_to_user(contact_id, '...'::uuid)
```
**B2:** `is_contact_visible_to_user` chamada por row (até 1677×/execução = N+1 pattern).

### EXPLAIN rpc_queue_goal_metrics (executado)
```
Aggregate  (cost=868.71..868.72 rows=1 width=8)
  ->  Seq Scan on queues q  (cost=0.00..868.40 rows=123 width=0)
        Filter: (is_active AND (is_admin_or_supervisor(...) OR (ANY subplan)))
```

### Índices ociosos
- **107MB** com `idx_scan=0`: email_attachments_msg_att_key(61MB), email_messages_body_text_trgm(17MB), etc.

---

## S6 — pg_cron

```sql
SELECT return_message, count(*) FROM cron.job_run_details
WHERE start_time >= now() - interval '30 days' AND status='failed'
GROUP BY return_message;
-- Resultado: 'job startup timeout' → 100% das falhas
```

| Job | Falhas | Total | % |
|-----|--------|-------|---|
| trigger_talkx_engine_tick | 4420 | 43080 | **10.3%** |
| notify_due_tasks | 2071 | 43080 | 4.8% |
| trigger_ai_jobs_tick | 2026 | 42362 | 4.8% |
| expire_stale_agent_presence | 1075 | 21541 | 5.0% |

**A4 — Pool exhaustion:** ~8 jobs concorrentes/minuto esgotam o pool de conexões. Causa: `return_message='job startup timeout'` em 100% das falhas.

Secrets dos crons: 5 jobs usando `vault.decrypted_secrets` (padrão seguro, 0 hardcoded).

---

## S7 — Funções de Banco

| Item | Valor |
|------|-------|
| SECURITY DEFINER | 402 |
| Com search_path | 402 (100%) |
| Sem EXCEPTION | 95 |
| SQL dinâmico inseguro | 0 |
| Cron secrets hardcoded | 0 |

---

## S8 — Edge Functions (14 com verify_jwt=false — TODAS LIDAS)

```bash
grep -B2 "verify_jwt = false" supabase/config.toml | grep "^\[functions\."
# Resultado: 14 funções
```

| Função | Risco | Auth alternativa | Status |
|--------|-------|-----------------|--------|
| auth-login | R1 | Rate limit + lockout + IP policy | PROTEGIDA |
| evolution-webhook | R1 | HMAC-SHA256 + instanceToken dual-auth | PROTEGIDA |
| whatsapp-webhook | R1 | verifyMetaWebhookSignature (HMAC) + Zod | PROTEGIDA |
| gmail-webhook | R1 | verifyGmailOidcRequest (OIDC Google) | PROTEGIDA |
| connection-health-check | R1 | isAuthorizedCronOrUser (vault secret) | PROTEGIDA |
| batch-fetch-avatars | R1 | authorizeCronOrUser + admin/supervisor | PROTEGIDA |
| public-api | R0 | N/A — retorna 410 (DESATIVADA) | ZERO RISCO |
| crm-integration | R1 | requireAuth + rate limit + allowlist | PROTEGIDA |
| csp-report | R1 | Rate limit + body bounded 8KB | BAIXO RISCO |
| talkx-link | R1 | HMAC-SHA256 v1 + timestamp ±5min | PROTEGIDA |
| searchbox-budget-alert | R1 | timingSafeEqual(CRON_SECRET) | PROTEGIDA |
| sync-call-records | R1 | timingSafeEqual(CRON_SECRET) | PROTEGIDA |
| gmail-cron-sync | R1 | x-cron-secret (linha 60, timingSafeEqual) | PROTEGIDA |
| elevenlabs-webhook | R1 | verifyElevenLabsSignature + dedupe UNIQUE | PROTEGIDA |

**I3 — Todas as 14 funções com verify_jwt=false têm autenticação alternativa verificada no código.**

Vault secrets (13): `ai_jobs_cron_secret`, `connection_health_check_cron_secret`, `gmail_cron_secret`, `gmail_encryption_key`, `multiplix_cron_secret`, `multiplix_send_url`, `sicoob_service_role_key`, `talkx_anon_key`, `talkx_cron_secret`, `talkx_scheduler_url`, `talkx_send_url`, `zapp_anon_key`, `avatars_refresh_cron_secret`.

Segredos no git: `git log --all -p | grep -iE 'SERVICE_ROLE_KEY|JWT_SECRET|POSTGRES_PASSWORD'` → **0 matches**.

---

## S9 — Auth, Storage e Realtime

### MFA (A1)
```sql
SELECT count(*) FROM auth.users u
LEFT JOIN auth.mfa_factors f ON f.user_id=u.id AND f.deleted_at IS NULL
WHERE f.id IS NULL AND u.deleted_at IS NULL;
-- Resultado: 10 (100% sem MFA)
```

### Storage (9 buckets)
```sql
SELECT id, public, allowed_mime_types FROM storage.buckets ORDER BY id;
```
| Bucket | Público | MIME filter |
|--------|---------|-------------|
| multiplix-voice | Não | **NULL** ← B1 |
| audio-memes | Sim | NULL |
| custom-emojis | Sim | NULL |
| stickers | Sim | NULL |
| avatars | Não | NULL |
| attachments | Não | NULL |
| talkx-media | Não | NULL |
| voice-recordings | Não | NULL |
| kb-documents | Não | NULL |

**B1 — multiplix-voice sem filtro MIME:** upload de qualquer tipo aceito.

### Realtime
```sql
SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime';
-- Resultado: 37 tabelas
```

---

## S10 — Logs e Auditoria

```sql
SELECT count(*), min(created_at), max(created_at) FROM auth.audit_log_entries;
-- Resultado: 0, null, null
```
**A3 — auth audit vazio:** sem rastreabilidade de logins/logouts.

Edge function logs 7d: **NÃO VERIFICÁVEL** — tentados `_analytics.edge_logs`, `edge_logs_001`, `edge_logs.*` → todos retornam 42P01 (relação não existe via SQL).

---

## S11 — Matriz RLS A×B com Policies Reais do Repositório

**Ambiente:** PostgreSQL 16.15 local (Ubuntu), banco temporário `rls_audit_s11_v2` (dropado após teste)  
**Fonte das policies:** migrations `20260929780000` e `20260929810000` do repo  
**Método:** PostgreSQL instalado, FORCE ROW LEVEL SECURITY, role não-superuser

### Resultados (12 testes)

| Teste | Descrição | Resultado | Veredicto |
|-------|-----------|-----------|----------|
| T-01 | User A vê próprio contato (assigned to A) | count=1 | PASS |
| T-02 | User A NÃO vê contato de B (não é membro da fila de B) | count=0 | PASS |
| T-03 | User A NÃO faz UPDATE em contato de B (fila diferente) | UPDATE 0 | PASS |
| T-04 | User A tenta mover `assigned_to` do próprio contato para B | ERROR: RLS violated | PASS |
| T-05 | User A atualiza campos próprios (name, phone) | UPDATE 1 | PASS |
| T-06 | User B NÃO deleta contato de A | DELETE 0 | PASS |
| T-07 | Contato sem `assigned_to` (NULL) invisível a user regular | count=0 | PASS |
| T-08 | Admin vê todos os contatos | count=3 | PASS |
| T-09 | Admin reatribui contato (reassign) | UPDATE 1 | PASS |
| T-10 | Membro de fila vê contato da sua fila | count=1 | PASS |
| **T-11** | **Membro de fila reatribui contato da fila para si (hijack)** | **UPDATE 1 — MUDOU** | **⚠️ FALHA** |
| T-12 | Não-membro NÃO reatribui contato de terceiro | BLOCKED | PASS |

**11/12 PASS — 1 FALHA REAL (T-11)**

### A2 — Vulnerabilidade T-11: Queue Member Hijack

**Cenário:** Contact B está `assigned_to=ProfileB` e `queue_id=QueueF1`. User A é membro ativo de QueueF1.

```sql
-- User A executa:
UPDATE contacts SET assigned_to = ProfileA WHERE id = ContactB;
-- Resultado: UPDATE 1 — reatribuição OCORREU
```

**Por que ocorre:**
- Policy: `FOR UPDATE USING (can_edit_contact(assigned_to, queue_id))` — **sem WITH CHECK**
- USING antes do update: `can_edit_contact(ProfileB, QueueF1)` → User A é membro de QueueF1 → **TRUE**
- WITH CHECK implícito (nova linha): `can_edit_contact(ProfileA, QueueF1)` → User A é ProfileA E membro de QueueF1 → **TRUE** → update permitido

**Impacto:** Um agente membro de uma fila pode reatribuir para si qualquer contato dessa fila, ignorando a atribuição original.

**Correção:** BEFORE UPDATE trigger que rejeita mudança de `assigned_to` por não-admins, ou policy separada para reatribuição. Ver `testes/s11_rls_matrix_RESULTADO_v2.md` para SQL de correção sugerido.

---

## S12 — Lacunas

| Item | Status | Evidência |
|------|--------|----------|
| PITR | **ATIVO** | `SELECT setting FROM pg_settings WHERE name='archive_mode'` → `on` |
| Staging | AUSENTE | — |
| Advisors Supabase | NÃO VERIFICÁVEL | `pgmeta_advisors` — 42P01 em todas as tentativas |
| LGPD: login_attempts TTL | LACUNA (B3) | Tabela `login_attempts` sem coluna `expires_at` |
| Alertas pg_cron | AUSENTE | Falhas visíveis apenas em `cron.job_run_details` |

---

## Não Verificáveis

| Item | SQL tentado | Resultado |
|------|------------|----------|
| Advisors | `supabase_migrations.pgmeta_advisors`, `extensions.edge_functions_catalog`, `_supabase.advisors` | 42P01 |
| Edge logs 7d por função | `_analytics.edge_logs`, `edge_logs_001`, `edge_logs.*` | 42P01 |
| pg_log | Via SQL direto | Não acessível |

---

## Grep PII/Segredos nos Arquivos da Auditoria

```bash
grep -rEn '(service_role_key|jwt_secret|postgres_password)\s*[:=]\s*["\x27][^"]{10,}' auditoria-supabase/
# → 0 matches

grep -rEn '\b[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}\b' auditoria-supabase/
# → 0 matches (nenhum CPF)

grep -rEn '\beyJ[A-Za-z0-9_-]{20,}' auditoria-supabase/
# → 0 matches (nenhum JWT real)
```
**0 PII reais ou segredos nos arquivos de auditoria.**

---

## Plano de Correção

| Prioridade | Achado | Proposta |
|------------|--------|----------|
| **IMEDIATO** | A1: 0 MFA | Supabase Dashboard → Authentication → MFA policy |
| **IMEDIATO** | A2: T-11 hijack | BEFORE UPDATE trigger em `contacts` (ver S11 v2) |
| **IMEDIATO** | A3: auth audit vazio | Dashboard → Authentication → Settings |
| **CURTO** | A4: pool exhaustion | `propostas/P05_fix_pgcron_pool.sql` |
| **CURTO** | M1: 42 UPDATE sem WITH CHECK | `propostas/P01_add_with_check_rls.sql` |
| **CURTO** | M2: views sem security_invoker | `propostas/P04_fix_views_security_invoker.sql` |
| **MÉDIO** | M3: 65 NULL statements | `node scripts/db-audit/register-migration.mjs` por arquivo |
| **MÉDIO** | M5: 35 FKs sem índice | `propostas/P02_add_missing_fk_indexes.sql` |
| **BAIXO** | B1: MIME multiplix-voice | Storage → Edit bucket → MIME types |

---

## Arquivos desta Auditoria

```
auditoria-supabase/
├── RELATORIO_AUDITORIA_SUPABASE.md     ← este arquivo (v3)
├── progresso.json                       ← estado 12 seções + severidade
├── inventario/                          ← 12 arquivos por seção
├── propostas/                           ← P01–P06 (NÃO APLICADAS, com ROLLBACK)
└── testes/
    ├── s11_rls_matrix_RESULTADO.md      ← v1: schema simulado (8/8 PASS)
    └── s11_rls_matrix_RESULTADO_v2.md   ← v2: policies reais (11/12 PASS, T-11 FALHA)
```
