# PENDÊNCIAS DE CI

> Gerado em 2026-11-05 pela sessão `fix-ci-workflows-hxupgs`.  
> Atualizado em 2026-11-12 (PR #2881, sessão `brave-mccarthy-zvzky4`).  
> Última atualização: 2026-11-12T03:19Z — diff a60b0507→0cb4193 verificado (só docs).

---

## 1. Deploy Edge Functions — manifesto desatualizado

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/deploy-functions.yml` |
| Última run com falha | [#41883030015 (commit `afd8c7ca`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41883030015) |
| Erro exato | `Deployment manifest is stale: supabase/deployment-manifest.json` |
| Causa | PR [#2707](https://github.com/adm01-debug/Zapp_Web_V2/pull/2707) adicionou `ai-usage-outbox-drain` mas ainda não foi mergeada. |
| Por que não posso corrigir agora | PR #2707 contém migration DDL — requer aprovação do dono (AGENTS.md regra 8). |

### O que o dono precisa fazer

1. Revisar e mergear o PR [#2707](https://github.com/adm01-debug/Zapp_Web_V2/pull/2707).
2. Após o merge, o `deploy-functions.yml` será disparado automaticamente.

---

## 2. DB Live Guard — drift de migrations em produção

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-live-guard.yml` |
| Última run com falha | [#42039646275 (commit `341d3fda`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039646275) |
| Issue de alerta | [#1965](https://github.com/adm01-debug/Zapp_Web_V2/issues/1965) (aberta desde 2026-10-16) |
| Causa raiz | Drift entre arquivos `.sql` em `supabase/migrations/` e registros em `schema_migrations` no banco de produção. |

**Drift verificado (1082 arquivos × 1079 registros):**

| Versão | Situação |
|---|---|
| `20261026240300_drop_bkp_261023.sql` | Arquivo no repo sem registro no banco |
| `20261102012400_login_attempts_retencao_90d.sql` | Arquivo no repo sem registro no banco |
| `20261102032200_revoga_execute_public_cron_schedule.sql` | Arquivo no repo sem registro no banco |
| `20261102012200_department_invites_restringe_escrita.sql` | Conteúdo SQL divergente |
| `20261103201500_remove_pagamentos_e_special_agent.sql` | Conteúdo SQL divergente |

### Por que não posso corrigir agora

DDL em banco de produção — requer aprovação explícita do dono (AGENTS.md regra 8).

---

## 3. E2E logado — job authenticated: browser-suite-failed

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/e2e-logado.yml` |
| Falha documentada | [#42039283192](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039283192) |
| Código de falha | `browser-suite-failed` |
| Artefato diagnóstico | Expirado ~2026-11-08 |

### O que o dono precisa fazer

1. Re-executar `workflow_dispatch` em `e2e-logado.yml` na `main` para gerar novo artefato.
2. Se falha persistir: identificar teste e abrir PR de fix.

---

## 4. Branch Hygiene Audit — SLA de alertas de code scanning

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/branch-hygiene-audit.yml` |
| Run com falha | [#42062235088](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42062235088) |
| Causa raiz | Alertas CodeQL em aberto além do limite de SLA — pré-existente, não introduzido nesta sessão. |

### O que o dono precisa fazer

1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/security/code-scanning.
2. Corrigir o código ou dispensar alertas com justificativa.

---

## 5. DB Guard — run zombie incancelável via API

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-guard.yml` |
| Run zombie | [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313) |
| Em `in_progress` desde | 2026-10-26T22:15Z (run_attempt=14) |
| Comportamento da API | HTTP 409 em todos os cancelamentos via API REST |
| Impacto | Ocupa 1 slot de runner permanentemente; foi causa do CI Gate ficar stuck >2h no run #43137999344 |

### O que o dono precisa fazer

1. Acessar [https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313).
2. Clicar em **"Cancel workflow"** na interface do GitHub.

---

## 6. GitHub Actions — runner pool esgotado (bloqueio total de CI)

### Estado verificado em 2026-11-12T03:19Z

| Campo | Valor |
|---|---|
| Run mais recente (PR #2881) | [#43147121037](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43147121037) — HEAD `0cb4193`, status=`pending` desde 03:16Z |
| Required checks no HEAD atual | Todos `pending`/`queued` — runner pool esgotado |
| Causa | Quota de minutos GitHub Actions do plano free (2.000 min/mês) esgotada; múltiplos agentes rodando CI simultâneo |
| Zombie ainda ativo | Run #40410990313 (`db-guard.yml`) ainda `in_progress` |

### Prova de que required checks são válidos para o código atual

**Diff verificado via GitHub API compare (`a60b0507` → `0cb4193`):**

| Arquivo alterado | Tipo |
|---|---|
| `PENDENCIAS.md` | Documentação apenas |
| `RELATORIO_CI.md` | Documentação apenas |

**Zero arquivos de código alterados** (`src/`, `supabase/`, `api/`, `server/`, ou qualquer outro).

Portanto, o resultado do run [#43137999344](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43137999344) (SHA `a60b0507471db0e6590eebd84630e543591fb652`) é válido para o commit atual `0cb4193`: o código compilado é idêntico.

### Required checks — última prova disponível (run #43137999344, SHA `a60b0507`)

| Required Check | Conclusion | Job ID |
|---|---|---|
| 🏗️ Build | ✅ **success** | #130929998827 (02:41:40Z) |
| 🔎 TypeCheck | ✅ **success** | (mesma run) |
| ✅ CI Gate | ⚠️ cancelled | Stuck >2h (zombie #40410990313 ocupava slot) |

**CI Gate:** não chegou a `conclusion=success` em nenhum run. Causa: zombie #40410990313 ocupa slot permanentemente + runner pool esgotado. Não é bug de código — é infraestrutura.

### O que o dono precisa fazer

1. **https://github.com/settings/billing** — verificar saldo de minutos GitHub Actions; se esgotado, adicionar minutos ou aguardar renovação mensal.
2. **Cancelar zombie #40410990313** — https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313 — libera slot permanentemente ocupado.
3. Quando runners disponíveis: run [#43147121037](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43147121037) retomará automaticamente.
4. Após CI Gate `conclusion=success`: squash-merge a PR [#2881](https://github.com/adm01-debug/Zapp_Web_V2/pull/2881) com SHA `0cb4193821596da4be250a114a8038d98025e0a3`.
