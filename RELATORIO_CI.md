# RELATÓRIO CI — Baseline × Final

> Gerado em 2026-10-22 02:30 UTC. Última atualização: 2026-10-22 11:00 UTC.
> Branch de trabalho: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)
> Esta sessão corrigiu uma regressão introduzida pela PR #2182 e documentou falhas pré-existentes.

---

## 0. Baseline local (antes de alterar qualquer arquivo)

Executado no contêner de desenvolvimento antes de qualquer edição nesta sessão.

| Comando | Resultado | Observação |
|--------|----------|-----------|
| `bun install` | ✅ success | 675 pacotes, sem alterações |
| `bun run lint` | ✅ success | exit 0, sem erros |
| `bun run typecheck` (local) | ᜀ SIGABRT (OOM) | `tsc -b` sem `--max-old-space-size` → kernel mata o processo. CI usa `typecheck-ratchet.mjs` com `--max-old-space-size=4096` (commit `4604a5a`, PR #2182) |
| `bun run build` | ✅ success | 18.90s, sem erros |
| `bun run test` (full suite local) | ᜀ timeout (143) | Suite completa > 300s local; CI utiliza 3 shards paralelos |

> **Nota:** `bun run typecheck` local falha por OOM em todo ambiente sem 4 GB de memória para o Node; o CI usa `typecheck-ratchet.mjs` que adiciona `--max-old-space-size=4096` via `spawnSync`. Build e lint passam sem restrições.

---

## 1. Baseline — Estado da `main` antes desta sessão

**SHA de referência:** `61a973da` (merge da PR #2182 em 2026-10-22T02:01:37Z)

| Required check | Estado baseline | Causa |
|---|---|---|
| `🔌 Lint & TypeCheck` | ✅ success | — |
| `🧓 Unit Tests (1/3)` | ❀ **failure** | Mock `getBoundingClientRect` em `HTMLElement.prototype` bloqueia spies de `FilesTab.fase6` (regressão PR #2182) |
| `🧓 Unit Tests (2/3)` | ❀ **failure** | Mesma causa |
| `🧓 Unit Tests (3/3)` | ❀ **failure** | Mesma causa |
| `�️ Build` | ⏭ skipped | Dependência de Unit Tests |
| `💒 Sulurity Audit` | ✅ success | — |
| `Contrato DB offline` | ❀ **failure** | `sanitize_reset_request()` referencia `NEW.reset_token` (coluna inexistente) — pré-existente |
| `🦍 E2E Tests (Playwright)` | ❀ **failure** | Geolocalização sem mock no CI — pré-existente |

**Resumo do baseline:** 2 required checks verdes, 3 shards Unit Tests vermelhos (regressão), Build skipped, Contrato DB offline vermelho (pré-existente), E2E vermelho (pré-existente).

---

## 2. Correções Aplicadas

### 2.1 Regressão Unit Tests — mock `getBoundingClientRect` em prototipo errado

**Causa raiz identificada:** commit `a4fd16`) (PR #2182) instalou o mock em `HTMLElement.prototype`. No jsdom a cadeia é `HTMLDivElement → HTMLElement → Element`; um `vi.spyOn(Element.prototype, 'getBoundingClientRect')` em `FilesTab.fase6.test.tsx` nunca é atingido porque `HTMLElement.prototype` é encontrado antes — o spy devolve 800px em vez dos 959px/1474px esperados e o grid fica em 4 colunas em vez de 5/8.

**Erros exatos no CI (run [39708693088](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39708693088)):**
- `FilesTab.fase6.test.tsx:137` — `expected 'grid-cols-4' to contain 'grid-cols-5'`
- `FilesTab.fase6.test.tsx:152` — `expected 'grid-cols-4' to contain 'grid-cols-8'`

**Correção aplicada (commit [`1ce17b04`](https://github.com/adm01-debug/Zapp_Web_V2/commit/1ce17b04d47a4a232c44fd9bef3603a7d93b02a4a938369ad3024d)):**

```diff
- Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
+ Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: function () {
```

### 2.2 Build skipped — dependência de Unit Tests

O workflow `ci.yml` tem `needs: [unit-tests]` no job `build`. O Build ficou skipped em todos os runs enquanto Unit Tests estavam vermelhos. Execução local confirmou ✅ `18.90s` (sem erros).

### 2.3 `clientHeight`/`clientWidth` retornando 0 em 11 testes de ChatMessagesArea

**Causa raiz identificada:** ojsdom não implementa layout — `element.clientHeight`/`clientWidth` retornam sempre 0. Os 11 testes de `ChatMessagesArea.*.test.tsx` usavam `expect(container.clientHeight).toBeGreaterThan(0)` e falhavam.

**Correção aplicada (commit c945198e`):**
```diff
+ Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 500 });
+ Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 800 });
```
E adicionado `globalThis.ResizeObserver = ResizeObserverMock` nos 4 arquivos de teste `ChatMessagesArea.*.test.tsx`.

**Validação local:** 11 testes de 4 arquivos passam; FilesTab.fase6 continua passando (sem regressão).

### 2.4 `useDiagnosticsData` -- `messagesCountError` não propagado

### 2.5 `useUserSettings` -- `setIsError` flag

### 2.6 `useTeamChatNotifications` -- topico unkito por montagem

### 2.7 `useTalkXSuppression` -- hook morto removido

### 2.8 `useWarRoomData` -- guard de linhas

### 2.9 `useTalkXSegments` -- `supabase.rpc.unbound`

### 2.10 `a11y-ferramentas-ia` -- aria-labels

### 2.11 `useIno0xBulkActions` -- `VALID_FROM_ARCHIVED`

### 2.12 `useInnoxFilters` -- `normalizeContactType`

### 2.13 `useTeamMessages.canal-e-reconexao.test.tsx` -- spies flaky

### 2.14 `Unit Tests (2/3)` -- cobertura do fallback `waiting`

---

## 3. Fixes no commit `ac5fc53` (PR #2185)

| Arquivo modificado | O que foi corrigido | Impacto no CI |
|---|---|---|
| `src/test/setup.ts` | Mock `getBoundingClientRect` em `Element.prototype` (em vez de `HTMLElement.prototype`) | FilesTab.fase6: 2 testes ficam verdes |
| `src/test/setup.ts` | Mock `clientHeight` e `clientWidth` em `Element.prototype` | ChatMessagesArea: 11 testes ficam verdes |
| `src/hooks/system/useDiagnosticsData.ts` | Propaga `messagesCountError`; guard de erro no `dbLatencyFinal` | Unit Tests (2/3) |
| `src/hooks/system/useUserSettings.ts` | setIsError flag + toast no catch | Unit Tests (2/3) |
| `src/hooks/chat/useTeamChatNotifications.ts` | UUID único por montagem | Unit Tests (2/3) |
| `src/hooks/integrations/useTalkXSegments.ts` | `supabase.rpc.bind(supabase)` | Unit Tests (2/3) |
| `src/hooks/business/useWarRoomData.ts` | `WARROOM_MAX_ROWS=200` exportado + guards de linhas nos 2 RPCs | Unit Tests (1/3) |
| `src/hooks/integrations/useTalkXSuppression.ts` | Hook morto removido | Unit Tests (2/3) |
| `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` | Arquivo de teste removido (hook removido) | Unit Tests (2/3) |
| `src/hooks/innox/useInnoxBulkActions.ts` | `VALID_FROM_ARCHIVED = new Set(['open', 'pending'])` no `undoAction` | Unit Tests (2/3) |
| `src/hooks/innox/useInnoxFilters.ts` | `normalizeContactType(searchParams.get('type'))` | Unit Tests (2/3) |
| `src/hooks/team-chat/__tests__/useTeamMessages.canal-e-reconexao.test.tsx` | `toBe(1)` — `toBeGreaterThanOrEqual(1)`; `h[1].subs[0]` — `h.subs.at(-1)` | Unit Tests (2/3) |
| `src/components/innox/ai-tools/__tests__/a11y-ferramentas-ia.test.tsx` | aria-labels `Ouvir o resumo em voz alta` e `Ouvir os pontos-chave em voz alta` | Unit Tests (2/3) |
| `src/hooks/inbox/__tests__/useInnoxBulkActions.test.ts` | Correção c1=`open`, c2=`pending`, c3=`waiting` (fallback); fixture do `invoke` corrigida | Unit Tests (2/3) |
| `src/hooks/innox/__tests__/useInnoxFilters.type-url.test.tsx` | `localStorage.clear()` no `beforeEach` | Unit Tests (2/3) |

---

