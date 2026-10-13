Especialista: iris

## O que mudou e por quê
- src/components/tasks/__tests__/newTaskDialog.test.tsx: removido o `import '@/test/mocks/tarefas'` e registrada em comentário a razão — o teste NÃO usa aquele harness (o modal não toca Supabase/useAuth; o único serviço externo, `useContactsSearch`, já é trocado localmente no próprio arquivo). Esse import criava uma dependência ENTRE cartões: empilhado sem `src/test/mocks/tarefas.ts`, o import falhava na resolução e derrubava o arquivo inteiro antes de qualquer asserção.

## Ponto do revisor ([refazer 2])
- Ponto 1 (quebra os TESTES no empilhamento, `newTaskDialog.test.tsx`): causa raiz é o import do harness compartilhado, não as asserções. Reproduzi sem tocar no comportamento: com o harness AUSENTE, a versão antiga dava `Test Files 1 failed (1); Tests no tests` (falha de load, exatamente o formato do erro do limpador — só o caminho do arquivo, sem asserção); a versão corrigida, com o harness AUSENTE também, dá `Test Files 1 passed (1); Tests 7 passed (7)`. Nenhuma asserção foi afrouxada ou removida: o diff é só o import e o comentário.

## Prova
- vermelho antes: `mv src/test/mocks/tarefas.ts fora && npx vitest run src/components/tasks/__tests__/newTaskDialog.test.tsx` (versão antiga) → `Test Files 1 failed (1); Tests no tests`
- verde depois: mesmo comando com o harness ausente (versão corrigida) → `Test Files 1 passed (1); Tests 7 passed (7)`
- verde depois (árvore normal, harness restaurado): `npx vitest run src/components/tasks/__tests__/newTaskDialog.test.tsx` → `Test Files 1 passed (1); Tests 7 passed (7)`
- suíte das tarefas: `npx vitest run src/components/tasks` → `Test Files 29 passed (29); Tests 329 passed | 1 todo (330)`
- verificação do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (60s)` (db_guard, tipos, lint, migrations OK)

## O que NÃO fiz e por quê
- Não mexi no componente nem em asserção: o defeito era a dependência entre cartões no teste; o comportamento provado (7 casos) está intacto.
- Fora do meu escopo, só registro: a suíte COMPLETA (`zapp-verify full .`) fecha VERMELHO na base atual por UM arquivo alheio a este cartão — `src/components/inbox/__tests__/RealtimeInboxView.selectedMessagesError.test.tsx` estoura um erro não tratado do undici (`ERR_INVALID_ARG_TYPE` em WebSocket.dispatchEvent) e o vitest sai com código 1 mesmo com `3 passed`. Rodei esse arquivo SOZINHO (sem carregar nada de `src/components/tasks/**`) e ele falha igual, de forma determinística — não há caminho causal com este cartão. É de outro especialista (inbox).
