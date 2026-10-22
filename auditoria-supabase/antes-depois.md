# Prova de Antes × Depois — Auditoria READ-ONLY (2026-10-22)

Esta auditoria é **READ-ONLY**: o banco de produção não foi modificado.
O delta entre início e fim é ZERO para todos os objetos abaixo.

## Migrations no ledger

**Antes (início da auditoria):**
```
SELECT max(version) FROM supabase_migrations.schema_migrations;
-- max: 20261026090300  (revoke_multiplix_anon_public_execute)

SELECT count(*) FROM supabase_migrations.schema_migrations;
-- 922
```

**Depois (fim da auditoria — mesmo turno, READ-ONLY):**
```
SELECT max(version) FROM supabase_migrations.schema_migrations;
-- max: 20261026090300  (inalterado)

SELECT count(*) FROM supabase_migrations.schema_migrations;
-- 922  (inalterado)
```

**Migrations do PR #2186 NÃO aplicadas:**
```
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version IN ('20261026100300','20261026110300','20261026120300');
-- 0 linhas → nenhuma das 3 está no ledger
```

## Policies de RLS

**Antes e depois (inalteradas — READ-ONLY):**
```
SELECT count(*) FROM pg_policies WHERE schemaname='public';
-- 456  (antes = 456, depois = 456)
```

**dept_invites — policies com USING/CHECK permissivo (vulnerabilidade ativa S3-01/S3-02):**
```
SELECT policyname, cmd, qual, with_check
FROM pg_policies WHERE tablename='department_invites';

dept_invites_delete_authenticated | DELETE | true       | null   ← S3-01 (USING true)
dept_invites_insert_authenticated | INSERT | null       | true   ← S3-02 (WITH CHECK true)
dept_invites_select_authenticated | SELECT | true       | null   ← OK (select é público)
```

Após merge do PR #2186 + apply da migration `20261026100300`, esses valores vão mudar para
políticas restritas por `department_id` — mas isso ainda NÃO ocorreu.

## Cron jobs

**Antes e depois (inalterados — READ-ONLY):**
```
SELECT count(*) FROM cron.job;
-- 16  (antes = 16, depois = 16)
```

**Nomes dos 16 jobs existentes:**
```
SELECT jobname FROM cron.job ORDER BY jobname;

ai-jobs-tick-1min
avatars-refresh
cleanup-edge-rate-limits
cleanup-link-preview-cache
connection-health-check
crm-sync-outbox
crm-sync-outbox-cleanup
expire-stale-agent-presence
gmail-incremental-sync
multiplix-send-trigger
search-events-retention
searchbox-budget-alert
talkx-scheduler-1min
tasks-notify-due
vacuum-contacts-daily
vacuum-messages-post-expurgo
```

**Job de TTL de login_attempts NÃO existe (S12-01 ativa):**
```
SELECT jobname FROM cron.job WHERE jobname LIKE '%login%';
-- 0 linhas → cron NÃO existe
```

Após merge do PR #2186 + apply da migration `20261026110300`, o job
`login-attempts-ttl-90d` será criado — mas isso ainda NÃO ocorreu.

## Storage buckets

**Antes e depois (inalterados):**
```
SELECT count(*) FROM storage.buckets;
-- 8  (antes = 8, depois = 8)
```

**multiplix-voice file_size_limit=null (S8-02 ativa):**
```
SELECT id, file_size_limit FROM storage.buckets WHERE id='multiplix-voice';
-- multiplix-voice | null  (inalterado)
```

## MFA

**Antes e depois (inalterados):**
```
SELECT count(*) FROM auth.users;          -- 10
SELECT count(*) FROM auth.mfa_factors;    -- 0
```

## Propostas geradas (NÃO APLICADAS)

| Arquivo | Migration version | O que corrige | Status |
|---------|-------------------|---------------|--------|
| `propostas/P001_dept_invites_ownership.sql` | `20261026100300` | S3-01 + S3-02 | **NÃO APLICADA** — em PR #2186 |
| `propostas/P010_login_attempts_ttl.sql` | `20261026110300` | S12-01 | **NÃO APLICADA** — em PR #2186 |
| `propostas/P003_log_search_event_rpc.sql` | `20261026120300` | S2-01 | **NÃO APLICADA** — em PR #2186 |

Cada proposta contém seção `-- ROLLBACK` com o SQL de reversão completo.

### P001 — ROLLBACK da correção S3-01/S3-02:
```sql
-- ROLLBACK (reverter para políticas permissivas originais):
DROP POLICY IF EXISTS dept_invites_delete_authenticated ON public.department_invites;
CREATE POLICY dept_invites_delete_authenticated ON public.department_invites
  FOR DELETE TO authenticated USING (true);
DROP POLICY IF EXISTS dept_invites_insert_authenticated ON public.department_invites;
CREATE POLICY dept_invites_insert_authenticated ON public.department_invites
  FOR INSERT TO authenticated WITH CHECK (true);
```

### P010 — ROLLBACK da correção S12-01:
```sql
-- ROLLBACK (remover cron e índice):
SELECT cron.unschedule('login-attempts-ttl-90d');
DROP INDEX IF EXISTS public.idx_login_attempts_created_at;
```

### P003 — ROLLBACK da correção S2-01:
```sql
-- ROLLBACK (remover RPC):
DROP FUNCTION IF EXISTS public.log_search_event(text, integer, boolean);
```
