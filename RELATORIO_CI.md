# Relatório CI — branch `fix/ci-workflows` (PR #2261)

> Gerado em 2026-10-25. Branch: `fix/ci-workflows` | SHA: `35952e7f` | PR: [#2261](https://github.com/adm01-debug/Zapp_Web_V2/pull/2261)
> Sessão: https://claude.ai/code/session_01XQg8vscDFaYdzdNS5632BA

---

## 1. Baseline local antes das alterações

Executado no ambiente de CI remoto (container Ubuntu 24.04) na branch `fix/ci-workflows`.

| Passo | Resultado | Evidência |
|-------|-----------|----------|
| `bun install` | ✅ exit 0 | background task `bgzfn24kb` — `PID: 10499 [exited with code 0]` |
| `bun run build` | ✅ exit 0, 18.94s | background task `bx6bgkvp7` — `✓ built in 18.94s`, `--- BUILD EXIT: 0` |
| `bun run lint` | ❌ 819 problemas (605 erros, 214 avisos) | `bx6bgkvp7` — `✖ 819 problems (605 errors, 214 warnings)` — pré-existente em `origin/main` |
| TypeCheck | ✅ | CI job `🔎 TypeCheck` [#121241225662](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40217337125/job/121241225662) `conclusion=success` |

**Lint é pré-existente em `origin/main`:** qualquer PR aberta contra `main` tem os mesmos 819 problemas antes das alterações desta branch.

---

## 2. Inventário de execuções com falha na `main` (baseline de comparação)

**Run de referência:** [#40122006424](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006424) — 2026-10-24 — SHA `2d97c44`

| Job | conclusion | Observação |
|-----|-----------|----------|
| `🧪 Unit Tests (1/3)` | ❌ failure | Pré-existente |
| `🧪 Unit Tests (2/3)` | ❌ failure | Pré-existente |
| `🧪 Unit Tests (3/3)` | ❌ failure | Pré-existente |
| `🏗️ Build` | ⏭️ skipped | Gate bloqueado pelos Unit Tests |
| `Contrato DB offline` (db-guard.yml) | ❌ failure | DASH-091/092 (`sanitize_reset_request()`), ver §4 de PENDENCIAS.md |

**Todos os 3 shards de Unit Tests já falhavam na `main` ANTES desta PR.**

---

## 3. Status do CI da PR #2261 (run #40217337125)

| Job | Job ID | conclusion | completed_at |
|-----|--------|-----------|-------------|
| `🔒 Security Audit` | [121241225455](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40217337125/job/121241225455) | ✅ success | 17:40:10Z |
| `🧬 Mutação do mapa` | [121241225597](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40217337125/job/121241225597) | ✅ success (skipped) | 17:41:24Z |
| `🧩 Node CI Scripts` | [121241225634](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40217337125/job/121241225634) | ✅ success | 17:44:22Z |
| `🔎 TypeCheck` | [121241225662](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40217337125/job/121241225662) | ✅ success | 17:43:20Z |
| `🧪 Unit Tests (1/3)` | [121241225599](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40217337125/job/121241225599) | ❌ failure | 17:46:11Z |
| `🧪 Unit Tests (2/3)` | [121241225795](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40217337125/job/121241225795) | ❌ failure | 17:52:06Z |
| `🧪 Unit Tests (3/3)` | [121241225630](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40217337125/job/121241225630) | ❌ failure | 17:51:17Z |
| `✅ CI Gate` | [121244819247](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40217337125/job/121244819247) | ❌ failure | 17:52:12Z |
| `🏗️ Build` | [121244820633](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40217337125/job/121244820633) | ⏭️ skipped | 17:52:06Z |
| `🎭 E2E Tests (Playwright)` | [121241225752](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40217337125/job/121241225752) | 🔄 in_progress | — |

---

## 4. Workflows corrigidos — evidência de `conclusion=success`

### 4.1 `scripts/ci/fila-merge.mjs` — execComRetry

**Causa raiz:** `execFileSync` lançava exceção em erros transitórios de rede (`HTTP 504 Gateway Timeout`, `ECONNRESET`, `ETIMEDOUT`, `unexpected end of JSON input`) ao chamar `gh pr list --json`. O runner de CI é efemeramente desconectado da API do GitHub.

**Fix:** `execComRetry` com 3 tentativas e backoff exponencial 5s/10s/20s. Chamado nos dois `execFileSync` de `decisaoAtual()`.

**Conclusão=success confirmada:**
- Job `🧩 Node CI Scripts` — [#121241225634](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40217337125/job/121241225634) — `conclusion=success` — `completed_at: 2026-10-25T17:44:22Z`
- Este job executa `🧩 Run Node CI scripts tests` e `🦕 Test Edge handlers`, ambos passaram.

---

### 4.2 `src/components/inbox/ai-tools/__tests__/a11y-ferramentas-ia.test.tsx` — aria-labels

**Causa raiz:** Asserções usavam aria-labels obsoletos (`'Ouvir resumo'`, `'Ouvir pontos-chave'`). `SummaryResult.tsx` foi atualizado para usar labels WCAG completos mas o teste não foi sincronizado.

**Fix:** Atualizado para `'Ouvir o resumo em voz alta'` e `'Ouvir os pontos-chave em voz alta'` (linhas 156–157).

**Verificação local:** `vitest run src/components/inbox/ai-tools/__tests__/a11y-ferramentas-ia.test.tsx` → **13/13 ✅**

**Nota:** O shard que contém este arquivo (1/3) ainda falha devido a outras falhas pré-existentes não relacionadas a esta fix (documentadas em PENDENCIAS.md §9c–§9f).

---

### 4.3 `src/components/inbox/chat/__tests__/ChatMessagesArea.pagination.test.tsx` — getBoundingClientRect

**Causa raiz:** `@tanstack/react-virtual@3.14.x` usa `getBoundingClientRect()` internamente; jsdom retorna zeros → `getVirtualItems()` → array vazio → nenhum elemento renderizado.

**Fix:** Spies de `getBoundingClientRect`, `clientHeight` e `scrollTo` adicionados em `beforeAll` (linhas 55–71).

**Verificação local:** `vitest run src/components/inbox/chat/__tests__/ChatMessagesArea.pagination.test.tsx` → **4/4 ✅**

---

### 4.4 `src/hooks/tasks/__tests__/workItemFormat.test.ts` — timezone UTC vs UTC-3

**Causa raiz:** Teste "aceita o ISO com offset que o banco devolve" (linha 122) dependia de `process.env.TZ` local (UTC-3), ausente no runner de CI (UTC). `'2026-10-11T17:00:00-03:00'` formatava como `'Hoje, 20:00'` em UTC em vez de `'Hoje, 17:00'`.

**Fix:** Envolvido com `withTimeZone('America/Sao_Paulo', ...)` (linhas 122–126 — helper já existia no arquivo).

**Verificação local:** `vitest run src/hooks/tasks/__tests__/workItemFormat.test.ts` → **13/13 ✅**

---

## 5. Prova de zero regressão

Comparação entre os arquivos que falham na `main` (run #40122006424) e na PR (run #40217337125):

### Shard 1/3

| Arquivo de teste | Falha na `main` | Falha na PR | Status |
|---|---|---|---|
| `useKnowledgeBase.erro.test.tsx` | ❌ | ❌ | Pré-existente, não alterado |
| `useTalkXSegments.test.ts` | ❌ | ❌ | Pré-existente, não alterado |
| `useTalkXSuppression.hook-morto.test.ts` | ❌ | ❌ | Pré-existente, não alterado |
| `useTeamMessages.canal-e-reconexao.test.tsx` | ❌ | ❌ | Pré-existente, não alterado |
| `a11y-ferramentas-ia.test.tsx` | ❌ | ✅ localmente | **CORRIGIDO** |

### Shard 2/3

| Arquivo de teste | Falha na `main` | Falha na PR | Status |
|---|---|---|---|
| `useInboxFilters.type-url.test.tsx` | ❌ | ❌ | Pré-existente, não alterado |
| `configuracoes.leituraErro.test.tsx` | ❌ | ❌ | Pré-existente, não alterado |
| `useDiagnosticsData.select.test.ts` | ❌ | ❌ | Pré-existente, não alterado |
| `workItemFormat.test.ts` | ❌ | ✅ localmente | **CORRIGIDO** |

### Shard 3/3

| Arquivo de teste | Falha na `main` | Falha na PR | Status |
|---|---|---|---|
| `useTeamChatPanel.search-antigas.test.tsx` | ❌ | ❌ | Pré-existente, não alterado |
| `command-palette.busca-antiga.test.tsx` | ❌ | ❌ | Pré-existente, não alterado |
| `useAuth.fila-offline-logout.test.tsx` | ❌ | ❌ | Pré-existente, não alterado |
| `useTeamChatNotifications.canal-estavel.test.tsx` | ❌ | ❌ | Pré-existente, BLOQUEADO (HZ5-09, §9a PENDENCIAS.md) |
| `ChatMessagesArea.pagination.test.tsx` | ❌ | ✅ localmente | **CORRIGIDO** |

**Conclusão: zero regressões introduzidas por esta PR.** Todos os arquivos que falham no PR já falhavam na `main` antes desta PR. Os 4 arquivos corrigidos passam localmente e o fix do `fila-merge.mjs` tem `conclusion=success` no CI.

---

## 6. Workflows com falha remanescente — todos pré-existentes em `origin/main`

| Workflow / Check | Run (PR) | Motivo | Bloqueio |
|---|---|---|---|
| `🧪 Unit Tests` (3 shards) | [40217337125](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40217337125) | 11 arquivos pré-existentes (§5 e §9c–§9m de PENDENCIAS.md) | Decisão arquitetural / produto / Joaquim |
| `Contrato DB offline` (db-guard.yml) | run nos commits do PR | DDL `sanitize_reset_request()` (DASH-091/092) | Aprovação de Joaquim em environment `producao-ddl` (Regra 8) |
| `🏗️ Build` | [40217337125](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40217337125) | Gate bloqueado por Unit Tests | Idem Unit Tests |

*Atualizado em 2026-10-25.*
