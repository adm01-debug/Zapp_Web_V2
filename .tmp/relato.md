Especialista: iris

## O que mudou e por quê
- `src/components/tasks/shared/TasksFilterBar.tsx`: a barra do módulo de Tarefas ganhou busca (com limpar e atalho), seletor de Prioridade (com contador), seletor de Contato, o popover "Filtros" (Estado, Prazo, "Com alarme", concluídas) e a faixa de chips com remoção individual. Depois desta rodada, os dois `SelectTrigger` do popover (Estado e Prazo) saíram de `h-9` (36 px) para `h-10` (40 px) — a mesma regra de alvo de toque que o resto da barra já seguia.
- `src/components/tasks/shared/ModeSwitcher.tsx` e `src/components/tasks/shared/ContactCombobox.tsx`: alvo de toque de 40 px e nome acessível nos controles que entram na barra.
- `src/components/tasks/TasksModule.tsx`: passa os filtros e callbacks que a barra consome para a barra montada.
- `src/hooks/tasks/workItemFilters.ts`, `workItemAggregates.ts` e `useTasksFilters.ts`: o recorte por `status` (estado) entra no filtro, no parse/serialize da URL e no reducer — é o que o popover "Filtros" escreve. O `done` continua valendo quando nenhum estado foi escolhido.
- Testes: `barraFiltros.test.tsx` (novo, cobre busca, prioridade, contato, popover, chips e os alvos de 40 px), mais os casos de `status` em `workItemFilters.test.ts`, `workItemAggregates.test.ts` e `useTasksFilters.test.tsx`, e os ajustes de `TasksModule.test.tsx` / `taskComponents.test.tsx`.

## Prova
- vermelho antes: `npx vitest run src/components/tasks/__tests__/barraFiltros.test.tsx` com os dois gatilhos de volta em `h-9` → `FAIL ... os gatilhos de Estado e Prazo do popover também têm 40 px de área` / `AssertionError: expected '...h-9 rounded-lg' to contain 'h-10'`.
- verde depois: `npx vitest run src/components/tasks src/hooks/tasks` → `Test Files 41 passed (41); Tests 547 passed | 1 todo (548)`.
- `npx tsc --noEmit` → `exit=0`.

## Pontos do revisor ([refazer 2])
- Ponto 1 (relato não abria com a assinatura): resolvido — a primeira linha agora é `Especialista: iris`.
- Ponto 2 (diff grande demais para revisão): resolvido — o diff agora traz só os arquivos do cartão (a barra, os hooks que ela consome e os testes dela); o que era de outros cartões saiu da faixa.
- Ponto 3 (os `SelectTrigger` de Estado e Prazo do popover em 36 px): resolvido — `h-9` → `h-10` em `TasksFilterBar.tsx`, com teste novo (`barraFiltros.test.tsx`) que falha em `h-9` e passa em `h-10`; a prova de mutação está acima.
- Ponto 4 (ressalva do juiz e número do revisor): registrado aqui — o juiz barato apontou a medida do tamanho do diff; a medida citada é a do bloco FATOS MEDIDOS do fechar, gerada por máquina.

## O que NÃO fiz e por quê
- Não mexi nos KPIs, no cabeçalho, no subtítulo das colunas, nos primitivos compartilhados nem no `useMyWorkItems`: são de outros cartões e ficaram fora desta faixa.
- Não fiz captura de tela nem arquivo gerado: o diff é texto puro, para o revisor conferir linha a linha.
- Não conferi em navegador real nem em tema escuro: o que o cartão pede (40 px nos gatilhos do popover e o recorte por estado) está provado por teste sobre as classes reais renderizadas.
