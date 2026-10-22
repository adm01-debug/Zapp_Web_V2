# Inventário de Migrations — Ledger (2026-10-22)

## Estado do Ledger (READ-ONLY — nada foi modificado)

| Campo | Valor |
|-------|-------|
| max(version) | `20261026090300` |
| count total | 922 |
| statements NULL | 61 |
| PR #2186 aplicado? | **NÃO** — 3 migrations pendentes |

## Migrations do PR #2186 (NÃO APLICADAS)

| Version | Arquivo | O que corrige |
|---------|---------|---------------|
| `20261026100300` | `P001_dept_invites_ownership.sql` | S3-01 + S3-02 (RLS dept_invites) |
| `20261026110300` | `P010_login_attempts_ttl.sql` | S12-01 (TTL login_attempts) |
| `20261026120300` | `P003_log_search_event_rpc.sql` | S2-01 (RPC log_search_event) |

## Evidência de que NÃO foram aplicadas

```sql
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('20261026100300','20261026110300','20261026120300');
-- 0 linhas → confirmado 2026-10-22
```

## Baseline antes/depois (INALTERADO)

```
Antes da auditoria:  max=20261026090300, count=922
Depois da auditoria: max=20261026090300, count=922  ← ZERO mudanças
```
