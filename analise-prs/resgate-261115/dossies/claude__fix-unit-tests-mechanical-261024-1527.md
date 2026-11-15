# Dossiê — claude__fix-unit-tests-mechanical-261024-1527 (PR #2228)

**Branch:** `origin/claude/fix-unit-tests-mechanical-261024-1527` · tip `af3fa1db7` · merge-base `b1fe88215` (2026-10-24) · 1 commit
**PR #2228:** "fix(tests): corrige falha mecânica de mock em useAdminDataCreateUser.test.ts" — fechada sem merge em 2026-11-01 (REST `pulls/2228`: `merged:false`).
**Triagem 2804:** OBSOLETA.

## Propósito
Corrigir `src/components/admin/__tests__/useAdminDataCreateUser.test.ts`, que mockava `@/lib/supabaseHelpers` enquanto o hook `useAdminData.ts` importa `invokeEdge`/`readEdgeError` de `@/lib/invokeEdge` e `supabase` de `@/integrations/supabase/client` → mock no caminho errado, `invokeEdge` real em ação, todos os cenários caíam no `catch`. A branch:
1. troca os `vi.mock` para `@/lib/invokeEdge` (mockando `invokeEdge` **e** `readEdgeError`) e `@/integrations/supabase/client` (com `SUPABASE_URL`);
2. passa a verificar o corpo em `options.body` (contrato `invokeEdge(fn, { body })`);
3. troca `httpError()` para um objeto sintético (`_parsedMessage`/`_parsedStatus`) lido por um `mockReadEdgeError`.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/admin/__tests__/useAdminDataCreateUser.test.ts` | **Intenção já na main, com abordagem melhor.** Commit `e1f2ee4dd` (2026-10-27, "fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)") tocou o arquivo (47 linhas) e: (a) `vi.mock('@/lib/invokeEdge', importOriginal → {...actual, invokeEdge: mockInvokeEdge})` — `origin/main:…test.ts:25-28`; (b) `vi.mock('@/integrations/supabase/client', …SUPABASE_URL: 'https://local.test', supabase:{auth.refreshSession, from, storage}})` — `:30-48`; (c) corpo lido de `options.body` — `:104-107`; (d) comentário do cabeçalho corrigido para `src/lib/invokeEdge` — `:5`. | `git show origin/main:src/components/admin/__tests__/useAdminDataCreateUser.test.ts`; `git log -S"vi.mock('@/integrations/supabase/client'" origin/main -- <arquivo>` → `e1f2ee4dd` |
| idem — hunks que a main **não** tem (`mockReadEdgeError`, `httpError` sintético com `_parsedMessage`, `mockInvokeEdge.mockResolvedValue({data,error})`) | **OBSOLETOS por desenho.** A main mantém `readEdgeError`/`parseEdgeError` REAL via `importOriginal` e `httpError()` com `Response` cru (`:66-75`), que é o formato que `parseEdgeError` consome (`origin/main:src/lib/invokeEdge.ts:188`). Isso testa a leitura real do erro (inclusive o caso HTML/502, `:196-208`), coisa que o mock da branch deixaria de cobrir. O valor de retorno `{data, error}` é irrelevante: o hook só faz `await invokeEdge(...)` e depende do `throw` (`origin/main:src/components/admin/useAdminData.ts:496-503`). A main também já removeu `special_agent` do enum esperado (`:148`, commit `1f77f7917`), enquanto a branch ainda o traz. | `git show origin/main:src/components/admin/useAdminData.ts | sed -n 485-515p`; `git show origin/main:src/lib/invokeEdge.ts | grep -n parseEdgeError` |

## Veredito
**OBSOLETA** (confiança alta). A causa raiz que a branch corrigia (mock no módulo errado + corpo em `options.body`) está corrigida na main desde `e1f2ee4dd`; as diferenças remanescentes são escolhas de implementação do teste superadas pela versão da main (parser real em vez de mock, enum já sem `special_agent`). Nada a portar.

**NÃO VERIFICADO:** execução local do teste (sem `node_modules` neste clone; `npx vitest` falha com `EOVERRIDE`). Evidência indireta: commit `e1f2ee4dd` declara CI Gate 136 → 0 vermelhos e workflows em `main@dac285f62` (2026-11-15) estão `success`/`skipped` ("Notifica falha na main" skipped = sem falha).

## Lacunas a recuperar
Nenhuma.

**apagar_branch_seguro:** true.

## Verificação adversarial

**Parecer: CONCORDA com OBSOLETA.** Tentei refutar hunk por hunk e não achei lacuna de valor ≥ médio.

Diff completo da branch (`git diff b1fe88215 origin/claude/fix-unit-tests-mechanical-261024-1527` → 1 arquivo, +49/-34). Cada adição confrontada com `git show origin/main:src/components/admin/__tests__/useAdminDataCreateUser.test.ts`:

| Hunk da branch | Situação na main | Evidência |
|---|---|---|
| Comentário do cabeçalho `src/lib/supabaseHelpers` → `src/lib/invokeEdge` | **Já está** | main `:5` |
| `vi.mock('@/lib/invokeEdge', …)` em vez de `@/lib/supabaseHelpers` | **Já está** (via `importOriginal`, só `invokeEdge` substituído) | main `:25-28` |
| `vi.mock('@/integrations/supabase/client', …)` com `auth.refreshSession`/`from`/`storage` | **Já está** | main `:30-48` |
| `SUPABASE_URL` no mock do client | **Já está** (`'https://local.test'`) | main `:31`; necessário por `useAdminData.ts:3` |
| Corpo lido de `options.body` | **Já está** | main `:104-107` |
| `mockFrom.mockImplementation` movido para `beforeEach` | **Irrelevante** — a main define no factory do `vi.mock` (`:34-40`) e o `beforeEach` usa `vi.clearAllMocks()` (só `mockClear`, preserva implementação); `vitest.config.ts` não tem `mockReset`/`clearMocks` e `src/test/setup.ts` não tem `resetAllMocks`/`restoreAllMocks` | `grep -nE "resetAllMocks\|restoreAllMocks\|clearAllMocks\|afterEach" origin/main:src/test/setup.ts` → 0 ocorrências |
| `mockReadEdgeError` + `httpError` sintético (`_parsedStatus`/`_parsedMessage`) | **Obsoleto e PIOR** — a main mantém `readEdgeError` (= `parseEdgeError`) REAL e monta `Response` cru (`:69-75`), exatamente o que `parseEdgeError` lê (`origin/main:src/lib/invokeEdge.ts:159-160,167-171,188`). Mockar o parser esvazia justamente o teste do caso HTML/502 | `git show origin/main:src/lib/invokeEdge.ts \| grep -n` |
| `mockInvokeEdge.mockResolvedValue({data,error:null})` | **Irrelevante** — o hook faz `await invokeEdge('create-user',{body})` e descarta o retorno; o fluxo depende só do `throw` | `origin/main:src/components/admin/useAdminData.ts:496-497,503,510` |
| Enum esperado com `'special_agent'` | **Regressão da branch** — `special_agent` não existe mais em `src/` da main (`1f77f7917`, #2692); o teste da main já está sem (`:148`) | `git grep -c special_agent origin/main -- src` → 0 ocorrências |

**Cobertura de cenários idêntica:** os 8 `it(` são os mesmos, com os mesmos títulos, em branch e main (`grep -nE '^\s+it\('` nos dois blobs). Nenhum caso de teste se perde.

**Teste EXECUTADO (resolve o "NÃO VERIFICADO" da triagem):** `./node_modules/.bin/vitest run src/components/admin/__tests__/useAdminDataCreateUser.test.ts` → `Test Files 1 passed (1) / Tests 8 passed (8)`, 1,31 s. Os três arquivos envolvidos na árvore de trabalho são idênticos a `origin/main` (`git diff --stat origin/main -- …test.ts …useAdminData.ts …invokeEdge.ts` → vazio), então a execução vale para a main (`dac285f62`). A versão da main passa; não há nada a consertar.

**Branch sem PR aberta:** `pulls?head=adm01-debug:claude/fix-unit-tests-mechanical-261024-1527&state=all` → só #2228, `state=closed`, `merged_at=null`. `apagar_branch_seguro = true` confirmado.
