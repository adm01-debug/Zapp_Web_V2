# PENDÊNCIAS DE CI

> Gerado em 2026-11-05 pela sessão `fix-ci-workflows-hxupgs`.
> Atualizar quando os bloqueios forem resolvidos.

---

## 1. Deploy Edge Functions — manifesto desatualizado

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/deploy-functions.yml` |
| Última run com falha | [#41883030015 (commit `afd8c7ca`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41883030015) |
| Erro exato | `Deployment manifest is stale: supabase/deployment-manifest.json` |
| Causa | PR [#2707](https://github.com/adm01-debug/Zapp_Web_V2/pull/2707) (`fix: cron do drain de ai_usage_outbox e comentario do CodeQL`) adicionou a edge function `ai-usage-outbox-drain` mas ainda não foi mergeada. O `generate-manifest.mjs` que atualiza `supabase/deployment-manifest.json` está dentro do próprio PR. |
| Por que não posso corrigir agora | PR #2707 toca `supabase/deployment-manifest.json` (conflito de arquivo — AGENTS.md regra 3) **e** contém migration DDL (`supabase/migrations/`) — requer aprovação do dono (AGENTS.md regra 8). |

### O que o dono precisa fazer

1. Revisar e mergear o PR [#2707](https://github.com/adm01-debug/Zapp_Web_V2/pull/2707).
2. Após o merge, o `deploy-functions.yml` será disparado automaticamente pelo push na `main` e deverá passar (manifesto regenerado pelo próprio PR).
3. Se o deploy ainda falhar após o merge, dispatchar manualmente `deploy-functions.yml` via GitHub Actions.

---

## 2. DB Live Guard — drift de migrations em produção

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-live-guard.yml` |
| Última run com falha | [#42039646275 (commit `341d3fda`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039646275) — verificado nesta sessão via dispatch |
| Issue de alerta | [#1965 — [db-live-guard] Contrato vivo do banco quebrado](https://github.com/adm01-debug/Zapp_Web_V2/issues/1965) (aberta desde 2026-10-16) |
| Passo que falha | `Comparar migrations com schema_migrations` |
| Causa raiz | Drift entre arquivos `.sql` em `supabase/migrations/` e registros em `schema_migrations` no banco de produção. |

**Detalhes do drift (medido em 2026-11-05 no commit `341d3fda`, 1082 arquivos × 1079 registros):**

| Versão | Arquivo | Situação |
|---|---|---|
| `20261026240300` | `20261026240300_drop_bkp_261023.sql` | **Arquivo no repo sem registro no banco** (apply pendente) |
| `20261102012400` | `20261102012400_login_attempts_retencao_90d.sql` | **Arquivo no repo sem registro no banco** (apply pendente) |
| `20261102032200` | `20261102032200_revoga_execute_public_cron_schedule.sql` | **Arquivo no repo sem registro no banco** (apply pendente) |
| `20261102012200` | `20261102012200_department_invites_restringe_escrita.sql` | **Conteúdo SQL divergente** (arquivo ≠ ledger) |
| `20261103201500` | `20261103201500_remove_pagamentos_e_special_agent.sql` | **Conteúdo SQL divergente** (arquivo ≠ ledger) |

### Por que não posso corrigir agora

Envolve DDL em banco de produção (AGENTS.md regra 8) — requer aprovação explícita do dono. As 3 migrations pendentes precisam de apply; as 2 divergentes precisam de diagnóstico (banco ou arquivo está correto?) antes de qualquer ação.

### O que o dono precisa fazer

1. Para as 3 **sem registro**: verificar se o DDL é seguro aplicar hoje e, se sim, executar via `db_query` do MCP `SUPABASE - ZAPP WEB V2 - MCP` usando `node scripts/db-audit/register-migration.mjs <arquivo.sql>` para gerar o SQL exato, sempre com `RETURNING` não-vazio como guarda.
2. Para as 2 **divergentes**: comparar `pg_get_functiondef` / `pg_indexes` / `pg_constraint` no banco com o SQL do arquivo para decidir se o banco ou o arquivo é a fonte correta, e então ou aplicar a correção ou atualizar o arquivo. Referência: `docs/MIGRATIONS.md`.
3. Após resolver, dispatchar novamente `db-live-guard.yml` para confirmar verde.

---

## 3. E2E logado — job authenticated aguardando conclusão

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/e2e-logado.yml` |
| Run em andamento | [#42039283192 (commit `341d3fda`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039283192) |
| Status no momento deste commit | `in_progress` — job `authenticated` rodando step 8 desde 13:50:28Z (timeout: 75 min) |
| Jobs concluídos com sucesso | `deslogado-principal` ✅ (13:50:08Z–13:55:59Z) · `deslogado-secundario` ✅ (13:50:08Z–13:56:04Z) |
| Job pendente | `authenticated` ⏳ — step "Validar grupo e executar a suíte no backend descartável" in_progress |
| Contexto | Workflow estava `disabled_manually`; reativado nesta sessão e dispatchado manualmente na `main` `341d3fda`. |

### Ação necessária

Nenhuma ação manual do dono. Quando o job `authenticated` concluir:
- Se `success`: workflow confirmado verde — atualizar RELATORIO_CI.md com `conclusion=success`.
- Se `failure`: diagnosticar a falha e abrir PR de correção ou registrar aqui o motivo.
