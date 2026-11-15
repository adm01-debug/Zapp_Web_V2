# Dossiê — fix__f1a-lote-b-useadmindata-select (PR #2069)

**Ref:** `origin/fix/f1a-lote-b-useadmindata-select` · tip `cbef3bcab` · merge-base `bac62ba98` (2026-10-23) · tip NÃO é ancestral de `origin/main`.
**Triagem anterior (2026-11-08):** OBSOLETA. **Veredito agora:** INCORPORADA (confiança alta).

## Propósito
Destravar o teste `src/components/admin/__tests__/useAdminData.select.test.ts`, que quebrava porque o mock do
query builder do Supabase não tinha `.range()` (usado pela paginação da aba de auditoria). Commits:
- `0428318bc fix(test): mock de supabase sem .range()/.gte()/.lte() em useAdminData.select — 1 arquivo (lote F1a)`
- `70f283986 chore(fmt): prettier em useAdminData.select.test.ts (F1a lote B)`
- `cbef3bcab Merge branch 'main' into ...`
Diff total: 1 arquivo, +12/−5.

## Arquivo × achado × evidência

| Arquivo | Hunk | Achado | Evidência |
|---|---|---|---|
| `src/components/admin/__tests__/useAdminData.select.test.ts` | adiciona `'range'` ao mock | **JÁ NA MAIN** | `git show origin/main:<arquivo>` linha 22: `for (const m of ['order','limit','eq','in','neq','range']) b[m] = () => b;` — entrou por `e1f2ee4dd fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)` (2026-10-27, posterior à branch) |
| idem | adiciona `'gte'`, `'lte'` ao mock | **Não está na main, mas sem efeito no teste** | `origin/main:src/components/admin/useAdminData.ts:272-273`: `.gte`/`.lte` só são chamados `if (auditFrom)` / `if (auditTo)`; `auditFrom = auditFilter?.from` (l.198-199), parâmetro opcional (`useAdminData(activeTab, auditFilter?)`). O teste chama `useAdminData('audit')` sem filtro → `gte`/`lte` nunca invocados. Defensivo apenas; valor nenhum. |
| idem | quebra de linhas (prettier) em `b.select`, `beforeEach`, `act`, `filter((s) =>` | **Cosmético** | Conteúdo idêntico, só formatação. A main mantém a versão em uma linha (l.21, 33, 38, 40). Valor nenhum. |

## Veredito
**INCORPORADA.** A única mudança funcional (`range` no mock) está na main com prova por linha. As 12 "linhas em lacuna"
apontadas pela checagem mecânica são: 2 métodos defensivos não exercitados (`gte`, `lte`) + formatação prettier.
Nenhuma lacuna a recuperar.

**NÃO VERIFICADO:** execução do teste na main neste clone — `node_modules` ausente (`vitest` não encontrado; `npm` falha
com EOVERRIDE). A classificação baseia-se em leitura do código (linhas citadas acima).

`apagar_branch_seguro = true`.

## Verificação adversarial

Tentei refutar o veredito INCORPORADA. Não consegui: o diff inteiro da branch cabe em 12 linhas e nenhuma
tem valor ≥ médio fora da main.

Diff completo (`git diff bac62ba9 origin/fix/f1a-lote-b-useadmindata-select --stat`): 1 arquivo,
`src/components/admin/__tests__/useAdminData.select.test.ts`, +12 −5. Commits: `70f283986` (prettier),
`0428318bc` (mock), `cbef3bcab` (merge de main).

O conteúdo do diff se divide em dois:

1. **`.range()` no mock — já na main.** `origin/main:src/components/admin/__tests__/useAdminData.select.test.ts:22`
   traz `for (const m of ['order', 'limit', 'eq', 'in', 'neq', 'range']) b[m] = () => b;`. Entrou por
   `e1f2ee4dd9481e7d4165edbd6c6bf9e94f8fdc62` ("fix(test): destrava o CI Gate da main (136 → 0 arquivos
   vermelhos)", 27/10/2026), confirmado por `git log -S"'neq', 'range'" origin/main -- <arquivo>`. Essa era a
   única correção funcional da branch, pois `useAdminData.ts:270` chama `.range(start, …)` sempre na aba audit.

2. **`gte`/`lte` no mock — código morto.** `src/components/admin/useAdminData.ts:272-273` só chama esses
   métodos sob condição (`if (auditFrom) …` / `if (auditTo) …`), e `auditFrom`/`auditTo` vêm de
   `auditFilter?.from`/`?.to` (linhas 198-199). O teste monta `renderHook(() => useAdminData('audit'))` sem
   `auditFilter` → ambos `undefined` → `.gte`/`.lte` nunca são chamados. Acrescentá-los ao mock não muda
   nenhum resultado.

3. **Resto é prettier.** Quebra de linha nos corpos de arrow e `(s) =>` em vez de `s =>`. Nenhum workflow em
   `.github/workflows/` roda prettier ou `format:check` (`grep -rln "prettier\|format:check" .github/workflows/`
   → vazio), então não há CI vermelha para destravar. AGENTS.md ("diff mínimo, zero churn") tira o valor.

**VERIFICADO (corrige o NÃO VERIFICADO acima):** rodei o teste com o conteúdo da main.
`npx vitest run src/components/admin/__tests__/useAdminData.select.test.ts` → `Test Files 1 passed (1) /
Tests 1 passed (1)`. O arquivo de teste e `useAdminData.ts` na árvore de trabalho são idênticos a
`origin/main` (`git diff origin/main -- <os dois arquivos>` → vazio). Ou seja: a main já passa sem nada da
branch.

Parecer: **concordo — INCORPORADA**. `apagar_branch_seguro = true`. Nenhuma lacuna adicional.
