Especialista: worker (design) (design-system-zapp)

## O que mudou e por quê
- src/hooks/tasks/workItem.types.ts, useMyWorkItems.ts, workItemFilters.ts, workItemAggregates.ts: voltaram ao conteúdo do dia, tirando do diff o que não é deste cartão — `contact_type` no select e no tipo, `subtitle` nas `KANBAN_COLUMNS`, o recorte de estado (`status`: campo, `statusesValidos`, `filtersFromSearch`/`searchWithFilters`/`isFilterActive`, `statusFiltro` no `applyFilters`) e os agregados `agendaDayCounts`/`agendaDayAriaLabel`/`daySubtitle` + `DayGroup.subtitle`/`dateKey`.
- O que ficou nesses dois hooks é só o recorte de PRAZO (`due`/`casaPrazo`/`now` no `applyFilters`, `setDue` no `useTasksFilters`), que é o que o critério 023 consome: é ele que o clique nos KPIs escreve no filtro. Esse trecho tem teste — `kpiStripTarefas.test.tsx` (o card publica `onToggleDue`), `TasksModule.test.tsx` (o clique aplica o recorte e o chip aparece, e2e no módulo) e `workItemFilters.test.ts`/`useTasksFilters.test.tsx`, que eu atualizei para o campo `due` (na base do cartão esses 3 casos estavam vermelhos, porque o `due` já vinha da faixa de dependência sem o ajuste das expectativas).
- src/components/tasks/shared/TasksKpiStrip.tsx: `action.pressed` virou opcional, e o card "Fazendo" deixou de passá-lo. Resultado: o botão de "Fazendo" (que só NAVEGA para o Quadro) sai sem `aria-pressed`; o `aria-pressed` só existe nos dois cards de recorte ("Atrasadas"/"Para hoje"), onde alternar é verdade.
- src/components/tasks/__tests__/kpiStripTarefas.test.tsx: o caso de 023 agora confere que o `kpi-acao` do "Fazendo" NÃO tem `aria-pressed`; e entraram dois casos de 028 que exercitam a mola (rerender com valor novo) e o caminho de movimento reduzido.

## Prova
- verde: `npx vitest run src/components/tasks/__tests__/` → `Test Files 21 passed (21); Tests 231 passed | 1 todo (232)`
- verde: `npx vitest run src/hooks/tasks/__tests__/` → `Test Files 8 passed (8); Tests 119 passed (119)`
- verde: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (160s)`
- vermelho antes (ponto 2): reintroduzir `pressed: false` no "Fazendo" → `npx vitest run src/components/tasks/__tests__/kpiStripTarefas.test.tsx` → `Tests 1 failed | 22 passed (23)`, falha em `023: o card do recorte ativo fica pressionado, com selo, e o rótulo diz o que o clique faz`
- vermelho antes (ponto 3, mola): trocar o retorno da contagem por `return formatar(valor)` → `Tests 1 failed | 22 passed`, falha em `028: com o movimento permitido a mola CONTA do valor antigo ao novo e fecha no valor exato`
- vermelho antes (ponto 3, movimento reduzido): tirar o `!reduceMotion` do retorno (`return animar ? texto : formatar(valor)`) → `Tests 1 failed | 22 passed`, falha em `028: com movimento reduzido o valor novo entra no MESMO render (sem mola)`
- cada mutação foi revertida com `git checkout --` e a árvore voltou limpa (`git status --short` vazio) antes do commit.

## Pontos do revisor
- Ponto 1 (código de outros cartões no diff): revertido. `contact_type`, `subtitle` das colunas, o recorte `status` e `agendaDayCounts`/`agendaDayAriaLabel`/`daySubtitle`/`DayGroup.subtitle`+`dateKey` voltaram ao dia; nenhum deles é lido por nada em `src/components/tasks` (confirmado por `git grep`). O único trecho de hook que ficou é o recorte de prazo, que é critério deste cartão e está coberto pelos testes citados acima.
- Ponto 2 (`aria-pressed` em item que só navega): corrigido — `pressed` é opcional e o "Fazendo" não o passa mais; teste de 023 ajustado para exigir a ausência do atributo, com a mutação de volta provando que falha.
- Ponto 3 (mola e movimento reduzido sem teste): corrigido com os dois casos novos de 028 (rerender 2→7: a região viva narra `Atrasadas: 7` no mesmo render, o número visível não salta e fecha no exato; e `useReducedMotion` true mudando no mesmo render), cada um com a sua mutação vermelha.
- Ponto 4 (relato dizia "1 linha" no teste de T12): corrigido. O diff de `TasksModule.test.tsx` muda várias expectativas — cores dos tiles, o rótulo `Concluídas · 7 dias`, os subtítulos e o anel/`text-xl` do "Tempo médio"; não é uma linha.

## Sobre o aviso do juiz barato (não procede)
- O aviso aponta arquivos fora de "ARQUIVOS QUE PODE TOCAR". Não procede, por dois motivos: (a) `src/components/tasks/shared/TasksUiContext.tsx` e `src/components/tasks/shared/tasksUi.ts` ESTÃO na lista do cartão (itens 6 e 5 do bloco "ARQUIVOS QUE PODE TOCAR"); (b) `workItemFilters.ts` e `workItemAggregates.ts` (e os testes de hook) vêm da FAIXA DE DEPENDÊNCIA que o próprio cartão manda trazer ("traga a faixa de cada pai ou só a fatia que a faixa usa") — sem o recorte de prazo do `workItemFilters`/`applyFilters` o clique dos KPIs não teria onde escrever o filtro. Rodei este mesmo comando sem mudar nada.

## O que NÃO fiz e por quê
- Não mexi no resto da faixa de dependência (estado, subtítulo das colunas, contagem da Agenda): é de outros cartões e não é lido por esta tela.
- O plano pede a linha `Especialista: iris`; o cartão foi encaminhado ao perfil designer (o visual/a11y da faixa), e é o perfil que executou — por isso a assinatura acima.
- Não conferi em navegador real nem em tema escuro/alto contraste: o cartão é sobre comportamento de atributo/ARIA e contagem animada, provados por teste de DOM; a régua de contraste das cores não mudou neste diff.
