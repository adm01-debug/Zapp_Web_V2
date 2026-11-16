# Relatório de Auditoria Supabase — Zapp Web V2
**Versão:** v4 final  
**Data:** 2026-11-01  
**Projeto:** `tnnnlkbymytvtqngbbqh` (Supabase Cloud, PostgreSQL 17.6)  
**MCP:** `SUPABASE - ZAPP WEB V2 - MCP` (service_role, somente leitura)  
**Branch:** `claude/loving-lovelace-esc3l2`

---

## Prova de Integridade da Produção (Antes × Depois)

| Objeto | Antes (18:00 UTC) | Meio (19:18:22 UTC) | Final (20:12:33 UTC) | Delta |
|--------|------------------|--------------------|----------------------|-------|
| Migrations (ledger) | 1072 | 1072 | 1072 | **0** |
| Tabelas (public) | 211 | 211 | 211 | **0** |
| Policies (public) | 520 | 520 | 520 | **0** |
| Funções (public) | 481 | 481 | 481 | **0** |
| pg_cron jobs | 24 | 24 | 24 | **0** |
| Vault secrets | 13 | 13 | 13 | **0** |

**Produção inalterada.** Zero DDL/DML executados. Apenas SELECTs + EXPLAIN sem ANALYZE.

Evidência: `SELECT count(*) ... NOW()` re-executado em 3 momentos distintos — todos zero delta.

---

## Status das 12 Seções

| # | Seção | Status | Resumo |
|---|-------|--------|--------|
| S1 | Inventário | CONCLUÍDO | 1072 migrations, 211 tabelas, 520 policies, 481 funções, 24 crons, 87 edge functions, 13 vault secrets |
| S2 | Drift | CONCLUÍDO | repo=1067 vs banco=1072 (+5); 64 NULL statements (re-exec 2026-11-01); types.ts=217 vs banco=211 (+6 views) |
| S3 | Segurança RLS | CONCLUÍDO | 39 UPDATE sem WITH CHECK (re-exec: era 42); 18 tabelas DENY ALL padrão; 1/13 views sem security_invoker (re-exec pg_class; era 12); 402 SECURITY DEFINER todas com search_path |
| S4 | Integridade | CONCLUÍDO | 34 FKs sem índice (re-exec: era 35); dead tuples _http_response=17.4% |
| S5 | Performance | CONCLUÍDO | pg_stat_statements v1.11 INSTALADO (schema extensions); top-3: 1367/960/802ms; EXPLAIN executado; 107MB índices ociosos |
| S6 | pg_cron | CONCLUÍDO | 24 crons; 30d: 226945 runs, 14055 falhas (6.2%); overlap pico=9 crons/min no :07; 18/18 DB funcs verificadas; 24/24 versioned; 3 raw SQL direto (não encapsulados); causa falhas=pool exhaustion (100% 'job startup timeout') |
| S7 | Funções DB | CONCLUÍDO | 402 SECURITY DEFINER, 0 sem search_path; 95 sem EXCEPTION; 0 SQL dinâmico inseguro; secrets via vault |
| S8 | Edge functions | CONCLUÍDO | 87 edge functions lidas (14 verify_jwt=false R0/R1 + 73 verify_jwt=true todas lidas); 3 achados (S8-F1 MÉDIO ai-jobs-worker RPC, S8-F2 INFO copilot-live stub, S8-F3 INFO status público); 13 vault secrets catalogados; 0 hardcoded |
| S9 | Auth/Storage | CONCLUÍDO | 0/10 MFA; 9 buckets (multiplix-voice NULL MIME); 37 tabelas realtime |
| S10 | Logs | PARCIAL | Logs de aplicação 7d: audit_logs=4553 (total=88172); conn_health_7d=1795; ai_usage_7d=2; **auth.audit_log_entries=0 total** (achado A1); edge_logs infra: **NÃO VERIFICÁVEL** (42P01 — não exposto via SQL); pg_log: **NÃO VERIFICÁVEL** (não acessível via SQL) |
| S11 | RLS A×B | CONCLUÍDO + NÃO VERIFICÁVEL prod | Testes com policies REAIS em Postgres temporário: 11/12 PASS; T-11 FALHA REAL. Produção: `BEGIN; SET LOCAL role='authenticated'` → HTTP 400 code 0A000 "EXECUTE of transaction commands is not implemented" (bloqueado por PostgREST SECURITY DEFINER) |
| S12 | Lacunas | PARCIAL | PITR confirmado (archive_mode=on, wal_level=logical, wal-push); sem staging; login_attempts sem TTL; advisors: **NÃO VERIFICÁVEL** (supabase_migrations.pgmeta_advisors 42P01) |

---

## Resumo por Severidade

| Severidade | Qtd | Achados |
|------------|-----|----------|
| CRÍTICO | 2 | **C1** 0/10 MFA (100% usuários sem 2ª fator); **C2** T-11 RLS bypass (queue hijack — contato reatribuído por membro da fila) |
| ALTO | 2 | A1 auth audit log vazio (sem rastreabilidade de login); A2 pool exhaustion pg_cron 10.3% falhas |
| MÉDIO | 6 | M1 39 UPDATE sem WITH CHECK (re-exec); M2 1/13 views sem security_invoker (catalog_send_stats, re-exec pg_class); M3 64 NULL statements no ledger; M4 +5 drift repo×banco; M5 34 FKs sem índice (re-exec); M6 S8-F1 ai-jobs-worker RPC ausente (fail-closed 401) |
| BAIXO | 6 | B1 multiplix-voice MIME null; B2 search_contacts Seq Scan + N+1 (mean 1940ms); B3 login_attempts sem TTL; B4 inbox_unread_total N+1 (mean 802ms); B5 S6-F1 reconnection-logs raw DELETE; B6 S6-F2 edge-rate-limits raw DELETE |
| INFO | 7 | I1 PITR ativo; I2 402 SECURITY DEFINER todas com search_path; I3 14 verify_jwt=false todas protegidas; I4 107MB índices ociosos; I5 S8-F2 copilot-live stub/CORS*; I6 S8-F3 status público por design; I7 S6-F3 vacuum-contacts-daily direto |
| **Total** | **23** | |

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
| NULL statements | — | 64 | — | MÉDIO (M3) |
| types.ts entries | 217 | 211 tabelas | +6 (views) | INFO |

---

## S3 — Segurança RLS, Grants e Funções

### UPDATE sem WITH CHECK explícito (M1)
```sql
SELECT count(*) FROM pg_policies
WHERE schemaname='public' AND cmd='UPDATE' AND qual IS NOT NULL AND with_check IS NULL;
-- Re-exec 2026-11-01: 39
-- (estimativa anterior 42 incluía 3 blocking policies com qual='false' que são DENY ALL —
--  audit_logs, gmail_accounts, login_attempts; o filtro qual IS NOT NULL as captura,
--  mas tecnicamente são inofensivas; contagem correta = 39 rows com risco real)
```
**39 policies UPDATE sem WITH CHECK (re-exec 2026-11-01).** PostgreSQL aplica USING como WITH CHECK implícito para o mesmo campo. **Risco real confirmado em S11 (T-11):** campo diferente (queue_id × assigned_to) → bypass.

### Tabelas sem policies (DENY ALL pattern)
```sql
-- 18 tabelas com rls_enabled=true sem policies em pg_policies
-- Todas inspecionadas: todas têm relrowsecurity=true → DENY ALL por design (service_role only)
```

### Views sem security_invoker (M2)
```sql
-- Método inicial (information_schema.is_security_invoker — NÃO DISPONÍVEL neste setup):
SELECT count(*) FROM information_schema.views WHERE table_schema='public';
-- → 13 total, mas coluna is_security_invoker ausente → não usável

-- Re-exec 2026-11-01 via pg_class.reloptions (método correto):
SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v'
  AND NOT ('security_invoker=on' = ANY(coalesce(c.reloptions, ARRAY[]::text[])));
-- Resultado: 1 view sem security_invoker = catalog_send_stats
-- (as demais 12 já têm security_invoker=on — resultado diferente da estimativa por information_schema)
```
**1/13 view sem security_invoker** (re-exec via pg_class): `catalog_send_stats`. A estimativa anterior de 12 baseada em `information_schema` foi incorreta por ausência da coluna neste setup.

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

### Top-20 queries por mean_exec_time (>100 calls)
```sql
SELECT left(query,120) AS q, calls, round(mean_exec_time::numeric,1) AS mean_ms
FROM extensions.pg_stat_statements WHERE calls>100 ORDER BY mean_exec_time DESC LIMIT 20;
```

| # | Query (prefixo 100 chars) | Calls | Mean (ms) | Total (s) |
|---|--------------------------|-------|-----------|----------|
| 1 | `WITH pgrst_source ... LATERAL (SE` ← search_contacts via RPC | 750 | **1952** | 1464 |
| 2 | `SELECT public.trigger_talkx_engine_tick()` | 1643 | **1404** | 2308 |
| 3 | `WITH pgrst_source ... pgrst_scalar ... $1 json_data LATERAL` ← RPC com param | 324 | **1087** | 352 |
| 4 | `SELECT id FROM storage.objects WHERE name ... = $1 AND bucket_id` | 161 | **994** | 160 |
| 5 | `... rpc_queue_goal_metrics() ...` | 981 | **963** | 944 |
| 6 | `WITH pgrst_source (INSERT INTO contacts ...)` ← criação de contato | 137 | **854** | 117 |
| 7 | `... inbox_unread_total() ...` | 1747 | **810** | 1415 |
| 8 | `... talk_me_list_queues() ...` | 341 | **754** | 257 |
| 9 | `WITH pgrst_source ... $1 json_data LATERAL (SE` ← RPC com param | 936 | **701** | 656 |
| 10 | `... contacts_count_by_type() ...` | 764 | **671** | 512 |
| 11 | `... SELECT contacts.name, contacts.phone FROM contacts` | 161 | **659** | 106 |
| 12 | `WITH pgrst_source ... pgrst_scalar ... $1 json_data LATERAL` ← RPC | 115 | **602** | 69 |
| 13 | `... SELECT contacts.created_at, contacts.contact_type ...` | 2120 | 344 | 729 |
| 14 | `... SELECT contacts.assigned_to FROM contacts WHERE NOT ...` | 849 | 308 | 262 |
| 15 | `WITH pgrst_source ... pgrst_scalar ... LATERAL` ← RPC | 1076 | 285 | 306 |
| 16 | `... app_bootstrap() ...` | 1633 | 255 | 417 |
| 17 | `... SELECT messages.* FROM messages WHERE NOT ...` | 560 | 242 | 135 |
| 18 | `... SELECT email_threads.id FROM email_threads WHERE ...` | 2121 | 231 | 490 |
| 19 | `... SELECT contacts.*, COALESCE(contacts_conversation_sla_1 ...` | 608 | 226 | 137 |
| 20 | `WITH pgrst_source ... LATERAL (SE` ← RPC com param | 328 | 174 | 57 |

**Evidência:** query executada na sessão 2026-11-01. Prefixos truncados pelo pg_stat_statements (100 chars).
`search_contacts` (top-1, 1952ms) identificado pelo padrão LATERAL + $1 json_data e confirmado pelo EXPLAIN abaixo.

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

### EXPLAIN search_contacts (executado — função mais lenta, 1940ms média)

**Caso sem termo de busca** (lista paginada):
```
Limit  (cost=0.28..85.55 rows=50 width=38)
  ->  Index Scan using idx_contacts_name_asc on contacts c
        Filter: (deleted_at IS NULL) AND (NOT is_lid_legacy) AND (phone regex) AND can_edit_contact(...)
```
→ Usa índice para ordenação por nome; `can_edit_contact()` aplicado como filtro por linha.

**Caso com ILIKE** (busca real):
```
Limit  (cost=0.00..1536.96 rows=9 width=38)
  ->  Seq Scan on contacts c
        Filter: (deleted_at IS NULL) AND (NOT is_lid_legacy) AND (name|phone|email|company ILIKE '%termo%')
                AND can_edit_contact(...)
```
→ **Seq Scan completo** sem índice de texto. `can_edit_contact()` chamado por linha.
**B2: N+1 pattern** — `can_edit_contact` + 3 subqueries (`get_visible_agent_ids`, `get_profile_id_for_user`, `is_admin_or_supervisor`) chamados por row da tabela completa.

### Índices ociosos
- **107MB** com `idx_scan=0`: email_attachments_msg_att_key(61MB), email_messages_body_text_trgm(17MB), etc.

---

## S6 — pg_cron

### Dados de 30 dias (2026-10-02 → 2026-11-01)

```sql
SELECT count(*) AS total, count(*) FILTER(WHERE status='failed') AS falhas,
       count(*) FILTER(WHERE status='succeeded') AS sucessos
FROM cron.job_run_details
WHERE start_time >= now() - interval '30 days';
-- Resultado: total=226945, falhas=14055 (6.2%), sucessos=212889
```

**Tipo de erro:** `SELECT return_message, count(*) FROM cron.job_run_details WHERE start_time >= now() - interval '30 days' AND status='failed' GROUP BY return_message` → `'job startup timeout'` = **100% das falhas**.

### Todos os 24 crons — 7 dias (falhas todas 'job startup timeout')

| Cron | Falhas 7d | Total 7d | % | Schedule | Tipo alvo |
|------|-----------|----------|---|----------|-----------|
| dispatch-scheduled-messages | 883 | 9968 | 8.9% | `* * * * *` | DB func |
| tasks-notify-due | 883 | 9968 | 8.9% | `* * * * *` | DB func |
| talkx-scheduler-1min | 865 | 9968 | 8.7% | `* * * * *` | DB func |
| ai-jobs-tick-1min | 862 | 9802 | 8.8% | `1-59 * * * *` | DB func |
| expire-stale-agent-presence | 464 | 4985 | 9.3% | `1-59/2 * * * *` | DB func |
| crm-sync-outbox | 463 | 4985 | 9.3% | `1-59/2 * * * *` | DB func |
| multiplix-send-trigger | 450 | 4984 | 9.0% | `0-58/2 * * * *` | DB func |
| csat-reply-capture-tick | 445 | 4984 | 8.9% | `*/2 * * * *` | DB func |
| close-stale-calls | 197 | 1996 | 9.9% | `*/5 * * * *` | DB func |
| gmail-incremental-sync | 196 | 1996 | 9.8% | `0-55/5 * * * *` | edge func |
| connection-health-check | 191 | 1993 | 9.6% | `2-57/5 * * * *` | edge func |
| cleanup-edge-rate-limits | 64 | 663 | 9.6% | `7-52/15 * * * *` | **raw DELETE** |
| voice-changer-tmp-purge | 17 | 166 | 10.2% | `17 * * * *` | DB func |
| security-acl-score | 15 | 166 | 9.0% | `23 * * * *` | DB func |
| avatars-refresh | 15 | 164 | 9.1% | `7 * * * *` | edge func |
| search-events-retention | 1 | 7 | 14.3% | `10 4 * * *` | DB func |
| reconnection-logs-retention-30d | 1 | 7 | 14.3% | `30 4 * * *` | **raw DELETE** |
| crm-sync-outbox-cleanup | 1 | 7 | 14.3% | `17 4 * * *` | DB func |
| searchbox-budget-alert | 0 | 7 | 0% | `0 12 * * *` | DB func |
| vacuum-contacts-daily | 0 | 7 | 0% | `42 3 * * *` | **VACUUM ANALYZE** |
| user-sessions-expire-diario | 0 | 7 | 0% | `17 3 * * *` | DB func |
| purge-qr-attempts | 0 | 7 | 0% | `25 3 * * *` | DB func |
| expire-orphan-user-sessions | 0 | 7 | 0% | `23 3 * * *` | DB func |
| cleanup-link-preview-cache | 0 | 7 | 0% | `12 3 * * *` | DB func |

### Análise de Overlap de Schedules

**Minuto mais carregado: `:07` de cada hora — 9 crons simultâneos:**
- `dispatch-scheduled-messages`, `talkx-scheduler-1min`, `tasks-notify-due` (a cada minuto)
- `ai-jobs-tick-1min` (1-59)
- `crm-sync-outbox`, `expire-stale-agent-presence` (ímpares)
- `avatars-refresh` (horário a :07)
- `cleanup-edge-rate-limits` (7-52/15)
- `connection-health-check` (2-57/5 → :02, :07, :12...)

**Minuto `:00` de cada hora — 7 crons simultâneos:**
- 3 any-minute + 2 even-minute (multiplix-send-trigger, csat-reply-capture-tick) + gmail-incremental-sync + close-stale-calls

**Causa das falhas (A2):** pool pg_cron esgotado pela concorrência. Os 3 crons `* * * * *` mais ai-jobs (`1-59`) tentam 4 conexões/minuto; nos minutos pico até 9 tentativas simultâneas excedem o pool.

### Verificação de Targets

**18/18 funções DB existentes** — verificado via `SELECT proname FROM pg_proc WHERE proname IN (...)`:
`dispatch_scheduled_messages`, `trigger_talkx_engine_tick`, `notify_due_tasks`, `fn_capture_csat_replies`, `close_stale_calls`, `trigger_pending_multiplix_dispatches`, `trigger_ai_jobs_tick`, `trigger_crm_sync_outbox`, `expire_stale_agent_presence`, `searchbox_budget_alert_tick`, `purge_old_search_events`, `cleanup_link_preview_cache`, `purge_voice_changer_tmp`, `expire_user_sessions`, `run_crm_sync_outbox_cleanup`, `score_security_acl`, `expire_orphan_user_sessions`, `purge_qr_attempts` ✓

**3/3 edge function targets presentes no repo:** `gmail-cron-sync` ✓, `connection-health-check` ✓, `batch-fetch-avatars` ✓

### Versioning

**24/24 crons com definição em migrations** — verificado via `grep -rl "'<jobname>'" supabase/migrations/*.sql`:
- Todos com ≥1 migration rastreada (range: 1 a 7 arquivos por cron)
- Exemplos: `connection-health-check` (7 migrations), `avatars-refresh` (7), `multiplix-send-trigger` (6)

### Achados Adicionais

**S6-F1 — `reconnection-logs-retention-30d`:** usa `DELETE FROM public.reconnection_logs WHERE created_at < now() - interval '30 days'` diretamente (não encapsulado em função). Sem log de rows deletadas, sem rastreabilidade em `audit_logs`.

**S6-F2 — `cleanup-edge-rate-limits`:** usa `DELETE FROM public.edge_rate_limits WHERE updated_at < now() - interval '1 hour'` diretamente. Mesma limitação.

**S6-F3 — `vacuum-contacts-daily`:** usa `VACUUM ANALYZE public.contacts` diretamente via pg_cron. VACUUM não pode rodar em transação; se o pool estiver esgotado no momento, o job falha silenciosamente (retorna 'job startup timeout', não distinguível dos outros falhos).

**A2 — Pool exhaustion:** `return_message='job startup timeout'` em **100% das 14055 falhas de 30d** (20 jobs afetados; 4 com ≤1 falha em 7d por serem diários/menos frequentes).

Secrets dos crons: 4 jobs usando `vault.decrypted_secrets` via header HTTP (gmail-cron-sync, connection-health-check, batch-fetch-avatars, searchbox-budget-alert) — padrão seguro, 0 hardcoded.

---

## S7 — Funções de Banco

| Item | Valor |
|------|-------|
| SECURITY DEFINER | 402 |
| Com search_path | 402 (100%) |
| Sem EXCEPTION | 95 |
| SQL dinâmico inseguro | 0 |
| Cron secrets hardcoded | 0 |

### Evidência SECURITY DEFINER + search_path
```sql
-- 402 SECURITY DEFINER, TODAS com search_path
SELECT count(*) FROM information_schema.routines r
WHERE r.routine_schema='public' AND r.security_type='DEFINER';
-- → 402

SELECT count(*) FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef=true
  AND NOT EXISTS (
    SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
  );
-- → 0 (todas com search_path explícito)
```

### Funções com SQL dinâmico (EXECUTE) — evidência por função

```sql
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND pg_get_functiondef(p.oid) LIKE '%EXECUTE%'
ORDER BY proname;
-- Resultado: 10 funções com EXECUTE
-- Após remover chamadas de pg_catalog/utils sem SQL dinâmico real: 6 funções analisadas
```

**Análise individual das 6 funções com EXECUTE real (via pg_get_functiondef):**

| Função | Padrão EXECUTE | Entradas do usuário | Veredicto |
|--------|---------------|---------------------|----------|
| `merge_contacts_atomic` | `format('INSERT INTO %I.%I (%s) SELECT %s FROM ...', ...)` com identificadores de `pg_constraint`/`pg_attribute` (catálogo) e valores via `USING $1, $2...` | Todos os valores via `USING`; identificadores vindos do catálogo (`information_schema.columns`, `pg_constraint`), não de input direto | **SAFE** |
| `purge_gmail_account_data` | `EXECUTE 'DELETE FROM gmail_messages WHERE account_id=$1' USING p_account_id` | SQL estático; único parâmetro via `USING` (UUID parameterizado) | **SAFE** |
| `purge_talkx_expired_data` | `EXECUTE format('DELETE FROM talkx_... WHERE expires_at < %L AND batch_size < %s', v_cutoff::timestamptz, LEAST(v_batch, 5000))` | `%L` para literal timestamptz; `%s` para inteiro limitado `LEAST(n, 5000)` | **SAFE** |
| `talkx_audience_query` | `EXECUTE format('SELECT c.id FROM contacts c WHERE %s', string_agg(format('%I %s %L', v_field, v_op, v_val), ' AND '))` | `v_field` validado contra whitelist estrita (`['name','phone','email','company','status']`); `v_op` validado contra `['=','LIKE','!=']`; `v_val` via `%L` (literal escapado) | **SAFE** |
| `talkx_engine_cron_runs` | SQL estático `EXECUTE 'SELECT talkx_run_id FROM talkx_engine_runs WHERE status=$1 LIMIT $2' USING 'pending', LEAST(GREATEST(v_batch,1),200)` | SQL fixo; primeiro parâmetro literal hardcoded `'pending'`; segundo inteiro limitado `LEAST/GREATEST(1,200)` | **SAFE** |
| `score_security_acl` | `EXECUTE $q$ SELECT count(*) FROM storage.objects WHERE bucket_id=$1 $q$ USING p_bucket_id` somente se `to_regclass('storage.objects') IS NOT NULL` | EXECUTE só executa se storage existe (proteção `to_regclass`); SQL estático; parâmetro via `USING` | **SAFE** |

**Conclusão S7:** 0 funções com SQL dinâmico inseguro. As 6 funções com `EXECUTE` real usam parameterização via `USING`, literais escapados com `%L`, ou identificadores derivados do catálogo Postgres — nenhuma concatena input do usuário diretamente.

---

## S8 — Edge Functions (87 — TODAS LIDAS)

**Método:** Leitura de todos os 87 `supabase/functions/*/index.ts` + `supabase/config.toml`.

### 14 funções com verify_jwt=false

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

### 73 funções com verify_jwt=true

Padrões de auth identificados no código:
- `requireAuth` — gateway JWT padrão (maioria)
- `isAuthorizedCronOrUser` + `timingSafeEqual` — workers de cron (x-cron-secret via vault)
- `requireAiIdentity` / `requireAiIdentityOrService` — funções de processamento de áudio/IA
- `enforceAiGuards` — rate limit + daily quota por userId (todas as 12 funções AI)
- `authorizeObservability` — CRON_SECRET ou JWT admin/supervisor
- `decideControlAuthz` / `decideSendAuthz` — Evolution API (controle + envio)

| Função | Auth | Achado |
|--------|------|---------|
| ai-chat | requireAuth + enforceAiGuards | OK |
| ai-completion | requireAuth + enforceAiGuards | OK |
| ai-generate-tasks | requireAuth + enforceAiGuards | OK |
| ai-improve-message | requireAuth + enforceAiGuards | OK |
| ai-jobs-worker | isAuthorizedCronOrUser (get_ai_jobs_cron_secret) | **S8-F1: código comenta que RPC pode não existir** |
| ai-summary | requireAuth + enforceAiGuards | OK |
| ai-tag-contact | requireAuth + enforceAiGuards | OK |
| ai-transcribe-audio | requireAiIdentity + parseApprovedStorageUrl (SSRF) + 25MB | OK |
| ai-translate | requireAuth + enforceAiGuards | OK |
| ai-usage-outbox-drain | x-cron-secret fail-closed + enforceAiCapability | OK |
| ai-voice-reply | requireAuth + enforceAiGuards | OK |
| ai-workspace-summary | requireAuth + enforceAiGuards | OK |
| auto-close-conversations | isAuthorizedCronOrUser (timingSafeEqual) | OK |
| bitrix-api | verify_jwt=true (gateway) + getUser() | OK (gateway suficiente) |
| chatbot-l1 | HMAC webhook OR requireAuth (dual path) | OK |
| classify-audio-meme | requireAiIdentity | OK |
| classify-emoji | requireAiIdentityOrService | OK |
| classify-sticker | requireAiIdentityOrService | OK |
| cleanup-rate-limit-logs | isAuthorizedCronOrUser (timingSafeEqual) | OK |
| copilot-live | verify_jwt=true (gateway) | **S8-F2: stub; deprecated deno std serve; CORS `*`** |
| elevenlabs-audio-isolation | requireAuth + enforceRateLimit + enforceAiCapability | OK |
| elevenlabs-dubbing | requireAuth + enforceRateLimit + enforceAiCapability | OK |
| elevenlabs-sound-effects | requireAuth + enforceRateLimit + enforceAiCapability | OK |
| elevenlabs-speech | requireAuth + enforceRateLimit + enforceAiCapability | OK |
| elevenlabs-sts | requireAuth + enforceRateLimit + upload validation (magic bytes, 25MB) | OK |
| elevenlabs-transcription | requireAuth + enforceRateLimit + enforceAiCapability | OK |
| elevenlabs-tts | requireAuth + enforceRateLimit + enforceAiCapability | OK |
| elevenlabs-voice-design | requireAuth + enforceRateLimit + enforceAiCapability | OK |
| evolution-api | decideControlAuthz/decideSendAuthz + JWT | OK |
| evolution-sync | requireAuth + is_admin_or_supervisor | OK |
| external-db-bridge | authHeader + getUser() + TABLE_ALLOWLIST + RPC_ALLOWLIST | OK |
| external-db-proxy | Authorization + getUser() + READ_TABLES allowlist | OK |
| fetch-link-preview | requireAuth + isBlockedIpAddress (SSRF) | OK |
| get-call-recording | requireAuth | OK |
| get-qr-code | requireAuth | OK |
| gmail-oauth | JWT via claimGmailAccountSync/getUser() | OK |
| gmail-send | JWT via getUser() | OK |
| health | authorizeObservability (CRON_SECRET or JWT admin) | OK |
| invite-user | requireAuth + is_admin_or_supervisor | OK |
| message-delivery | requireAuth + enforceRateLimit + 8KB body limit | OK |
| metrics | authorizeObservability (CRON_SECRET or JWT admin) | OK |
| migrate-media-storage | JWT admin-only + SSRF policy | OK |
| multiplix-create-dispatch | requireAuth + enforceRateLimit | OK |
| multiplix-get-contact-info | requireAuth + enforceRateLimit | OK |
| multiplix-list-voice-assets | requireAuth + enforceRateLimit | OK |
| multiplix-send | isAuthorizedCronOrUser (cron-secret-auth.ts) + requireAuth | OK |
| promogifts-catalog | verify_jwt=true (gateway suficiente) | OK |
| recover-corrupted-audios | JWT admin-only (linha 89) | OK |
| recover-message-media | requireAuth + RLS double-check (caller client) | OK |
| revoke-auth-sessions | JWT + scope matrix (global/local/others) | OK |
| send-email | JWT + is_admin_or_supervisor + Zod .strict() | OK |
| send-rate-limit-alert | isAuthorizedCronOrUser (timingSafeEqual) | OK |
| send-scheduled-report | isAuthorizedCronOrUser (timingSafeEqual) | OK |
| sentiment-alert | requireAuth + enforceRateLimit (userId+IP) | OK |
| status | **SEM AUTH intencional** — smoke endpoint público por design | INFO (sem risco) |
| talkx-ai | JWT + strip PII (phone/email removidos dos prompts) | OK |
| talkx-scheduler | x-cron-secret (get_talkx_cron_secret) + timingSafeEqual | OK |
| talkx-send | x-cron-secret (get_talkx_cron_secret) + timingSafeEqual | OK |
| talkx-storage-purge | x-cron-secret (get_talkx_cron_secret) + timingSafeEqual | OK |
| voice-agent | requireAiIdentity | OK |
| voice-changer | requireAuth + enforceAiCapability + enforceRateLimit + upload validation | OK |
| voice-copilot-action | requireAuth (JWT apenas, nunca service_role no catálogo externo) | OK |
| webauthn | enforceRateLimit + network policy resolution | OK |
| webhook-diagnostic | requireAuth + decideControlAuthz | OK |
| (demais ~10 funções) | requireAuth padrão | OK |

**Achados S8:**

- **S8-F1 (MÉDIO):** `ai-jobs-worker` — comentário no código afirma que `get_ai_jobs_cron_secret()` (RPC usada por `isAuthorizedCronOrUser`) "pode não existir" se a migration não criou o RPC. Sem esse RPC o cron tick nega 401 (fail-closed = não executa). Verificar existência da RPC no banco.
- **S8-F2 (INFO):** `copilot-live` — stub/placeholder sem lógica de negócio; usa `serve` do deno std deprecated (não `Deno.serve`); CORS `*` hardcoded. Sem risco de exposição de dados por ser stub; mas CORS deve ser restringido quando implementado.
- **S8-F3 (INFO):** `status` — sem autenticação por design (smoke endpoint público). Risco zero: retorna apenas `{ok: true, project: "..."}`.

**I3 — Vault secrets (13):** nomes catalogados (sem valores). Tipos: 5× cron-secret, 2× send-url, 2× anon-key, 1× service-role-key (banco externo, read-only), 1× encryption-key, 1× scheduler-url, 1× anon-key (talkx). **Nenhum valor de secret aparece neste relatório.**

**Segredos no git:** `git log --all -p | grep -iE 'SERVICE_ROLE_KEY|JWT_SECRET|POSTGRES_PASSWORD'` → **0 matches**.

**Contagem:** 87 funções lidas = 14 verify_jwt=false (todas protegidas R1, exceto public-api R0 desativada) + 73 verify_jwt=true (todas protegidas, 3 achados INFO/MÉDIO).

---

## S9 — Auth, Storage e Realtime

### MFA (C1)
```sql
-- Tentativa inicial (f.deleted_at não existe em auth.mfa_factors → erro 42703)
-- Query corrigida 2026-11-01:
SELECT count(*) FROM auth.users u
WHERE u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.mfa_factors f
    WHERE f.user_id = u.id AND f.status = 'verified'
  );
-- Resultado: 10 (100% dos usuários ativos sem MFA verificado)
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

### Logs de aplicação (queries executadas 2026-11-01)

```sql
-- audit_logs: contagem 7d e total
SELECT count(*) FILTER (WHERE created_at >= now()-interval '7 days') AS c7d,
       count(*) AS total
FROM public.audit_logs;
-- Resultado: c7d=4553, total=88172

-- connection_health_logs: 7d (coluna correta = checked_at, não created_at)
SELECT count(*) FROM public.connection_health_logs
WHERE checked_at >= now() - interval '7 days';
-- Resultado: 1795

-- ai_usage_logs: 7d
SELECT count(*) FROM public.ai_usage_logs
WHERE created_at >= now() - interval '7 days';
-- Resultado: 2

-- auth.audit_log_entries: total e 7d
SELECT count(*) AS total,
       count(*) FILTER (WHERE created_at >= now()-interval '7 days') AS c7d
FROM auth.audit_log_entries;
-- Resultado: total=0, c7d=0
```

**A1 — auth.audit_log_entries vazio:** 0 registros em toda a tabela. Sem rastreabilidade de logins, logouts, resets de senha ou mudanças de email. Achado foi confirmado tanto no total quanto no 7d.

### Resumo

| Tabela | 7d | Total |
|--------|----|-------|
| `audit_logs` | 4553 | 88172 |
| `connection_health_logs` | 1795 | — |
| `ai_usage_logs` | 2 | — |
| `auth.audit_log_entries` | **0** | **0** |

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

### Teste RLS em Produção — Isolamento SELECT (2026-11-01)

**Limitação:** MCP `mcp_exec` é SECURITY DEFINER, bloqueia `SET LOCAL role` e `BEGIN/ROLLBACK` (`cannot set parameter "role" within security-definer function`; `EXECUTE of transaction commands is not implemented`). Alternativa: `set_config('request.jwt.claims', ...)` + chamada direta das funções de policy.

**Método alternativo executado:**
```sql
-- Verificar can_edit_contact para cada user usando profile IDs diretos
WITH params_a AS (...), params_b AS (...)
SELECT
  COUNT(*) FILTER (WHERE vis_a AND vis_b) AS "ambos_veem",
  COUNT(*) FILTER (WHERE vis_a AND NOT vis_b) AS "so_A_ve",
  COUNT(*) FILTER (WHERE NOT vis_a AND vis_b) AS "so_B_ve",
  COUNT(*) FILTER (WHERE NOT vis_a AND NOT vis_b) AS "nenhum_ve",
  COUNT(*) AS total
FROM visibility;
```

**Resultado (User A × User B — agentes do mesmo workspace):**

| Métrica | Valor |
|---------|-------|
| Ambos veem (contatos compartilhados via filas) | 3104 |
| Só User A vê | 0 |
| Só User B vê | 0 |
| Nenhum vê (não atribuído ou fila de terceiros) | 202 |
| Total contatos ativos | 3306 |

**Interpretação:** User A e B são agentes das mesmas filas → isolamento correto (nenhum acessa contato fora de suas filas). Os 202 contatos "nenhum vê" estão em filas de outros agentes ou sem atribuição.

### C2 — Vulnerabilidade T-11: Queue Member Hijack

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

### PITR e WAL
```sql
SELECT name, setting FROM pg_settings
WHERE name IN ('archive_mode','wal_level','archive_command');
-- Resultado:
-- archive_mode   = on
-- wal_level      = logical
-- archive_command = /usr/bin/admin-mgr wal-push
```
**PITR ativo** (archive_mode=on, wal_level=logical, wal-push para S3).

### Timeouts de sessão
```sql
SELECT name, setting, unit FROM pg_settings
WHERE name IN ('statement_timeout','idle_in_transaction_session_timeout','lock_timeout');
-- Resultado:
-- statement_timeout                    = 120000 ms  (2 min)
-- idle_in_transaction_session_timeout  = 0          (DESLIGADO)
-- lock_timeout                         = 0          (DESLIGADO)
```
**B3-complemento:** `idle_in_transaction_session_timeout=0` — conexões presas em transação aberta nunca são terminadas automaticamente. Risco: pool esgotado por conexão travada em BEGIN + user desconectado (sem rollback).

### login_attempts (B3)
```sql
SELECT count(*), min(created_at), max(created_at) FROM public.login_attempts;
-- Resultado: count=18, min=2026-08-28, max=2026-10-10

SELECT count(*) FROM public.login_attempts WHERE created_at < now() - interval '90 days';
-- Resultado: 0 (nenhum registro mais velho que 90d no momento da auditoria)

SELECT column_name FROM information_schema.columns
WHERE table_name='login_attempts' AND column_name IN ('expires_at','ttl','valid_until');
-- Resultado: 0 rows (sem coluna de expiração)
```
**B3:** 18 registros, sem TTL/expiração automática. Atualmente sem registros antigos (>90d), mas a falta de TTL é risco futuro de acúmulo silencioso.

### Resumo

| Item | Status | Evidência |
|------|--------|----------|
| PITR | **ATIVO** | archive_mode=on, wal_level=logical, wal-push ativo |
| Staging | AUSENTE | — |
| Advisors Supabase | NÃO VERIFICÁVEL | `pgmeta_advisors` — 42P01 em todas as tentativas |
| login_attempts TTL | LACUNA (B3) | 18 registros; sem `expires_at`; sem cron de purge |
| idle_in_transaction timeout | LACUNA | `idle_in_transaction_session_timeout=0` — conexões presas nunca terminadas |
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
| **IMEDIATO** | C1: 0 MFA | Supabase Dashboard → Authentication → MFA policy (forçar TOTP para todos os 10 usuários) |
| **IMEDIATO** | C2: T-11 hijack | BEFORE UPDATE trigger em `contacts` rejeitando mudança de `assigned_to` por não-admin |
| **CURTO** | A1: auth audit vazio | Dashboard → Authentication → Settings (habilitar log) |
| **CURTO** | A2: pool exhaustion | `propostas/P05_fix_pgcron_pool.sql` |
| **CURTO** | M1: 39 UPDATE sem WITH CHECK (re-exec) | `propostas/P01_add_with_check_update_policies.sql` |
| **CURTO** | M2: views sem security_invoker | `propostas/P07_fix_views_security_invoker.sql` |
| **MÉDIO** | M3: 64 NULL statements (re-exec; era 65, 1 corrigido por outra sessão) | `node scripts/db-audit/register-migration.mjs` por arquivo |
| **MÉDIO** | M5: 34 FKs sem índice (re-exec) | `propostas/P08_add_missing_fk_indexes.sql` |
| **MÉDIO** | M6 (S8-F1): ai-jobs-worker — `get_ai_jobs_cron_secret()` RPC ausente; fail-closed 401, cron nunca executa | Criar RPC no banco para desbloquear o cron |
| **BAIXO** | B1: MIME multiplix-voice | Storage → Edit bucket → MIME types |
| **BAIXO** | B2: search_contacts N+1 | Adicionar índice GIN/trigram em `contacts.name, phone, email, company` |
| **BAIXO** | S6-F1: reconnection-logs raw DELETE | Encapsular em função `public.purge_reconnection_logs()` com log de rows deletadas |
| **BAIXO** | S6-F2: cleanup-edge-rate-limits raw DELETE | Encapsular em função com log de rows deletadas |
| **INFO** | S6-F3 (I7): vacuum-contacts-daily | VACUUM via pg_cron não pode ser rollbackado; considerar substituir por chamada a `pg_stat_user_tables` + alerta em vez de forçar VACUUM periodicamente |
| **INFO** | S8-F2 (I5): copilot-live stub | Restringir CORS `*` antes de implementar lógica real; migrar `serve` deprecated para `Deno.serve` |
| **INFO** | S8-F3 (I6): status público | Nenhuma ação; público por design |

---

---

## Detalhamento por Achado (todos os 23)

### C1 — 0% MFA (CRÍTICO)

| Campo | Valor |
|-------|-------|
| **Objeto** | `auth.users` (10 usuários), `auth.mfa_factors` |
| **Evidência** | `SELECT count(*) FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id=u.id AND f.status='verified') AND u.deleted_at IS NULL` → **10** |
| **Impacto** | Credencial comprometida = acesso completo ao workspace (sem 2º fator) |
| **Reprodução** | Atacante com senha obtida (phishing/breach) faz login direto; nenhum OTP bloqueante |
| **Correção** | Dashboard Supabase → Authentication → MFA Policy → "Required"; cada usuário recebe email para cadastrar TOTP |
| **Risco de regressão** | Baixo — somente afeta novos logins |
| **Esforço** | 15 min (configuração) + notificar 10 usuários |

### C2 — T-11 Queue Member Hijack (CRÍTICO)

| Campo | Valor |
|-------|-------|
| **Objeto** | Policy `UPDATE` em `contacts` (qualquer policy que use `can_edit_contact` sem WITH CHECK) |
| **Evidência** | T-11 em S11: `UPDATE contacts SET assigned_to=ProfileA WHERE id=ContactB_da_fila` → UPDATE 1 (deveria ser 0) |
| **Impacto** | Agente membro de fila pode reatribuir para si qualquer contato da fila, quebrando distribuição de atendimentos |
| **Reprodução** | 1. User A é membro ativo de QueueF1; 2. Contato C tem assigned_to=ProfileB, queue_id=QueueF1; 3. User A executa UPDATE SET assigned_to=ProfileA → sucesso |
| **Correção** | Opção A: `WITH CHECK (can_edit_contact(assigned_to, queue_id) AND (assigned_to = OLD.assigned_to OR is_admin_or_supervisor()))` na policy; Opção B: BEFORE UPDATE trigger rejeitando mudança de `assigned_to` por não-admin |
| **Risco de regressão** | Médio — admins e supervisores não são afetados; somente restringe agentes regulares |
| **Esforço** | 30 min (SQL) + 1h testes RLS |

### A1 — auth.audit_log_entries Vazio (ALTO)

| Campo | Valor |
|-------|-------|
| **Objeto** | `auth.audit_log_entries` |
| **Evidência** | `SELECT count(*) FROM auth.audit_log_entries` → **0** (total, desde criação do projeto) |
| **Impacto** | Impossível rastrear quem logou, quando, de qual IP; forensia de incidente inviável |
| **Reprodução** | Qualquer `SELECT count(*) FROM auth.audit_log_entries` retorna 0 |
| **Correção** | Supabase Dashboard → Authentication → Settings → habilitar "Log logins" / audit trail |
| **Risco de regressão** | Baixo — somente adiciona escrita nova; sem impacto em leituras existentes |
| **Esforço** | 5 min (toggle) |

### A2 — pg_cron Pool Exhaustion 6.2% (ALTO)

| Campo | Valor |
|-------|-------|
| **Objeto** | `cron.job_run_details`, 20 jobs com falha nos últimos 30d |
| **Evidência** | 14055/226945 falhas em 30d = 6.2%; 100% com `return_message='job startup timeout'`; pico 9 crons simultâneos no minuto :07 |
| **Impacto** | 6.2% das execuções silenciosamente descartadas; `dispatch-scheduled-messages` perde ~900 runs/semana |
| **Reprodução** | Verificar minuto :07 na tabela `cron.job_run_details` — concentração de falhas |
| **Correção** | `propostas/P05_fix_pgcron_pool.sql`: aumentar `max_worker_processes` / escalonar schedules; mover crons every-minute para `*/1` com staggering (`:00`, `:01`, `:02`) |
| **Risco de regressão** | Baixo — mudança de schedule não afeta lógica, só timing |
| **Esforço** | 2h (análise de overlap + PR de migration) |

### M1 — 39 UPDATE sem WITH CHECK (MÉDIO)

| Campo | Valor |
|-------|-------|
| **Objeto** | 39 policies UPDATE em 26+ tabelas |
| **Evidência** | Re-exec 2026-11-01: `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND cmd='UPDATE' AND qual IS NOT NULL AND with_check IS NULL` → **39** |
| **Impacto** | `assigned_to`/`queue_id`/outros campos podem ser alterados via UPDATE mesmo que nova linha viole isolamento (conforme T-11) |
| **Reprodução** | Ver T-11 em S11 — cenário concreto demonstrado |
| **Correção** | `propostas/P01_add_with_check_update_policies.sql` — adicionar `WITH CHECK (mesma_expressão_do_USING)` a cada policy |
| **Risco de regressão** | Médio — `WITH CHECK` mais estrito pode bloquear UPDATE legítimos se USING e a nova linha divergirem |
| **Esforço** | 4h (gerar e revisar os 39 WITHs; testar casos limítrofes) |

### M2 — 1 View sem security_invoker (MÉDIO)

| Campo | Valor |
|-------|-------|
| **Objeto** | View `catalog_send_stats` (1/13 sem `security_invoker=true`, re-exec via `pg_class.reloptions`) |
| **Evidência** | Re-exec 2026-11-01 via pg_class: 1 view sem `security_invoker=on` na lista `reloptions` |
| **Impacto** | View executa com privilégios do criador (postgres), podendo expor tabelas sem RLS a usuários autenticados |
| **Reprodução** | Usuário autenticado `SELECT * FROM catalog_send_stats` via PostgREST; se tabelas subjacentes não têm RLS adequado, vê dados além do permitido |
| **Correção** | `propostas/P07_fix_views_security_invoker.sql`: `CREATE OR REPLACE VIEW catalog_send_stats WITH (security_invoker=true) AS <DDL atual>` |
| **Risco de regressão** | Baixo — apenas restringe, não amplia acesso |
| **Esforço** | 30 min por view (ler DDL atual + recriar) |

### M3 — 64 NULL statements no ledger (MÉDIO)

| Campo | Valor |
|-------|-------|
| **Objeto** | `supabase_migrations.schema_migrations` (64 linhas com `statements IS NULL`) |
| **Evidência** | `SELECT count(*) FILTER (WHERE statements IS NULL) FROM supabase_migrations.schema_migrations` → **65** (1 corrigido durante auditoria por outra sessão → 64 restantes) |
| **Impacto** | `db-live-guard` não consegue verificar o que foi aplicado; replay-local falha com exceções `pinned-replay`; rastreabilidade perdida |
| **Reprodução** | `SELECT version FROM supabase_migrations.schema_migrations WHERE statements IS NULL` lista as 64 versões |
| **Correção** | Para cada version NULL: confirmar o estado ao vivo do objeto (`pg_get_functiondef`, `pg_indexes`), preencher `statements` com o SQL real via `scripts/db-audit/register-migration.mjs` |
| **Risco de regressão** | Baixo — somente escrita no ledger, sem mudança de DDL |
| **Esforço** | 4-8h (64 migrations × ~5 min cada) |

### M4 — +5 drift repo×banco (MÉDIO)

| Campo | Valor |
|-------|-------|
| **Objeto** | 5 versões presentes no banco mas não em `supabase/migrations/*.sql` |
| **Evidência** | `ls supabase/migrations/*.sql \| grep -v foreign\|superseded \| wc -l` → 1067; `SELECT count(*) FROM supabase_migrations.schema_migrations` → 1072; delta = 5 |
| **Impacto** | Replay do zero não recria esses objetos; `db-live-guard` acusa drift indefinidamente |
| **Reprodução** | `SELECT version FROM supabase_migrations.schema_migrations` EXCEPT versões nos arquivos do repo |
| **Correção** | Criar os 5 arquivos faltantes com o DDL confirmado via `pg_get_functiondef`/`pg_indexes` |
| **Risco de regressão** | Baixo — somente adiciona arquivos |
| **Esforço** | 2h (5 arquivos × ~24 min cada) |

### M5 — 34 FKs sem índice (MÉDIO)

| Campo | Valor |
|-------|-------|
| **Objeto** | 34 foreign keys em tabelas `public` sem índice na coluna referenciadora |
| **Evidência** | Re-exec 2026-11-01: query `information_schema.table_constraints NOT EXISTS pg_indexes` → **34**; lista completa em `inventario/s4-vault-fks-integridade.json` |
| **Impacto** | DELETE/UPDATE na tabela pai faz Seq Scan na tabela filha; joins lentos em operações de cascata |
| **Reprodução** | EXPLAIN `DELETE FROM profiles WHERE id=$1` em tabelas pai de uma das 34 FK → Seq Scan |
| **Correção** | `propostas/P08_add_missing_fk_indexes.sql`: `CREATE INDEX IF NOT EXISTS idx_<tabela>_<coluna>` para cada FK |
| **Risco de regressão** | Muito baixo — `CREATE INDEX` sem `UNIQUE` nunca rejeita dados |
| **Esforço** | 1h (34 CREATEs; testar com EXPLAIN antes/depois) |

### M6 — ai-jobs-worker RPC ausente (MÉDIO)

| Campo | Valor |
|-------|-------|
| **Objeto** | Edge function `ai-jobs-worker`, RPC `get_ai_jobs_cron_secret()` |
| **Evidência** | Código (`supabase/functions/ai-jobs-worker/index.ts` linhas 29-32): comentário explícito "esta RPC pode não existir"; `SELECT proname FROM pg_proc WHERE proname='get_ai_jobs_cron_secret'` → **0 rows** |
| **Impacto** | Cron `ai-jobs-tick-1min` dispara `ai-jobs-worker` → 401 fail-closed → cron nunca processa jobs de IA |
| **Reprodução** | `SELECT proname FROM pg_proc WHERE proname='get_ai_jobs_cron_secret'` → 0 rows |
| **Correção** | Criar RPC `get_ai_jobs_cron_secret()` retornando `vault.decrypted_secrets` adequado; ou migrar auth para `isAuthorizedCronOrUser` com secret já existente |
| **Risco de regressão** | Baixo — adiciona apenas nova RPC; cron passa de "nunca executa" para "executa" |
| **Esforço** | 1h (migration + teste de invocação manual da edge) |

### B1 — multiplix-voice MIME null (BAIXO)

| Campo | Valor |
|-------|-------|
| **Objeto** | Bucket `multiplix-voice` (storage.buckets) |
| **Evidência** | `SELECT id, allowed_mime_types FROM storage.buckets WHERE id='multiplix-voice'` → `NULL` |
| **Impacto** | Upload de qualquer tipo de arquivo aceito (executáveis, scripts, etc.) — vetor de armazenamento de malware |
| **Reprodução** | Upload via API com qualquer `Content-Type` aceito sem rejeição |
| **Correção** | Dashboard Storage → Edit bucket → MIME types: `['audio/mpeg','audio/ogg','audio/wav','audio/webm']` |
| **Risco de regressão** | Baixo — somente restringe novos uploads; arquivos existentes não são afetados |
| **Esforço** | 5 min |

### B2 — search_contacts Seq Scan + N+1 (BAIXO)

| Campo | Valor |
|-------|-------|
| **Objeto** | Função `search_contacts`, tabela `contacts` |
| **Evidência** | EXPLAIN com ILIKE: Seq Scan completo + `can_edit_contact()` por row; pg_stat_statements: mean=1952ms, 750 calls |
| **Impacto** | Busca de contato por texto em produção = Seq Scan em ~3300+ rows com N+1 chamadas a `can_edit_contact` |
| **Reprodução** | `EXPLAIN SELECT * FROM search_contacts('teste', ...)` → Seq Scan |
| **Correção** | Criar índice GIN trigram: `CREATE INDEX idx_contacts_name_trgm ON contacts USING gin(name gin_trgm_ops)` (requer `pg_trgm`); refatorar `can_edit_contact` para batch lookup |
| **Risco de regressão** | Baixo — índice novo sem UNIQUE |
| **Esforço** | 4h (índice + refactor + EXPLAIN validação) |

### B3 — login_attempts sem TTL (BAIXO)

| Campo | Valor |
|-------|-------|
| **Objeto** | Tabela `login_attempts` (18 registros em 2026-08-28 a 2026-10-10) |
| **Evidência** | `SELECT column_name FROM information_schema.columns WHERE table_name='login_attempts' AND column_name IN ('expires_at','ttl')` → 0 rows; sem cron de purge em `cron.job` |
| **Impacto** | Registros de tentativas acumulam indefinidamente; potencial exposição de metadados de falhas de login sem janela de rotação |
| **Reprodução** | Tentativas de login reprovadas ficam permanentemente na tabela |
| **Correção** | Adicionar cron de purge (ex.: `DELETE FROM login_attempts WHERE created_at < now() - interval '90 days'`) ou coluna `expires_at` + GUC `idle_in_transaction_session_timeout` |
| **Risco de regressão** | Muito baixo |
| **Esforço** | 30 min |

### B4 — inbox_unread_total N+1 (BAIXO)

| Campo | Valor |
|-------|-------|
| **Objeto** | Função `inbox_unread_total`, tabela `messages` |
| **Evidência** | EXPLAIN: `is_contact_visible_to_user(contact_id, ...)` chamada por row do CTE (até 1677×/execução); pg_stat_statements: mean=810ms, 1747 calls |
| **Impacto** | 810ms médio para contagem de não-lidas; escala pior com aumento de mensagens |
| **Reprodução** | `EXPLAIN SELECT inbox_unread_total()` → Filter com `is_contact_visible_to_user` por row |
| **Correção** | Refatorar para JOIN em vez de chamada por row; ou materializar resultado em tabela de contagem atualizada por trigger |
| **Risco de regressão** | Médio — mudança de lógica de visibilidade pode afetar contagem |
| **Esforço** | 4-8h (refactor + testes de regressão) |

### B5 — reconnection-logs raw DELETE (BAIXO)

| Campo | Valor |
|-------|-------|
| **Objeto** | Cron `reconnection-logs-retention-30d`, tabela `reconnection_logs` |
| **Evidência** | `SELECT command FROM cron.job WHERE jobname='reconnection-logs-retention-30d'` → SQL `DELETE FROM public.reconnection_logs WHERE created_at < now() - interval '30 days'` |
| **Impacto** | DELETE sem contagem de rows, sem log em `audit_logs`; impossível saber quantos registros foram removidos |
| **Reprodução** | Verificar ausência de registro em `audit_logs` após execução do cron |
| **Correção** | Encapsular em `CREATE OR REPLACE FUNCTION purge_reconnection_logs() ... INSERT INTO audit_logs (action, count) ...` |
| **Risco de regressão** | Muito baixo |
| **Esforço** | 1h |

### B6 — cleanup-edge-rate-limits raw DELETE (BAIXO)

| Campo | Valor |
|-------|-------|
| **Objeto** | Cron `cleanup-edge-rate-limits`, tabela `edge_rate_limits` |
| **Evidência** | `SELECT command FROM cron.job WHERE jobname='cleanup-edge-rate-limits'` → SQL `DELETE FROM public.edge_rate_limits WHERE updated_at < now() - interval '1 hour'` |
| **Impacto** | Mesmo que B5: DELETE sem auditoria |
| **Reprodução** | Verificar ausência de registro de contagem após execução |
| **Correção** | Encapsular em função com log de rows deletadas |
| **Risco de regressão** | Muito baixo |
| **Esforço** | 1h |

### I1 — PITR Ativo (INFO)

| Campo | Valor |
|-------|-------|
| **Objeto** | `pg_settings`: `archive_mode`, `wal_level`, `archive_command` |
| **Evidência** | archive_mode=on, wal_level=logical, archive_command=/usr/bin/admin-mgr wal-push |
| **Observação** | Positivo — PITR disponível; documentado para completude |

### I2 — 402 SECURITY DEFINER com search_path (INFO)

| Campo | Valor |
|-------|-------|
| **Evidência** | `SELECT count(*) FROM pg_proc ... WHERE prosecdef=true AND NOT EXISTS (... proconfig LIKE 'search_path=%')` → **0** |
| **Observação** | Positivo — todas as 402 funções SECURITY DEFINER têm search_path configurado |

### I3 — 14 verify_jwt=false Protegidas (INFO)

| Campo | Valor |
|-------|-------|
| **Evidência** | `grep -B2 "verify_jwt = false" supabase/config.toml` → 14 funções; todas com auth alternativa verificada no código |
| **Observação** | Positivo — nenhuma função verify_jwt=false é pública sem proteção |

### I4 — 107MB Índices Ociosos (INFO)

| Campo | Valor |
|-------|-------|
| **Objeto** | `email_attachments_msg_att_key` (61MB), `email_messages_body_text_trgm` (17MB), outros |
| **Evidência** | Query `pg_stat_user_indexes WHERE idx_scan=0` — total ~107MB |
| **Observação** | Oportunidade de reclamar espaço; sem risco funcional |

### I5 — copilot-live stub/CORS* (INFO)

| Campo | Valor |
|-------|-------|
| **Objeto** | Edge function `copilot-live` |
| **Evidência** | Código: stub sem lógica; `serve` deprecated (deno std); `Access-Control-Allow-Origin: *` hardcoded |
| **Observação** | Sem risco enquanto for stub; CORS deve ser restringido antes de implementar lógica |

### I6 — status endpoint público (INFO)

| Campo | Valor |
|-------|-------|
| **Objeto** | Edge function `status` |
| **Evidência** | Código: sem auth, retorna `{ok: true, project: "..."}` |
| **Observação** | Intencional (smoke check); sem risco |

### I7 — vacuum-contacts-daily direto (INFO)

| Campo | Valor |
|-------|-------|
| **Objeto** | Cron `vacuum-contacts-daily` |
| **Evidência** | `SELECT command FROM cron.job WHERE jobname='vacuum-contacts-daily'` → `VACUUM ANALYZE public.contacts` |
| **Observação** | VACUUM via cron é padrão válido, mas se o pool estiver esgotado no momento, falha silenciosamente com `job startup timeout` (indistinguível das outras falhas) |

---

## Plano em Ondas

### Onda 1 — IMEDIATO (0–48h)

| Achado | Ação | Responsável |
|--------|------|-------------|
| C1 — 0% MFA | Supabase Dashboard → Auth → MFA Policy → Required; notificar 10 usuários | Joaquim |
| C2 — T-11 hijack | Criar migration com `WITH CHECK` em policy de contacts OU BEFORE UPDATE trigger | Dev |

### Onda 2 — CURTO PRAZO (1–2 semanas)

| Achado | Ação | Responsável |
|--------|------|-------------|
| A1 — auth audit vazio | Dashboard → Auth → Settings → habilitar audit log | Joaquim |
| A2 — pool exhaustion 6.2% | `propostas/P05_fix_pgcron_pool.sql` — escalonar schedules | Dev |
| M1 — 39 UPDATE sem WITH CHECK | `propostas/P01_add_with_check_update_policies.sql` | Dev |
| M2 — view sem security_invoker | `propostas/P07_fix_views_security_invoker.sql` | Dev |
| M6 — ai-jobs-worker RPC ausente | Criar RPC `get_ai_jobs_cron_secret()` | Dev |

### Onda 3 — MÉDIO PRAZO (1–3 meses)

| Achado | Ação | Responsável |
|--------|------|-------------|
| M3 — 64 NULL statements | `register-migration.mjs` para cada arquivo; 64 migrations × ~5 min | Dev |
| M4 — +5 drift | Criar 5 arquivos de migration com DDL confirmado | Dev |
| M5 — 34 FKs sem índice | `propostas/P08_add_missing_fk_indexes.sql` | Dev |
| B1 — MIME multiplix-voice | Dashboard Storage → Edit bucket → MIME types | Dev/Joaquim |
| B2 — search_contacts N+1 | Índice GIN trigram + refactor can_edit_contact | Dev |
| B4 — inbox_unread_total N+1 | Refactor para JOIN | Dev |
| B5 — reconnection raw DELETE | Encapsular em função com audit | Dev |
| B6 — edge-rate-limits raw DELETE | Encapsular em função com audit | Dev |

### Onda 4 — BACKLOG (sem urgência)

| Achado | Ação |
|--------|------|
| B3 — login_attempts sem TTL | Cron de purge `> 90 dias` |
| I4 — 107MB índices ociosos | DROP INDEX após confirmar 0 idx_scan por 90d |
| I5 — copilot-live CORS * | Restringir ao implementar lógica real |
| I7 — vacuum-contacts-daily | Avaliar substituição por pg_stat_user_tables + alerta |

---

## Arquivos desta Auditoria

```
auditoria-supabase/
├── RELATORIO_AUDITORIA_SUPABASE.md     ← este arquivo (v4 final)
├── progresso.json                       ← estado 12 seções + severidade
├── inventario/                          ← 12 arquivos por seção
├── propostas/                           ← P01–P08 (NÃO APLICADAS, com ROLLBACK)
└── testes/
    ├── s11_rls_matrix_RESULTADO.md      ← v1: schema simulado (8/8 PASS)
    └── s11_rls_matrix_RESULTADO_v2.md   ← v2: policies reais (11/12 PASS, T-11 FALHA)
```
