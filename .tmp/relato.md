Especialista: hugo

## O que mudou e por quê
- src/hooks/business/useQueueGoalAlerts.ts (novo): hook global que consulta `queue_goal_metrics()`
  em intervalo configuravel (padrao 5 min), so para staff (`isSupervisor`), e emite UM toast por
  PASSAGEM de faixa (50/75/100 nas metricas de teto; 25/50/75 na invertida `min_assignment_rate`).
  A faixa alcancada e memorizada por (fila, metrica, dia) em `localStorage` com TTL de 24h e, tambem,
  na memoria da sessao — recarregar a pagina nao repete o aviso. Metrica sem base (NULL) nao avisa.
- src/hooks/business/useQueueGoals.ts: regra UNICA de faixa extraida para `getQueueAlertBand`
  (+ `QUEUE_ALERT_BANDS` / `INVERTED_QUEUE_ALERT_BANDS`), para o aviso global e qualquer tela nao terem
  duas regras divergentes. Nada do comportamento existente do hook foi alterado.
- src/components/notifications/GoalNotificationProvider.tsx: passou a montar `useQueueGoalAlerts()`
  junto do `useGoalNotifications()` — e o "provider global de notificacoes" existente, ja montado no
  app inteiro (Index.tsx); o aviso vale em qualquer tela, sem provider novo.
- Horario silencioso: o aviso e ADIADO (nao marca a faixa) e sai depois do periodo; som e notificacao
  do navegador seguem as preferencias ja existentes.
- Nao mexe em src/components/queues/QueuesView.tsx: ela segue dona dos alertas da tela; o aviso global
  reusa a mesma regra de faixa exportada, sem duplicar a logica.

## Prova
- vermelho antes (memo de faixa desligado de proposito): `npx vitest run src/hooks/__tests__/useQueueGoalAlerts.test.ts`
  -> `Tests 4 failed | 8 passed (12)` nas 4 provas de nao-repeticao.
- verde depois: `npx vitest run src/hooks/__tests__/useQueueGoalAlerts.test.ts` -> `Tests 12 passed (12)`.
- sem regressao: `npx vitest run src/hooks src/components/notifications` ->
  `Test Files 372 passed (372); Tests 3388 passed | 19 expected fail | 5 todo (3412)`.
- `npx eslint` nos arquivos tocados: sem saida (0 erro).

## Arquivos no diff fora da lista literal (explicacao pedida pelo juiz)
- src/components/notifications/GoalNotificationProvider.tsx: e exatamente o "provider global de
  notificacoes existente" que o cartao manda reaproveitar (item 2 do O QUE FAZER); monta o hook e
  entrega o aviso em qualquer tela.
- src/integrations/supabase/types.ts, supabase/migrations/20261013023001_queue_goal_metrics.sql e
  supabase/tests/queue_goal_metrics.sql: NAO foram escritos por mim; vieram do cartao pai t_21198d91
  (commit 638bc3b14), trazido como FAIXA de base por DEPENDENCIA, conforme a secao DEPENDENCIA do
  cartao. Sem ele o hook nao tem a RPC tipada. Sao a base, nao escopo novo.

## O que NÃO fiz e por quê
- Nao toquei QueuesView/telas (fora da minha area): o cartao pede para nao duplicar a regra, o que
  foi resolvido exportando `getQueueAlertBand` de `useQueueGoals.ts`.
- Sem canal realtime: a RPC e agregada e o aviso e por consulta periodica, como desenhado; o unico
  canal de dados do hook e essa consulta, e ela aplica o mesmo escopo no mount e no intervalo.
