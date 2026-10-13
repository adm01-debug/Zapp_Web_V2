Especialista: hugo

CONCLUÍ. O painel de diagnóstico mede a latência por sonda leve, pede os totais de tabela inteira como estimados, mostra o erro de cada consulta e só atualiza com a aba visível.

Mudou:
- `src/hooks/system/useDiagnosticsData.ts`: latência por `contacts.select('id', { count: 'estimated' }).limit(1)`; `messages` e `whatsapp_connections` com `count: 'estimated'`; `error` tratado em todas as consultas e na `Promise.all` (no erro o agregado fica nulo, entra o registro `collect-error` em `errorLogs`, e o hook expõe `collectionError` e conta em `errorCount`); `useVisiblePolling(fetchAll, 30_000)` no lugar do `setInterval`; órfãos com `.is('deleted_at', null)` e travadas com `.or('is_deleted.is.null,is_deleted.eq.false')` — os dois alertas condicionais seguem `count: 'exact'`.
- `src/hooks/analytics/useAIStats.ts`: contagens de transcrição com `count: 'estimated'`; `error` tratado e lançado em `conversation_analyses` (as duas janelas), `messages` e `audit_logs`.
- `src/hooks/system/__tests__/useDiagnosticsData.test.ts` e `src/hooks/analytics/__tests__/useAIStats.test.tsx`: os dois `it.fails` que documentavam os defeitos viraram `it`; o mock ganhou `or` e o helper da sonda reconhece `select id limit 1`.

Prova (comandos rodados agora):
- `npx vitest run src/hooks/system/__tests__/useDiagnosticsData.test.ts` → Test Files 1 passed, Tests 36 passed
- `npx vitest run src/hooks/analytics/__tests__/useAIStats.test.tsx -t "transcri"` → Test Files 1 passed, Tests 6 passed
- `npx vitest run src/components/dashboard/__tests__ src/components/diagnostics src/hooks/system src/hooks/analytics src/hooks/__tests__` → Test Files 179 passed, Tests 1528 passed

Critério 1 (sonda leve): o teste exige `select === 'id'`, `limit === 1` e `count === 'estimated'`. Critério 2 (sem COUNT exato de tabela inteira em loop): o teste exige a lista de contagens exatas head sem filtro vazia. Critério 3 (erro visível): RLS em `messages` deixa o agregado nulo e produz o registro `collect-error` com o código 42501. Critério 4 (verificação verde): as três linhas acima.
