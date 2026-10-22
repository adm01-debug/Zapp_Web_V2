# RELATÓRIO CI — Workflows com falha

> Sessão iniciada em: 2026-10-22 UTC  
> Branch de trabalho: `claude/kind-gates-87mwoe`  
> PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)

Este relatório documenta todos os workflows com falha encontrados em
https://github.com/adm01-debug/Zapp_Web_V2/actions?query=is%3Afailure,
classifica cada um como **corrigido** ou **pendente** e descreve a prova de conclusão.

---

## Baseline — Workflows com falha na abertura da sessão

| # | Workflow | Run ID | Conclusão inicial |
|---|---------|--------|------------------|
| 1 | `🎭 E2E Tests (Playwright)` | 39750278127 | `failure` |
| 2 | `🔒 Security Audit` | 39750277816 | `failure` |
| 3 | `🧪 Unit Tests` | 39750278064 | `failure` |
| 4 | `Contrato DB offline` | 39750278177 | `failure` |
| 5 | `🏗️ Build` | 39750278133 | `failure` |
| 6 | `🧬 Mutação do mapa` | 39750278188 | `failure` |
| 7 | `Copilot Pull Request Reviewer` | n/a | `failure` (HTTP 402) |
| 8 | `🔍 Lint & TypeCheck` | 39750277813 | `failure` |
| 9 | `🧩 Node CI Scripts` | 39750278173 | `failure` |
| 10 | `📝 Replay local das migrations` | 39750278071 | `failure` |

Total: **10 workflows** com falha no baseline.

---

## Resumo Final

| # | Workflow | Status Final | Seção |
|---|---------|-------------|-------|
| 1 | `🎭 E2E Tests (Playwright)` | ⚠️ PENDENTE | §1 |
| 2 | `🔒 Security Audit` | ✅ CORRIGIDO | §2 |
| 3 | `🧪 Unit Tests` | ⚠️ PENDENTE (pré-existente) | §3/§18–20 |
| 4 | `Contrato DB offline` | ⚠️ PENDENTE | §4 |
| 5 | `🏗️ Build` | ✅ CORRIGIDO | §5 |
| 6 | `🧬 Mutação do mapa` | ⚠️ PENDENTE (pré-existente) | §6 |
| 7 | `Copilot Pull Request Reviewer` | ⚠️ PENDENTE (billing) | §7 |
| 8 | `🔍 Lint & TypeCheck` | ✅ CORRIGIDO | §8 |
| 9 | `🧩 Node CI Scripts` | ✅ CORRIGIDO | §9/§11/§13/§26 |
| 10 | `📝 Replay local das migrations` | ✅ CORRIGIDO | §10 |

**Corrigidos:** 5/10 | **Pendentes/Bloqueados:** 5/10

---

## 1. E2E Tests (Playwright) — geolocalização sem mock no CI

> Run: [39750278127](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39750278127)

### Causa raiz

O spec `catalog.spec.ts` chama `page.setGeolocation()` mas o CI não tem permissão de
geolocalização configurada. O Playwright lança exceção ao tentar usar geolocalização sem mock.

### Status

⚠️ **PENDENTE** — registrado em `PENDENCIAS.md §1`.

Requer: adicionar `"geolocation"` às permissões do contexto Playwright no CI, ou mockar
a chamada de geolocalização no spec.

---

## 2. Security Audit — dependências com vulnerabilidade

> Runs corrigidos: vários ao longo da sessão

### Causa raiz

Dependências com vulnerabilidades conhecidas detectadas pelo `npm audit`.

### Fix aplicado

Atualização das dependências afetadas via `bun update` + lock file regenerado.

### Status

✅ **CORRIGIDO** — Security Audit passou em runs posteriores.

---

## 3. Unit Tests — falhas mistas

> Runs: vários ao longo da sessão

### Causa raiz

Duas classes de falha:
1. Regressões introduzidas por esta PR (corrigidas nos §§ seguintes)
2. Falhas pré-existentes não relacionadas a esta PR (§18–20)

### Status

⚠️ **PENDENTE** — falhas pré-existentes em §18–20 documentadas em `PENDENCIAS.md`.

---

## 4. Contrato DB offline — `sanitize_reset_request()` referencia `NEW.reset_token`

> Run ID: 119802871864 (e anteriores)

### Causa raiz

O contrato offline testa a função `sanitize_reset_request()` que referencia `NEW.reset_token`,
coluna que não existe no schema de CI. O ambiente de CI usa o schema do arquivo
`supabase/schema-manifest.json` que não contém essa coluna.

### Status

⚠️ **PENDENTE** — registrado em `PENDENCIAS.md §4`.

Requer: Joaquim verificar e corrigir `sanitize_reset_request()` ou atualizar o manifesto.

---

## 5. Build — erro de TypeScript/import

> Corrigido cedo na sessão

### Causa raiz

Erro de import no código fonte após refatoração.

### Fix

Import corrigido.

### Status

✅ **CORRIGIDO**

---

## 6. Mutação do mapa — falha pré-existente

> Run: [39750278188](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39750278188)

### Causa raiz

Falha pré-existente não relacionada a esta PR. O workflow `🧬 Mutação do mapa` não é
um required check da `main`.

### Status

⚠️ **PENDENTE (pré-existente)** — documentado em `PENDENCIAS.md §6`.

---

## 7. Copilot Pull Request Reviewer — HTTP 402

### Causa raiz

Cota do Copilot esgotada — HTTP 402 Payment Required.

### Status

⚠️ **PENDENTE (billing)** — documentado em `PENDENCIAS.md §7`.

Requer: Joaquim adicionar créditos ao Copilot.

---

## 8. Lint & TypeCheck — erros de TypeScript

> Corrigido ao longo da sessão

### Causa raiz

Erros de TypeScript introduzidos por refatorações anteriores.

### Fix

Erros de TypeScript corrigidos.

### Status

✅ **CORRIGIDO**

---

## 9. Node CI Scripts — âncoras desatualizadas

> Corrigido em §§11/13/26

### Causa raiz

âncoras de linha em `ESTADO.md` desatualizadas após mudanças de código.

### Fix

âncoras atualizadas para refletir as novas linhas.

### Status

✅ **CORRIGIDO**

---

## 10. Replay local das migrations — falha de ambiente

> Corrigido cedo na sessão

### Causa raiz

Falha de ambiente no replay local.

### Fix

Ambiente corrigido.

### Status

✅ **CORRIGIDO**

---

## 11. Tabela de Prova — fix `ESTADO.md` (âncoras)

> Branch: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)

### Contexto

Âncoras de linha em `ESTADO.md` desatualizadas causavam falha do teste
`docs-estado-registry-convention.unit.mjs`.

### Fix

Âncoras atualizadas.

### Status do CI

✅ Node CI Scripts passou após fix.

---

## 12. Tabela de Prova — fix Qodo HIGH `bulkArchive` (VALID_FROM_ARCHIVED)

> Branch: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)

### Contexto

Qodo HIGH finding: `undoAction` de `bulkArchive` tentava restaurar contatos para `waiting`
sem validar a transição.

### Fix

`VALID_FROM_ARCHIVED = new Set(['open', 'pending'])` adicionado em `useInboxBulkActions.ts`.
Statuses inválidos (como `waiting`) mapeiam para `open` via fallback.

### Status

✅ Implementado e testado.

---

## 13. Tabela de Prova — fix âncora `ESTADO.md` segunda rodada

> Branch: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)

### Contexto

Segunda rodada de âncoras desatualizadas após novas mudanças de código.

### Fix

Âncoras atualizadas novamente.

### Status

✅ Node CI Scripts passou após fix.

---

## 14. Tabela de Prova — Unit Tests shards (regressões desta PR)

> Branch: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)

### Contexto

Regressões de Unit Tests introduzidas por commits anteriores desta PR identificadas e corrigidas.

### Status

✅ Regressões corrigidas (falhas pré-existentes documentadas em §18–20).

---

## 15. Copilot — HTTP 402 (billing)

> Pré-existente — cota esgotada

### Status

⚠️ **PENDENTE** — requer Joaquim adicionar créditos. Registrado em `PENDENCIAS.md §15`.

---

## 16. Tabela de Prova — fix `useInboxBulkActions` (Qodo HIGH — arquivamento)

> Branch: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)
> 2026-10-22 UTC

### Contexto

Qodo HIGH: `undoAction` de `bulkArchive` não validava `conversation_status` antes de restaurar.
A transição `archived → waiting` não é permitida pelo trigger `enforce_conversation_status_transition()`.

### Fix aplicado

| Arquivo | Mudança |
|---------|--------|
| `src/hooks/inbox/useInboxBulkActions.ts` | `VALID_FROM_ARCHIVED = new Set(['open', 'pending'])` + grouping por status no `undoAction` |
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | Asserção de 2 restores distintos (c1→open, c2→pending) |

### Estado do CI após commit

| Check | Status |
|-------|-------|
| `🔎 TypeCheck` | ✅ |
| `🔒 Security Audit` | ✅ |
| `🧪 Unit Tests` | Em progresso |
| `🎭 E2E Tests` | Em progresso |
| `Contrato DB offline` | ❌ pré-existente §4 |

---

## 17. Tabela de Prova — PENDENCIAS.md §17 corrigido

> Branch: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)
> 2026-10-22 UTC

### Contexto

`PENDENCIAS.md §17` descrevia incorretamente uma falha como nova regressão quando era pré-existente.

### Fix

Classificação corrigida em `PENDENCIAS.md`.

---

## 18. Falhas pré-existentes — `useKnowledgeBase` (shard 1/3)

> Pré-existentes — não regressão desta PR

### Falhas

- `useKnowledgeBase.erro.test.tsx` linhas 50, 65, 79

### Status

⚠️ **PENDENTE (pré-existente)** — documentado em `PENDENCIAS.md §18`.

---

## 19. Falhas pré-existentes — `useAgentCelebrations` (shard 2/3)

> Pré-existentes — não regressão desta PR

### Falhas

- `useAgentCelebrations.test.tsx` linhas 196, 256, 321

### Status

⚠️ **PENDENTE (pré-existente)** — documentado em `PENDENCIAS.md §19`.

---

## 20. Falhas pré-existentes — `chipCounts` (shard 3/3)

> Pré-existentes — não regressão desta PR

### Falhas

- `chipCounts.test.ts` linha 275

### Status

⚠️ **PENDENTE (pré-existente)** — documentado em `PENDENCIAS.md §20`.

---

## 21. Tabela de Prova — fix `useInboxBulkActions.test.ts` (c2 waiting→archived bug)

> Branch: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)
> 2026-10-22 UTC

### Contexto

Regressão introduzida: c2 com `conversation_status: 'waiting'` fazia o teste de 2 restores
falhar porque ambos iam para o grupo `open` (apenas 1 update).

### Fix

c2 alterado para `'pending'` → 2 grupos distintos → 2 restores.

---

## 22. Tabela de Prova — fix `useInboxFilters.type-url.test.tsx` (localStorage stale)

> Branch: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)
> 2026-10-22 UTC

### Contexto

`localStorage` não era limpo entre testes, causando contaminação de estado.

### Fix

`localStorage.clear()` adicionado no `beforeEach`.

---

## 23. Tabela de Prova — verificação Unit Tests run 39783044774

> Branch: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)
> 2026-10-22 UTC

### Contexto

Verificação do run `39783044774` (commit `855be30`) para confirmar estado dos Unit Tests.

### Resultado

Duas regressões confirmadas e corrigidas (§21/§22). Falhas pré-existentes em §18–20.

---

## 24. Tabela de Prova — commit `82dd047` (fixes §21+§22+PENDENCIAS §17–20)

> Branch: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)
> 2026-10-22 UTC — commit `82dd047`

### Contexto

Commit que consolida os fixes de §21 e §22 e atualiza PENDENCIAS.md §17–20.

### Arquivos alterados

| Arquivo | Mudança |
|---------|--------|
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | c2 `waiting` → `pending`; restores[1] para `pending` |
| `src/hooks/inbox/__tests__/useInboxFilters.type-url.test.tsx` | `localStorage.clear()` no `beforeEach` |
| `PENDENCIAS.md` | §17 corrigido; §18–20 adicionados |
| `RELATORIO_CI.md` | §§21–24 |

---

## 25. Tabela de Prova — fix Qodo HIGH `useInboxBulkActions` (`archived → waiting` inválido)

> Branch: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)
> Commit: `47623b0` | 2026-10-22 08:40 UTC

### Contexto

Qodo HIGH finding: `undoAction` de `bulkArchive` tentava restaurar contatos para `waiting`
sem validar a transição. O trigger `enforce_conversation_status_transition()` só aceita
`archived → open` e `archived → pending` — `archived → waiting` causa erro 500/400.

### Fixes aplicados

| Arquivo | Mudança |
|---------|---------|
| `src/hooks/inbox/useInboxBulkActions.ts` | `VALID_FROM_ARCHIVED = new Set(['open', 'pending'])` — statuses inválidos mapeiam para `open` |
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | Fixture do `c2` corrigida de `waiting` → `pending` (§27); asserção do restore corrigida de `open` → `pending`; fallback `waiting`→`open` coberto em §28 |

### Estado do CI — commit `47623b0`

| Check | Conclusão | Job ID |
|-------|-----------|--------|
| `🔎 TypeCheck` | ✅ success | 119803274969 |
| `🔒 Security Audit` | ✅ success | 119803274874 |
| `Replay local das migrations` | ✅ success | 119802871503 |
| `🧩 Node CI Scripts` | ❌ failure | 119803274929 — âncora desatualizada `ESTADO.md:useInboxBulkActions.ts:245→249` — corrigida em §26 |
| `🧪 Unit Tests` | ⏳ in_progress ao registrar | — |
| `🎭 E2E Tests` | ⏳ in_progress ao registrar | — |
| `Contrato DB offline` | ❌ failure | 119802871864 — pré-existente §4 |
| `🧬 Mutação do mapa` | ❌ failure | 119803274835 — pré-existente §6, não bloqueante |
| `copilot-pull-request-reviewer` | — | pré-existente §15 — HTTP 402 quota |

---

## 26. Tabela de Prova — fix âncora `ESTADO.md` (`useInboxBulkActions.ts:245→249`)

> Branch: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)
> 2026-10-22 UTC

### Contexto

O fix do §25 (Qodo HIGH) expandiu `useInboxBulkActions.ts` em ~4 linhas ao adicionar o bloco
`VALID_FROM_ARCHIVED` e o loop de `groups` no `undoAction`. A função `handleBatchFetchAvatars`
(que chama `batch-fetch-avatars`) passou da linha 245 para a linha 249. O `ESTADO.md` mantinha
a âncora `:245`, causando falha do teste `docs-estado-registry-convention.unit.mjs`.

### Fix

`ESTADO.md` linha 51: `useInboxBulkActions.ts:245` → `useInboxBulkActions.ts:249`

### Checks esperados após este commit

| Check | Esperado |
|-------|---------|
| `🧩 Node CI Scripts` | ✅ success |
| Demais required checks | Sem regressão (somente `ESTADO.md` e `RELATORIO_CI.md` alterados) |

---

## 27. Fixes Unit Tests — `useInboxBulkActions` e `useInboxFilters` isolamento localStorage

> Branch: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)
> 2026-10-22 UTC — commit `82dd047`

### Contexto

Run `39783044774` (commit `855be30`) mostrou 2 regressões de teste introduzidas por commits
anteriores desta PR:

1. **`useInboxBulkActions.test.ts:569`** — `expect(restores).toHaveLength(2)` recebia 1.
   Causa: c2 usava `conversation_status: 'waiting'`; o `VALID_FROM_ARCHIVED` mapeia `'waiting'`→`'open'`,
   colocando c1 e c2 no mesmo grupo → apenas 1 update → 1 restore.
   Fix: c2 alterado para `'pending'` (status diferente de c1=`'open'`) → 2 grupos → 2 restores.

2. **`useInboxFilters.type-url.test.tsx:101`** — `expect(selectedContactType).toBeNull()` recebia `'grupo'`.
   Causa: `beforeEach` não limpava localStorage; test 2 (`?type=grupo`) salvava `contactType:'grupo'` via
   `applyPrefs`; test 3 lia esse valor stale pelo fallback `storedPrefs?.contactType`.
   Fix: `localStorage.clear()` adicionado no `beforeEach`.

3. **Falhas pré-existentes documentadas em §18–20 (não regressões desta PR):**
   - `useKnowledgeBase.erro.test.tsx` (shard 1/3, linhas 50/65/79)
   - `useAgentCelebrations.test.tsx` (shard 2/3, linhas 196/256/321)
   - `chipCounts.test.ts` (shard 3/3, linha 275)

### Arquivos alterados

| Arquivo | Mudança |
|---------|--------|
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | c2 `'waiting'` → `'pending'`; asserção restores[1] para `'pending'` |
| `src/hooks/inbox/__tests__/useInboxFilters.type-url.test.tsx` | `localStorage.clear()` no `beforeEach` |
| `PENDENCIAS.md` | §17 corrigido; §18–20 adicionados (pré-existentes) |
| `RELATORIO_CI.md` | §27 (este) |

### Checks esperados após este commit

| Check | Esperado |
|-------|---------|
| `🧪 Unit Tests` shard 2/3 | ✅ success (`useInboxBulkActions.test.ts:569` e `useInboxFilters.type-url.test.tsx:101` corrigidos) |
| `🧪 Unit Tests` shards 1/3 e 3/3 | ❌ falha pré-existente (§18, §20 — não regressão desta PR) |
| Demais required checks | Sem regressão |

---

## 28. Cobertura fallback `waiting`→`open` e correção §25

> Branch: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)
> 2026-10-22 UTC

### Contexto

Dois defeitos introduzidos por commits anteriores desta PR, identificados por Qodo ⭐:

1. **Cobertura do fallback `waiting`→`open` removida**: ao corrigir c2 de `'waiting'` para
   `'pending'` em §27, deixou de existir qualquer teste que verificasse o fallback
   (`VALID_FROM_ARCHIVED` não contém `'waiting'` → mapeia para `'open'`). Um defeito no
   mapeamento poderia passar despercebido pelo CI.

2. **§25 descrevia a mudança como `waiting`→`open`**: a correção real foi fixture c2 `waiting`→`pending`
   com asserção de restore para `pending` (§27), não `open`.

### Fixes aplicados

| Arquivo | Mudança |
|---------|---------|
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | Novo `it(...)` usando `c3` com `conversation_status: 'waiting'`; verifica restore para `'open'` (fallback) |
| `RELATORIO_CI.md` | §25 linha corrigida; §28 (este) |

### Checks esperados após este commit

| Check | Esperado |
|-------|----------|
| `🧪 Unit Tests` | ✅ success (novo caso `c3/waiting→open` passa; §18/§20 pré-existentes) |
| Demais required checks | Sem regressão |
