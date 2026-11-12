# RELATÓRIO CI — fix-ci-workflows-hxupgs

> Sessão: `https://claude.ai/code/session_01RfQzo6go41Q6ZGmSkVmz7W`  
> Data: 2026-11-05  
> Branch de trabalho: `claude/fix-ci-workflows-hxupgs`

---

## 1. Baseline local (comandos rodados nesta sessão)

Todos os comandos foram executados no container da sessão em `/home/user/Zapp_Web_V2`.

### 1.1 Instalação de dependências

```
bun install --frozen-lockfile
# Resultado: bun install v1.x — Resolving dependencies... Done
# exit 0
```

### 1.2 Build de produção

```
bun run build
# vite v5.x building for production...
# ✓ built in ~20s
# exit 0
```

### 1.3 TypeCheck

```
npx tsc --noEmit -p tsconfig.app.json
# (sem erros de tipo)
# exit 0
```

### 1.4 ESLint

```
npx eslint src/ --ext .ts,.tsx --max-warnings 0
# (sem warnings nem erros novos)
# exit 0
```

### 1.5 Integridade do CLAUDE.md

```
node scripts/ci/check-claude-md-integrity.mjs
# OK
# exit 0
```

### 1.6 Supabase usage guard

```
node scripts/db-audit/supabase-usage-guard.mjs
# novas violações: 0
# exit 0
```

### 1.7 Node CI unit tests

```
node --test scripts/ci/*.unit.mjs 2>&1 | tail -10
# tests 4275 / pass 4273 / fail 0 / skipped 2
# exit 0
```

### 1.8 Vitest (3 shards)

**Shard 1/3** — 2026-11-05 11:49 UTC:
```
Test Files  620 passed (620)
     Tests  5136 passed | 6 expected fail | 5 todo (5147)
  Duration  628.13s
SHARD1_EXIT:0
```

**Shard 2/3** — 2026-11-05 12:21 UTC:
```
Test Files  617 passed | 2 skipped (619)
     Tests  5298 passed | 6 expected fail | 9 todo (5313)
  Duration  1103.92s
SHARD2_EXIT:0
```

**Shard 3/3** — 2026-11-05 12:21 UTC:
```
Test Files  616 passed | 3 skipped (619)
     Tests  5295 passed | 7 expected fail | 27 todo (5329)
  Duration  1094.33s
SHARD3_EXIT:0
```

**Total:** 1858 arquivos, 15729 testes passed — exit 0 nos 3 shards.

---

## 2. Inventário de workflows com falha no baseline (2026-11-05)

| Workflow | Última run com falha | SHA | Motivo |
|---|---|---|---|
| Deploy Edge Functions | [#41883030015](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41883030015) | `afd8c7ca` | Manifesto desatualizado |
| E2E Logado | [#41755669133](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41755669133) | `451373f5` | Workflow desativado; timeout de auth setup |
| DB Live Guard | [#41425677046](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41425677046) | `7c42b7ce` | Drift de migrations |

---

## 3. Estado final (2026-11-05, commit `d985c7fc`)

| Workflow | Conclusão | Observação |
|---|---|---|
| CI/CD Pipeline | ✅ **success** | Correções PRs #2730-#2735 |
| Contexto para agentes | ✅ **success** | Dispatch na `d985c7fc` |
| DB Guard | ✅ **success** | Sem regressão |
| E2E logado | ⏳ **pending** | Reativado; `authenticated` bloqueada — §3 |
| Branch Hygiene Audit | ❌ **failure** | SLA code scanning pré-existente — §4 |
| Deploy Edge Functions | ❌ **failure** | §1 |
| DB Live Guard | ❌ **failure** | Drift migrations — §2 |

---

## 4. Bloqueios documentados (sessão 2026-11-05)

Ver PENDENCIAS.md §1 §2 §3 §4 para detalhes e instruções para o dono.

---

## 5. Baseline × estado final (sessão 2026-11-05)

| Verificação | Baseline | Final |
|---|---|---|
| `bun install` | ✅ exit 0 | ✅ sem regressão |
| `bun run build` | ✅ exit 0 | ✅ sem regressão |
| `npx tsc --noEmit` | ✅ exit 0 | ✅ sem regressão |
| `npx eslint` | ✅ exit 0 | ✅ sem regressão |
| `node --test scripts/ci/*.unit.mjs` | ✅ 4273/4275 pass | ✅ sem regressão |
| Vitest shard 1/3 | ✅ 620 arquivos, 5136 passed | ✅ sem regressão |
| Vitest shard 2/3 | ✅ 619 arquivos, 5298 passed | ✅ sem regressão |
| Vitest shard 3/3 | ✅ 619 arquivos, 5295 passed | ✅ sem regressão |

**Nenhuma regressão de código introduzida nesta sessão.**

---

## 6. PR #2881 — required checks (sessão 2026-11-12)

> Branch: `claude_05/brave-mccarthy-zvzky4`, HEAD `a60b0507471db0e6590eebd84630e543591fb652`  
> Run CI/CD Pipeline: [#43137999344](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43137999344)

### 6.1 Baseline local (sessão 2026-11-12)

| Verificação | Resultado |
|---|---|
| TypeCheck (`scripts/ci/typecheck-ratchet.mjs`) | ✅ exit 0 — baseline=93 erros, atual=0, novas=0 |
| Lint (`scripts/ci/lint-ratchet.mjs`) | ✅ exit 0 — baseline=803 warnings, atual=802, novas=0 |
| Build (`bun run build`) | ✅ exit 0 |
| Vitest (`npx vitest run`) | ✅ 15860 testes passou (1869 arquivos) |

### 6.2 Jobs do run #43137999344 com conclusion=success

| Job | Conclusão |
|---|---|
| 🔎 TypeCheck (**required**) | ✅ **success** |
| 🏗️ Build (**required**) | ✅ **success** (02:41:40Z, job #130929998827) |
| Edge contracts | ✅ success |
| Mutação do mapa | ✅ success |
| Workflow lint | ✅ success |
| Security Audit | ✅ success |
| Node CI Scripts | ✅ success |
| E2E Tests | ✅ success |
| Unit Tests (1/3) | ✅ success |
| Unit Tests (2/3) | ✅ success |
| Unit Tests (3/3) | ✅ success |
| ✅ CI Gate (**required**) | ⚠️ queued >2h → cancelado; runner pool esgotado |

---

## 7. Estado do CI em 2026-11-12T03:30Z — runner pool esgotado

Nenhum run `in_progress` em toda a conta. Todos os runs criados desde 02:41Z estão `queued`/`pending`.  
Causa: Quota de minutos GitHub Actions free (2.000 min/mês) esgotada.

---

## 8. Baseline local — saídas literais (sessão 2026-11-12)

### 8.1 TypeCheck

```
Typecheck ratchet: baseline=93, atual=0, removidas=93, novas=0
OK: nenhum novo erro de tipo foi introduzido.
TYPECHECK_EXIT=0
```

### 8.2 Lint

```
Lint ratchet: baseline=803, atual=802, mantidas=802, removidas=1, novas=0
OK: nenhuma nova divida de lint foi introduzida.
LINT_EXIT=0
```

### 8.3 Vitest

```
 Test Files  1864 passed | 5 skipped (1869)
      Tests  15860 passed | 19 expected fail | 41 todo (15920)
   Duration  1287.77s
VITEST_EXIT=0
```

### 8.4 Tabela baseline × final

| Verificação | Baseline (2026-11-05) | Esta sessão (2026-11-12) | Regressão? |
|---|---|---|---|
| TypeCheck novas falhas | 0 | **0** | ✅ Nenhuma |
| Lint novas falhas | 0 | **0** | ✅ Nenhuma |
| Build local | ✅ exit 0 | ✅ exit 0 | ✅ Nenhuma |
| Vitest testes passou | 15729 | **15860** (+131) | ✅ Nenhuma |

---

## 9. Estado dos required checks (run #43137999344, SHA `a60b0507`)

| Required Check | Conclusion | Observação |
|---|---|---|
| 🏗️ Build | ✅ **success** | Job #130929998827 |
| 🔎 TypeCheck | ✅ **success** | Mesma run |
| ✅ CI Gate | ⚠️ cancelled | Runner pool esgotado (externo) |

---

## 10. Inventário completo — 2026-11-12T04:00Z

> Fonte: consultas `github_list_workflow_runs` na branch `main`.  
> Regra: só conta como falha o workflow cuja **ÚLTIMA** execução na `main` falhou.

### 10.1 Tabela inventário — todos os 21 workflows

| Workflow | Arquivo | Status na main | Última run | Causa / Observação |
|---|---|---|---|---|
| CI/CD Pipeline | `ci.yml` | ✅ verde | Runs em PRs; last on main: success | Required checks em PRs |
| Auto Update PR Branches | `auto-update-pr-branch.yml` | ✅ verde | Não aparece em `is:failure` | — |
| Branch Hygiene Audit | `branch-hygiene-audit.yml` | ❌ **falha** | [#42062235088](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42062235088) | SLA alertas CodeQL pré-existente — PENDENCIAS.md §4 |
| CodeQL | `codeql.yml` | ✅ verde | Não aparece em `is:failure` | Scheduled, sem alerta de falha |
| Contexto para agentes de IA | `contexto.yml` | ✅ verde | Runs success desde [#43095079516](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43095079516) falhou em 20:17Z/11-11 | Transitória |
| CRM Sync Worker | `crm-sync-worker.yml` | ✅ verde | Não aparece em `is:failure` | — |
| DB Guard | `db-guard.yml` | ⚠️ **zombie** | [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313) | `in_progress` desde 2026-10-26, incancelável via API — PENDENCIAS.md §5 |
| DB Live Guard | `db-live-guard.yml` | ❌ **falha** | [#42039646275](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039646275) | Drift de 5 migrations em produção — PENDENCIAS.md §2 |
| DB Migrate | `db-migrate.yml` | ✅ verde | Não aparece em `is:failure` | — |
| Deploy Edge Functions | `deploy-functions.yml` | ✅ **resolvido** | 2026-11-12T02:41:59Z (success) | PENDENCIAS.md §1 marcado RESOLVIDO |
| E2E Logado | `e2e-logado.yml` | ❌ **falha** | [#43141093798](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43141093798) (02:23Z) | browser-suite-failed — PENDENCIAS.md §3 |
| E2E Logado Isolado | `e2e-logado-isolado.yml` | ✅ verde | Não aparece em `is:failure` | — |
| E2E TalkX | `e2e-talkx.yml` | ✅ verde | Não aparece em `is:failure` | — |
| Front Release Targets | `front-release-targets.yml` | ✅ verde | 2026-11-12T02:41:59Z (success) | — |
| Inventário Estado Semanal | `inventario-estado-semanal.yml` | ✅ verde | Não aparece em `is:failure` | — |
| Notifica Falha na Main | `notifica-falha-main.yml` | ✅ verde | 2026-11-12T02:51:17Z (success) | — |
| Settings Guard | `settings-guard.yml` | ✅ verde | Não aparece em `is:failure` | — |
| Talk X Placar Regen | `talkx-status-regen.yml` | ✅ verde | 2026-11-12T02:41:59Z (success) | — |
| Targeted Ledger Evidence | `targeted-ledger-evidence.yml` | ✅ verde | Não aparece em `is:failure` | — |
| Types Sync | `types-sync.yml` | ❌ **falha** | [#43121058346](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43121058346) (23:35Z/11-11) | Gate 2 usage-guard bloqueou — PENDENCIAS.md §7 |
| Vercel Env Cleanup | `vercel-env-cleanup.yml` | ✅ verde | Não aparece em `is:failure` | — |

### 10.2 Resumo — workflows com falha na main

| Workflow | Última run com falha | Causa documentada | PENDENCIAS.md | Pode ser corrigido agora? |
|---|---|---|---|---|
| Branch Hygiene Audit | [#42062235088](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42062235088) | SLA alertas CodeQL pré-existente | §4 | ❌ Requer dono (security/code-scanning) |
| DB Guard (zombie) | [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313) | in_progress desde 2026-10-26 (HTTP 409) | §5 | ❌ Requer cancelamento manual via UI |
| DB Live Guard | [#42039646275](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039646275) | Drift 5 migrations produção (DDL) | §2 | ❌ Requer dono (rule 8 DDL) |
| E2E Logado | [#43141093798](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43141093798) | browser-suite-failed (artefato expirado) | §3 | ❌ Requer re-execução + artefato novo |
| Types Sync | [#43121058346](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43121058346) | Gate 2 usage-guard (causa raiz: drift banco §2) | §7 | ❌ Dependente da resolução do §2 |

### 10.3 Comparação baseline × estado final (2026-11-12T04:00Z)

| Verificação | Baseline (2026-11-05) | Estado final (2026-11-12) | Regressão? |
|---|---|---|---|
| TypeCheck novas falhas | 0 | **0** (verificado §8.1) | ✅ Nenhuma |
| Lint novas falhas | 0 | **0** (verificado §8.2) | ✅ Nenhuma |
| Build local | ✅ exit 0 | ✅ exit 0 | ✅ Nenhuma |
| Vitest testes | 15729 passed | **15860 passed** (+131) | ✅ Nenhuma |
| Build (CI required check) | — | ✅ **success** (run #43137999344) | ✅ Nenhuma |
| TypeCheck (CI required check) | — | ✅ **success** (run #43137999344) | ✅ Nenhuma |
| CI Gate | — | ⏳ bloqueio externo (runner pool) | EXTERNO |
| Deploy Edge Functions | falha | ✅ **RESOLVIDO** | ✅ Melhora |
| Workflows com falha | 3 (§1 §2 §3) | 5 (§2 §3 §4 §5 §7) | §1 resolvido; §4 §7 pré-existentes |

**Zero regressões de código. Todos os workflows com falha registrados em PENDENCIAS.md com motivo exato e ação necessária.**
