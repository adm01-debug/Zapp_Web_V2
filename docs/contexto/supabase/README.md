# Snapshot Supabase — contexto para agentes de IA

Gerado automaticamente a cada 10 min pelo workflow `contexto` (job `banco`). **Não edite manualmente.**

Frescor: `git log -1 --format=%cI -- docs/contexto/supabase`. Só há commit quando algo mudou; o histórico está em `CHANGELOG.md`.

## Protocolo para agentes

1. **Tabela**: leia só `tables/<schema>/<tabela>.md` (colunas, FKs, índices, RLS, triggers, grants). ER geral em `relationships.md`.
2. **Antes de mexer em RLS/functions/índices**: leia `lints.md` e `policies.md`. Não repita problemas já listados.
3. **DDL exato**: `schema.sql` (se habilitado). **Tipos TS**: `types.ts` (se habilitado). **Lógica no banco**: `functions.md` + `functions/`.
4. **Migrations**: `migrations.md` lista o que já foi aplicado; nunca crie migration duplicada. Dashboard não registra ali — confira `schema.sql`.
5. **Jobs e integrações**: `cron.md`, `queues.md`, `webhooks.md`, `edge-functions.md`, `realtime.md`, `storage.md`, `auth.md`.
6. **Acesso**: `grants.md` + `roles.md` (timeouts por role) + `project-config.md` (schemas expostos, max_rows, PITR).
7. **Volume/perf**: `stats.md` (tamanhos, linhas, índices sem uso, queries custosas) — aproximado, não use como contagem exata.
8. `snapshot.json` = tudo estrutural em JSON para busca programática; `stats.json` = métricas brutas.

## Resumo

| categoria | quantidade |
|---|---|
| tabelas | 221 |
| colunas | 2522 |
| views | 13 |
| functions | 481 |
| triggers | 174 |
| policies (RLS) | 558 |
| índices | 774 |
| tipos/enums | 10 |
| extensões | 8 |
| cron jobs | 0 |
| filas pgmq | 0 |
| migrations | 1076 |
| buckets | 0 |
| edge functions | n/d |
| webhooks | 0 |
| lints ALTA | 1 |
| lints total | 490 |


## Servidor

| propriedade | valor |
|---|---|
| Postgres | 17.6 |
| database | postgres |
| timezone |  |
| max_connections | 60 |
| statement_timeout (global) | 90000 |
| projeto | n/d |
| região | n/d |
| URL | n/d |


## Arquivos

| arquivo | conteúdo |
|---|---|
| `tables.md` / `tables/` | índice e um arquivo por tabela; `tables/_supabase_internal_triggers.md` = triggers em auth/storage |
| `relationships.md` | todas as FKs + diagrama ER (Mermaid) |
| `schema.sql` | desligado neste repo (PGDUMP=false) |
| `types.ts` | desligado neste repo (GEN_TYPES=false) |
| `lints.md` | RLS faltando, security definer sem search_path, views sem security_invoker, FK sem índice, RPC anon… |
| `policies.md` | todas as policies RLS (incl. storage e realtime) |
| `functions.md` / `functions/` | funções/procedures com corpo SQL e quem pode executar via RPC |
| `triggers.md`, `indexes.md`, `views.md`, `types-enums.md`, `sequences.md`, `schemas.md`, `extensions.md` | objetos do schema |
| `grants.md`, `roles.md` | privilégios (tabela, coluna, sequence, default privileges) e roles com config |
| `cron.md`, `cron-runs.md`, `queues.md` | pg_cron (definições / execuções) e pgmq |
| `migrations.md` / `migrations/` | migrations aplicadas e seu SQL |
| `storage.md`, `auth.md`, `realtime.md`, `webhooks.md`, `vault.md`, `foreign-servers.md` | serviços e integrações |
| `edge-functions.md` / `edge-functions/` | edge functions (versão, verify_jwt, URL) e nomes dos secrets |
| `project-config.md` | PostgREST, Postgres, pooler, rede, SSL, branches, backups (redigido) |
| `stats.md` / `stats.json` | métricas voláteis |
| `snapshot.json` | tudo estrutural em JSON |
| `CHANGELOG.md` | diff semântico a cada mudança |
| `errors.md` | seções que falharam na última coleta |

## ⚠️ Problemas na última coleta

| seção | erro |
|---|---|
| db_stats | permission denied for schema auth |
