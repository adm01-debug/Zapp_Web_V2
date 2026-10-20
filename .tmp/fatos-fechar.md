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
