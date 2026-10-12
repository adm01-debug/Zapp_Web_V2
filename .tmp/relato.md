Especialista: hugo

## O que mudou e por quê
- src/hooks/analytics/useGoalsDashboard.ts: as três leituras de meta agora CONTAM no banco (`select('id', { count: 'exact', head: true })` → `count`) em vez de baixar as linhas inteiras de `messages`/`contacts`/`conversation_analyses` e filtrar/contar no browser. O filtro `sender = 'agent'` foi para o banco (`.eq('sender','agent')`) e as análises viraram duas contagens (total e `status = 'resolvido'`), eliminando o `Array.prototype.filter` sobre array de linhas. O `profiles` passou de `.single()` para `.maybeSingle()`.
- src/hooks/analytics/__tests__/useGoalsDashboard.contagem.test.tsx (novo): stub que REGISTRA o select de cada tabela e responde só `{ count }`, sem devolver linha nenhuma; prova que as quatro leituras de meta usam `count: 'exact'` + `head: true`, que o recorte do banco inclui `agent_id` do perfil e `sender = agent`, e que o `current` de cada meta sai do `count`.
- src/hooks/analytics/__tests__/useGoalsDashboard.test.tsx: mock ESTENDIDO para registrar o select e responder `{ count }` em modo `head`, mais `maybeSingle` — nenhum caso existente foi removido ou afrouxado.
- src/components/dashboard/GoalsConfigDialog.tsx: leitura de `profiles` de `.single()` para `.maybeSingle()` (sem perfil, não estoura).
- src/components/dashboard/__tests__/GoalsConfigDialog.test.tsx: mock ganha `maybeSingle`, mantendo os casos existentes.

## Prova
- vermelho antes: `npx vitest run src/hooks/analytics/__tests__/useGoalsDashboard.contagem.test.tsx` → `Test Files 1 failed (1) | Tests 3 failed (3)` (o hook ainda baixava linhas; sem `head` não há contagem)
- verde depois: `npx vitest run src/hooks/analytics/__tests__/useGoalsDashboard.contagem.test.tsx src/hooks/analytics/__tests__/useGoalsDashboard.test.tsx src/components/dashboard/__tests__/GoalsConfigDialog.test.tsx` → `Test Files 3 passed (3) | Tests 43 passed (43)`
- `npx vitest run src/hooks/analytics` → `Test Files 12 passed (12) | Tests 107 passed (107)`
- `npx vitest run src/components/dashboard` → `Test Files 33 passed (33) | Tests 141 passed (141)`

## O que NÃO fiz e por quê
- `DailyGoalsCard.tsx` não foi tocado: a contagem dele resolve no RPC do banco (fora do defeito deste cartão).
- O cartão lista `src/components/dashboard/goals/GoalsConfigDialog.tsx`; confirmei no código atual que o arquivo fica em `src/components/dashboard/GoalsConfigDialog.tsx` (instrução do próprio cartão) — é o arquivo editado.
- Cartão roteado ao perfil worker (geral) para execução; a área/persona de origem do cartão é hugo (hooks, estado e dados no front).
