Especialista: iris

## O que mudou e por quê
- `src/components/dashboard/SLAMetricsDashboard.tsx`: tirei o `?? 100` (o erro de consulta pintava 100% verde) e o painel ganhou 2 estados próprios — erro, com "Não foi possível carregar as métricas de SLA" + botão **Tentar de novo** (invalida a query `sla-metrics`), e sem amostra, com o aviso "Sem dados de SLA no período" e a taxa mostrada como '—'. A sparkline "No Prazo" deixou de ser `totalConversations - totalBreaches` e passou a ser `evaluatedConversations - totalBreaches` (a pendente não é sucesso).
- `src/components/queues/SLAMetricCards.tsx`: com `hasSample=false` a taxa geral e a de 1ª resposta viram '—' com tinta neutra (`text-muted-foreground`/`bg-muted/20`) e o rótulo "Sem dados avaliados no período" ocupa o lugar da barra — acabou o 0.0% vermelho sem amostra.
- `src/components/queues/SLADashboard.tsx`: o bloco `if (!data)`, que era o caminho de ERRO da consulta (o queryFn nunca devolve `null`), virou estado de erro explícito com **Tentar de novo**; a sparkline de 1ª resposta saiu de `100 - breaches/totalConversations` para o denominador `evaluatedConversations` (sem avaliada o dia é 0, não 100).
- `src/components/dashboard/sla/SLASummaryCard.tsx`: nova prop obrigatória `hasSample` — sem amostra a taxa vira '—', a barra zera e "Respostas no Prazo"/"Respostas com Violação" viram '—'.
- `src/components/sla/SLAHistoryDashboard.tsx`: erro de consulta ("Não foi possível carregar o histórico de SLA" + Tentar de novo, invalida `sla-history`) separado de "Sem dados de SLA no período" (`!totals.hasSample`), que substitui o resumo e os gráficos; o seletor de período continua visível.
- Cores: só as que o sistema já tem (`text-success`/`text-warning`/`text-destructive` e `text-muted-foreground`); nenhuma cor nova.
- Testes: 4 arquivos novos e 3 harness existentes ajustados (provider do react-query porque os componentes passaram a usar `useQueryClient`; nenhuma asserção foi alterada).

## Prova
- vermelho antes: `npx vitest run <os 5 arquivos de teste novos>`, com as 5 telas no estado da BASE (`git show HEAD:<arquivo>` restaurado) → `Test Files 5 failed (5); Tests 16 failed | 6 passed (22)` — as 6 que passam são os casos "com dados/com amostra", que valem nos dois códigos; todas as de "sem dados", erro e denominador caem.
- verde depois: mesmo comando → `Test Files 5 passed (5); Tests 22 passed (22)`.
- espinha dorsal (vizinhos das telas tocadas): `npx vitest run src/components/queues src/components/dashboard src/components/sla src/pages/__tests__/SLADashboard.sidebar-navegacao.test.tsx src/pages/__tests__/QueuesComparisonSLA.landmarks.test.tsx` → `Test Files 49 passed (49); Tests 193 passed (193)`.
- verificação do cartão: `zapp-verify . --rapido` → `OK tipos / OK lint / OK migrations / VERIFY: VERDE SEM BANCO (40s)`.
- a prova do denominador não usa mock de resposta: renderiza o dashboard REAL e lê o `polyline`/`path` que o componente pintou (1ª resposta e taxa geral saem com a mesma geometria; com o denominador antigo a linha de "No Prazo" fica reta, porque os dois dias dariam 5).

## O que NÃO fiz e por quê
- não produzi captura (screenshot) claro/escuro: os ARQUIVOS QUE PODE TOCAR são os 5 componentes + testes e não existe projeto Playwright de visual que renderize as telas de SLA; os 3 estados × 2 temas são provados na saída renderizada (classe `dark` no `documentElement` nos testes). A cor não muda de valor: herda os tokens `--success`/`--warning`/`--destructive` (`src/styles/tokens.css:145-147` e `:460-468`; `tailwind.config.ts:65-93`).
- não toquei em `src/hooks/sla/**` (área do worker de hooks): o hook não expõe `error` nem `refetch`, então o erro é lido como `data === null && !loading` — seguro porque o `queryFn` sempre devolve objeto — e o "Tentar de novo" invalida a query pelo `useQueryClient`. Expor `error`/`refetch` no hook fica para o worker de hooks.
- nenhum arquivo foi renomeado e nenhum teste existente foi pulado ou afrouxado.
