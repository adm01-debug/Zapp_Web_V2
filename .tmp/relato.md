Especialista: complexo (faixa front+hooks de Tarefas; código pelo Claude Code, conferido por mim)

## O que mudou e por quê
- `src/components/tasks/shared/TasksKpiStrip.tsx`: faixa 017-022 na base do dia (5 cards clicáveis, subtítulos com prazo explorável, anel no limite do Fazendo, contagem animada com `motion-safe` e `prefers-reduced-motion`, compacta em uma linha com rolagem no Quadro, sem palavra solta no pulso, sem `aria-pressed` no Fazendo que só navega) + rótulo da etapa 020 (`Concluídas · 7 dias`).
- `src/components/tasks/TasksModule.tsx`: clique em Atrasadas/Para hoje filtra a lista (caso 3, 023-026; clicar de novo remove); KPIs calculados antes do recorte para um card não zerar os outros; densidade acompanha o modo.
- `src/hooks/tasks/workItemAggregates.ts`: `avgLeadTimeDays` (criação→conclusão) + `formatLeadTime` em pt-BR + `applyDueRecorte` com os mesmos baldes do KPI.
- `src/hooks/tasks/workItem.types.ts`: tipo `DueRecorte`.
- `src/hooks/tasks/useTasksFilters.ts`: estado `due`/`setDue` (só tela, fora da URL); `Limpar` zera junto.
- `src/components/tasks/__tests__/TasksModule.test.tsx`: 2 asserções atualizadas para o rótulo novo da etapa 020 (espelha o commit aprovado f36f5bd6a; nenhum teste novo — são dos cartões 029/030/046/047).

## Prova
- verde depois: `npx vitest run TasksModule.test.tsx useTasksFilters.test.tsx workItemAggregates.test.ts workItemFilters.test.ts` → `Test Files 4 passed (4); Tests 101 passed (101)` (log `.tmp/vitest-final.log`); antes, na primeira execução a frio, 1 falha transiente no teste `pinta os tiles` (rótulo não achado) que passou isolado e em todas as reexecuções seguintes sem mudar código.
- verde depois: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (174s)` (sem banco porque o cartão não tem migration; log `.tmp/zapp-verify2.log`). A primeira tentativa ficou vermelha em `tipos` só porque o workspace estava sem dependências; `bun install` resolveu.
- O diff tem SÓ esta faixa (6 arquivos acima, commit 8b41d97b0).

## O que NÃO fiz e por quê
- Não escrevi teste novo (é dos cartões 029/030/046/047) e não mexi em outra área, produção, push/merge/deploy.
- Não manipulei `.v2-fila` à mão (é do operador/integrador via fechar).
- Cobri 017-028 inteira na base do dia, incluindo o caso 3 que faltava: nada ficou de fora para reagendar.
