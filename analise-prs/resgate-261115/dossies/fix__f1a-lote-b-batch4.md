# Dossiê — fix__f1a-lote-b-batch4 (branch `origin/fix/f1a-lote-b-batch4`, PR #2081)

- tip `80a6e057a` · merge_base `bac62ba98` · 3 commits (2026-10-23): `d9f5fcc45 chore(fmt): prettier em useDiagnosticsData.ts`, `4b0d88a78 fix: contagem de whatsapp_connections lançava e derrubava toda a coleta de diagnóstico (N-216)`, merge de main.
- 1 arquivo: `src/hooks/system/useDiagnosticsData.ts` (+93/−23). Sem migration, edge ou workflow.

## Propósito
N-216: na coleta de diagnóstico (`collectHealth`), `if (connectionsCountError) throw connectionsCountError` após o COUNT estimado de `whatsapp_connections` derrubava a função inteira (descartando contacts/storage/realtime já coletados) e deixava "0 conexões" indistinguível de falha de leitura. A branch captura o erro e o injeta na classificação de `health.database`. O restante do diff (≈70 das 93 linhas) é só reformatação Prettier (quebra de chains, trailing comma `es5`, parênteses em arrow).

## Arquivo × achado × evidência

| Arquivo | Hunk | Achado | Evidência |
|---|---|---|---|
| `src/hooks/system/useDiagnosticsData.ts` | remoção do `throw connectionsCountError` + erro entra em `classifyHealth(database)` | **JÁ NA MAIN, em outra forma** | `origin/main:src/hooks/system/useDiagnosticsData.ts:291-294` — `const { count: connectionsCount, error: connectionsCountError } = await supabase.from('whatsapp_connections').select('id', { count: 'estimated', head: true });` seguido do comentário "Erro na contagem não aborta o ciclo nem vira '0 conexões' saudável: entra na classificação do banco (abaixo), que passa a 'down'." (sem `throw`). Linha 317: `database: classifyHealth(connectionsCountError ?? dbError, dbLatency, 500, 2000)`. Introduzido por `e1f2ee4dd` (2026-10-27, "fix(test): destrava o CI Gate da main"). |
| idem | teste do comportamento | **JÁ NA MAIN** (a branch não trazia teste; main tem) | `origin/main:src/hooks/system/__tests__/useDiagnosticsData.select.test.ts:5` ("N-216 — Diagnósticos…"), `:74` `it('falha na contagem de conexões vira erro de banco (não "0 conexões" saudável)')`, `:81` `expect(result.current.health?.connectionsCount).toBe(0)`. |
| idem | `try/catch` em volta do `await supabase.from('whatsapp_connections')…` (branch) vs. sem try/catch (main) | diferença defensiva sem efeito de negócio | Erro PostgREST/RLS vem em `{ error }` (não lança) — caso coberto na main. Rejeição de rede propagaria ao `catch` do chamador → `collectionError`/log crítico (mesmo tratamento que a main dá ao COUNT de `messages`, `:289-290`), ou seja, nunca vira "0 saudável". |
| idem | ordem `dbError ?? connectionsCountError` (branch) vs `connectionsCountError ?? dbError` (main) | equivalente | Ambos resultam em `down`/`unauthorized` quando qualquer um dos dois existe; só muda qual erro é inspecionado quando ambos falham. |
| idem | ~70 linhas de Prettier (chains quebradas, `(l) =>`, objetos multilinha) | ruído / valor nenhum | `.prettierrc` tem `trailingComma: es5` mas a main mantém o arquivo não formatado (`:90-93` com trailing comma, chains em 1 linha); CI (`.github/workflows/ci.yml`) não roda `prettier --check` (lint é `scripts/ci/lint-ratchet.mjs`, `package.json:19`). Reformatar hoje seria churn puro. |

## Veredito
**INCORPORADA** — a única mudança funcional (não lançar no COUNT de `whatsapp_connections` e refletir o erro em `health.database`) está na main desde `e1f2ee4dd`, com teste dedicado que a branch nem tinha. O resto é formatação sem gate em CI.

Triagem anterior (2026-11-08) marcou `JA_NA_MAIN` — confirmado pelo código, não pelo comentário.

## Lacunas a recuperar
Nenhuma. `apagar_branch_seguro = true`.

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA**. `apagar_branch_seguro = true`. Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da main.

Escopo real da branch (conferido, não aceito da triagem): `git diff bac62ba98 origin/fix/f1a-lote-b-batch4 --stat` → **1 arquivo só**, `src/hooks/system/useDiagnosticsData.ts`. Nenhum teste, migration, edge ou workflow. Os 3 commits são `d9f5fcc45` (prettier), `4b0d88a78` (fix N-216) e `80a6e057a` (merge de main).

O `git diff origin/fix/f1a-lote-b-batch4 origin/main -- src/hooks/system/useDiagnosticsData.ts` inteiro reduz-se a **três** diferenças — as 69 linhas de `missing_in_main` do JSON são todas reformatação:

1. **Não lançar no COUNT de `whatsapp_connections` + erro vira sinal de banco — JÁ NA MAIN.** `git show origin/main:src/hooks/system/useDiagnosticsData.ts` linhas 291-294: o destructuring do COUNT estimado existe **sem** `if (connectionsCountError) throw`, com o comentário "Erro na contagem não aborta o ciclo nem vira '0 conexões' saudável: entra na classificação do banco (abaixo), que passa a 'down'."; linha 317: `database: classifyHealth(connectionsCountError ?? dbError, dbLatency, 500, 2000)`. `git log -S'if (connectionsCountError) throw connectionsCountError' --oneline origin/main -- <arquivo>` → o `throw` saiu em `e1f2ee4dd` ("fix(test): destrava o CI Gate da main"), ou seja, **removido para corrigir**, não revert nem desativação. É exatamente o efeito de negócio da branch.
2. **Teste do comportamento — JÁ NA MAIN, e a branch não tinha.** `origin/main:src/hooks/system/__tests__/useDiagnosticsData.select.test.ts:74-82`: `it('falha na contagem de conexões vira erro de banco (não "0 conexões" saudável)')`, injeta `{message:'connection refused', code:'XX000'}` no COUNT e espera `health.database === 'down'` e `connectionsCount === 0`. Cobertura superior à da branch.
3. **`try/catch` em volta do COUNT (só na branch) — valor baixo, confirmado por leitura do chamador.** `origin/main:src/hooks/system/useDiagnosticsData.ts:420-445`: `fetchAll` roda as 4 sondas em `Promise.all` dentro de `try/catch` e qualquer rejeição vira `coletaFalhou` (severity `error`, visível no painel) + `collectionError`. Então rejeição de rede **não** vira "0 conexões saudável" na main — vira falha de coleta explícita. Além disso a própria branch **manteve** `if (messagesCountError) throw messagesCountError` 3 linhas acima, logo nem na branch `fetchSystemHealth` é à prova de throw. Diferença residual: numa rejeição de rede a branch ainda pintaria storage/realtime/edge. Valor: baixo, não ≥ médio.

Checagens extras que fiz para tentar derrubar o veredito:
- **Ordem `dbError ?? connectionsCountError` (branch) vs `connectionsCountError ?? dbError` (main):** equivalente para o resultado que importa — `classifyHealth` devolve `down`/`unauthorized` se qualquer um existir. Só muda qual erro `isAuthorizationError` inspeciona quando **os dois** falham ao mesmo tempo; nenhum dos dois estados é "saudável". Sem lacuna.
- **A formatação Prettier poderia ter valor se o CI exigisse:** não exige. `git grep -nE "prettier" origin/main -- .github/workflows package.json scripts/ci` só acha a devDependency (`package.json:133`) e um comentário em `scripts/ci/inventario-rotas.unit.mjs:216` dizendo literalmente "o repo nao roda `prettier --check` no CI". Nota: a branch estava **mais** próxima do `.prettierrc` (`trailingComma: es5`, sem vírgula final em parâmetros) que a main, mas sem gate isso é churn em arquivo sensível — descartar é a decisão certa.
- **Nenhum arquivo além desse** diverge por causa da branch (o resto do `git diff --stat` branch↔main é a main tendo andado 2302 arquivos à frente).

Lacunas adicionais: nenhuma.
