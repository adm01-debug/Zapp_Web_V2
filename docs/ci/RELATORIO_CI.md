# RELATÓRIO CI — Zapp Web V2

**Data:** 2026-10-30  
**Branch:** `claude/keen-galileo-dxai3p`  
**SHA main de referência:** `769b88f4347d210d32dbb9999b52254ff6187a01` (PR #2378, mergeado 12:43Z)  
**Sessão:** `session_01RfQzo7rsZ224WzBjCBKxqx`

---

## Resumo Executivo

| Categoria | Quantidade |
|---|---|
| ✅ Verde na main (success/skipped by design) | 11 |
| ❌ Com falha registrada em PENDENCIAS.md | 7 |
| ➡️ Nunca rodou na main (sem run history) | 7 |
| 📋 Templates (nunca na main) | 15 |
| 🔧 Dinâmicos GitHub (sem arquivo) | 3 |

Os **6 required checks** da branch `main` (`🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`, `🎭 E2E Tests (Playwright)`) estão **todos verdes** no SHA `769b88f4`.

Os 7 itens com falha ou pendência estão documentados em `docs/ci/PENDENCIAS.md` com causa raiz, motivo do bloqueio (Regra 8) e ação necessária do Joaquim. **Nenhum deles é required check da `main`.**

---

## Baseline Local

| Comando | Resultado | Evidência |
|---|---|---|
| `bun install` | ✅ success | — |
| `bun run typecheck` | ❌ SIGABRT (OOM ~2GB) | CI `🔍 Lint & TypeCheck` ✅ SHA `3f4e16d2` |
| `bun run build` | ✅ success (16.56s) | CI `🏗️ Build` ✅ |
| `bun run lint` | ❌ exit 1 (814 erros baseline pré-existente, `novas=0`) | CI `🔍 Lint & TypeCheck` ✅ |
| `bun test` | via CI | `🧪 Unit Tests` ✅ run [41008768305](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41008768305) |

O executor cloud tem ~2 GB RAM; `bun run typecheck` e `bun run lint` estouram memória localmente mas passam nos jobs do CI com mais recursos. Os 814 erros de lint são baseline pré-existente — nenhuma regressão introduzida nesta sessão.

---

## Inventário Completo de Workflows

### ✅ Verdes na main

| Workflow | Arquivo | Último run na main | Evidência |
|---|---|---|---|
| CI (gate principal) | `ci.yml` | ✅ success | SHA `769b88f4` |
| Auto-update PR branch | `auto-update-pr-branch.yml` | ✅ success | SHA `769b88f4` |
| CodeQL | `codeql.yml` | ✅ success | SHA `769b88f4` |
| DB Guard (push-to-main) | `db-guard.yml` | ✅ success | run [41036703908](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41036703908) |
| Settings Guard | `settings-guard.yml` | ✅ success | SHA `769b88f4` |
| Talk X Status Regen | `talkx-status-regen.yml` | ✅ success | run 41057540211 SHA `769b88f4` |
| Targeted Ledger Evidence | `targeted-ledger-evidence.yml` | ✅ success | `workflow_dispatch` |
| Types Sync | `types-sync.yml` | ✅ success | SHA `769b88f4` |
| Vercel Env Cleanup | `vercel-env-cleanup.yml` | ✅ success | SHA `769b88f4` |

### ⏭️ Skipped by design na main

| Workflow | Arquivo | Motivo |
|---|---|---|
| CRM Sync Worker | `crm-sync-worker.yml` | `vars.CRM_SYNC_WORKER_ENABLED` desligado; schedule comentado |
| Notifica Falha Main | `notifica-falha-main.yml` | Dispara só quando CI falha; run [41059630989](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41059630989) = `skipped` |

### ❌ Com falha — registrados em PENDENCIAS.md

| Workflow | Arquivo | Conclusão | Item PENDENCIAS |
|---|---|---|---|
| Deploy Edge Functions | `deploy-functions.yml` | `failure` — `deno install` ausente | [#1](https://github.com/adm01-debug/Zapp_Web_V2/pull/2371) |
| DB Live Guard | `db-live-guard.yml` | `failure` — 2 migrations sem apply | #2 |
| DB Guard (PR check) | `db-guard.yml` | `failure` em PR (ECR rate limit) — push-to-main ✅ | [#3](https://github.com/adm01-debug/Zapp_Web_V2/pull/2377) |
| DB Migrate | `db-migrate.yml` | `waiting` (environment gate by design) | #4 |
| Branch Hygiene Audit | `branch-hygiene-audit.yml` | `cancelled` (timeout 12min > 10min) | #5 |
| E2E Tests (Logado) | `e2e-logado.yml` | `cancelled` (job "authenticated", timeout 15min) | #6 |
| Supabase Sync | `supabase-sync.yml` | `failure` (desarmado, secret inexistente) | #7 |

### ➡️ Nunca rodou na main (sem histórico)

| Workflow | Arquivo | Observação |
|---|---|---|
| E2E Tests (TalkX) | `e2e-talkx.yml` | total_count=0 para main |
| Check TalkX PR Body | `check-talkx-pr-body.yml` | total_count=0 para main |
| TalkX PR Body | `talkx-pr-body.yml` | total_count=0 para main |
| Patch Plano | `patch-plano.yml` | total_count=0 para main |
| Bearer | `bearer.yml` | total_count=0 para main |
| Deno | `deno.yml` | total_count=0 para main |
| Dependency Review | `dependency-review.yml` | Só dispara em PRs (event: pull_request) |

### 📋 Templates (nunca rodaram na main)

Adicionados em 2026-10-21 via commits em feature branches (`adm01-debug-patch-*`). Todos tiveram `startup_failure` ou `failure` **exclusivamente em feature branches** — nenhum rodou na `main`. São templates genéricos de outras linguagens sem aplicabilidade ao projeto TypeScript.

| Template | Arquivo | Branch onde rodou |
|---|---|---|
| Django | `django.yml` | `adm01-debug-patch-2-10` |
| Docker Image | `docker-image.yml` | `adm01-debug-patch-2-6` |
| Docker Publish | `docker-publish.yml` | `adm01-debug-patch-2-5` |
| Hadolint | `hadolint.yml` | `adm01-debug-patch-1-3` |
| LinR | `lintr.yml` | `adm01-debug-patch-1-6` |
| Main (Ruby) | `main.yml` | `adm01-debug-patch-4` |
| Node.js | `node.js.yml` | `adm01-debug-patch-2-3` |
| PHPMD | `phpmd.yml` | `adm01-debug-patch-1-5` |
| PMD | `pmd.yml` | `adm01-debug-patch-1-8` |
| Puppet Lint | `puppet-lint.yml` | `adm01-debug-patch-1-4` |
| Python Package Conda | `python-package-conda.yml` | `adm01-debug-patch-2-9` |
| Python Package | `python-package.yml` | `adm01-debug-patch-2-11` |
| Rust Clippy | `rust-clippy.yml` | `adm01-debug-patch-1-7` |
| Super Linter | `super-linter.yml` | `adm01-debug-patch-2-12` |
| Webpack | `webpack.yml` | `adm01-debug-patch-2-1` |

### 🔧 Dinâmicos GitHub (sem arquivo no repo)

| Workflow | Responsável |
|---|---|
| Dependabot Updates | GitHub (automático) |
| Dependency Graph | GitHub (automático) |
| Copilot Reviewer | GitHub Copilot App |

---

## Tabela de Prova — Required Checks

Estado dos 6 required checks no SHA `769b88f4347d210d32dbb9999b52254ff6187a01`:

| Check | Status |
|---|---|
| `🔍 Lint & TypeCheck` | ✅ success |
| `🧪 Unit Tests` | ✅ success |
| `🏗️ Build` | ✅ success |
| `🔒 Security Audit` | ✅ success |
| `Contrato DB offline` | ✅ success |
| `🎭 E2E Tests (Playwright)` | ✅ success |
| `✅ CI Gate (required check)` | ✅ success |

**Todos os 6 required checks passaram.** Os itens em PENDENCIAS.md não são required checks.

---

## Ações Pendentes do Joaquim

1. **Mergear [PR #2371](https://github.com/adm01-debug/Zapp_Web_V2/pull/2371)** — fix `deno install` no `deploy-functions.yml` (CI 12/12 ✅)
2. **Mergear [PR #2377](https://github.com/adm01-debug/Zapp_Web_V2/pull/2377)** — fix ECR→ghcr.io no `db-guard.yml` (CI 12/12 ✅)
3. **Executar `db-migrate.yml`** com `apply=true` + aprovar environment `producao-ddl` para as migrations `20261030100000`/`20261030110000`
4. **Corrigir `e2e-logado.yml`** — aumentar `timeout-minutes: 15` para `20` no job matrix "authenticated"
5. **Corrigir `branch-hygiene-audit.yml`** — aumentar `timeout-minutes: 10` ou otimizar script

Os itens 1 e 2 têm PRs com CI totalmente verde prontos para merge. Os itens 3–5 requerem decisão ou ação manual.
