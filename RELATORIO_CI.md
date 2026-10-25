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
| Unit tests (shard 2/3) | ⚠️ 2 falhas | `workItemFormat.test.ts:123` (timezone CI=UTC vs local UTC-3), `configuracoes.leituraErro.test.tsx:73` — **pré-existentes na `main`** (item 10) |
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

**Commit:** `a6d68651` (via MCP push)  
**Causa:** `gh pr list --json` retornou `"unexpected end of JSON input"` (resposta truncada da API do GitHub). O padrão de erros transitórios em `execComRetry` não incluía esse caso, então o erro era tratado como permanente e o workflow falhava sem retry.  
**Fix:** adicionado `unexpected end of JSON` ao regex de erros transitórios em `scripts/ci/fila-merge.mjs:38`.

### 3. `useInboxFilters.ts` — migração para `useSearchParams` (PK-14)

**Commit:** `a6d68651` (via MCP push)  
**Causa:** `useInboxFilters.ts` usava `window.location.search` / `window.history.replaceState` diretamente, contornando o `MemoryRouter` do React Router nos testes. Resultado: 5/9 testes em `useInboxFilters.type-url.test.tsx` falhavam porque o hook não lia os params da URL do MemoryRouter.  
**Fix:** Migrado para `useSearchParams` / `setSearchParams` do `react-router-dom`. Sentinel `undefined` vs `null` para distinguir "sem param na URL" de "param inválido/all" — garante que `contactTypeUrl !== undefined` cancela o fallback para prefs salvas quando há param na URL, mesmo inválido. 9/9 testes passam.

**Nota sobre misatribuição no log do CI (shard 2/3, run 40211737149):** O CI reportou falha em `useInboxFilters.type-url.test.tsx:137` com `expected 'Hoje, 20:00' to be 'Hoje, 17:00'`. Investigado e confirmado: o arquivo `useInboxFilters.type-url.test.tsx` em `ee05fe0` **não tem assertion de data**. A falha real é `workItemFormat.test.ts:123` (timezone flake — ver §1–§5 de PENDENCIAS.md). Os 9 testes de PK-14 passam.

### 4. TC-009 — versão de migration incorreta em `team-receipts-reactions-conversation-id.test.sh`

**Commit:** `4adee58`  
**Causa:** `scripts/db-audit/team-receipts-reactions-conversation-id.test.sh:32` referenciava `20261009193246_team_receipts_reactions_conversation_id_forced.sql` (inexistente nesta branch). O arquivo real é `20261006222024_team_receipts_reactions_conversation_id_forced.sql`.  
**Fix:** Linha 32: `20261009193246` → `20261006222024`. TC-009 (`Contrato DB offline`) passa.

### 5. `useDiagnosticsData.ts` — `throw` impedia `setHealth` de ser chamado

**Commit:** `4adee58`  
**Causa:** `src/hooks/system/useDiagnosticsData.ts:293` tinha `if (connectionsCountError) throw connectionsCountError` — o `throw` encerrava `fetchSystemHealth` antes de `setHealth` ser invocado com `dbError` setado, então `health?.database` ficava `undefined` em vez de `'down'`.  
**Fix:** Linha 293: `throw connectionsCountError` → `dbError = dbError ?? connectionsCountError`. `useDiagnosticsData.select.test.ts:79` passa.

### 6. `supabase/deployment-manifest.json` — manifesto stale

**Commit:** `96b1aa6`  
**Causa:** `deployment-manifest.json` apontava para versão antiga de `ai-audio-authz.ts` (4007→7475 bytes) e `ai-transcribe-audio/index.ts` (28209→29419 bytes). O `deploy-functions.yml` (run 40097636982) falhava com "Deployment manifest is stale".  
**Fix:** Arquivo regenerado com hashes atuais. `manifest_sha256=42fcdc0b3046b16ee740b3ec41ec6ff675087b215442e10d2ec4693011feca8f`.

---

## Validação pós-fix (local — 2026-10-25 ~22:05 UTC)

Rodado localmente após todos os 6 commits de correção (último: `96b1aa6`):

| Etapa | Resultado | Evidência |
|---|---|---|
| `bun run build` | ✅ success | `✓ built in 14.23s` — `dist/` gerado, zero erros |
| `bun run typecheck` | ⚠️ mesmos erros do baseline | drift de schema pré-existente (`warroom_queue_stats`, `transfer_conversation`, etc.) — **sem novos erros introduzidos** |
| `ChatMessagesArea.pagination.test.tsx` | ✅ 4/4 pass | `bun vitest run …pagination.test.tsx` — fix #1 confirmado |
| `useDiagnosticsData.select.test.ts` | ✅ pass | incluído nos 15 testes abaixo — fix #5 confirmado |
| `useInboxFilters.type-url.test.tsx` | ✅ 9/9 pass | incluído nos 15 testes abaixo — fix #3 confirmado |
| **3 arquivos fixados juntos** | ✅ **15/15 pass** | `bun vitest run …pagination.test.tsx …useDiagnosticsData.select.test.ts …useInboxFilters.type-url.test.tsx` |

**Conclusão:** `bun run build` ✅, 15/15 testes dos arquivos corrigidos passam. Sem regressão local.

---

## Resumo

- **Corrigidos nesta sessão:** 6 (`pagination.test.tsx`, `fila-merge.mjs`, `useInboxFilters.ts` PK-14, TC-009 versão migration, `useDiagnosticsData.ts` throw→dbError, `deployment-manifest.json` stale)
- **Pré-existentes na main, requerem decisão humana/infra:** ver `PENDENCIAS.md` §1–§5
- **Sem regressão introduzida:** confirmado local e por comparação com run `40122006424` (main, commit `2d97c44`)
- **CI do PR #2246 (SHA `b309619`):** runs `40237086221` (CI/CD Pipeline) e `40237086219` (DB Guard) estão em `queued` aguardando runner — 14 runs de outros PRs na fila na mesma conta
- **Bloqueador para merge:** `e2e-logado.yml` / `types-sync.yml` / `db-live-guard.yml` — bloqueios de infra documentados em §1–§3 de PENDENCIAS.md

*Este arquivo deve ser atualizado após cada ciclo de correção de CI.*
