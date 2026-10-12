Especialista: senior (area-front-hooks)

## O que mudou e por quê
- Reapliquei a entrega anterior a partir da branch do commit `f9dbdd125`: o código efetivo veio dos commits de código `41b61467a` e `bb0bf9c4d` da mesma branch, porque `f9dbdd125` só altera o relato da entrega anterior.
- `src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx`: corrigi o mock de Supabase usado pelo teste de empilhamento para expor `.select()` na cadeia de `insert()`, igual ao cliente real que `useConversationActions.snoozeConversation` chama com `.insert(...).select('id').single()`. A asserção do teste não foi removida nem afrouxada: ele continua compondo os hooks reais e exigindo que a conversa saia da lista ao adiar e volte após o prazo.

## Pontos do refazer
- Ponto 1: parti da entrega anterior por `git cherry-pick -n 41b61467a bb0bf9c4d` sobre a ponta atual de `dia/2026-10-11`; o sha pedido `f9dbdd125` foi conferido e é o commit de relato no topo da branch anterior.
- Ponto 2: reproduzi o vermelho sobre a ponta atual com `bun run test src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx` antes da correção → `TypeError: supabase.from(...).insert(...).select is not a function` em `src/hooks/chat/useConversationActions.ts:211`. Corrigi a causa sem afrouxar asserções adicionando a etapa `.select()` ao mock encadeado do teste.
- Ponto 3: provei verde com o mesmo comando e com `zapp-verify . --rapido` verde; novo commit deste refazer: `e39a937d0`.

## Prova
- vermelho antes: `bun run test src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx` → `TypeError: supabase.from(...).insert(...).select is not a function` / `Test Files 1 failed (1)` / `Tests 1 failed (1)`.
- verde depois: `bun run test src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx` → `Test Files 1 passed (1)` / `Tests 1 passed (1)`.
- regressão da entrega anterior preservada: `bun run test src/hooks/chat/__tests__/useConversationActions.snooze.test.ts src/hooks/chat/__tests__/snoozeDurations.test.ts src/hooks/chat/__tests__/useConversationActions.test.ts` → `Test Files 3 passed (3)` / `Tests 29 passed (29)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`.

## Arquivos do diff
.tmp/relato.md
src/hooks/chat/__tests__/snoozeDurations.test.ts
src/hooks/chat/__tests__/useConversationActions.snooze.test.ts
src/hooks/chat/__tests__/useConversationActions.test.ts
src/hooks/chat/snoozeDurations.ts
src/hooks/chat/useConversationActions.ts
src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx

## O que NÃO fiz e por quê
- Não mudei código fora do escopo do snooze nem toquei em migration, Edge Function, CI ou dependência.
- Não removi, pulei nem afrouxei teste: a mudança no teste só faz o mock aceitar o encadeamento real usado pelo código de produção.