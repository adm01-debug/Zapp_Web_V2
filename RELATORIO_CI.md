# Relatório CI — adm01-debug/Zapp_Web_V2

> Gerado em 2026-10-25 — baseline da branch `claude_05/festive-carson-ub43wu` (PR #2246).

---

## Baseline local (bun install / build / lint / typecheck / testes)

| Etapa | Resultado | Observação |
|---|---|---|
| `bun install` | ✅ success | sem falhas |
| `bun run build` | ✅ success | `dist/` gerado, sem erros |
| `bun run lint` | ⚠️ 819 problems | 605 errors, 214 warnings — **todos pré-existentes na `main`** |
| `bun run typecheck` | ⚠️ erros | drift de schema (ver item 2 de PENDENCIAS.md) — **pré-existentes na `main`** |
| Unit tests (shard 1/3) | ⚠️ 4 falhas | `useTalkXSegments.test.ts:347,371,384,398` — pré-existentes (item 5) |
| Unit tests (shard 2/3) | ✅ pass | sem falhas introduzidas |
| Unit tests (shard 3/3) | ⚠️ 1 falha | `useCampaignRowActions.test.tsx` — pré-existente (item 6) |
| `ChatMessagesArea.pagination.test.tsx` | ✅ 4/4 pass | **corrigido nesta sessão** (commit `9c1c058`) |

**Typecheck** exigiu `NODE_OPTIONS="--max-old-space-size=4096"` (heap default insuficiente).  
**Lint e typecheck** confirmados pré-existentes rodando na `main` (run 40122006424, commit `2d97c44`).

---

## Inventário de workflows — última execução na main

| Workflow | Arquivo | Último run na main | Data | Status |
|---|---|---|---|---|
| ci.yml | `ci.yml` | [40122006424](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006424) | 2026-10-24 | ❌ failure (items 5, 6) |
| DB Guard (offline) | `db-guard.yml` | [40122006482](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006482) | 2026-10-24 | ❌ failure (item 3) |
| E2E logado | `e2e-logado.yml` | [40122006547](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006547) | 2026-10-24 | ❌ failure (item 7) |
| Auto Update PR Branches | `auto-update-pr-branch.yml` | [40210888395](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40210888395) | 2026-10-25 | ❌ failure → **CORRIGIDO nesta sessão** |
| Types Sync | `types-sync.yml` | [40169860237](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40169860237) | 2026-10-25 | ❌ failure (item 2) |
| DB Live Guard | `db-live-guard.yml` | [39212157834](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39212157834) | 2026-10-19 | ❌ failure (item 9) |
| E2E Talk X | `e2e-talkx.yml` | — | — | N/A (0 runs na main) |
| Deploy Functions | `deploy-functions.yml` | [40097636982](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40097636982) | 2026-10-24 | ❌ failure (item 8) |
| CodeQL | `codeql.yml` | [39232205552](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39232205552) | 2026-10-19 | ✅ success |
| Settings Guard | `settings-guard.yml` | [38901696564](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/38901696564) | 2026-10-16 | ✅ success |
| Talk X Status Regen | `talkx-status-regen.yml` | [40122006445](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006445) | 2026-10-24 | ✅ success |
| Targeted Ledger Evidence | `targeted-ledger-evidence.yml` | [36041611976](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/36041611976) | 2026-09-24 | ✅ success |
| Branch Hygiene Audit | `branch-hygiene-audit.yml` | [39220130783](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39220130783) | 2026-10-19 | ⚠️ cancelled |
| CRM Sync Worker | `crm-sync-worker.yml` | [35717413825](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35717413825) | 2026-09-22 | ⏭️ skipped |
| DB Migrate | `db-migrate.yml` | — | — | N/A (dispatch manual) |
| Supabase Sync | `supabase-sync.yml` | — | — | N/A (desarmado; secret não existe) |

**Required checks da main** (6): `🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`, `🎭 E2E Tests (Playwright)`.  
Os required checks são exercidos por `ci.yml`, `db-guard.yml` e `e2e-logado.yml`.

---

## O que foi corrigido nesta sessão

### 1. `ChatMessagesArea.pagination.test.tsx` — TanStack Virtual v3 no jsdom

**Commit:** `9c1c058`  
**Causa:** TanStack Virtual v3 exige `getBoundingClientRect()` mock (spy) *e* `clientHeight: 600` *e* `scrollTo` mock no jsdom. O mock de `clientHeight` e `scrollTo` estavam ausentes.  
**Fix:** adicionados no `beforeAll` — 4 testes passam (4/4).

### 2. `fila-merge.mjs` — retry em JSON truncado do `gh pr list`

**Commit:** este PR (pendente push)  
**Causa:** `gh pr list --json` retornou `"unexpected end of JSON input"` (resposta truncada da API do GitHub). O padrão de erros transitórios em `execComRetry` não incluía esse caso, então o erro era tratado como permanente e o workflow falhava sem retry.  
**Fix:** adicionado `unexpected end of JSON` ao regex de erros transitórios em `scripts/ci/fila-merge.mjs:38`.

---

## Resumo

- **Corrigidos nesta sessão:** 2 (`pagination.test.tsx`, `fila-merge.mjs`)
- **Pré-existentes na main, requerem decisão humana/DDL:** 7 (ver `PENDENCIAS.md` items 1–9)
- **Sem regressão introduzida:** confirmado — lint, typecheck e falhas de teste estão na `main` antes desta branch

*Este arquivo deve ser atualizado após cada ciclo de correção de CI.*
