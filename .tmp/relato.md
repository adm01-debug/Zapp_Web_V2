Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/inbox/chipCounts.ts: extraí `passesExtraFilters(conversa, contexto)` — busca (nome/telefone/e-mail),
  painel Filtros (status, etiquetas, atendente, intervalo de datas) e tipo de contato — e o `countByChip` passou a
  exigir esse predicado além de contato/adiamento/chip. Mesma borda da lista: só recorta data quando há `from`; tipo
  desconhecido não filtra; e-mail nulo não casa; busca é case-insensitive e preserva acento.
- src/hooks/inbox/useInboxFilters.ts: a lista trocou o bloco inline de busca/painel/tipo por
  `passesExtraFilters(c, extraFilterContext)`; o hook devolve `chipCounts` memoizado montado com o MESMO contexto.
  Uma varredura das conversas testando os seis chips por conversa (o custo não cresce com a busca, que dispara a cada tecla).
- src/hooks/inbox/__tests__/chipCounts.test.ts: matriz de 18 combinações comparando, chip a chip, o `chipCounts` do hook
  com o `length` da lista; mais busca sem resultado, acento/maiúscula, busca por telefone e volume de 1.200 conversas.
- Lista inalterada para o usuário: os predicados aplicados por cima do chip continuam EXATAMENTE os mesmos (mesmas
  bordas, mesma ordem de efeito — só o conjunto filtrado importa); nenhum componente/tela foi editado e os testes de
  lista existentes (ConversationListSidebar e useInboxFilters.arquivadas) seguem verdes no mesmo comando abaixo.

## Prova
- vermelho antes: `npx vitest run src/hooks/inbox/__tests__/chipCounts.test.ts` com chipCounts.ts/useInboxFilters.ts na base
  (HEAD) → `Tests 19 failed | 14 passed (33)`
- verde depois: `npx vitest run src/hooks/inbox/__tests__/chipCounts.test.ts src/hooks/inbox/__tests__/useInboxFilters.arquivadas.test.tsx`
  → `Test Files 2 passed (2); Tests 38 passed (38)`
- regressão da área: `npx vitest run src/hooks/inbox src/components/inbox`
  → `Test Files 190 passed (190); Tests 1531 passed | 1 expected fail | 1 todo (1533)`

## O que NÃO fiz e por quê
- src/components/inbox/conversation-list/StatusChips.tsx e o seu teste aparecem no histórico por causa dos cherry-picks
  dos pais (t_9637c51a/t_e476c02e), que o cartão manda aplicar; NÃO os editei neste cartão. O que este cartão escreve é
  só chipCounts.ts, useInboxFilters.ts e o __tests__/chipCounts.test.ts.
- Não toquei em StatusChips.tsx (tela): passar a exibir `chipCounts` é do cartão filho t_aae4ea59.
- Não alterei o filtro de arquivadas nem `filterByContactType`; o tipo de contato é aplicado pela mesma regra (via
  FILTER_OPTIONS, a mesma fonte que `filterByContactType` usa) na lista e no contador.
- Amostra conferida: 1.200 conversas — acima do SEEDED_CONTACT_LIMIT documentado (=500 no realtime.service) — buscando
  pela string "Volume" com etiqueta 'vip', para a regra não depender de a amostra carregada estar inteira.
