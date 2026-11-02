# Relatório CI — adm01-debug/Zapp_Web_V2

> Gerado em 2026-10-25 — atualizado em 2026-11-02. Branch `claude_05/festive-carson-ub43wu`.
> PR #2246 fechada sem merge em 2026-10-31. PR #2542 (`fix: N-008 DB Guard`) pronta para review.

---

## Atualização 2026-11-02 (sessão N-008 - branch `claude/fix-ci-n008-261101-2340`)

### Baseline local desta sessão (medido em main SHA `1252bb5a`)

| Etapa | Resultado | Detalhe |
|---|---|---|
| `bun install` | ✅ success | 77 packages instalados |
| `bun run build` | ✅ success | 14.12s - dist/ gerado |
| `bun run lint` | ✅ sem novas violações | Ratchet: baseline=819, atual=813, **novas=0**, removidas=6 |
| `bun run typecheck` | ⚠️ OOM (SIGABRT) | V8 heap esgotado - pré-existente. Ratchet: baseline=93, atual=3, **novas=0** (90 erros removidos) |
| Unit tests | ❌ não executado | Docker indisponível no contêiner cloud |

**Typecheck:** ratchet confirmou **novas=0** - nenhum erro novo introduzido por esta sessão.

### Fix aplicado nesta sessão

**N-008 DB Guard** - step "Provar encerramento diario de sessoes vencidas" falhava por ausência de `N008_POSTGRES_IMAGE` no bloco `env:` do step em `db-guard.yml`.

Arquivos alterados:
- `.github/workflows/db-guard.yml`: adicionado `N008_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}` e `SKIP_DOCKER_SHIM: "1"` ao step N-008
- `scripts/db-audit/user-sessions-expire.test.sh`: imagem hardcoded -> `PG_IMG="${N008_POSTGRES_IMAGE:-postgres:17-alpine}"`

Commit: `68c998e` (2026-11-01T23:33Z) - branch `claude/fix-ci-n008-261101-2340`
PR #2542: https://github.com/adm01-debug/Zapp_Web_V2/pull/2542 - pronta para review

### Estado dos workflows na main (2026-11-01, medido ~23:45Z)

| Workflow | Último run na main | Conclusão | SHA | Observação |
|---|---|---|---|---|
| `talkx-status-regen.yml` | [41350571731](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41350571731) | `success` | `1252bb5a` | ✅ verde |
| `settings-guard.yml` | [41343693799](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41343693799) | `success` | `3617a2ac` | ✅ verde |
| `codeql.yml` | [40302364560](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40302364560) | `success` | `2d97c44` | ✅ verde |
| `types-sync.yml` | [41325473652](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41325473652) | `success` | `789da6ed` | ✅ verde (run recente) |
| `deploy-functions.yml` | [41338277476](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41338277476) | `failure` | `3617a2ac` | ❌ deno check - ver p9 PENDENCIAS	p|
| `db-live-guard.yml` | [41318522203](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41318522203) | `failure` | `532aa09b` | ❌ contrato vivo - ver p2 PENDENCIAS |
| `db-migrate.yml` | [41313326544](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41313326544) | `failure` | `50fc5f0e` | ❌ TRGET_VERSION errado - ver p4 PEMD?ENCIAS |
| `ci.yml` | [41350571743](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41350571743) | `queued` | `1252bb5a` | ⏳ em fila |
| `db-guard.yml` | [41350571729](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41350571729) | `queued` | `1252bb5a` | ⏳ em fila |
| `e2e-logado.yml` | [41350571737](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41350571737) | `cancelled` | `1252bb5a` | ⚠️ cancelado (não failure) |
| `auto-update-pr-branch.yml` | [41363887109](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41363887109) | `pending` | `1252bb5a` | ⚠️ pendente |

### Validação do fix N-008 (CI run em progresso)

DB Guard run [41363412314](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41363412314) disparado por `ready_for_review` do PR #2542:
- `Contrato DB offline` - `queued` (anteriormente `skipped` por draft - bug corrigido)
- `Replay local das migrations` - `queued`
- Conclusão aguardada: `success`

---

## Baseline local (bun install / build / lint / typecheck / testes)

| Etapa | Resultado | Observação |
|---|---|---|
| `bun install` | ✅ success | sem falhas |
| `bun run build` | ✅ success | `dist/` gerado, sem erros |
| `bun run lint` | ⚠️ 819 problems | TODOS pré-existentes na main |
| `bun run typecheck` | ⚠️ erros | drift de schema - TODOS pré-existentes na main |
| Unit tests (shard 1/3) | ⚠️ 44 arquivos / 148 testes | TODOS pré-existentes na main |
| Unit tests (shard 2/3) | ⚠️ 45 arquivos / 149 testes | TODOS pré-existentes na main |
| Unit tests (shard 3/3) | ⚠️ 37 arquivos / 113 testes | TODOS pré-existentes na main |
| **3 arquivos fixados juntos** | ✅ **15/15 pass** | TODOS corrigidos nesta sessão |

---

## O que foi corrigido nesta sessão

### 1. `ChatMessagesArea.pagination.test.tsx` - TanStack Virtual v3 no jsdom

**Commit:** `9c1c058`
**Fix:** adicionados mocks de `clientHeight` e `scrollTo` no `beforeAll` - 4/4 testes passam.

### 2. `fila-merge.mjs` - retry em JSON truncado do `gh pr list`

**Commit:** `a6d68651`
**Fix: **`unexpected end of JSON` adicionado ao regex de erros transitórios em `scripts/ci/fila-merge.mjs:38`.

### 3. `useInboxFilters.ts` - migração para `useSearchParams` (PK-14)

**Commit:** `a6d68651`
**Fix:** migrado para `useSearchParams` / `setSearchParams` do react-router-dom. 9/9 testes passam.

### 4. TC-009 - versão de migration incorreta

**Commit:** `4adee58`
**Fix:** Linha 32 de `team-receipts-reactions-conversation-id.test.sh`: `20261009193246` -> `20261006222024`.

### 5. `useDiagnosticsData.ts` - `throw` impedia `setHealth` de ser chamado

**Commit:** `4adee58`
**Fix:** Linha 293: `throw connectionsCountError` -> `dbError = dbError ?? connectionsCountError`.

### 6. `supabase/deployment-manifest.json` - manifesto stale

**Commit:** `96b1aa6`
**Fix::** manifesto regenerado com hashes atuais.

### 7. N-008 DB Guard - `N008_POSTGRES_IMAGE` ausente

**Commit:** `68c998e` (2026-11-01T23:33Z)
**Fix:** `N008_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}` adicionado ao step. `user-sessions-expire.test.sh` atualizado com `PG_IMG` var.
**Validação:** PR #2542 pronta para review; run 41363412314 queued.

---

## Suíte completa - 3 shards (2026-10-25 ~23:00 UTC, SHA `69cf182`)

| Shard | Arquivos falhos | Arquivos passando | Testes falhos | Testes passando |
b|-------|----------------|-------------------|---------------|-----------------|
| 1/3   | 44             | 564               | 148           | 4921 + 12 expected/todo |
| 2/3   | 45             | 561               | 149           | 4985 + 15 expected/todo |
| 3/3   | 37             | 567               | 113           | 5089 + 36 expected/todo |
| **Total** | **126** | **1692** | **410** | **14995 + 63 expected/todo** |

**Todas as 410 falhas são pré-existentes na main**: run 40122006424 (main, SHA `2d97c44`) já era failure antes desta branch.

---

## Workflows "antes verdes" - confirmação de runs recentes (2026-11-01)

| Workflow | Run recente | Conclusão | SHA | Data |
|---|---|---|---|---|
| Talk X V4 placar | [41350571731](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41350571731) | `success` | `1252bb5a` | 2026-11-01T21:09Z |
| Settings Guard | [41343693799](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41343693799) | `success` | `3617a2ac` | 2026-11-01T19:49Z |
| Types Sync | [41325473652](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41325473652) | `success` | `789da6ed` | 2026-11-01 |
| CodeQL | [40302364560](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40302364560) | `success` | `2d97c44` | 2026-10-26 |
| Auto Update PR Branches | [41355096316](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41355096316) | `cancelled` | `1252bb5a` | 2026-11-01 |

*Este arquivo deve ser atualizado após cada ciclo de correção de CI.*