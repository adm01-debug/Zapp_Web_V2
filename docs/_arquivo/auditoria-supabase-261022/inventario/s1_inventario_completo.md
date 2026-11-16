# S1 — Inventário Completo do Banco de Produção

**Coletado em:** 2026-11-01T18:31:55Z  
**Projeto:** tnnnlkbymytvtqngbbqh (Supabase Cloud)  
**MCP:** SUPABASE - ZAPP WEB V2 - MCP

## Baseline (2026-11-01)

| Métrica | Valor |
|---|---|
| Migrations no banco | 1072 |
| Tabelas (schema public) | 211 |
| Políticas RLS | 520 |
| Funções | 481 |
| pg_cron jobs | 24 |
| Edge functions no repo | 87 |

## Tabelas

- **211 tabelas** no schema `public`
- **0 tabelas sem RLS** (todas têm RLS habilitado)
- **18 tabelas com RLS mas SEM políticas** (efetivamente inacessíveis para authenticated):
  - `_rb_message_reactions_contato_20261007001008`
  - `_zapp_fn_before` (também sem PK)
  - `_zapp_mig133_log`
  - `agent_mini_game_xp_daily`
  - `ai_budget_reservations`
  - `ai_jobs`
  - `catalog_rate_limit_hits`
  - `catalog_rate_limits`
  - `edge_rate_limits`
  - `gmail_oauth_states`
  - `link_preview_cache`
  - `search_events`
  - `searchbox_budget_alert_cron`
  - `searchbox_budget_alert_emails`
  - `talkx_storage_purge_queue`
  - `talkx_test_send_claims`
  - `team_chat_media_acl_r2_db_020_rb`
  - `voip_profile_credentials`
- **Tabela sem PK:** `_zapp_fn_before` (única)

## Chaves Estrangeiras sem Índice

**Total:** 30 FKs sem índice de suporte

Top 5:
| Tabela | FK Column |
|---|---|
| contacts | ai_projection_analysis_id |
| conversation_events | from_queue_id |
| conversation_events | to_queue_id |
| (27 mais) | ... |

## SECURITY DEFINER

```sql
SELECT count(*) as total_definer,
  count(*) FILTER (WHERE array_to_string(proconfig,'') NOT LIKE '%search_path%') as sem_search_path
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
WHERE n.nspname='public' AND prosecdef=true AND prokind='f';
-- Resultado: {"total_definer": 402, "sem_search_path": 0}
```

**Todas as 402 funções SECURITY DEFINER têm search_path configurado. ✓**

## Migrations: Repo vs Banco

| Fonte | Total |
|---|---|
| Banco (ledger) | 1072 |
| Repo (arquivos .sql) | 1067 |
| Diferença (banco − repo) | **5** |
| Migrations com NULL statements | **65** |

**Drift: 5 migrations no banco não encontradas no repo.**

## Evidência bruta

```sql
-- Baseline query (2026-11-01T18:31:55Z):
SELECT count(*) as total_tables FROM pg_tables WHERE schemaname='public';
-- Resultado: 211

SELECT count(*) as total_migrations FROM supabase_migrations.schema_migrations;
-- Resultado: 1072

SELECT count(*) FILTER (WHERE statements IS NULL) as null_stmts FROM supabase_migrations.schema_migrations;
-- Resultado: 65
```