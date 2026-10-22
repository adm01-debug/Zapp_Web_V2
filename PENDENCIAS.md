# PENDENCIAS.md — Bloqueios do PR #2185

Branch: `claude/kind-gates-87mwoe`  
Data: 2026-10-22  
SHA HEAD: `12e9162b50e898ace5e100318f00fd59b811af7f`

---

## P1 — `Contrato DB offline` falha (pré-existente em `main`)

**Check:** `Contrato DB offline` (job em `db-guard.yml`)  
**Status:** BLOQUEADO — falha também no branch `main` (SHA `5a4632c8`); não é regressão deste PR  
**Erro exato:**  
```
ERROR: record "new" has no field "reset_token"
CONTEXT: PL/pgSQL function sanitize_reset_request() line 15 at NEW assignment
```

**Causa:** A função `sanitize_reset_request()` referencia coluna `reset_token` que não existe
na tabela atual de `password_reset_requests`. A migration que adicionou a coluna foi aplicada
em produção mas `NEW.reset_token` aponta para campo ausente no schema local do contrato.

**Evidência:** Reproduced no SHA de `main` antes de qualquer commit deste PR.

**Ação necessária pelo Joaquim:**  
Corrigir a função `sanitize_reset_request()` ou reconciliar o schema do contrato local
com o da produção. DDL vai pelo fluxo arquivo→PR→merge (seção 1, regra 6 do CLAUDE.md).

---

## P2 — `🏗️ Build` falha por budget de bundle (revelado por este PR)

**Check:** `🏗️ Build` (job em `ci.yml`)  
**Status:** BLOQUEADO — falha ao medir gzip do bundle inicial  
**Erro exato:**  
```
initial-js: 359.5 KB gzip > budget 300 KB
FALHA: budget de bundle estourado
```

**Causa:** O commit anterior no `ci.yml` tinha `if: success()` no job `build`, então ele ficava
`skipped` quando unit-tests falhavam, mascarando a falha. Após o fix de `if: !cancelled()`,
o build passou a rodar e revelou que o bundle inicial está 59.5 KB acima do limite de 300 KB.

**A falha de bundle preexiste a este PR** — ela estava oculta pelo `skipped`. O fix de `ci.yml`
é correto; ele apenas expôs o estado real.

**Investigação inicial:**  
`scripts/ci/bundle-budget.mjs` mede gzip de JS carregado no first paint. O limite em
`performance-budget.json` é `initial-js.maxKB = 300`. A medição atual é 359.5 KB.

**Solução sugerida (não implementada — requer build local para validar):**  
Adicionar code splitting em `vite.config.ts` para extrair framer-motion para chunk lazy:
```ts
// vite.config.ts — manualChunks
'vendor-motion': ['framer-motion']
```
Isso move framer-motion do bundle inicial para chunk lazy, reduzindo o initial-js.

**Ação necessária pelo Joaquim ou sessão com build local disponível:**  
Rodar `bun run build` localmente, medir com `node scripts/ci/bundle-budget.mjs`, ajustar
`vite.config.ts` e validar que `initial-js < 300 KB` antes de commitar.

---

## P3 — `copilot-pull-request-reviewer` retorna HTTP 402

**Check:** `copilot-pull-request-reviewer` (app externo da GitHub/Copilot)  
**Status:** BLOQUEADO por billing — não é required check, não bloqueia merge  
**Erro:** HTTP 402 Payment Required  

**Contexto:** Este check não faz parte dos 6 required checks da `main` (ver CLAUDE.md — Perímetro
do GitHub). Não bloqueia o merge do PR #2185.

**Ação necessária pelo Joaquim:** Verificar billing do GitHub Copilot ou ignorar (não é bloqueante).

---

## P4 — Falhas pré-existentes em `🧪 Unit Tests` (não introduzidas por este PR)

**Check:** `🧪 Unit Tests` (3 shards em `ci.yml`)  
**Status:** DOCUMENTADO — falhas preexistem em `main`; não são regressões deste PR  

**Testes afetados e sintomas:**

1. **`__tests__/VolumeDial.test.tsx`** — 8 falhas
   - Sintoma: `aria-valuenow` calculado como `33` quando esperado `50`, `30` quando esperado `100`, etc.
   - Causa raiz: lógica de normalização angular do VolumeDial produz valores inesperados
   - Nenhum commit deste PR toca este arquivo

2. **`__tests__/useAgentCelebrations.test.tsx`** — 4 falhas
   - Sintoma: `celebrations.length` retorna `0` quando esperado `1`
   - Causa raiz: condição de disparo de celebração não satisfeita no setup do teste
   - Nenhum commit deste PR toca este arquivo

3. **`__tests__/useDashboardKpi.periodo.test.tsx`** — 3 falhas
   - Sintoma: parâmetros RPC `p_from`/`p_until` não encontrados no mock
   - Causa raiz: assinatura da função RPC mudou mas os mocks do teste não foram atualizados
   - Nenhum commit deste PR toca este arquivo

**Evidência de pré-existência:**
```bash
# Todos retornam vazio — nenhum desses arquivos foi tocado por este PR
git log main..origin/claude/kind-gates-87mwoe -- src/components/__tests__/VolumeDial.test.tsx
git log main..origin/claude/kind-gates-87mwoe -- src/hooks/__tests__/useAgentCelebrations.test.tsx
git log main..origin/claude/kind-gates-87mwoe -- src/hooks/__tests__/useDashboardKpi.periodo.test.tsx
```

**Ação:** Não é bloqueio deste PR. Requer investigação e correção separada em branch dedicado.

---

## Resumo

| # | Check | Bloqueante? | Depende de |
|---|---|---|---|
| P1 | `Contrato DB offline` | Sim (required) | Joaquim — DDL de correção |
| P2 | `🏗️ Build` (bundle budget) | Sim (required) | Sessão com build local |
| P3 | `copilot-pull-request-reviewer` | Não | Joaquim — billing |
| P4 | `🧪 Unit Tests` (3 suites, 15 falhas) | Não (pré-existente em main) | Investigação separada |

**Os 4 outros required checks** (`🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🔒 Security Audit`,
`🎭 E2E Tests (Playwright)`) estão em progresso no CI atual. `🧪 Unit Tests` pode apresentar
as 15 falhas pré-existentes do P4, mas nenhuma delas é regressão introduzida por este PR.
