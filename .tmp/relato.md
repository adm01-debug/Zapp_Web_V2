Especialista: Hugo (area-front-hooks)

Concluí o que o cartão pede: as etapas 21 (tempo médio da criação à conclusão, com formato pt-BR), 52 (subtítulo de data dos grupos), 112/117 (contagens por tipo no dia da Agenda) e 126 (Agenda só com os itens já carregados, 7 dias, com o teste da virada), e o relatório de lacunas da etapa 8. Tudo em `workItemAggregates.ts` (funções puras) + os testes do próprio módulo; nenhuma consulta nova.

## O que mudou e por quê
- `src/hooks/tasks/workItemAggregates.ts`:
  - `kpis()` passa a devolver `avgLeadTimeDays` (etapa 21/D13): média de `completed_at − created_at` das concluídas dos últimos 7 dias. `avgCycleTimeDays` (started_at → completed_at) continua calculado e no mesmo campo — é o contrato que `TasksKpiStrip.tsx` já lê hoje.
  - `formatLeadTime(days)` nova, pura e exportada: pt-BR com uma casa decimal e vírgula (`1,4 dias`), singular em 1 (`1 dia`) e `—` quando não há dados (null/NaN).
  - `daySubtitle(date)` nova, pura: dia por extenso em pt-BR no fuso local — `Domingo, 11 de outubro`; data inválida devolve `''` em vez de derrubar a tela (etapa 52).
  - `DayGroup` ganhou `subtitle` e `dateKey`, preenchidos por `groupUpcomingByDay` (etapa 52).
  - `agendaDayCounts(day, atrasadas)` e `agendaDayAriaLabel(day, atrasadas)` novas, puras (etapas 112/117): contagens por tipo (`prazos`, `lembretes`, `atrasadas`, `semHora`, `total`) e o texto do `aria-label`. A tarefa com prazo E alarme aparece nas duas seções mas conta UMA vez no `total`. O `agendaDayDots` fica intacto (ver "O que NÃO fiz").
- `src/hooks/tasks/__tests__/workItemAggregates.test.ts`: 4 describes novos (etapas 21, 52, 112/117 e 126) com os casos que provam o comportamento; nenhum teste existente foi alterado.

## Prova
- vermelho antes: `npx vitest run src/hooks/tasks/__tests__/workItemAggregates.test.ts` com `kpis()` na regra antiga (só o tempo de ciclo, sem `avgLeadTimeDays`) → `AssertionError: expected null to be 4` e `Tests 1 failed | 60 passed (61)` — a concluída que nasceu 7 dias antes de terminar e só entrou em "Fazendo" no último dia dava ciclo 1 e lead time 4.
- verde depois: `npx vitest run src/hooks/tasks/__tests__/workItemAggregates.test.ts` → `Test Files 1 passed (1)` / `Tests 61 passed (61)`.
- regressão dos consumidores (hook, telas de tarefas e a aba do Inbox): `npx vitest run src/hooks/tasks src/components/tasks src/components/inbox/tabs` → `Test Files 76 passed (76)` / `Tests 809 passed | 2 todo (811)`.

## Etapa 8 — lacunas de dados do que a UI nova precisa (sem banco novo, sem consulta nova)
- Resumo do dia (`N tarefas com prazo · M lembretes`) e `aria-label` da faixa: NÃO existia contagem por tipo — o `agendaDayDots` só devolvia cores (no máximo 3). Resolvido: `agendaDayCounts`/`agendaDayAriaLabel`.
- Tempo médio decimal: existia só a métrica de ciclo, e nenhum formato pt-BR; o rótulo "Da criação à conclusão" não tinha número correspondente. Resolvido: `avgLeadTimeDays` + `formatLeadTime`.
- Janela de 30 dias: já coberta pela query única B13 (`DONE_WINDOW_DAYS` + `.or('status.neq.done,completed_at.is.null,completed_at.gte.<cutoff>')` em `useMyWorkItems`); os recortes de 7 dias da Agenda são locais (`splitDoneByRecency`/`weekBuckets`). Nada a criar.
- Progresso do limite: os limites estão em `WIP_LIMITS` (hard/soft por status) e a contagem por status em `bucketByStatus` — o dado existe; falta só a apresentação (tela).

## O que NÃO fiz e por quê
- Não mudei a assinatura de `agendaDayDots`. O único consumidor é `src/components/tasks/agenda/TasksAgendaMode.tsx`, que tipa o retorno como `string[]` (cores) e não está nos arquivos deste cartão: trocar o retorno para contagens quebraria a tela agora. As contagens entraram como funções novas que o mesmo componente consome sem mexer no contrato atual.
- Não liguei o rótulo "Da criação à conclusão" ao número novo: quem desenha é `src/components/tasks/shared/TasksKpiStrip.tsx` (linha 68 ainda usa `avgCycleTimeDays` com `Math.round(...)+'d'`), que é tela — `area-front-componentes` (Íris). Deixei o dado pronto (`avgLeadTimeDays` + `formatLeadTime`).
- Lacuna conhecida, documentada no JSDoc de `groupUpcomingByDay`: o rótulo "Semana que vem" reúne mais de um dia no MESMO grupo (comportamento da etapa 49, mantido de propósito); nesse grupo `subtitle`/`dateKey` apontam para o dia mais cedo. Separar por dia dentro dele mudaria o rótulo e os testes da etapa 49.
- Nenhuma consulta nova: tudo aqui é agregação pura sobre os `items` já carregados (B13 preservado).
