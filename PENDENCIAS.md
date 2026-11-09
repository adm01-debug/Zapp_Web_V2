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

## 3. E2E logado — job authenticated: browser-suite-failed

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/e2e-logado.yml` |
| Falha documentada | [#42039283192 (commit `341d3fda`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039283192) |
| Run em `d985c7fc` | [#42061398622](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42061398622) — `pending` (criado por `workflow_run` do CI/CD Pipeline; mesmo comportamento esperado) |
| Job | `authenticated` ([127285511593](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039283192/job/127285511593)) |
| Passo que falha | `Validar grupo e executar a suíte no backend descartável` (step 8, 13:50:28Z–14:40:23Z, ~50 min) |
| Código de falha | `browser-suite-failed` — `real-browser-suite` executou ~45 min; 0 casos identificados no resumo público |
| Issue aberta | "[e2e-logado] Suíte logada quebrada na main" (criada em 14:40:25Z, 0 test cases no resumo público) |
| Jobs que passaram | `deslogado-principal` ✅ (13:50:08Z–13:55:59Z) · `deslogado-secundario` ✅ (13:50:08Z–13:56:04Z) |
| Artefato diagnóstico | `playwright-report-logado-authenticated-42039283192-1` (195 KB, 44 arquivos; expira ~2026-11-08) |

### O que o dono precisa fazer

1. Baixar o artefato [playwright-report-logado-authenticated-42039283192-1](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039283192/artifacts/13425621512) para identificar qual(is) teste(s) falhou/falharam e o motivo exato.
2. Se for regressão de código: abrir PR de fix.
3. Se for infra/flakiness: re-executar `workflow_dispatch` em `e2e-logado.yml` na `main` atual para confirmar verde.
4. Depois de verificar verde: atualizar este arquivo removendo este bloqueio e atualizar RELATORIO_CI.md §3/§4.3.

---

## 5. CI Queue — fila de runners GitHub (sessão 2026-11-09)

| Campo | Valor |
|---|---|
| PR | [#2881](https://github.com/adm01-debug/Zapp_Web_V2/pull/2881) — branch `claude_05/brave-mccarthy-zvzky4` |
| HEAD atual | `2fc7053f553bba83f184034f593d6a8f0ebcf134` |
| Run CI/CD Pipeline | [42543039375](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42543039375) — `pending` desde 2026-11-09T00:58:25Z |
| Run DB Guard | [42543039418](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42543039418) — `pending` desde 2026-11-09T00:58:25Z |
| Run E2E | [42543039370](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42543039370) — `pending` desde 2026-11-09T00:58:25Z |
| Causa | Fila global de runners do GitHub (status `pending` = fila de infra, não concorrência). Múltiplas sessões de agentes competem por runners simultaneamente. |
| Check-in armado | Trigger `trig_019uUbVo8NyetZNRjJZ4Qrdi` — verificação programada para 2026-11-09T02:03Z |
| Ação do dono | Nenhuma — condição temporária. Runs iniciarão quando runners ficarem disponíveis. Se após 02:03Z ainda `pending`, verificar se existe run stuck bloqueando o grupo de concorrência. |

**Histórico de runs canceladas (HEAD anteriores):**

| Run ID | HEAD | Status |
|---|---|---|
| [42538584418](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42538584418) | `76a6072f` | `queued` → cancelada |
| [42538584548](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42538584548) | `76a6072f` | cancelled |
| [42540034065](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42540034065) | `cb292233` | cancelled |
| [42540033943](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42540033943) | `cb292233` | cancelled |
| [42541991611](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42541991611) | `558f4a9a` | cancelled |
| [42541991641](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42541991641) | `558f4a9a` | cancelled |
| [42542650389](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42542650389) | `18a87133` | cancelled |
| [42542650448](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42542650448) | `18a87133` | cancelled |
| [42542650490](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42542650490) | `18a87133` | cancelled |

---

## 4. Branch Hygiene Audit — SLA de alertas de code scanning

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/branch-hygiene-audit.yml` |
| Run com falha | [#42062235088 (commit `d985c7fc`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42062235088) — 16:13:39Z–16:19:35Z |
| Passo que falha | Step 6 "SLA dos alertas de code scanning (W83)" — `conclusion=failure` |
| Causa raiz | Alertas de code scanning (CodeQL) em aberto há mais tempo do que o limite de SLA configurado (referência W83 do inventário de workflows). Condição **temporal e pré-existente** — o workflow era ✅ no baseline desta sessão (#41409678874) mas os alertas envelheceram desde então. **Não introduzida por esta sessão** (nenhuma alteração de código ou configuração de CodeQL foi feita). |
| Por que não posso corrigir agora | Fechar/dispensar alertas de code scanning é decisão de segurança do dono; corrigir o código apontado pelos alertas está fora do escopo desta sessão de CI. |

### O que o dono precisa fazer

1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/security/code-scanning e revisar os alertas em aberto.
2. Para cada alerta: corrigir o código (PR de fix) ou dispensar com justificativa se for falso positivo.
3. Após fechar os alertas pendentes, dispatchar `branch-hygiene-audit.yml` para confirmar verde.
