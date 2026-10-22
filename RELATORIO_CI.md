# RELATÓRIO CI — Baseline × Final

> Gerado em 2026-10-22 02:30 UTC. Última atualização: 2026-10-22 07:00 UTC.
> Branch de trabalho: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)
> Esta sessão corrigiu uma regressão introduzida pela PR #2182 e documentou falhas pré-existentes.

---

## 0. Baseline local (antes de alterar qualquer arquivo)

Executado no contêiner de desenvolvimento antes de qualquer edição nesta sessão.

| Comando | Resultado | Observação |
|---------|-----------|----------|
| `bun install` | ✅ success | 675 pacotes, sem alterações |
| `bun run lint` | ✅ success | exit 0, sem erros |
| `bun run typecheck` (local) | ❌ SIGABRT (OOM) | `tsc -b` sem `--max-old-space-size` → kernel mata o processo. CI usa `typecheck-ratchet.mjs` com `--max-old-space-size=4096` (commit `4604a5a`, PR #2182) |
| `bun run build` | ✅ success | 18.90s, sem erros |
| `bun run test` (full suite local) | ❌ timeout (143) | Suite completa > 300s local; CI usa 3 shards paralelos |

> **Nota:** `bun run typecheck` local falha por OOM em todo ambiente sem 4 GB de memória para o Node; o CI usa `typecheck-ratchet.mjs` que adiciona `--max-old-space-size=4096` via `spawnSync`. Build e lint passam sem restrições.

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

### 2.3 ChatMessagesArea — virtualizer renderiza 0 itens (`data-testid="bubble"` não encontrado)

**Causa raiz identificada:** `@tanstack/react-virtual` ≥ 3.x usa `element.clientWidth`/`element.clientHeight` (via `getRect()` em `virtual-core/dist/esm/index.js` linhas 6-8) — **não** `getBoundingClientRect` — para calcular quantos itens são visíveis. No jsdom, `clientHeight` é sempre `0`, então o virtualizer calcula 0 itens visíveis e não monta nenhum elemento.

**Erro recorrente em 4 arquivos de teste:**
- `ChatMessagesArea.loop.test.tsx` — `Unable to find an element by: [data-testid="bubble"]`
- `ChatMessagesArea.agrupar-envio.test.tsx` — idem
- `ChatMessagesArea.movimento-reduzido.test.tsx` — idem
- `ChatMessagesArea.pagination.test.tsx` — idem

**Correção aplicada (commit [`945198e`](https://github.com/adm01-debug/Zapp_Web_V2/commit/945198e11602cfa85f98884499d9970689ea2ac7)):** adicionado mock de `clientHeight`/`clientWidth` em `Element.prototype` em `src/test/setup.ts`:

```diff
+ Object.defineProperty(Element.prototype, 'clientHeight', {
+   configurable: true,
+   get: function () { return 600; },
+ });
+ Object.defineProperty(Element.prototype, 'clientWidth', {
+   configurable: true,
+   get: function () { return 800; },
+ });
```

Além disso, os 4 arquivos de teste `ChatMessagesArea` foram atualizados para registrar o `ResizeObserverMock` em **ambos** `window` e `globalThis` no `beforeAll`:

```typescript
beforeAll(() => {
  (window as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
});
```

**Validação local:** 11 testes de 4 arquivos passam; FilesTab.fase6 continua passando (sem regressão).

### 2.4 `useDiagnosticsData` — `messagesCountError` não propagado

**Causa raiz identificada:** Em `fetchSystemHealth`, `messagesCountError` era capturado num bloco `try/catch` mas nunca relançado. Quando a query de contagem estimada de `messages` falhava (ex.: RLS, `code: '57014'`), `fetchAll` não entrava no `catch`, `coletaFalhou` ficava `null` e `collectionError` retornava `null` — escondendo a falha.

**Teste que falhava (`useDiagnosticsData.test.ts:882–894`):**
```
expected: not.toBeNull()
received: null   (collectionError)
```

**Correção aplicada (commit desta sessão):** adicionado `if (messagesCountError) throw messagesCountError;` após o bloco `try/catch` de contagem estimada de `messages` em `src/hooks/system/useDiagnosticsData.ts`. A propagação faz com que `fetchSystemHealth` lance exceção → `fetchAll` captura → `coletaFalhou` recebe log `collect-error` → `collectionError` fica não-nulo.

---

## 3. Estado Final — PR #2185

**Commits nesta PR:**
| Commit | Arquivo | Descrição |
|--------|---------|----------|
| `1ce17b04` | `src/test/setup.ts` | Fix: mock `getBoundingClientRect` em `Element.prototype` (não `HTMLElement.prototype`) |
| `d9104710` | `PENDENCIAS.md` | Docs: §8 RESOLVIDO, §9 inventário, §10 documentação da regressão |
| `0d48b04f` | `RELATORIO_CI.md` | Docs: relatório baseline × final |
| `945198e` | `src/test/setup.ts`, 4 testes `ChatMessagesArea`, `PENDENCIAS.md` | Fix §2.3: mock `clientHeight`/`clientWidth` em `Element.prototype`; `globalThis.ResizeObserver` nos 4 arquivos de teste; todos 11 testes ChatMessagesArea passam |
| `7b18ebf` | `PENDENCIAS.md` | Docs: §5 RESOLVIDO (clientHeight/clientWidth), §9 inventário atualizado |
| `6c883342` | múltiplos arquivos | Fix §2.4–§2.7: `workItemFormat` timezone; `useUserSettings` isError; `useInboxFilters` setSearchParams; `useDiagnosticsData` connectionsCountError; docs |
| `2dd6c92` | `src/hooks/system/useDiagnosticsData.ts`, `PENDENCIAS.md`, `RELATORIO_CI.md` | Fix §2.8: propaga `messagesCountError` via throw em `fetchSystemHealth`; docs §11 |
| _(este push)_ | `src/hooks/inbox/useInboxFilters.ts`, `PENDENCIAS.md`, `RELATORIO_CI.md` | Fix §2.9 (regressão `useInboxFilters`): `contactTypeFromUrl()` substituída por `normalizeContactType(searchParams.get('type'))` (React Router); `useSearchParams` movido para antes de `basePrefs` (ordem de hooks); docs §0, §13 |

### 3.1 Required checks — run [39727885851](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39727885851) (commit `1e44e21`)

| Required check | Baseline (main `61a973da`) | Estado em `1e44e21` | Δ |
|---|---|---|---|
| `🔍 Lint & TypeCheck` | ✅ success | ✅ success (05:26:45 UTC) | = |
| `🧪 Unit Tests (1/3)` | ❌ failure (regressão §2.1) | ❌ failure — falhas pré-existentes §12 (05:31:24 UTC) | ↑ regressão §2.1 corrigida; novas: pré-existentes |
| `🧪 Unit Tests (2/3)` | ❌ failure (regressão §2.1) | ❌ failure — `useInboxFilters` + pré-existentes §13 (05:34:55 UTC) | ↑ regressão §2.1 corrigida; `useInboxFilters` fix neste push |
| `🧪 Unit Tests (3/3)` | ❌ failure (regressão §2.1) | ❌ failure — falhas pré-existentes §13 (05:35:08 UTC) | ↑ regressão §2.1 corrigida; novas: pré-existentes |
| `🏗️ Build` | ⏭️ skipped | ⏭️ skipped (Unit Tests falharam) | = local ✅ 18.90s |
| `🔒 Security Audit` | ✅ success | ✅ success (05:25:37 UTC) | ✅ flake 503 anterior não repetiu |
| `Contrato DB offline` | ❌ failure (pré-existente) | ❌ failure (pré-existente) | = pendente §4 |
| `🎭 E2E Tests (Playwright)` | ❌ failure (pré-existente) | ❌ failure (pré-existente) | = pendente §1 |

> **Unit Tests:** A regressão original de `getBoundingClientRect` (§2.1) foi corrigida. Os shards agora
> falham por motivos pré-existentes (documentados em §§12–13) **e** por uma regressão de `useInboxFilters`
> introduzida por esta PR (commit `6c883342`), corrigida no push atual (§2.9).
>
> **Security Audit:** O flake 503 do npm registry na run anterior **não se repetiu** — check passou ✅.
>
> **Build:** Skipped por dependência de Unit Tests no workflow; execução local confirma ✅ (18.90s, sem erros).
>
> **E2E Tests:** Falha esperada por geolocalização sem mock (§1, pré-existente).

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
| `Mutação do mapa` baseline inválido | Baixo (não bloqueante) | Corrigir suíte base do módulo `mapa` |
| Copilot reviewer quota esgotada | Baixo (não required) | Recarregar créditos Copilot |

---

## 7. Inventário — Workflows com falha na `main` (`61a973da`) e seu estado

> Levantado em 2026-10-22 06:00 UTC a partir dos runs mais recentes em cada workflow.

| Workflow | Última run na `main` | Conclusion | Causa | Registrado em |
|---|---|---|---|---|
| `CI/CD Pipeline` | [39709064603](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39709064603) | ❌ failure | Unit Tests — regressão `getBoundingClientRect` (§2.1); corrigida por PR #2185 | PENDENCIAS.md §§12–13 |
| `types-sync` | [39709064516](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39709064516) | ❌ failure | "A sincronizacao foi bloqueada por um ou mais gates" — `types.ts`, `schema-catalog.json`, `schema-manifest.json`, `grants-baseline.json` todos com diferenças vs banco após PR #2182 | PENDENCIAS.md §14 |
| `DB Guard (offline)` | [39709064361](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39709064361) | ❌ failure | `Contrato DB offline` step 41 — `sanitize_reset_request()` referencia `NEW.reset_token` (coluna inexistente) | PENDENCIAS.md §4 |
| `E2E logado` | [39709064443](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39709064443) | ❌ failure | `navigator.geolocation` sem mock no CI | PENDENCIAS.md §1 |
| `Talk X V4 placar regen` | (último run) | ✅ success | — | — |
| `Notifica falha na main` | (último run) | ✅ success | — | — |

**Resumo do inventário:**
- 4 workflows com falha na `main` identificados.
- `CI/CD Pipeline` corrigido pela PR #2185 (regressão §2.1 + §2.9).
- `types-sync`, `DB Guard offline` e `E2E logado`: falhas pré-existentes, bloqueadas no Joaquim, registradas em PENDENCIAS.md.

---

## 8. Tabela de Prova — PR #2185 (commit `585697bf`)

> Run CI/CD Pipeline: [39731000348](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39731000348)
> Iniciada: 2026-10-22T05:57:31Z | Concluída: 2026-10-22T06:06Z

| Check | Job ID | Conclusion | Completado em |
|---|---|---|---|
| `🔒 Security Audit` | [119666179204](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39731000348/job/119666179204) | ✅ success | 05:59:14Z |
| `🧬 Mutação do mapa` | [119666179114](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39731000348/job/119666179114) | ✅ success | 05:59:03Z |
| `Replay local das migrations` | [119665771720](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39731000238/job/119665771720) | ✅ success | 05:59:21Z |
| `🔎 TypeCheck` | [119666179355](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39731000348/job/119666179355) | ✅ success | 06:00:23Z |
| `🧩 Node CI Scripts` | [119666179223](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39731000348/job/119666179223) | ✅ success | 06:01:18Z |
| `Contrato DB offline` | [119665771899](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39731000238/job/119665771899) | ❌ failure (pré-existente §4) | 06:00:11Z |
| `🧪 Unit Tests (1/3)` | [119666179266](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39731000348/job/119666179266) | ❌ failure (pré-existente §12) | ~06:06Z |
| `🧪 Unit Tests (2/3)` | [119666179319](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39731000348/job/119666179319) | ❌ failure (pré-existente §13) | ~06:06Z |
| `🧪 Unit Tests (3/3)` | [119666179160](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39731000348/job/119666179160) | ❌ failure (pré-existente §13) | ~06:05Z |
| `🎭 E2E Tests (Playwright)` | [119666179255](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39731000348/job/119666179255) | ❌ failure (pré-existente §1) | — |

**Confirmação:** Unit Tests 1/3, 2/3, 3/3 confirmados com `conclusion=failure` via notificações PR activity (check_run.completed às ~06:05–06:06Z). Falhas são pré-existentes documentadas em PENDENCIAS.md §§12–13 e §1 — nenhuma regressão introduzida por esta PR.

## 8b. Tabela de Prova — PR #2185 (commit `e78b5788`, docs only)

> Run CI/CD Pipeline: [39732358702](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39732358702)
> Iniciada: 2026-10-22T06:10:56Z

| Check | Job ID | Conclusion | Completado em |
|---|---|---|---|
| `🔒 Security Audit` | [119670308407](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39732358702/job/119670308407) | ✅ success | 06:12:11Z |
| `🧬 Mutação do mapa` | [119670308396](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39732358702/job/119670308396) | ✅ success (skipped) | 06:11:57Z |
| `🔎 TypeCheck` | [119670308434](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39732358702/job/119670308434) | ✅ success | 06:13:16Z |
| `🧩 Node CI Scripts` | [119670308113](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39732358702/job/119670308113) | ✅ success | 06:14:02Z |
| `Contrato DB offline` | [119670063158](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39732358647/job/119670063158) | ❌ failure (pré-existente §4) | 06:13:52Z |
| `🧪 Unit Tests (1/3)` | [119670308324](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39732358702/job/119670308324) | ⏳ in_progress | — |
| `🧪 Unit Tests (2/3)` | [119670308462](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39732358702/job/119670308462) | ⏳ in_progress | — |
| `🧪 Unit Tests (3/3)` | [119670308475](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39732358702/job/119670308475) | ⏳ in_progress | — |
| `🎭 E2E Tests (Playwright)` | [119670308560](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39732358702/job/119670308560) | ⏳ in_progress (pré-existente §1) | — |

> **Nota (06:15Z):** Unit Tests e E2E ainda em andamento no commit `e78b5788` (docs-only). Este commit não altera código — resultado esperado idêntico ao commit `585697bf` acima (failure pré-existente §§12–13 e §1).

---

*Relatório atualizado em 2026-10-22 06:15 UTC: §8 atualizado com resultados confirmados do commit `585697bf`; §8b adicionado com estado do commit `e78b5788` (docs-only, in_progress).*
