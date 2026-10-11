Especialista: hugo

## Pontos da recusa
- Ponto 1: reproduzir a falha do empilhamento em `src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx` — feito. Depois do cherry-pick dos commits de código anteriores, rodei `npx vitest run src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx` e o teste falhou com `TypeError: supabase.from(...).insert(...).select is not a function` em `src/hooks/chat/useConversationActions.ts:211`.
- Ponto 2: corrigir só o que quebrou — feito. Em `src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx`, alinhei o mock `resultChain` ao contrato real usado por `useConversationActions.snoozeConversation`: `insert(...).select('id').single()`. Foi só a adição de `.select` no chain do teste de consumo da Inbox; não mudei a lógica de produção além do trabalho anterior reaproveitado.
- Ponto 3: fechar de novo com a pilha verde — feito. O teste que quebrou ficou verde isolado, os testes relacionados do snooze ficaram verdes juntos e `zapp-verify full .` concluiu verde.

## Pedido original preservado
- `src/hooks/chat/snoozeDurations.ts`: mantém a função pura `snoozeDurationToDate(duration, now)` para `1h`, `3h`, `tomorrow` e `nextweek`; `tomorrow`/`nextweek` zeram minuto, segundo e milissegundo, e `nextweek` usa domingo → +1, segunda → +7, sexta → +3.
- `src/hooks/chat/useConversationActions.ts`: usa a função única para calcular o vencimento; insere a nova linha antes de remover as antigas, preservando o adiamento anterior se a inserção falhar; se a remoção das antigas falhar, apaga a linha nova de volta e mostra erro, sem sucesso otimista.
- `src/hooks/chat/__tests__/snoozeDurations.test.ts`: cobre domingo, segunda, sexta e virada de mês.
- `src/hooks/chat/__tests__/useConversationActions.snooze.test.ts`: cobre erro de gravação visível, preservação do adiamento anterior, remoção de todas as linhas antigas e reversão quando o delete pós-insert falha.
- `src/hooks/chat/__tests__/useConversationActions.test.ts`: mantém o caso `/snooze` sem argumento com aviso `Informe o período: 1h, 3h, amanha ou semana`.

## Prova
- vermelho antes: `npx vitest run src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx` → `FAIL src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx` / `TypeError: supabase.from(...).insert(...).select is not a function` / `Test Files 1 failed (1); Tests 1 failed (1)`.
- verde depois no teste recusado: `npx vitest run src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx` → `Test Files 1 passed (1); Tests 1 passed (1)`.
- verde nos testes relacionados: `npx vitest run src/hooks/chat/__tests__/snoozeDurations.test.ts src/hooks/chat/__tests__/useConversationActions.snooze.test.ts src/hooks/chat/__tests__/useConversationActions.test.ts src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx` → `Test Files 4 passed (4); Tests 30 passed (30)`.
- verificação completa pedida na recusa: `zapp-verify full .` → `OK db_guard`; `OK tipos`; `OK lint`; `OK migrations`; `OK testes`; `OK build`; `VERIFY: VERDE SEM BANCO (1240s)`.
- commit: `cc411640c fix(hooks): refaz adiamento sem quebrar consumo da inbox`.

## Arquivos alterados
- `src/hooks/chat/__tests__/snoozeDurations.test.ts`
- `src/hooks/chat/__tests__/useConversationActions.snooze.test.ts`
- `src/hooks/chat/__tests__/useConversationActions.test.ts`
- `src/hooks/chat/snoozeDurations.ts`
- `src/hooks/chat/useConversationActions.ts`
- `src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx`

## O que NÃO fiz e por quê
- Não mexi em QuickAdd, tarefas, Edge, banco, CI nem manifesto.
- Não troquei o contrato de produção para caber no mock; mantive `insert(...).select('id').single()` e ajustei só o mock do teste que estava defasado.
- `zapp-verify full .` ficou `VERDE SEM BANCO` porque o próprio verificador avisou `banco_local NÃO VERIFICADO: sem nome de conjunto`; este cartão é de hooks/front e não inclui migration ou SQL.
