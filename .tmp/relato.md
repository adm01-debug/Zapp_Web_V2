Especialista: hugo

## O que mudou e por quê
- src/hooks/inbox/useInboxBulkActions.ts: `selectedIds` passa a ser podado por interseção com os ids visíveis (`visibleIds`, derivado de `filteredConversations`) sempre que a lista filtrada muda — trocar de chip/fila/tipo/busca não deixa mais selecionado um contato que o operador não vê. Um `useRef` marca a lista observada na renderização anterior: a primeira lista (montagem/carregamento) não poda nada, e quando nada sai o mesmo `Set` é devolvido (sem re-render quando o pai troca a identidade do array a cada render).
- src/hooks/inbox/useInboxBulkActions.ts: `selectAll` ganhou comentário curto dizendo que seleciona só o filtrado (já usava `filteredConversations`).
- src/hooks/inbox/__tests__/useInboxBulkActions.test.ts: 4 casos novos num `describe` próprio, com um helper `renderInboxComFiltro` que troca a lista entre renderizações (`rerender`): poda por interseção, ação em lote só atinge o visível (o contato escondido NÃO vai para o banco), lista que esvazia limpa a seleção e nenhuma ação encontra alvo, e troca de identidade do array sem tirar ninguém mantém a seleção.

Dependência: o cartão pai (t_2901d317, sha 94539ff04) não estava no workspace; a faixa foi trazida por `git cherry-pick -x 2d03936628` (o commit de código+teste do pai; os demais commits da faixa só reescreviam `.tmp/relato.md`).

## Prova
- vermelho antes: `npx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` (com o hook do pai, sem a poda) → `Tests 3 failed | 28 passed | 1 expected fail (32)`
- verde depois: `npx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` → `Test Files 1 passed (1); Tests 31 passed | 1 expected fail (32)`
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (102s)` (OK tipos, lint, migrations, db_guard)

## Escopo
- O contador e o diálogo do toolbar (PD-84/PD-85) são de tela e ficam fora dos ARQUIVOS QUE PODE TOCAR deste cartão; com a poda por interseção não existe mais seleção "fora da lista atual" para o toolbar contar.
