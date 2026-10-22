# RELATORIO_CI.md — PR #2185 · Branch `claude/kind-gates-87mwoe`

Data: 2026-10-22  
SHA final no push: `e9e4d857d46058abb1e05b05d629d98b5662cdf3`  
PR: https://github.com/adm01-debug/Zapp_Web_V2/pull/2185

---

## Comparação Baseline × Final

### Required checks da `main` (6 checks obrigatórios)

| Check | Baseline (antes dos fixes) | Final (SHA e9e4d857) | Delta |
|---|---|---|---|
| `🔍 Lint & TypeCheck` | ✅ PASSING | ✅ PASSING | = |
| `🧪 Unit Tests` | ❌ FAILING | ✅ PASSING (corrigido) | ↑ |
| `🏗️ Build` | ⏭️ SKIPPED (mascarado) | ❌ FAILING (bundle pré-existente) | revelado |
| `🔒 Security Audit` | ✅ PASSING | ✅ PASSING | = |
| `Contrato DB offline` | ❌ FAILING (pré-existente main) | ❌ FAILING (pré-existente) | = |
| `🎭 E2E Tests (Playwright)` | ✅ PASSING | ✅ PASSING | = |

### Checks não-required

| Check | Baseline | Final | Delta |
|---|---|---|---|
| `🧩 Node CI Scripts` | ❌ FAILING | ✅ PASSING (corrigido) | ↑ |
| `🧬 Mutação do mapa (não bloqueante)` | não aplicável | ✅ PASSING | = |
| `Replay local das migrations` | não aplicável | em progresso | — |
| `copilot-pull-request-reviewer` | ❌ HTTP 402 | ❌ HTTP 402 (billing) | = |

---

## Fixes Implementados Nesta Sessão

### Fix 1 — `🧪 Unit Tests` (SHA `81e38a27`)

**Problema:** `useKnowledgeBase.ts` não expunha estado `error`; falha de RLS/rede virava "base vazia" silenciosa.  
**Arquivo:** `src/hooks/integrations/useKnowledgeBase.ts`  
**Mudança:**
- Adicionado `const [error, setError] = useState<string | null>(null);`
- `fetchData` checa `articlesRes.error` e `filesRes.error`; propaga via `setError`
- `error` incluído no retorno do hook
- Teste `t_1944d290` (em `__tests__/useKnowledgeBase.erro.test.tsx`) passou a ser satisfeito

**Resultado:** `🧪 Unit Tests` (3 shards) passando.

---

### Fix 2 — `🧩 Node CI Scripts` (SHA `c84f1d5b`)

**Problema:** Âncoras do `ESTADO.md` para `ai-kb-ingest` apontavam para linhas `126` e `197` que foram deslocadas quando o Fix 1 adicionou ~13 linhas ao `useKnowledgeBase.ts`.  
**Arquivo:** `ESTADO.md` (linha 42)  
**Mudança:**
```
Antes: src/hooks/integrations/useKnowledgeBase.ts:126 · :197
Depois: src/hooks/integrations/useKnowledgeBase.ts:139 · :210
```

**Resultado:** `🧩 Node CI Scripts` (guarda `docs-estado-registry-convention.unit.mjs`) passou a validar.

---

### Fix 3 — `🏗️ Build` (ci.yml, SHA anterior)

**Problema:** `ci.yml` tinha `if: success()` no job `build`, fazendo o build ficar `SKIPPED` quando unit-tests falhavam — mascarando a falha de bundle 59.5 KB acima do limite.  
**Arquivo:** `.github/workflows/ci.yml`  
**Mudança:** `if: success()` → `if: !cancelled()`  
**Resultado:** Build agora sempre roda (exceto cancelamento), revelando a falha de bundle pré-existente. **Fix correto — revelou estado real.**

---

### Fix 4 — `KnowledgeBaseView` renderização de erro (SHA posterior)

**Problema:** `KnowledgeBaseView.tsx` não renderizava o estado `error` exposto pelo hook.  
**Arquivo:** `src/components/knowledge/KnowledgeBaseView.tsx`  
**Mudança:** Adicionada renderização de `error` com alerta visual.  
**Resultado:** UX corrigida — usuário vê mensagem de erro em vez de lista vazia.

---

## Bloqueios Registrados (ver PENDENCIAS.md)

### P1 — `Contrato DB offline` (pré-existente em `main`)

**Status:** BLOQUEADO — não é regressão deste PR  
**Erro:** `ERROR: record "new" has no field "reset_token"` em `sanitize_reset_request()` linha 15  
**Evidência:** Reproduz no SHA `5a4632c8` de `main` antes de qualquer commit deste PR  
**Ação:** Requer Joaquim — DDL de correção da função `sanitize_reset_request()` ou reconciliação de schema local

### P2 — `🏗️ Build` bundle budget (pré-existente, revelado por este PR)

**Status:** BLOQUEADO — requer build local para validar fix  
**Erro:** `initial-js: 359.5 KB gzip > budget 300 KB`  
**Causa:** Bundle pré-existente acima do limite; `skipped` mascarava desde antes deste PR  
**Solução proposta:** `manualChunks: { 'vendor-motion': ['framer-motion'] }` em `vite.config.ts`  
**Ação:** Rodar `bun run build` + medir com `node scripts/ci/bundle-budget.mjs`

### P3 — `copilot-pull-request-reviewer` HTTP 402 (billing)

**Status:** NÃO BLOQUEANTE — não faz parte dos 6 required checks  
**Ação:** Verificar billing GitHub Copilot (Joaquim)

---

## Resumo Executivo

| Tipo | Contagem |
|---|---|
| Checks corrigidos por este PR | **2** (Unit Tests, Node CI Scripts) |
| Bugs de UX corrigidos | **1** (KnowledgeBaseView error state) |
| Bug mascarado revelado | **1** (Build/bundle budget — pré-existente) |
| Bloqueios pré-existentes em `main` | **2** (Contrato DB offline, bundle) |
| Checks não-required sem impacto | **1** (copilot HTTP 402) |

**Todos os required checks que podiam ser corrigidos sem DDL, sem build local e sem billing externo foram corrigidos.** Os 2 bloqueios restantes exigem intervenção humana (Joaquim) ou sessão com build local disponível, conforme documentado em `PENDENCIAS.md`.
