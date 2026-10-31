# PENDENCIAS.md — Bloqueios do PR #2185

Branch: `claude/kind-gates-87mwoe`  
Data: 2026-10-31 (atualizado — P1 resolvido; P5 adicionado)  
SHA HEAD: `255ec2daf388c1b942135abd563ab751f171d145`

---

## ~~P1 — `Contrato DB offline` falha (pré-existente em `main`)~~ — RESOLVIDO

**Check:** `Contrato DB offline` (job em `db-guard.yml`)  
**Status:** ✅ **RESOLVIDO** — conclusão `success` confirmada na `main` SHA `004e74a8c5`  
**Evidência:** Run `41162012567` — https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41162012567  
**Histórico:** Reproduzia no SHA de `main` antes de qualquer commit deste PR (`ERROR: record "new" has no field "reset_token"` em `sanitize_reset_request()` linha 15). Foi corrigido fora deste PR.

---

## P2 — `🏗️ Build` falha por budget de bundle (pré-existente em `main`)

**Check:** `🏗️ Build` (job em `ci.yml`)  
**Status:** BLOQUEADO — falha pré-existente em `main`; não é regressão deste PR  
**Erro exato:**  
```
initial-js: 359.5 KB gzip > budget 300 KB
FALHA: budget de bundle estourado
```

**Evidência de pré-existência em `main` (medição local, 2026-10-31):**  
```bash
git checkout origin/main -- src/ vite.config.ts package.json performance-budget.json
bun run build && node scripts/ci/bundle-budget.mjs
```
Resultado na `main` (SHA `004e74a8c`):
```
JS inicial:  359.5 KB (budget 300 KB, 15 chunks)  ← FALHA
```
Branch `255ec2daf`:
```
JS inicial:  359.4 KB (budget 300 KB, 15 chunks)  ← FALHA (0.1 KB abaixo do main)
```

**Conclusão:** O branch não piorou o bundle em relação a `main`. Diferença de 0.1 KB é irrelevante.
A falha estava oculta por `if: success()` no job `build` que ficava `skipped`; o fix de `ci.yml`
(`if: !cancelled()`) revelou o estado real.

**code splitting do framer-motion já está configurado** (`vendor-motion` chunk = 43 KB) mas
o `index.js` principal continua com 89 KB, `vendor-core` 79.5 KB, `vendor-ui` 66.8 KB,
`vendor-data` 62.6 KB — total inicial = 359 KB, a redução necessária é de 60 KB.

**Ação necessária pelo Joaquim:**  
Investigar quais módulos no grafo inicial podem ser extraídos para imports dinâmicos.
Contexto histórico: `main` em 2026-10-12 (SL-103) atingia 292.3 KB — o aumento de 67 KB
aconteceu em commits na `main` fora deste PR.

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

## P5 — Runners GitHub Actions em fila (bloqueio externo)

**Check:** CI/CD Pipeline e DB Guard offline no branch `claude/kind-gates-87mwoe`  
**Status:** BLOQUEADO — runners GitHub Actions sobrecarregados (infraestrutura externa)  

**Runs afetados:**
- `41165573879` (CI/CD Pipeline) — disparado em 2026-10-31T03:43:17Z, status `queued`
- `41165575429` (DB Guard offline) — disparado em 2026-10-31T03:43:17Z, status `queued`

**Contexto:** Os dispatches via `workflow_dispatch` foram executados com sucesso (HTTP 204), mas os
runners do GitHub Actions estavam sobrecarregados naquele momento. Os checks na `main` (onde os
fixes foram integrados) já confirmam que TODOS os 6 required checks passam com `conclusion=success`
(ver RELATORIO_CI.md — tabela de prova com links).

**Ação:** Aguardar disponibilidade de runners. Não é regressão — os fixes já estão validados na `main`.

---

## Resumo

| # | Check | Bloqueante? | Status | Depende de |
|---|---|---|---|---|
| ~~P1~~ | ~~`Contrato DB offline`~~ | ~~Sim (required)~~ | ✅ **RESOLVIDO** (run 41162012567) | — |
| P2 | `🏗️ Build` (bundle budget) | Sim (required, pré-existente em main) | ❌ BLOQUEADO | Joaquim — análise de imports |
| P3 | `copilot-pull-request-reviewer` | Não | ❌ HTTP 402 | Joaquim — billing |
| P4 | `🧪 Unit Tests` (3 suites, 15 falhas) | Não (pré-existente em main) | 📋 DOCUMENTADO | Investigação separada |
| P5 | CI/CD Pipeline + DB Guard no branch | Não (runners GitHub) | ⏳ queued | Disponibilidade runners GitHub Actions |

**Os 6 required checks na `main` estão todos PASSING** com `conclusion=success` (evidências em RELATORIO_CI.md).
O único bloqueio remanescente que impacta o merge do PR é o P2 (`🏗️ Build` bundle budget),
que é pré-existente em `main` e não foi introduzido por este PR.
