Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- `src/components/inbox/__tests__/ConversationListSidebar.topoNovo.test.tsx` (novo; é o único arquivo do diff): prova o topo da barra de conversas no desktop chamando `ConversationListSidebar` de verdade e com o `StatusChips` REAL (não mockado), com fixture de 3 conversas abertas. Cobre os itens 1, 2 e 4 do cartão:
  1. ordem no DOM por `compareDocumentPosition`: título → (Atualizar + Zen) → contagem → chips → Filtros → busca → lista;
  2. existe EXATAMENTE UM botão acessível "Atualizar conversas" (ele chama `inbox.refetch`) e o `InboxFilters` do desktop não recebe `onRefetch`/`isRefetching` (o mock muda de nome para `filtros-com-refetch` se a prop voltar);
  3. (item 4 do cartão) `axe` sem violações `critical`/`serious` nos temas claro E escuro.
- Item 3 do cartão (chips com `aria-pressed`) está como `it.todo` no arquivo novo, com o motivo e o cartão dependente no comentário: o atributo mora em `StatusChips.tsx`, e nesta branch (base `dia/2026-10-13`) ele ainda é o componente antigo — `git grep -n aria-pressed -- src/components/inbox/conversation-list/` não retorna nada; o redesign dos chips em pílula/badge (commit `abcef6f8e`) foi retirado da fila e está em refazer no cartão `t_b8496016`. Assim que `t_b8496016` entrar, o `it.todo` vira teste verde (chip ativo com `aria-pressed="true"`, os demais `"false"`, clique repassa e alterna). Em vez de fingir, entreguei verde o encadeamento de que o `aria-pressed` depende: o chip ativo é o do `chipTab` recebido e o clique repassa por `inboxFilters.setChipTab`.
- Nenhum arquivo de produção mudou: o diff é só o teste. A produção foi mutada apenas durante a prova por mutação e restaurada de `.tmp/producao.orig.tsx` antes do commit (`git status --short` limpo).

## Por que o arquivo novo é indispensável (aviso do juiz)
- O arquivo vizinho listado, `ConversationListSidebar.topo.test.tsx`, mocka `@/components/inbox/conversation-list/StatusChips` como `() => null`: ali não existe chip nenhum no DOM, então nem a ordem relativa dos chips nem o `aria-pressed` nem o `axe` sobre os chips poderiam ser provados. Desmockar `StatusChips` dentro daquele arquivo mudaria os mocks compartilhados por `vi.mock` (hoisted) e poria em risco as asserções já existentes dele — preferi um arquivo novo, sem tocar em teste existente.

## Prova
- vermelho antes (prova por mutação, produção revertida depois): movendo o bloco `<StatusChips />` para dentro da linha de Filtros/busca → o teste de ordem falha com `AssertionError: expected false to be true` na cadeia `antes(chips, filtros)`;
- vermelho antes (segunda mutação): passando `onRefetch`/`isRefetching` ao `InboxFilters` do desktop e inserindo um `<img>` sem `alt` → falham o teste do botão único (`Unable to find an element by: [data-testid="filtros"]`, só existe `filtros-com-refetch`) e os dois casos de `axe` (`expected [ 'image-alt(critical)' ] to deeply equal []`);
- verde depois: `npx vitest run src/components/inbox/__tests__/ConversationListSidebar.topoNovo.test.tsx` → `Test Files 1 passed (1); Tests 5 passed | 1 todo (6)`, rodado 2x seguidas com a mesma linha;
- verde depois (sem regressão nas vizinhas): `npx vitest run src/components/inbox/__tests__/ConversationListSidebar.test.tsx src/components/inbox/__tests__/ConversationListSidebar.topo.test.tsx src/components/inbox/__tests__/StatusChips.test.tsx` → `Test Files 3 passed (3); Tests 25 passed (25)`.

## O que NÃO fiz e por quê
- Não toquei em `StatusChips.tsx` nem em `ConversationListSidebar.tsx`: o cartão limita o diff às suítes de teste, e editar produção para o item 3 passar seria fazer a mudança de outro cartão (`t_b8496016`).
- `axe` em jsdom não avalia contraste de cor (sem canvas/CSS computado); o filtro por `critical`/`serious` foi mantido como o cartão pede.
- Avisos do juiz na 1ª rodada (arquivo novo + ressalva do item 3) foram lidos; rodo este MESMO comando de novo, sem editar o relato, para a entrega seguir com os avisos registrados ao revisor.
