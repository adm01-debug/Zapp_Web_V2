Especialista: senior (area-front-hooks)

Concluído: corrigi os pontos da recusa adicionando prova de horário de verão real, UTC-3 e virada de dia nos testes de datas/presets de Tarefas.

## Pontos da recusa

Ponto 1: `src/hooks/tasks/__tests__/workItemFormat.test.ts` precisava provar calendário local em horário de verão/UTC-3.
O que mudei: adicionei `withTimeZone('America/Sao_Paulo')` com 04/11/2018 (dia de 23h) e 17/02/2019 (dia de 25h), um ISO em Z que cai no dia local anterior em UTC-3 e o nome do caso de hora separada explicitando ausência versus horário escolhido.
Prova vermelha: com mutação local temporária trocando a regra por janela de 24h, o teste `formatWorkItemDay atravessa horário de verão real em America/Sao_Paulo por calendário local` falhou com `Expected: "Amanhã, 01:05" / Received: "Hoje, 01:05"`.
Prova verde final: `bunx vitest run src/hooks/tasks/__tests__/workItemFormat.test.ts src/hooks/tasks/__tests__/workItemPresets.test.ts` -> `Test Files 2 passed (2)` e `Tests 31 passed (31)`.

Ponto 2: `src/hooks/tasks/__tests__/workItemPresets.test.ts` precisava provar presets por dia civil em DST/virada.
O que mudei: adicionei casos para `duePresetDate('tomorrow')` em 04/11/2018 às 23:59, `duePresetDate('nextWeek')` em 17/02/2019 às 23:59, `remindPresetDate('tomorrow9')` reaproveitando `tomorrowAtNine` e `nextMondayAtNine` mantendo 09:00 local ao atravessar a mudança de fuso.
Prova vermelha: com mutação local temporária trocando `setDate` por `+86_400_000`, os testes `presets de prazo atravessam horário de verão real em America/Sao_Paulo por dia de calendário` e `"amanhã 9h" e "próxima segunda 9h" atravessam DST real...` falharam com `Expected: 4 / Received: 5`.
Prova verde final: `bunx vitest run src/hooks/tasks/__tests__/workItemFormat.test.ts src/hooks/tasks/__tests__/workItemPresets.test.ts` -> `Test Files 2 passed (2)` e `Tests 31 passed (31)`.

Ponto 3: escopo do refazer.
O que mudei: o commit contém somente o relato, `workItemFormat.ts`, `workItemPresets.ts` e os dois testes desses módulos. Telas, QuickAdd, banco, Edge, CI, migrations, exportação/importação, edição em massa, deploy, push e dependências ficaram fora do diff.
Verificação: `git diff --stat 972ab38ad985b846ae663d2f8af774e5402c418c...HEAD` lista apenas os 5 arquivos abaixo; `zapp-verify . --rapido` saiu com código 0 e linhas `OK dependencias`, `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`.

## Arquivos do diff
.tmp/relato.md
src/hooks/tasks/__tests__/workItemFormat.test.ts
src/hooks/tasks/__tests__/workItemPresets.test.ts
src/hooks/tasks/workItemFormat.ts
src/hooks/tasks/workItemPresets.ts

## Verificações executadas
- `bun test src/hooks/tasks/__tests__/workItemFormat.test.ts src/hooks/tasks/__tests__/workItemPresets.test.ts` com mutação local temporária -> `26 pass`, `5 fail`, `73 expect() calls`, `Ran 31 tests across 2 files`.
- `bunx vitest run src/hooks/tasks/__tests__/workItemFormat.test.ts src/hooks/tasks/__tests__/workItemPresets.test.ts` -> `Test Files 2 passed (2)` e `Tests 31 passed (31)`.
- `zapp-verify . --rapido` -> `OK dependencias`, `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, exit 0.
