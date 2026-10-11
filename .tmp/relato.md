Especialista: designer (design-system-zapp)

## O que mudou e por quê
Cartão é do recorte visual da barra de filtros (etapas 032–039). A entrega anterior foi recusada só por TAMANHO (diff de 123950 caracteres > teto de 90000 do revisor). O corpus não é deste cartão: o cherry-pick da faixa trouxe o trabalho de VÁRIOS cartões irmãos (primitivos T11, workItemFormat/Presets T04, o tipo do contato T05 e o cabeçalho) mais os testes deles, e um relato herdado grande.

- `chore(tarefas): tira da faixa o que nao e do cartao da barra de filtros` — tirei do commit o que não é deste cartão:
  - arquivos ÓRFÃOS (sem nenhum importador em `src`): `TaskCheckbox.tsx`, `PriorityPill.tsx`, `StatusPill.tsx`, `DateLabel.tsx`, `ContactAvatar.tsx`, `workItemFormat.ts`, `workItemPresets.ts`, `TasksUiContext.tsx`, `tasksUi.ts` — são o scaffold de outros cartões (T04/T11); nenhuma superfície deste cartão os importa.
  - o CABEÇALHO, que é outro cartão: `TasksHeaderMenu.tsx`, `cabecalhoNovaTarefa.test.tsx`; devolvi `TasksModule.tsx` ao original (só mantenho a barra: `mode`, `onStatus`, `onDue`) e devolvi os trechos de cabeçalho em `TasksModule.test.tsx` (subtítulo "Seu espaço de execução", atalho N≈modal).
  - o TIPO DO CONTATO (outro cartão, T05): devolvi `useMyWorkItems.ts` e `useMyWorkItems.test.tsx` ao original.
  - testes herdados de outros cartões devolvidos/removidos: `QuickAdd.test.tsx`, `cardAcoes.test.tsx`, `workItemColumns.test.tsx`.
- Mantive só o que a barra usa de verdade: `ModeSwitcher.tsx`, `TasksFilterBar.tsx`, `ContactCombobox.tsx`, `TasksModule.tsx` (a barra), `useTasksFilters.ts`, `workItemFilters.ts`, `workItem.types.ts`, `workItemAggregates.ts` e o teste próprio `__tests__/barraFiltros.test.tsx` (+ ajustes em `TasksModule.test.tsx` e `taskComponents.test.tsx`).

## Prova
- "vermelho" (entrega anterior, diff grande demais): revisor media `123950` caracteres > teto `90000`.
- "verde depois" (mesma conta do revisor sobre o HEAD deste cartão): `75746` caracteres ≤ `90000`.
- tipo: `bun run typecheck` → `$ tsc -b --force` sem erro.
- testes da barra e dos hooks do recorte: `npx vitest run src/components/tasks/__tests__/barraFiltros.test.tsx src/components/tasks/__tests__/TasksModule.test.tsx src/components/tasks/__tests__/taskComponents.test.tsx src/hooks/tasks/__tests__/workItemFilters.test.ts src/hooks/tasks/__tests__/useTasksFilters.test.tsx src/hooks/tasks/__tests__/workItemAggregates.test.ts` → `Test Files  6 passed (6); Tests  145 passed (145)`.
- gate do projeto: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (tipos, lint, db_guard, migrations OK).

## Pontos do revisor (só em [refazer])
- Ponto 1 (diff grande demais — "divida em cartões menores ou remova arquivos irrelevantes"): removi do commit os arquivos de outros cartões e os órfãos (sem importador); a entrega agora são só os arquivos da barra e o teste próprio. Revisor: 123950 → 75746 (≤ 90000). Não criei cartões novos porque a fatia visual da barra é uma só e é a do título; o que sobrava era trabalho de irmãos já entregues em cartão próprio.

## O que NÃO fiz e por quê
- Não mexi em `src/components/ui/*` nem em token/tema: o cartão é da barra e usa os controles `ui/` como estão.
- Não reimplementei nada: reaproveitei `ContactCombobox`, `ModeSwitcher`, `workItemFilters`/`workItemAggregates` e os `ui/*` existentes.
- Não decidi cor/tom novo: não houve necessidade visual sem critério escrito.

## Arquivos de hooks no diff (aviso do juiz barato)
O juiz apontou `useTasksFilters.ts`, `workItemFilters.ts`, `workItem.types.ts`, `workItemAggregates.ts` e os testes de hooks como fora de "ARQUIVOS QUE PODE TOCAR". Não procede como achado de fora do escopo: são a API de filtros que a BARRA consome (o cartão pede o popover de estado/prazo e o contato) — `setStatus`/`setDue`, `SEM_CONTATO`/`DueFilter`, `TasksFilters` e `KANBAN_COLUMNS`. Sem eles a barra não compila nem cumpre as etapas 036/038. Eles vêm da faixa de dependência (cartão irmão do estado/prazo), não são correção de outro assunto; por isso seguem no diff.
