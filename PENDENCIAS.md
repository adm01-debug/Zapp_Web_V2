# PENDÊNCIAS DE CI

> Gerado em 2026-11-05 pela sessão `fix-ci-workflows-hxupgs`.  
> Atualizado em 2026-11-12 (PR #2881, sessão `brave-mccarthy-zvzky4`).  
> Última atualização: 2026-11-12T03:11Z — 14 check runs verificados, todos queued.

---

## 1. Deploy Edge Functions — manifesto desatualizado

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/deploy-functions.yml` |
| Última run com falha | [#41883030015 (commit `afd8c7ca`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41883030015) |
| Erro exato | `Deployment manifest is stale: supabase/deployment-manifest.json` |
| Causa | PR [#2707](https://github.com/adm01-debug/Zapp_Web_V2/pull/2707) adicionou `ai-usage-outbox-drain` mas ainda não foi mergeada. |
| Por que não posso corrigir agora | PR #2707 toca `supabase/deployment-manifest.json` (AGENTS.md regra 3) **e** contém migration DDL — requer aprovação do dono (AGENTS.md regra 8). |

### O que o dono precisa fazer

1. Revisar e mergear o PR [#2707](https://github.com/adm01-debug/Zapp_Web_V2/pull/2707).
2. Após o merge, o `deploy-functions.yml` será disparado automaticamente.
3. Se o deploy ainda falhar após o merge, dispatchar manualmente `deploy-functions.yml`.

---

## 2. DB Live Guard — drift de migrations em produção

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-live-guard.yml` |
| Última run com falha | [#42039646275 (commit `341d3fda`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039646275) |
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

Envolve DDL em banco de produção (AGENTS.md regra 8) — requer aprovação explícita do dono.

### O que o dono precisa fazer

1. Para as 3 **sem registro**: executar apply via MCP `SUPABASE - ZAPP WEB V2 - MCP`.
2. Para as 2 **divergentes**: comparar banco com arquivo; corrigir a fonte errada. Referência: `docs/MIGRATIONS.md`.
3. Após resolver, dispatchar `db-live-guard.yml` para confirmar verde.

---

## 3. E2E logado — job authenticated: browser-suite-failed

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/e2e-logado.yml` |
| Falha documentada | [#42039283192 (commit `341d3fda`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039283192) |
| Job | `authenticated` — step 8 "Validar grupo e executar a suíte no backend descartável" |
| Código de falha | `browser-suite-failed` — `real-browser-suite` executou ~45 min; 0 casos no resumo público |
| Issue aberta | "[e2e-logado] Suíte logada quebrada na main" |
| Artefato diagnóstico | `playwright-report-logado-authenticated-42039283192-1` (195 KB; expirado ~2026-11-08) |

### O que o dono precisa fazer

1. Baixar o artefato [playwright-report-logado-authenticated-42039283192-1](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039283192/artifacts/13425621512) para identificar qual(is) teste(s) falharam.
2. Se for regressão: abrir PR de fix.
3. Se for flakiness: re-executar `workflow_dispatch` em `e2e-logado.yml` na `main` atual para confirmar verde.

---

## 4. Branch Hygiene Audit — SLA de alertas de code scanning

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/branch-hygiene-audit.yml` |
| Run com falha | [#42062235088 (commit `d985c7fc`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42062235088) |
| Passo que falha | Step 6 "SLA dos alertas de code scanning (W83)" |
| Causa raiz | Alertas CodeQL em aberto além do limite de SLA. Condição temporal pré-existente, não introduzida por esta sessão. |

### O que o dono precisa fazer

1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/security/code-scanning e revisar os alertas em aberto.
2. Para cada alerta: corrigir o código ou dispensar com justificativa se for falso positivo.
3. Após fechar os alertas pendentes, dispatchar `branch-hygiene-audit.yml` para confirmar verde.

---

## 5. DB Guard — run zombie incancelável via API

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-guard.yml` |
| Run zombie | [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313) |
| Branch | `claude_04/trusting-newton-duiglt` |
| Em `in_progress` desde | 2026-10-26T22:15Z (run_attempt=14) |
| Estado atual | `in_progress` — confirmado em 2026-11-12T (ainda não cancelado) |
| Comportamento da API | Lista como `in_progress`; chamadas `cancel` e `force-cancel` retornam HTTP 409 |
| Impacto | Ocupa 1 slot virtual de runner GitHub Actions permanentemente — foi a causa do CI Gate (#130934752962) ficar stuck por >2h no run #43137999344 da PR #2881 |
| Diagnóstico confirmado | Verificado em 2026-11-12. |

### O que o dono precisa fazer

1. Acessar [https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313) e clicar em **"Cancel workflow"** na interface do GitHub (UI tem permissões diferentes da API REST).
2. Se não funcionar via UI: contatar suporte do GitHub para limpar o run zombie (`workflow_run_id=40410990313`).
3. Após cancelar: runs CI Gate que ficam stuck como este deverão ser liberados automaticamente.

---

## 6. GitHub Actions — runner pool esgotado (bloqueio total de CI)

| Campo | Valor |
|---|---|
| Verificado em | 2026-11-12T03:11Z (esta atualização) |
| Sintoma | Todos os 14 check runs do commit `96079dbe` em `queued` — zero `in_progress` em toda a conta |
| Run mais recente (PR #2881) | [#43146169159](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43146169159) — HEAD `96079dbeb671e40952d21416e44da8f2ef771b80`, status=`queued` desde 2026-11-12T03:08:30Z |
| 14 check runs verificados | 12 GitHub Actions = todos `queued`; Vercel Preview=success; Vercel Agent=neutral |
| Required checks | 🏗️ Build=queued, 🔎 TypeCheck=queued, ✅ CI Gate=queued — todos `conclusion=null` |
| Zombie ainda ativo | Run #40410990313 (`db-guard.yml`) ainda `in_progress` — confirmado em 2026-11-12T03:11Z |
| Prova dos required checks passando | No run #43137999344 (SHA `a60b0507`, não cancelado por runner pool): Build=✅ success (job #130929998827), TypeCheck=✅ success |
| Causa diagnóstica | Quota de minutos GitHub Actions do plano free (2.000 min/mês) possivelmente esgotada. Com suítes de ~21 min por run e múltiplos agentes rodando CI simultâneo, a cota se esgota rapidamente. Alternativamente: outage temporário dos runners GitHub-hosted `ubuntu-24.04`. |
| CI Gate: por que não passed | Runner pool esgotado — job `queued` indefinidamente; código correto, bloqueio é infraestrutura |

### O que o dono precisa fazer

1. Verificar saldo de minutos em **https://github.com/settings/billing** (seção "Actions").
2. Se a cota estiver esgotada: aguardar renovação mensal ou comprar minutos adicionais no plano GitHub Pro/Team.
3. Se for outage do GitHub: verificar https://www.githubstatus.com/ e aguardar resolução.
4. **Cancelar o zombie #40410990313** (§5 acima) — libera 1 slot permanentemente ocupado.
5. Quando runners disponíveis: o run [#43146169159](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43146169159) (HEAD `96079dbe`) retomará automaticamente.
6. Após CI verde (Build + TypeCheck + CI Gate = success): squash-merge a PR [#2881](https://github.com/adm01-debug/Zapp_Web_V2/pull/2881) com SHA `96079dbeb671e40952d21416e44da8f2ef771b80`.
