Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/tasks/workItemAggregates.ts: adiciona o helper `memoLast` e as versões memorizadas `memoizedApplyFilters`, `memoizedBucketByDue`, `memoizedBucketByStatus` e `memoizedKpis` (etapa 185). Cada uma guarda o ÚLTIMO resultado com a chave = identidade da entrada (a lista de itens; no recorte, também o objeto de filtros). Os selectors puros continuam intactos, com os testes que já existiam.
- src/components/tasks/TasksModule.tsx: troca as quatro chamadas cruas pelas memorizadas; `kpis(hook.items)` e `bucketByStatus(hook.items)` passam a reusar `hook.kpis`/`hook.byStatus`, que o `useMyWorkItems` JÁ memoiza sobre `hook.items` — mesmo valor, sem repetir o cálculo duas vezes por render.
- src/hooks/tasks/__tests__/workItemAggregates.test.ts: testes da etapa 185 (referência estável; a 2ª chamada não relê os itens; lista nova recalcula; a chave inclui os filtros; valor igual ao do selector puro).
- Traz a banda da mãe (t_17bbbc0f, commit 89d1048a4) por `git cherry-pick -x`: ela não estava na ponta da branch do dia.

## Prova
- vermelho antes: teste temporário contra os selectors CRUS (`npx vitest run src/hooks/tasks/__tests__/red-memo-185.test.ts`) → `Test Files 1 failed (1); Tests 1 failed (1)` — `expect(bucketByDue(lista)).toBe(bucketByDue(lista))` falha: cada chamada devolvia referência nova. O arquivo temporário foi removido antes do commit.
- verde depois: `npx vitest run src/hooks/tasks/__tests__/workItemAggregates.test.ts src/components/tasks/__tests__/TasksModule.test.tsx src/components/tasks/__tests__/TasksModule.atalhosDeModo.test.tsx` → `Test Files 3 passed (3); Tests 103 passed (103)`, 0 falhas, 0 pulados.
- B13: os testes de troca de modo (TasksModule e atalhosDeModo) seguem verdes — nenhuma consulta nova ao alternar Lista/Quadro/Agenda.

## O que NÃO fiz e por quê
- Não toquei em TasksListMode.tsx nem TasksAgendaMode.tsx: os selectors de agenda (`groupUpcomingByDay`, `weekBuckets`, `groupAgendaDay`) são chamados DENTRO desses componentes, fora dos arquivos que o cartão cita. A Agenda já se beneficia da referência estável de `items` que o `TasksModule` passa; memoizar a computação interna dela é trabalho desses dois arquivos.
