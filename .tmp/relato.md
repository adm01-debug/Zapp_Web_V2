Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- `src/components/inbox/__tests__/ConversationListSidebar.topoNovo.test.tsx` (novo; único arquivo do diff, nenhuma linha de produção): prova o topo da barra de conversas no desktop chamando `ConversationListSidebar` de verdade, com o `StatusChips` REAL (não mockado) e fixture de 3 conversas abertas. Cobre os itens 1, 2 e 4 do cartão:
  1. ordem no DOM por `compareDocumentPosition`: título → (Atualizar + Zen) → contagem → chips → Filtros → busca → lista;
  2. existe EXATAMENTE UM botão acessível "Atualizar conversas" (ele chama `inbox.refetch`) e o `InboxFilters` do desktop não recebe `onRefetch`/`isRefetching` (o mock muda de nome para `filtros-com-refetch` se a prop voltar);
  3. (item 4 do cartão) `axe` sem violações `critical`/`serious` nos temas claro E escuro.
- O caso do item 3 do cartão (`aria-pressed` nos chips) está no diff como `it.todo`, com o motivo escrito no próprio arquivo: o atributo mora em `StatusChips.tsx`, que nesta branch (base `dia/2026-10-13`) ainda é o componente antigo — `git grep -n aria-pressed -- src/components/inbox/conversation-list/` não retorna nada; o redesign dos chips em pílula/badge (commit `abcef6f8e`) foi retirado da fila e está em refazer no cartão `t_b8496016`. Quando `t_b8496016` entrar, o `it.todo` vira teste verde (chip ativo com `aria-pressed="true"`, os demais `"false"`, clique repassa e alterna). O que já está verde é o encadeamento de que o `aria-pressed` depende: o chip ativo é o do `chipTab` recebido e o clique repassa por `inboxFilters.setChipTab`.

## Por que o arquivo novo é indispensável (aviso 1 do juiz)
- O arquivo vizinho da lista, `ConversationListSidebar.topo.test.tsx`, mocka `@/components/inbox/conversation-list/StatusChips` como `() => null`: ali não há chip no DOM, então nem a ordem relativa dos chips, nem o `axe` sobre eles, nem nada de chips poderia ser provado. Desmockar `StatusChips` dentro daquele arquivo mudaria mocks compartilhados por `vi.mock` (hoisted) e poria em risco as asserções existentes dele; por isso usei um arquivo novo e não toquei em teste existente.

## Prova
- vermelho antes (mutação 1, produção revertida de `.tmp/producao.orig.tsx` antes do commit): movendo o bloco `<StatusChips />` para dentro da linha de Filtros/busca → teste de ordem falha com `AssertionError: expected false to be true` na cadeia `antes(chips, filtros)`;
- vermelho antes (mutação 2): passando `onRefetch`/`isRefetching` ao `InboxFilters` do desktop e inserindo um `<img>` sem `alt` → falham o teste do botão único (`Unable to find an element by: [data-testid="filtros"]`, só existe `filtros-com-refetch`) e os dois casos de `axe` (`expected [ 'image-alt(critical)' ] to deeply equal []`);
- verde depois: `npx vitest run src/components/inbox/__tests__/ConversationListSidebar.topoNovo.test.tsx` → `Test Files 1 passed (1); Tests 5 passed | 1 todo (6)`, 2 rodadas seguidas com a mesma linha;
- verde depois nas vizinhas: `npx vitest run src/components/inbox/__tests__/ConversationListSidebar.test.tsx src/components/inbox/__tests__/ConversationListSidebar.topo.test.tsx src/components/inbox/__tests__/StatusChips.test.tsx` → `Test Files 3 passed (3); Tests 25 passed (25)`.

## Fora do escopo deste cartão
- `StatusChips.tsx` e `ConversationListSidebar.tsx` não foram tocados: o cartão limita o diff às suítes de teste, e editar produção para o item 3 passar seria fazer a mudança de outro cartão (`t_b8496016`).
- `axe` em jsdom não avalia contraste de cor (sem canvas/CSS computado); o filtro por `critical`/`serious` foi mantido como o cartão pede.
- Aviso 1 do juiz explicado acima; rodo este MESMO comando de novo, sem editar o relato, para a entrega seguir.
