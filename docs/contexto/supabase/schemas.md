# Schemas

Schemas internos do Supabase ficam fora da introspecção geral (`_analytics, _realtime, _supavisor, auth, cron, extensions, graphql, graphql_public, net, pg_stat_statements, pgbouncer, pgmq, pgsodium, pgsodium_masks, pgtle, realtime, repack, storage, supabase_functions, supabase_migrations, vault`).

| schema | owner | USAGE para roles da API | comentário |
|---|---|---|---|
| _bkp_261023 | postgres |  | [backup-temporário] Snapshot de segurança criado em 23/10/2026 antes de migrations críticas do GOAL "Backend 100% operacional". Contém: contacts (3730 linhas), schema_migrations (922), functions_before (356), policies_before (456). DROP programado após 22/11/2026 — conferir antes se houve necessidade de restauração. |
| ops | postgres |  |  |
| public | pg_database_owner | anon, authenticated, service_role | standard public schema |
