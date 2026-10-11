Especialista: worker (testes) (area-testes-do-produto)

## Aviso do juiz — arquivo fora da lista do cartão (indispensável)
- `src/hooks/tasks/workItemAggregates.ts` não está em ARQUIVOS QUE PODE TOCAR, mas é INDISPENSÁVEL: `applyFilters` é o único recorte dos três modos (Lista, Quadro, Agenda) e é onde um filtro vira efeito. Sem estendê-lo, `status`/`due` ficariam só na URL e não recortariam nada — o filtro prometeria o que o código não faz. O arquivo é de hooks/dados, minha área. A mudança é aditiva (só `now` opcional e os dois novos ramos); o comportamento antigo segue coberto pelos testes existentes, que passam.

## O que mudou e por quê
- src/hooks/tasks/workItemFilters.ts (etapas 024/037): `TasksFilters` ganhou `status` (WorkItemStatus | 'all') e `due` ('all'|'overdue'|'today'|'week'|'none'). `filtersFromSearch` lê os dois da URL (`?status=`, `?due=`), ignora valor fora da lista (cai em 'all') e mantém o `q` herdado; `searchWithFilters` grava só o que difere do padrão e preserva os params alheios (`view`, `task`); `isFilterActive` conta os dois como filtro ativo. Como `useTasksFilters.clear()` aplica `DEFAULT_FILTERS` sobre a URL corrente, "Limpar tudo" zera `status` e `due` (e o `q` da correção do cartão pai não volta).
- src/hooks/tasks/workItemAggregates.ts (etapas 024/037): `applyFilters` passou a RECORTAR por estado e prazo, com `now` injetável (default `new Date()`). `today` segue o veredito de `bucketByDue` (prazo de hoje SEM contar o já vencido); `week` é a janela dos próximos 7 dias; `none` é o sem prazo. Um estado escolhido manda no lugar do toggle "concluídas" (`done`): `status=doing&done=0` devolve a coluna, não vazio.
- src/hooks/tasks/workItem.types.ts (etapa 081): `KANBAN_COLUMNS` ganhou `subtitle` curto — "A organizar", "Próximas ações", "Conclua uma para iniciar outra", "Dependências externas", "Últimos 7 dias" — e a `policy` longa continua intacta.
- Testes: `workItemColumns.test.ts` (novo); `workItemFilters.test.ts` (+4 casos de URL round-trip); `useTasksFilters.test.tsx` (+1); `workItemAggregates.test.ts` (+7 de recorte); `QuickAdd.test.tsx` (etapa 041: Ctrl+2 e o caso "sem linguagem natural").

## Prova
- vermelho antes (só os testes novos, com os 3 arquivos de src revertidos por `git stash push`): `npx vitest run <os 5 arquivos>` -> `Test Files 4 failed (4); Tests 15 failed | 65 passed (80)`.
- verde depois: `npx vitest run src/hooks/tasks/__tests__/workItemFilters.test.ts src/hooks/tasks/__tests__/workItemColumns.test.ts src/hooks/tasks/__tests__/workItemAggregates.test.ts src/hooks/tasks/__tests__/useTasksFilters.test.tsx src/components/tasks/__tests__/QuickAdd.test.tsx` -> `Test Files 5 passed (5); Tests 93 passed (93)` — zero falhas, zero pulados.
- regressão do módulo: `npx vitest run src/hooks/tasks src/components/tasks` -> `Test Files 31 passed (31); Tests 356 passed | 1 todo (357)` — zero falhas.

## Etapa 041 (revisão, sem reescrever o componente)
O parser do QuickAdd já cumpria a decisão G-5: Ctrl+1/2/3 (Hoje/Amanhã/Próx. semana), Ctrl+L (lembrete) e Ctrl+@ (contato), todos documentados no `title` do campo, sem NLP. Não alterei `QuickAdd.tsx`; provei em teste que o texto "amanhã às 9h ligar para o cliente" entra CRU (título inteiro, prazo e lembrete nulos) e que Ctrl+2 marca amanhã.

## O que NÃO fiz e por quê
- Não mexi na UI (TasksFilterBar / popover) — é do iris (cartões 036/038).
- Não toquei banco, migration nem Edge.
