# Dossiê — claude__fix-unit-tests-inbox-261023-1108 (PR #2417)

**Branch:** `origin/claude/fix-unit-tests-inbox-261023-1108` · tip `1a77ca48` · merge_base `1252bb5a` (2026-11-01)
**PR #2417:** "fix(tests): mocks clientHeight/clientWidth e spy HTMLElement para @tanstack/virtual-core >=3.19" — CLOSED 2026-11-01 (congelamento de features #2545), não mergeada.
**Veredito: OBSOLETA** · confiança alta · `apagar_branch_seguro = true`

## Propósito
Infra de testes unitários: `@tanstack/virtual-core` 3.19 (lockfile da main: `@tanstack/virtual-core@3.19.11`, `bun.lock:535`) mede o contêiner por `clientHeight/clientWidth`, que no jsdom valem 0 → nenhuma bolha do `ChatMessagesArea` renderizava nos testes. A branch fez dois fixes:
1. `src/test/setup.ts`: shim GLOBAL `HTMLElement.prototype.clientHeight=600 / clientWidth=800` (+3 linhas) — commit `aa71b361c`.
2. `FilesTab.fase6.test.tsx`: spy de `getBoundingClientRect` em `HTMLElement.prototype` em vez de `Element.prototype` — commit `6bf1465f4`.

## Arquivo × achado × evidência
| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx` | IDENTICAL_TO_MAIN (fora da lista de lacunas) | **Já na main** | `origin/main:...FilesTab.fase6.test.tsx:103` = `vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')` — idêntico ao `+` do commit `6bf1465f4` |
| `src/test/setup.ts` | ABSENT_APPLIES_CLEAN (3 linhas) | **Superado**: a main NÃO usa shim global; cada teste de virtualização define o próprio shim de `clientHeight`, e a suíte está verde | ver abaixo |

### Prova de que a necessidade está coberta na main por outra abordagem
- Shim por arquivo (`Object.defineProperty(Element.prototype, 'clientHeight', { get: () => 600, configurable: true })`) em TODOS os testes do `ChatMessagesArea` na main:
  - `src/components/inbox/chat/__tests__/ChatMessagesArea.agrupar-envio.test.tsx:55` (desde `e51662a9c`, 2026-10-24)
  - `src/components/inbox/chat/__tests__/ChatMessagesArea.loop.test.tsx:55` (idem)
  - `src/components/inbox/chat/__tests__/ChatMessagesArea.movimento-reduzido.test.tsx:73` (idem)
  - `src/components/inbox/chat/__tests__/ChatMessagesArea.pagination.test.tsx:60` (`3617a2acd`, 2026-11-01)
  - `src/components/inbox/chat/__tests__/ChatMessagesArea.scroll-programatico.test.tsx:47` (`f332a2979`, 2026-11-10)
- Outros testes com virtualizador fazem o mesmo, de forma seletiva e com restauração do descriptor: `src/pages/__tests__/ChatPopup.pagination.test.tsx:41-55` e `ChatPopup.messageBalloon.test.tsx:260-274` (devolvem 600 só para `role="log"`, 0 para o resto — um shim global de 600 em `HTMLElement.prototype` conflitaria com essa intenção), `src/components/catalog/__tests__/ExternalProductCatalog.virtualizacao.test.tsx:61`, `src/components/tasks/__tests__/quadroArrastarTecladoRolagem.test.tsx:363`.
- `setup.ts` na main (`origin/main:src/test/setup.ts:131-143`) só mocka `getBoundingClientRect`; `git log -S'clientHeight' origin/main -- src/test/setup.ts` = vazio (o shim global nunca entrou e nunca foi removido — simplesmente não foi adotado).
- CI da main em `dac285f62` (HEAD atual): `🧪 Unit Tests (1/3) (2/3) (3/3)` = SUCCESS (statusCheckRollup via GraphQL, 2026-11-15). Os 12 testes que a branch dizia falhar passam na main sem o shim global.
- NÃO VERIFICADO localmente: `vitest` não roda neste clone (sem `node_modules`; `npx` falha com EOVERRIDE postcss) — a prova de execução é o CI da main.

## Lacunas a recuperar
Nenhuma. O hunk de `src/test/setup.ts` (abaixo, só para registro) não deve ser portado: duplicaria os shims por arquivo e alteraria o comportamento dos testes `ChatPopup.*` que dependem de `clientHeight = 0` fora do `role="log"`.
```diff
@@ -144,6 +144,9 @@ Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
+// @tanstack/virtual-core >=3.19 mede o contêiner por clientWidth/clientHeight (jsdom: 0).
+Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 600; } });
+Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 800; } });
```

## Decisão
OBSOLETA — abordagem (shim global) superada pelos shims por arquivo já na main; o segundo fix da PR já está na main byte a byte. Triagem anterior (2026-11-08) também marcou OBSOLETA; aqui confirmado com evidência. Branch pode ser apagada.

## Verificação adversarial

**Parecer: CONCORDO com OBSOLETA** · `apagar_branch_seguro = true` · verificado em 2026-11-15 contra `origin/main` = `dac285f62`.

Tentei refutar procurando qualquer hunk útil fora da main. Não há.

1. **Delta total da branch = 3 linhas.** `git diff --stat 1252bb5a origin/claude/fix-unit-tests-inbox-261023-1108` → `src/test/setup.ts | 3 +++` (só isso). Os commits `6bf1465f4` (FilesTab) e `aa71b361c` (setup) estão na branch, mas o conteúdo do primeiro já estava no merge-base: o diff MB..REF não lista `FilesTab.fase6.test.tsx`. Confirmado na main: `origin/main:src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx:103` = `vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')`.

2. **A necessidade está coberta na main por outra abordagem — conferida arquivo por arquivo**, não aceita da triagem:
   - `origin/main:src/components/inbox/chat/__tests__/ChatMessagesArea.agrupar-envio.test.tsx:55`, `.loop.test.tsx:55`, `.movimento-reduzido.test.tsx:73`, `.pagination.test.tsx:60`, `.scroll-programatico.test.tsx:47` — todos com `Object.defineProperty(Element.prototype, 'clientHeight', { get: () => 600, configurable: true })`.
   - `origin/main:src/components/catalog/__tests__/ExternalProductCatalog.virtualizacao.test.tsx:61` e `src/components/tasks/__tests__/quadroArrastarTecladoRolagem.test.tsx:363` — mesmo padrão para os outros virtualizadores.
   - `origin/main:src/test/setup.ts:131-146` só mocka `getBoundingClientRect`; `git grep` não acha `clientHeight`/`clientWidth` nesse arquivo na main.

3. **Não foi removido de propósito nem perdido:** `git log -S"clientHeight" --oneline origin/main -- src/test/setup.ts` = **vazio**. O shim global nunca entrou na main e nunca foi revertido — foi uma abordagem alternativa não adotada.

4. **Portar o hunk seria regressão, não ganho.** `origin/main:src/pages/__tests__/ChatPopup.pagination.test.tsx:33-49` sobrescreve `HTMLElement.prototype.clientHeight` — **exatamente o mesmo alvo** do hunk da branch — devolvendo `600` só para `role="log"` e **`0` para todo o resto**, com restauração do descriptor em `mockRestore()` (linhas 54-55). Com o shim global presente, o `mockRestore` devolveria `600` global em vez do `0` do jsdom. Idem `ChatPopup.messageBalloon.test.tsx:260-274`.

5. **Prova de execução (independente):** `statusCheckRollup` de `dac285f62` via GraphQL em 2026-11-15 = `SUCCESS`, com `🧪 Unit Tests (1/3)`, `(2/3)`, `(3/3)` todos `SUCCESS` e `✅ CI Gate` `SUCCESS`. Os testes que a PR #2417 dizia estarem vermelhos passam na main sem o shim global. Nenhum `it.skip`/`describe.skip` nos testes de `ChatMessagesArea`, `ChatPopup*` ou `FilesTab*` da main (grep vazio) — ou seja, não estão verdes por estarem desligados.

6. **PR #2417:** `state=CLOSED`, `merged=false`, `closedAt=2026-11-01T23:48:29Z` (GraphQL).

**Lacunas adicionais: nenhuma.** Nada de valor ≥ médio fora da main. Branch pode ser apagada.
