# Inventário de Tabelas — 173 tabelas públicas (2026-10-22)

Fonte: `pg_tables` + `pg_policies` (schema `public`).

## Status RLS

Todas as 173 tabelas têm `rowsecurity = true` (RLS habilitado).

## Tabelas com zero policies (default-deny — correto)

11 tabelas com RLS ON e ZERO policies = acesso negado para qualquer role não-service_role:

| Tabela | Observação |
|--------|-----------|
| `_zapp_fn_before` | Tabela interna de migrations |
| `_zapp_mig133_log` | Log de migration |
| `ai_budget_reservations` | Acesso só por funções SECURITY DEFINER |
| `ai_jobs` | Acesso só por funções SECURITY DEFINER |
| `catalog_rate_limit_hits` | Acesso só por service_role/funções |
| `catalog_rate_limits` | Acesso só por service_role/funções |
| `edge_rate_limits` | Acesso por DELETE cron e funções |
| `gmail_oauth_states` | Estados temporários OAuth |
| `link_preview_cache` | Cache gerenciado por funções |
| `talkx_storage_purge_queue` | Fila interna do TalkX |
| `talkx_test_send_claims` | Claims de teste do TalkX |

**Achado I7:** 11 tabelas default-deny — comportamento CORRETO e desejado.

## Tabelas com policies USING(true) ou WITH_CHECK(true) — achados S3

| Tabela | Policy | Tipo | Severidade |
|--------|--------|------|------------|
| `department_invites` | `dept_invites_delete_authenticated` | DELETE USING(true) | **ALTO** (S3-01) — corrigida em PR #2186 |
| `department_invites` | `dept_invites_insert_authenticated` | INSERT WITH_CHECK(true) | **ALTO** (S3-02) — corrigida em PR #2186 |
| `webhook_failures` | `service_role_full` | ALL USING(true) WITH_CHECK(true) | BAIXO (B2 — mitigado por role service_role) |

## Tabelas internas (prefixo `_`)

| Tabela | Uso |
|--------|-----|
| `_zapp_fn_before` | Suporte a migrations — tabela de estado |
| `_zapp_mig133_log` | Log da migration #133 |

## Total de policies por tabela (top 10 mais protegidas)

(baseado em contagem via `pg_policies`, data da auditoria)

As tabelas com mais policies refletem isolamento multi-tenant complexo: `contacts`, `conversations`, `messages`, `profiles`, `departments`, `campaigns`.
