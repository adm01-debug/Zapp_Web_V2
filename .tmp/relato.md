Especialista: senior (area-front-hooks)

## O que mudou e por quê
- src/hooks/chat/useConversationActions.ts: `snoozeConversation` agora guarda TODOS os ids anteriores e apaga com `.delete().in('id', ids)` depois do insert aceito (antes apagava só o primeiro); o insert usa `.select('id').single()` para obter o id da linha nova; se o delete pós-insert falha, a linha nova é apagada de volta (reversão explícita), com toast de erro e sem toast de sucesso nem atualização de estado.
- src/hooks/chat/__tests__/useConversationActions.snooze.test.ts: mock do delete com `.in` e fila de resultados por chamada; teste com 3 linhas anteriores (todas removidas) e teste com falha no delete (reversão + erro visível + sem sucesso); asserção do teste de sucesso atualizada para `.in`.
- src/hooks/chat/__tests__/useConversationActions.test.ts: mock `resultChain` com `.select`/`.in` (só o dublê, nenhuma asserção afrouxada) — o insert com `.select('id')` quebrava 5 testes antigos.
- (trazidos do trabalho anterior via cherry-pick cb8700801) src/hooks/chat/snoozeDurations.ts + snoozeDurations.test.ts: cálculo de `nextweek`/`tomorrow` já aprovado pelo revisor, sem alteração.
- useChatPanelHandlers.ts fora do diff: a base dia/2026-10-11 já avisa no `/snooze` sem argumento (outro cartão); mantive a versão da base no conflito do cherry-pick.

## Pontos do revisor
- Ponto 1 (apagava só a primeira linha antiga): `idsAnteriores` com todos os ids + `.in('id', ids)` em useConversationActions.ts — prova: `várias linhas anteriores: remove TODAS após o insert aceito` (vermelho antes: recebia `[{ id: 'snooze-a' }]` em vez de `[{ 'in:id': ['snooze-a','snooze-b','snooze-c'] }]`; verde depois).
- Ponto 2 (erro do delete descartado): `deleteError` tratado com reversão da linha nova + `toast.error` + `return` antes do sucesso em useConversationActions.ts — prova: `falha no delete pós-insert: reverte a linha nova, avisa erro e não mostra sucesso` (vermelho antes: `writeOrder` era `['insert','delete']`, sem reversão; verde depois: `['insert','delete','delete']`, sem `toast.success`, `isSnoozed` false).
- Ponto 3 (testes com 2+ linhas e com falha no delete): os dois testes acima, em src/hooks/chat/__tests__/useConversationActions.snooze.test.ts.

## Prova
- vermelho antes (testes novos contra o código do cherry-pick, sem a correção): `npx vitest run src/hooks/chat/__tests__/useConversationActions.snooze.test.ts` → `Tests 3 failed | 2 passed (5)`.
- verde depois: `npx vitest run src/hooks/chat/__tests__/useConversationActions.snooze.test.ts src/hooks/chat/__tests__/snoozeDurations.test.ts` → `Test Files 2 passed (2); Tests 13 passed (13)`.
- regressão da pasta: `npx vitest run src/hooks/chat` → `Test Files 32 passed (32); Tests 312 passed | 2 expected fail | 1 todo (315)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (97s)` (sem migration no cartão; tipos, lint e migrations OK).

## Arquivos (git diff --name-only dia/2026-10-11...HEAD)
- src/hooks/chat/__tests__/snoozeDurations.test.ts
- src/hooks/chat/__tests__/useConversationActions.snooze.test.ts
- src/hooks/chat/__tests__/useConversationActions.test.ts
- src/hooks/chat/snoozeDurations.ts
- src/hooks/chat/useConversationActions.ts

## O que NÃO fiz e por quê
- Não mexi em VirtualizedRealtimeList.tsx nem no QuickAdd de tarefas: fora dos 3 pontos da recusa (a recusa aprovou o cálculo e cobrou só a gravação).
- Não alterei useChatPanelHandlers.ts: o aviso do `/snooze` sem argumento já existe na base.
- Não converti o delete+insert em upsert/RPC única: a recusa mandou explicitamente insert-antes + `.in('id', ids)` depois do aceite; segui a prescrição.
