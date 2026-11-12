# PENDÊNCIAS DE CI

> Gerado em 2026-11-05 pela sessão `fix-ci-workflows-hxupgs`.
> Atualizado em 2026-11-12 pela sessão `brave-mccarthy-zvzky4` (§3 atualizado com run #43116986482; §5 adicionado).
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

## 3. E2E logado — job authenticated: relatório público inválido

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/e2e-logado.yml` |
| Última run com falha (medida 2026-11-12) | [#43116986482 (commit `e408b778`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43116986482) — 2026-11-11T23:04Z–2026-11-11T23:24Z |
| Jobs com falha | `authenticated-1-of-3` ([130847401538](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43116986482/job/130847401538)) · `authenticated-2-of-3` ([130847401543](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43116986482/job/130847401543)) · `authenticated-3-of-3` ([130847401667](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43116986482/job/130847401667)) |
| Passo que falha | Step 8 "Validar grupo e executar a suíte no backend descartável" — `conclusion=failure` |
| Log exato (1) | `resumo público indisponível ou inválido; alerta sem detalhes privados` |
| Log exato (2) | `mesma causa da ultima vez -- sem comentario novo` |
| `REPORT_READY` | `true` — a suíte Playwright executou e gerou relatório, mas o relatório **público** está indisponível (proteção de privacidade ativa no repo) |
| Issue rastreadora | `[e2e-logado] Suíte logada quebrada na main` (open, mesma fingerprint nas runs 1662–1664) |
| Padrão de persistência | Falha em 3 commits consecutivos da main: `f036006a` (run 1662) · `d5835ed8` (run 1663) · `e408b778` (run 1664, #43116986482) — **não introduzida por esta sessão** |
| Artefato privado | `playwright-report-logado-authenticated-*` no run [#43116986482](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43116986482) — expira ~2027-02-11 (90 dias) |

### Por que não posso corrigir agora

O relatório detalhado dos testes falhando está apenas no artefato privado. O log de execução reporta `resumo público indisponível ou inválido` — não contém quais testes falharam nem o motivo específico. Sem acesso ao artefato privado não é possível identificar a causa raiz.

### O que o dono precisa fazer

1. Baixar o artefato privado `playwright-report-logado-authenticated-*` em https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43116986482 para identificar quais testes falharam e o motivo exato.
2. Se for regressão de código: abrir PR de fix.
3. Se for infra/flakiness: re-executar `workflow_dispatch` em `e2e-logado.yml` na `main` atual para confirmar verde.
4. Depois de verificar verde: atualizar este arquivo removendo este bloqueio e atualizar RELATORIO_CI.md §3/§4.3.

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

---

## 5. DB Guard (offline) — zombie runs bloqueiam CI do PR #2881

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-guard.yml` (workflow_id 344052670) |
| Padrão recorrente | Runs ficam `in_progress` indefinidamente porque o runner `self-hosted` rotulado `offline` não responde. Consomem todos os slots do plano gratuito do GitHub Actions, travando todos os outros workflows (`in_progress`/`queued`). |
| Impacto nesta sessão | CI/CD Pipeline do PR #2881 (run #43125697334) ficou `pending` por ~20 h sem progredir. |
| Causa raiz | O `db-guard.yml` dispara em `pull_request` mas o runner `offline` nunca pega o job. Não há `timeout-minutes` configurado no job, então o run fica aberto até o limite de 35 dias da API. |
| Por que não posso corrigir definitivamente | Desabilitar workflow, adicionar `timeout-minutes` ou migrar runner envolve CI/workflows (AGENTS.md regra 8) — requer aprovação do dono. |

**Runs cancelados nesta sessão (2026-11-12T00:xx Z):**

| Run ID | Branch | Criado em |
|---|---|---|
| 43123050528 | `claude/feat-talkx-x056-filtros-dinamicos-kit-261108-1200` | 2026-11-11T23:52Z |
| 43122915453 | `claude/fix-talkx-bloquear-destinatario-v2-261111` | 2026-11-11T23:50Z |
| 43122393754 | `claude/fix-revoke-anon-select-grants-261108-2300` | 2026-11-11T23:46Z |
| 40410990313 | `claude_04/trusting-newton-duiglt` | 2026-10-26T22:15Z (já cancelado) |

**Runs cancelados em sessão anterior (2026-11-12T00:00 Z):**

| Run ID | Branch | Criado em |
|---|---|---|
| 43121695754 | `claude/feat-talkx-analytics-rpc-front-26111108-2200` | 2026-11-11T23:41Z |
| 43121311648 | `claude/chore-scripts-docs-testes-261108-2048` | 2026-11-11T23:35Z |
| 43121058569 | `main` | 2026-11-11T23:31Z |

### O que o dono precisa fazer

1. Adicionar `timeout-minutes: 10` ao job `guard` em `.github/workflows/db-guard.yml` para que runs com runner offline expirem automaticamente em vez de acumular.
2. **Ou** migrar o runner para `ubuntu-latest` (GitHub-hosted) se o job `DB Guard (offline)` não depende de recursos locais do runner.
3. Após a correção, dispatchar `db-guard.yml` manualmente para confirmar que o job termina (success ou failure) em vez de ficar `in_progress`.
