Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- `src/components/inbox/__tests__/ConversationListSidebar.topoNovo.test.tsx` (novo, único arquivo do diff): prova o topo da barra de conversas no desktop chamando `ConversationListSidebar` de verdade e com o `StatusChips` REAL (não mockado), com fixture de 3 conversas abertas. Cobre os itens 1, 2 e 4 do cartão:
  1. ordem no DOM por `compareDocumentPosition`: título → (Atualizar + Zen) → contagem → chips → Filtros → busca → lista;
  2. existe EXATAMENTE UM botão acessível "Atualizar conversas" (ele chama `inbox.refetch`) e o `InboxFilters` do desktop não recebe `onRefetch`/`isRefetching` (o mock muda de nome para `filtros-com-refetch` se a prop voltar);
  3. (item 4 do cartão) `axe` sem violações `critical`/`serious` nos temas claro E escuro.
- Nenhum arquivo de produção foi alterado (o diff tem só o teste); a produção foi mutada só durante a prova por mutação e restaurada a partir de `.tmp/producao.orig.tsx` antes do commit.

## Prova
- verde depois: `npx vitest run src/components/inbox/__tests__/ConversationListSidebar.topoNovo.test.tsx` → `Test Files 1 passed (1); Tests 5 passed | 1 todo (6)` — rodado 2x seguidas, mesma linha.
- sem regressão nas suítes vizinhas: `npx vitest run src/components/inbox/__tests__/ConversationListSidebar.test.tsx src/components/inbox/__tests__/ConversationListSidebar.topo.test.tsx src/components/inbox/__tests__/StatusChips.test.tsx` → `Test Files 3 passed (3); Tests 25 passed (25)`.
- prova por mutação (produção revertida depois, `git status` limpo além do teste novo):
  a) movendo o bloco `<StatusChips />` para fora do topo (para dentro da linha de Filtros/busca) → o teste de ordem falha: `AssertionError: expected false to be true` na cadeia `antes(chips, filtros)`;
  b) passando `onRefetch`/`isRefetching` para o `InboxFilters` do desktop e inserindo um `<img>` sem `alt` → falham o teste do botão único (`Unable to find an element by: [data-testid="filtros"]`, só existe `filtros-com-refetch`) e os dois `axe` (`expected [ 'image-alt(critical)' ] to deeply equal []`).

## NÃO CONCLUÍ
- Item 3 do cartão (chips com `aria-pressed` refletindo a seleção): o atributo mora em `src/components/inbox/conversation-list/StatusChips.tsx`, que nesta branch (base `dia/2026-10-13`) ainda é o componente antigo — o redesign dos chips em pílula/badge (commit `abcef6f8e`) foi retirado da fila e está em refazer no cartão `t_b8496016`. Prova da ausência: `git grep -n aria-pressed -- src/components/inbox/conversation-list/` não retorna nada. Por isso o caso está como `it.todo` no arquivo novo, com o motivo e o cartão dependente no comentário; **quando `t_b8496016` entrar, o `it.todo` vira teste verde** (assert: chip ativo com `aria-pressed="true"`, os demais `"false"`, clique repassa e alterna).
- O que ENTREGUEI do item 3 em vez de fingir: teste verde que prova o encadeamento do qual o `aria-pressed` depende — chip ativo é o do `chipTab` recebido (classe `status-chip-active`) e o clique repassa por `inboxFilters.setChipTab`.

## O que NÃO fiz e por quê
- Não toquei em `StatusChips.tsx` nem em `ConversationListSidebar.tsx`: o cartão limita o diff às suítes de teste e editar produção para fazer o item 3 passar seria mudar a regra de outro cartão.
- `axe` em jsdom não avalia contraste de cor (sem canvas/CSS computado); o filtro por `critical`/`serious` foi mantido como o cartão pede.
