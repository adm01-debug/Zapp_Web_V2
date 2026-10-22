# RELATÓRIO CI — Baseline × Final

> Gerado em 2026-10-22 02:30 UTC.
> Branch de trabalho: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)
> Esta sessão corrigiu uma regressão introduzida pela PR #2182 e documentou falhas pré-existentes.

---

## 1. Baseline — Estado da `main` antes desta sessão

**SHA de referência:** `61a973da` (merge da PR #2182 em 2026-10-22T02:01:37Z)

| Required check | Estado baseline | Causa |
|---|---|---|
| `🔍 Lint & TypeCheck` | ✅ success | — |
| `🧪 Unit Tests (1/3)` | ❌ **failure** | Mock `getBoundingClientRect` em `HTMLElement.prototype` bloqueia spies de `FilesTab.fase6` (regressão PR #2182) |
| `🧪 Unit Tests (2/3)` | ❌ **failure** | Mesma causa |
| `🧪 Unit Tests (3/3)` | ❌ **failure** | Mesma causa |
| `🏗️ Build` | ⏭️ skipped | Dependência de Unit Tests |
| `🔒 Security Audit` | ✅ success | — |
| `Contrato DB offline` | ❌ **failure** | `sanitize_reset_request()` referencia `NEW.reset_token` (coluna inexistente) — pré-existente |
| `🎭 E2E Tests (Playwright)` | ❌ **failure** | Geolocalização sem mock no CI — pré-existente |

**Resumo do baseline:** 2 required checks verdes, 3 shards Unit Tests vermelhos (regressão), Build skipped, Contrato DB offline vermelho (pré-existente), E2E vermelho (pré-existente).

---

## 2. Correções Aplicadas

### 2.1 Regressão Unit Tests — mock `getBoundingClientRect` em prototype errado

**Causa raiz identificada:** commit `a4dfd16` (PR #2182) instalou o mock em `HTMLElement.prototype`. No jsdom a cadeia é `HTMLDivElement → HTMLElement → Element`; um `vi.spyOn(Element.prototype, 'getBoundingClientRect')` em `FilesTab.fase6.test.tsx` nunca é atingido porque `HTMLElement.prototype` é encontrado antes — o spy devolve 800px em vez dos 959px/1474px esperados e o grid fica em 4 colunas em vez de 5/8.

**Erros exatos no CI (run [39708693088](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39708693088)):**
- `FilesTab.fase6.test.tsx:137` — `expected 'grid-cols-4' to contain 'grid-cols-5'`
- `FilesTab.fase6.test.tsx:152` — `expected 'grid-cols-4' to contain 'grid-cols-8'`

**Correção aplicada (commit [`1ce17b04`](https://github.com/adm01-debug/Zapp_Web_V2/commit/1ce17b04d47a4a2cee3a2cd1a063124dfd5d0495)):**

```diff
- Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
+ Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: function () {
      return { width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) };
    },
  });
```

Instalando em `Element.prototype`, o spy de `vi.spyOn(Element.prototype, 'getBoundingClientRect')` fica no mesmo nível e pode sobrescrever o valor — sem interferir com o fallback global (800×600) para testes que não instalam spy. Apenas 1 linha alterada em `src/test/setup.ts`.

### 2.2 OOM no hook husky pre-push — typecheck-ratchet

**Causa raiz:** `spawnSync` em `scripts/ci/typecheck-ratchet.mjs` executava `tsc -b --force` sem `--max-old-space-size`, causando OOM no pre-push (saiu com `exit null`, matado pelo kernel). Commit [`4604a5a`](https://github.com/adm01-debug/Zapp_Web_V2/commit/4604a5a) (PR #2182) adicionou `--max-old-space-size=4096`.

---

## 3. Estado Final — PR #2185

**Commits nesta PR:**
| Commit | Arquivo | Descrição |
|--------|---------|----------|
| `1ce17b04` | `src/test/setup.ts` | Fix: mock `getBoundingClientRect` em `Element.prototype` (não `HTMLElement.prototype`) |
| `d9104710` | `PENDENCIAS.md` | Docs: §8 RESOLVIDO, §9 inventário, §10 documentação da regressão |
| `e_atual` | `RELATORIO_CI.md` | Docs: este relatório |

### 3.1 Required checks — PR #2185 (run [39710295180](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39710295180))

| Required check | Baseline | Estado Atual | Δ |
|---|---|---|---|
| `🔍 Lint & TypeCheck` | ✅ success | ⏳ aguardando CI | — |
| `🧪 Unit Tests (1/3)` | ❌ failure | ⏳ aguardando CI | ↑ esperado success |
| `🧪 Unit Tests (2/3)` | ❌ failure | ⏳ aguardando CI | ↑ esperado success |
| `🧪 Unit Tests (3/3)` | ❌ failure | ⏳ aguardando CI | ↑ esperado success |
| `🏗️ Build` | ⏭️ skipped | ⏳ aguardando CI | ↑ esperado success |
| `🔒 Security Audit` | ✅ success | ⏳ aguardando CI | — |
| `Contrato DB offline` | ❌ failure (pré-existente) | ❌ failure (pré-existente) | = pendente §4 |
| `🎭 E2E Tests (Playwright)` | ❌ failure (pré-existente) | ❌ failure (pré-existente) | = pendente §1 |

> **Nota:** CI em progresso no momento da geração deste documento. Tabela será atualizada após conclusão.

---

## 4. Falhas Pré-existentes Não Resolvidas (dependem do Joaquim)

### 4.1 `Contrato DB offline` — `sanitize_reset_request()` (PENDENCIAS.md §4)

**Passo que falha:** Passo 41 — "Simular fronteira RLS das RPCs do Dashboard (DASH-091/092)"

**Erro:**
```
ERROR:  record "new" has no field "reset_token"
CONTEXT:  PL/pgSQL function sanitize_reset_request() line 4 at assignment
```

**Por que agente não corrigiu:** A correção requer:
1. Diagnóstico do schema atual de `password_reset_requests` em produção
2. Decisão de negócio: adicionar a coluna ou remover a referência na função
3. Migration versionada + PR + merge + apply em produção (fluxo completo da Seção 0/1 do CLAUDE.md)

Confirmado em 5+ runs históricas antes desta sessão — não é regressão desta PR.

### 4.2 `🎭 E2E Tests (Playwright)` — geolocalização (PENDENCIAS.md §1)

**Specs que falham:**
- `location-picker.spec.ts` linhas 81, 148
- `contact-address.spec.ts` linha 184
- `contact-map-pin.spec.ts` linha 79

**Por que agente não corrigiu:** Falha de infraestrutura — `navigator.geolocation` sem mock no CI. Não é código da aplicação. Correção requer decisão do Joaquim sobre mock de geolocalização no contexto do Playwright.

---

## 5. Correções da Sessão Anterior (PR #2182 — mergeada)

Para completênza, as 4 correções aplicadas na PR #2182 (já na `main`):

| Arquivo | Descrição | Run de validação |
|---------|-----------|------------------|
| `scripts/ci/typecheck-ratchet.mjs` | `--max-old-space-size=4096` para evitar OOM no pre-push | [39690218238](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39690218238) |
| `src/types/types.ts` | Restauração do arquivo correto (13045 linhas) com view `team_message_read_state` | — |
| `.github/workflows/eslint.yml` | Remoção do arquivo que quebrava `Node CI Scripts` | — |
| `src/test/setup.ts` | Mock `getBoundingClientRect` (ver §2.1 — regressão corrigida nesta PR) | — |

---

## 6. Gaps / Melhorias Identificadas (não implementadas — baixo risco)

| Gap | Risco | Ação sugerida |
|-----|-------|---------------|
| `ChatMessagesArea` flaky (`data-testid="bubble"` não encontrado) | Baixo (pré-existente) | Investigar dependência de timing do virtualizador; considerar `waitForElement` com timeout maior |
| `Mutação do mapa` baseline inválido | Baixo (não bloqueante) | Corrigir suíte base do módulo `mapa` |
| Copilot reviewer quota esgotada | Baixo (não required) | Recarregar créditos Copilot |

---

*Relatório gerado automaticamente em 2026-10-22 02:30 UTC.*
*Atualizar a tabela §3.1 após conclusão do CI do run [39710295180](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39710295180).*
