Especialista: senior (area-front-hooks)

Ponto 1 — remover o diff alheio do refazer anterior
O que mudei: não trouxe os commits/relatos do refazer 1; cherry-pickei só a fatia de código e reescrevi o hook para manter apenas o que serve ao pedido original. Em `src/hooks/tasks/workItemAggregates.ts` ficaram só `avgLeadTimeDays` e `formatLeadTime`; não há `daySubtitle`, `agendaDayCounts`, `subtitle` em grupos de dia nem import de `date-fns` nesse arquivo.
Teste/prova: `search_files` em `src/hooks/tasks/workItemAggregates.ts` por `daySubtitle|agendaDayCounts|subtitle:|format\(` retornou `total_count: 0`. `git log --oneline dia/2026-10-11..HEAD` mostra só `be8806e72 fix(tarefas): refaz KPIs da faixa de tarefas`.

Ponto 2 — cumprir o pedido original da faixa de KPIs (rótulos, subtítulos, anel de limite e tempo médio correto)
O que mudei: `src/components/tasks/shared/TasksKpiStrip.tsx` agora renderiza os 5 cards com os textos pedidos: `Atrasadas`, `Para hoje`, `Fazendo`, `Concluídas · 7 dias`, `Tempo médio`; subtítulos dinâmicos (`Requer atenção`/`Tudo em dia`, `Vencem hoje`/`Nada vence hoje`, `Em andamento`/`Limite atingido`, `Últimos 7 dias`, `Da criação à conclusão`); anel SVG estático no card Fazendo; e o Tempo médio usa `avgLeadTimeDays`, não `avgCycleTimeDays`.
Teste/prova vermelho: na base `dia/2026-10-11`, com os testes novos aplicados sem a correção, `bunx vitest run src/components/tasks/__tests__/kpiStripTarefas.test.tsx src/hooks/tasks/__tests__/workItemAggregates.test.ts` falhou com `Test Files 2 failed`, `13 failed`; exemplos: subtítulo `Requer atenção` recebido como `<sem elemento>`, `avgLeadTimeDays` recebido como `undefined` e `formatLeadTime is not a function`.
Teste/prova verde: no commit final, `bunx vitest run src/components/tasks/__tests__/kpiStripTarefas.test.tsx src/hooks/tasks/__tests__/workItemAggregates.test.ts` passou com `Test Files 2 passed (2)` e `Tests 62 passed (62)`.

Ponto 3 — manter os chamadores e a tipagem sem regressão
O que mudei: `src/components/inbox/tabs/__tests__/TasksTab.test.tsx` recebeu `avgLeadTimeDays: null` no mock tipado de `KpiSnapshot`; `src/components/tasks/__tests__/TasksModule.test.tsx` foi atualizado para a faixa nova, sem remover teste existente nem pular asserção. Os três arquivos que o juiz marcou fora da lista restrita são indispensáveis ao pedido original: `workItemAggregates.ts` é onde o dado do T03 nasce (`created_at` → `completed_at`), `workItemAggregates.test.ts` prova esse cálculo real, e `TasksTab.test.tsx` mantém tipado um chamador real da interface alterada. Não mexi em banco, Edge, CI, manifesto, exportação/importação nem edição em massa.
Teste/prova verde: `bunx vitest run src/components/tasks/__tests__/TasksModule.test.tsx src/components/inbox/tabs/__tests__/TasksTab.test.tsx` passou com `Test Files 2 passed (2)` e `Tests 44 passed (44)`. `bun run typecheck` executou `tsc -b --force` com exit 0.

Arquivos alterados (`git diff --name-only dia/2026-10-11...HEAD`):
src/components/inbox/tabs/__tests__/TasksTab.test.tsx
src/components/tasks/__tests__/TasksModule.test.tsx
src/components/tasks/__tests__/kpiStripTarefas.test.tsx
src/components/tasks/shared/TasksKpiStrip.tsx
src/hooks/tasks/__tests__/workItemAggregates.test.ts
src/hooks/tasks/workItemAggregates.ts

Verificações executadas:
- `git diff --check dia/2026-10-11...HEAD`: exit 0, sem saída.
- `bunx vitest run src/components/tasks/__tests__/kpiStripTarefas.test.tsx src/hooks/tasks/__tests__/workItemAggregates.test.ts`: verde, 2 arquivos e 62 testes passando.
- `bunx vitest run src/components/tasks/__tests__/TasksModule.test.tsx src/components/inbox/tabs/__tests__/TasksTab.test.tsx`: verde, 2 arquivos e 44 testes passando.
- `bun run typecheck`: verde, `tsc -b --force` com exit 0.
- `zapp-verify . --rapido`: exit 0 — `OK db_guard 0s`, `OK tipos 108s`, `OK lint 3s`, `OK migrations 0s`; este refazer é front/hook e não inclui migration.

Autorrevisão de escopo:
- O diff tem 6 arquivos e 1 commit sobre a base do dia.
- Nenhum arquivo de guarda, manifesto, workflow, migration ou Edge Function foi alterado.
- O único arquivo fora de `tasks/` é um teste de chamador (`TasksTab.test.tsx`) ajustado para o novo campo obrigatório da interface.
- Não há escrita em banco/rede nem tratamento de erro novo neste diff.
