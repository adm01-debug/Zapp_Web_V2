# Dossiê — fix__f1a-framer-motion-mock-voicechangerpicker-20261018

- Ref: `origin/fix/f1a-framer-motion-mock-voicechangerpicker-20261018` (tip `3f8ee72f3`, merge_base `bac62ba98`), PRs #2062 e #2434 (mesmo tip).
- Commits: `20a84dfef chore(fmt): prettier em VoiceChangerPicker.aria.test.tsx`, `8cf96c52d fix(test): mock de framer-motion sem useReducedMotion — 1 arquivo (lote F1a)`, `3f8ee72f3 Merge main`.
- Propósito: o teste `VoiceChangerPicker.aria.test.tsx` mockava `framer-motion` sem exportar `useReducedMotion`, quebrando o componente no Vitest. A branch adiciona `useReducedMotion: () => false` ao mock e reformata (prettier) o mock do supabase.

## Arquivo × achado × evidência

| Arquivo | Hunk | Achado | Evidência |
|---|---|---|---|
| `src/components/inbox/__tests__/VoiceChangerPicker.aria.test.tsx` | `+useReducedMotion: () => false,` (linha 40 da branch) | **JÁ NA MAIN** | `git grep -n useReducedMotion origin/main -- <arquivo>` → linha 40: `useReducedMotion: () => false,`. Entrou em `e1f2ee4dd` (2026-10-27, "fix(test): destrava o CI Gate da main"), não via esta branch (`8cf96c52d` não é ancestral da main). A main vai além: usa `importOriginal` + `...actual` (linhas 25-35), cobrindo qualquer outro export de framer-motion. |
| idem | reformatação prettier do mock `supabase` (1 linha → 5 linhas) | **cosmético, sem valor** | `git show origin/main:<arquivo>` linha 7 mantém a versão de uma linha; comportamento idêntico. Único trecho que o line_check conta como "missing" (3 linhas) / "still" (1 linha). |

## Veredito
**INCORPORADA** (confiança alta). A única mudança funcional (export `useReducedMotion` no mock) está na main de forma mais robusta; o resto é formatação. Nada a portar. Branch pode ser apagada; PRs #2062/#2434 fechadas corretamente (triagem anterior "OBSOLETA" era, na prática, INCORPORADA — o alvo não foi removido, foi coberto por outro commit).

## Lacunas a recuperar
Nenhuma.

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA** (confiança alta). Tentei refutar e não achei hunk de valor ≥ médio fora da main.

Provas que levantei por conta própria (repo em `origin/main` = `dac285f62`):

1. **Hunk funcional está na main, de forma mais robusta.** `git show origin/main:src/components/inbox/__tests__/VoiceChangerPicker.aria.test.tsx` → linha 40 `useReducedMotion: () => false,`, dentro de `vi.mock('framer-motion', async (importOriginal) => { const actual = await importOriginal... return { ...actual, ... } })` (linhas 25-35). É superconjunto do mock estático da branch: cobre `useReducedMotion` **e** qualquer outro export de framer-motion.
2. **Não entrou por esta branch e não foi removido de propósito.** `git merge-base --is-ancestor 8cf96c52d origin/main` → não ancestral. `git log -S'useReducedMotion' origin/main -- <arquivo>` → único commit `e1f2ee4dd` "fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)"; depois `a5760922c` "test: integra dia/2026-10-23 na main (mocks framer-motion p/ Vitest 4)". Nenhum commit de remoção/revert tocando o alvo.
3. **Teste roda verde na main (verificado, não inferido).** `npx vitest run src/components/inbox/__tests__/VoiceChangerPicker.aria.test.tsx` → `Test Files 1 passed (1) / Tests 1 passed (1)`, 1.68s. Arquivo no working tree é byte-idêntico ao de `origin/main` (`diff` vazio) e `origin/main` é ancestral do HEAD. Ou seja: a necessidade que originou a branch já está atendida.
4. **Diff completo branch×main do arquivo: só sobra formatação.** `diff <(git show <tip>:<arquivo>) <(git show origin/main:<arquivo>)` → duas diferenças: (a) o mock `supabase` quebrado em 5 linhas pela branch vs 1 linha na main; (b) a main usando `importOriginal`/`...actual` onde a branch usava mock estático. Nenhuma linha de lógica de teste exclusiva da branch.

Achado adicional (não muda o veredito): `npx prettier --check` **falha** no arquivo da main — a linha 7 tem 110 caracteres contra `printWidth: 100` (`.prettierrc`). Era exatamente o que o commit `20a84dfef chore(fmt)` da branch corrigia. Classifico como valor **nenhum**: `package.json` da main não tem script de format/check e `git grep "prettier --check\|format:check"` em `.github/`+`package.json`+`scripts/` da main não retorna nenhum gate (os 2 hits são scripts de inventário de rotas, sem relação). Logo não há CI vermelha nem risco; é churn cosmético de 4 linhas num arquivo de teste. Não rebaixa para PERDIDA_PARCIAL.

**Apagar a branch é seguro.** PRs #2062/#2434 (mesmo tip) corretamente fechadas — a triagem anterior rotulou "OBSOLETA", mas o rótulo preciso é INCORPORADA: o alvo não foi descartado, foi coberto por `e1f2ee4dd`.
