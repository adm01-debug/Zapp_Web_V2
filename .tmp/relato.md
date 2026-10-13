Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/tasks/agenda/TasksAgendaMode.tsx — faixa de 7 dias com sigla (DOM…SÁB), número e pílula "Hoje"; título "Próximos 7 dias" com o intervalo e a nota; pontos por TIPO com legenda; navegação ←/→ levando o foco; rótulo acessível com as contagens ("2 lembretes, 1 prazo"); bloco "N tarefa(s) atrasada(s)" com "Ver tarefas" e um só chevron; foco visível e ícones `aria-hidden`.
- src/hooks/tasks/workItemAggregates.ts — `agendaDayDots` monta os pontos por TIPO na ordem da legenda: lembrete (`bg-primary`, azul), prazo (`bg-warning`, âmbar), atrasada (`bg-destructive`, vermelho).
- src/components/tasks/__tests__/TasksAgendaFaixa.test.tsx (novo) — prova a faixa no componente REAL (`TasksAgendaMode`), sem mock do alvo.
- src/components/tasks/__tests__/TasksAgendaMode.test.tsx e agendaGroups.test.tsx — ajustados ao novo cabeçalho e à ordem dos pontos (mesmo componente/módulo).
- src/hooks/tasks/__tests__/workItemAggregates.test.ts — trava a ordem dos pontos por tipo.

## Pontos do revisor
- Ponto 1 (relato errado, código certo): o cartão do dia é endereçado pela POSIÇÃO na faixa (`selectedDay` = offset desde hoje, `data-offset`), não por `isToday`. O código deste ponto não foi tocado; só o relato é reescrito aqui.
- Ponto 2 (procedente): os pontos misturavam tipos e prioridades. Em `src/hooks/tasks/workItemAggregates.ts` (`agendaDayDots`, agora linhas 169–179) a regra passou a ser azul = lembrete, âmbar = prazo, vermelho = atrasada — plano §3, linhas 75 e 82 (etapa 111). Prova: `workItemAggregates.test.ts` linhas 137–143.
- Ponto 3 (NÃO PROCEDE): o intervalo da semana está certo — plano §3, linha 74 (etapa 109). Prova: `TasksAgendaFaixa.test.tsx` linha 96, `expect(getByTestId('agenda-week-range').textContent).toBe('11 – 17 de outubro de 2026')`. Não mexi no cálculo.

## Etapas × plano §3
- Etapa 108 (plano §3, linha 73): faixa de atrasadas em largura total, vermelho suave, "N tarefas atrasadas" e "Ver tarefas ⌄" que expande a lista.
- Etapa 109 (linha 74): "Próximos 7 dias" com "11 – 17 de outubro de 2026" à direita e a nota "O lembrete avisa você. O prazo marca a entrega."
- Etapa 110 (linha 75): cartões de dia com sigla, número e pílula "Hoje"; selecionado com borda primary; ←/→ navegam.
- Etapa 111 (linhas 75 e 82): azul = lembrete, âmbar = prazo, vermelho = atrasada, com legenda discreta e `aria-label` somando os tipos.

## Destrave do workspace (motivo dos bloqueios anteriores)
- O worktree estava preso no meio de um `rebase` (conflito em .tmp/relato.md, HEAD destacado); nesse estado a guarda recusa todo comando git. Destravei sem contornar guarda: `git checkout 7f9fb11fe -- .tmp/relato.md` (resolver o índice) + `git checkout <branch>` + `git rebase --abort`.
- Refiz o rebase só dos commits de CÓDIGO sobre a base atual: `git rebase --onto dia/2026-10-13 1f900cfa1b <branch>`. Os commits que só mexiam em .tmp/relato.md foram descartados (conflito modify/delete; .tmp não é deste cartão).
- Resultado: 3 commits (feat 8e4e26ee6d, test 400c939218, fix bdfe5fe005) em cima de dia/2026-10-13.

## Verificação
- vermelho antes (componente da base, via `git checkout dia/2026-10-13 -- src/components/tasks/agenda/TasksAgendaMode.tsx`): `npx vitest run src/components/tasks/__tests__/TasksAgendaFaixa.test.tsx` → `Test Files 1 failed (1); Tests 5 failed | 1 passed (6)`
- verde depois: `npx vitest run src/components/tasks/__tests__/TasksAgendaFaixa.test.tsx src/components/tasks/__tests__/TasksAgendaMode.test.tsx src/components/tasks/__tests__/agendaGroups.test.tsx src/hooks/tasks/__tests__/workItemAggregates.test.ts` → `Test Files 4 passed (4); Tests 86 passed (86)`
- `zapp-verify . --rapido`: db_guard OK; "tipos" VERMELHO por falha de EXECUÇÃO, não de código — `tc-rapido: tsc saiu 137 em app (falha de execução, NÃO é aprovação)`, máquina em 44–47 GB de 47 GB e um `git prune` de outro processo com ~3,5 GB; `tsc -p tsconfig.app.json --noEmit` isolado também saiu 137 (SIGKILL/oom), sem nenhum diagnóstico `error TS`.

## O que NÃO fiz e por quê
- Não toquei em TasksModule.tsx: a faixa e o cabeçalho vivem no modo Agenda.
- Sem migration/Edge Function (plano de front).
- `agendaDayDots` ficou com a ordem por tipo porque foi o pedido do revisor (Ponto 2) e há teste travando a ordem.
