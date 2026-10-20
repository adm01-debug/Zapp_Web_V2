Especialista: hugo
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 49s;OK lint 4s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (15/10 21:45, gerados por máquina: valem mais que números escritos à mão)
```
 .../notifications/GoalNotificationProvider.tsx     |   4 +
 src/components/queues/QueuesView.tsx               |  78 +++-
 .../__tests__/QueuesView.metricasRpc.test.tsx      | 131 +++++++
 .../queues/__tests__/QueuesView.test.tsx           |   8 +
 .../__tests__/useQueueGoalAlerts.test.tsx          | 287 ++++++++++++++
 src/hooks/analytics/useQueueGoalAlerts.ts          | 161 ++++++++
 src/hooks/business/useQueueGoals.ts                | 120 ++++++
 .../20261015232316_rpc_queue_goal_metrics.sql      | 177 +++++++++
 supabase/tests/rpc_queue_goal_metrics.sql          | 430 +++++++++++++++++++++
 9 files changed, 1384 insertions(+), 12 deletions(-)
```
- Testes alterados neste cartão (3 arquivo[s]) rodados AGORA no seu commit: Test Files 3 passed (3);Tests 13 passed (13)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261015232316_rpc_queue_goal_metrics.sql, supabase/tests/rpc_queue_goal_metrics.sql; diff grande (68538 caracteres): cartão deveria ser menor; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\bDROP\b, padrão:\bGRANT\b, padrão:\bREVOKE\b


## FAIXA DO PAI
- commit 7070a5ac2 (aplicado aqui como d04842db55) do cartão t_35099565 — a migration + o teste SQL
  da RPC `rpc_queue_goal_metrics()`. NÃO é deste cartão; foi trazido por cherry-pick porque a RPC é
  a fonte de dado que este cartão consome.

## O que mudou e por quê
- src/hooks/business/useQueueGoals.ts: acrescenta as 4 definições de métrica (contatos aguardando,
  espera média, mensagens sem resposta e taxa de atribuição), as faixas 50/75/100 % do limite e as
  faixas INVERTIDAS 25/50/75 % do mínimo da taxa de atribuição, mais o hook `useQueueGoalMetrics()`
  que lê `rpc_queue_goal_metrics()`. `null` = não medido, `0` = dado: `goalMetricPercent` devolve
  `null` para meta zerada (nada de `Infinity %`).
- src/hooks/analytics/useQueueGoalAlerts.ts (novo): a varredura de 5 min que avisa ao CRUZAR cada
  faixa, uma vez por faixa. A faixa já anunciada vai para `sessionStorage` com o dia local na chave
  (`<fila>:<métrica>:<faixa>:<dia>`), então remontar o provider não repete o aviso; o nome do aviso é
  o nome REAL da fila que a RPC devolveu. Som segue `soundEnabled` e o horário silencioso (igual ao
  `useGoalNotifications` já aprovado) e a notificação do navegador segue `browserNotifications`.
  Se a RPC falhar o hook fica MUDO em vez de anunciar número inventado.
- src/components/notifications/GoalNotificationProvider.tsx: monta o hook uma única vez no app.
- src/components/queues/QueuesView.tsx: A CONTA INVENTADA SAI. Antes a taxa de atribuição era
  `membros ativos / (membros ativos + aguardando)` calculada na tela e o alerta de espera olhava
  `queue.waiting_count`; agora as 4 métricas saem da RPC (com `avg_wait_minutes` e
  `messages_pending` que faltavam) e métrica nula não vira alerta.
- Testes: src/hooks/analytics/__tests__/useQueueGoalAlerts.test.tsx (7 casos, hook REAL),
  src/components/queues/__tests__/QueuesView.metricasRpc.test.tsx (a métrica da RPC na tela) e o
  mock de `rpc` no QueuesView.test.tsx existente (as asserções dele ficaram iguais).

## Prova
- vermelho antes (tela ainda no código antigo, `git checkout HEAD -- src/components/queues/QueuesView.tsx`):
  `npx vitest run src/components/queues/__tests__/QueuesView.metricasRpc.test.tsx` →
  `Test Files 1 failed (1); Tests 2 failed (2)` (com `waiting_count` 0 e a RPC respondendo 15
  aguardando, o alerta não aparecia).
- verde depois: `npx vitest run src/hooks/analytics/__tests__/useQueueGoalAlerts.test.tsx
  src/components/queues/__tests__/QueuesView.metricasRpc.test.tsx
  src/components/queues/__tests__/QueuesView.test.tsx` → `Test Files 3 passed (3); Tests 13 passed (13)`
- regressão da área: `npx vitest run src/components/queues src/components/notifications
  src/hooks/analytics src/hooks/__tests__/useQueueGoals.test.tsx` →
  `Test Files 37 passed (37); Tests 221 passed | 3 expected fail | 1 todo (225)`.
- as 4 métricas, as faixas 50/75/100 e as invertidas 25/50/75 estão cobertas por teste que chama o
  hook real com a RPC mockada.

## O que NÃO fiz e por quê
- NÃO trouxe o outro cartão pai (t_36560a6e, commit 3e4131cce, branch de 13/10): a faixa dele está
  divergida da `dia/2026-10-15` (o diff dela contra a base tem 188 arquivos e remoções em massa) e
  ele não toca nenhum arquivo deste cartão. Trazer seria diff alheio enorme, não dependência.
