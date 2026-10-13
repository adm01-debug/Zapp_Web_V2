Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/business/useQueueGoalAlerts.ts (novo): hook global que consulta `queue_goal_metrics()`
  em intervalo configuravel (padrao 5 min), so para staff (`isSupervisor`), e emite UM toast por
  PASSAGEM de faixa (50/75/100 nas metricas de teto; 25/50/75 na invertida `min_assignment_rate`).
  A faixa alcancada e memorizada por (fila, metrica, dia) em `localStorage` com TTL de 24h e,
  tambem, na memoria da sessao — recarregar a pagina nao repete o aviso.
- src/hooks/business/useQueueGoals.ts: regra UNICA de faixa extraida para `getQueueAlertBand`
  (+ `QUEUE_ALERT_BANDS` / `INVERTED_QUEUE_ALERT_BANDS`), para o aviso global e qualquer tela nao
  terem duas regras divergentes. Nada do comportamento existente do hook foi alterado.
- src/components/notifications/GoalNotificationProvider.tsx: passou a montar `useQueueGoalAlerts()`
  junto do `useGoalNotifications()` — o aviso vale em qualquer tela, sem provider novo.
- Respeita horario silencioso: o aviso e ADIADO (nao marca a faixa) e sai depois do periodo; usa
  tambem som/notificacao do navegador conforme as preferencias ja existentes.
- Nao mexe em src/components/queues/QueuesView.tsx: ela segue dona dos alertas da tela; o aviso
  global reusa a mesma regra de faixa exportada.

## Prova
- vermelho antes (memo de faixa desligado de proposito): `npx vitest run src/hooks/__tests__/useQueueGoalAlerts.test.ts`
  -> `Tests 4 failed | 8 passed (12)` nas 4 provas de nao-repeticao.
- verde depois: `npx vitest run src/hooks/__tests__/useQueueGoalAlerts.test.ts` -> `Tests 12 passed (12)`.
- sem regressao: `npx vitest run src/hooks src/components/notifications` ->
  `Test Files 372 passed (372); Tests 3388 passed | 19 expected fail | 5 todo (3412)`.
- `npx eslint` nos 4 arquivos tocados: sem saida (0 erro).

## O que NÃO fiz e por quê
- Nao toquei QueuesView/telas (fora da minha area): o cartao pede para nao duplicar a regra, o que
  foi resolvido exportando `getQueueAlertBand` de `useQueueGoals.ts`.
- Sem canal realtime: a RPC e agregada e o aviso e por amostragem periodica, como desenhado; o
  unico canal de dados do hook e a consulta, e ele aplica o mesmo escopo no mount e no intervalo.
