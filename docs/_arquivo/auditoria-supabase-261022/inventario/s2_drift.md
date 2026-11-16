# S2 — Drift: Repo × Banco × Schema

**Coletado em:** 2026-11-01  
**Status:** PARCIALMENTE VERIFICADO

## Drift de Migrations

| Fonte | Total |
|---|---|
| Repo (`supabase/migrations/*.sql`) | 1067 |
| Banco (`schema_migrations`) | 1072 |
| Diferença | **+5 no banco** |

### Migrations com NULL statements (65 encontradas)

```sql
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE statements IS NULL ORDER BY version DESC LIMIT 10;
```

| version | name |
|---|---|
| 20261026210000 | dashboard_kpi_periodo_aditivo |
| 20261026200000 | contact_notes_pinned |
| 20261026190300 | saved_filters_inbox_limites |
| 20261026160000 | restore_rls_security_alerts_talkx_blacklist |
| 20261016250000 | revoke_anon_write_grants_all_tables |
| 20261016130000 | revert_wrong_security_fixes_passkey_search_events_purge_gmail |
| 20261016120000 | security_fixes_passkey_purge_gmail_search_events |
| (+ 58 mais antigas) | ... |

**Risco:** NULL statements impede replay local e invalida hash no `db-migrate.yml`.

### Migrations Duplicadas (mesmo nome, versões diferentes)

**Total pares duplicados:** 20 identificados.

## Drift de tipos.ts

**NÃO VERIFICADO** — comparação entre `types.ts` do repo e schema ao vivo requer execução do `supabase gen types typescript` offline.

## Edge Functions: Repo vs Banco

**Repo:** 87 diretórios em `supabase/functions/` (86 funções + `_shared`)

**NÃO VERIFICADO via API** — listagem de edge functions deployed requer CLI Supabase.

## Deno.env vs Vault

```sql
SELECT count(*) as total_secrets FROM vault.secrets;
-- Resultado: 13 secrets no vault
```

**NÃO VERIFICADO** — catálogo completo de `Deno.env.get()` requer leitura dos arquivos de edge functions.

## Archive/WAL (PITR)

| Parâmetro | Valor |
|---|---|
| archive_mode | `on` |
| archive_command | `/usr/bin/admin-mgr wal-push %p` (WAL-G) |
| wal_level | `logical` |
| max_wal_senders | `5` |

**PITR está ATIVO** via WAL archiving gerenciado pela Supabase. ✓