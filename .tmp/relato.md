Especialista: iris

Concluí o cartão: o diálogo de transferência em lote volta a oferecer os colegas ativos, coerente com a decisão PD-84/85 (opção b) já implementada no caminho canônico.

## O que mudou e por quê
- `src/components/inbox/TransferDialog.tsx`: nova prop `scope?: 'single' | 'bulk'` (padrão `'single'`). O filtro "conversa sem fila → só você mesmo" vale em `scope='single'`, onde `queueId` é a fila daquela conversa (regra do trigger `trg_prevent_contact_assignee_hijack`). Em `scope='bulk'` a fila muda de conversa para conversa e não existe um `queueId` único, então o seletor oferece os colegas ativos; nota curta no modo lote com a mesma classe `text-xs text-muted-foreground` da nota irmã.
- `src/components/inbox/BulkActionsToolbar.tsx`: o diálogo do lote passa a ser renderizado com `scope="bulk"`.
- `src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx`: o mock `useAgents` ganhou um colega ativo ("Colega da Fila") e um `describe` com 2 testes; os testes pré-existentes seguem passando.

## Decisão executada (PD-84/PD-85)
A opção (b) — RPC por contato com resultado por linha — já está no código: `bulkTransfer` em `src/hooks/inbox/useInboxBulkActions.ts` chama `supabase.rpc('transfer_conversation')` uma vez por contato, em série, e agrega o resultado de cada linha. A régua de cada conversa é do banco.

## Prova (comandos rodados agora, nesta máquina)
- verde depois: `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` → `Test Files 2 passed (2)`; `Tests 31 passed | 1 expected fail (32)`; 0 falhas.
- verificação do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (150s)`; `OK tipos 145s`, `OK lint 5s`, `OK db_guard 0s`, `OK migrations 0s`.
- vermelho antes: com o `TransferDialog` de HEAD~1 e o mesmo teste, o clique em "Colega da Fila" levanta `TestingLibraryElementError: Unable to find an element with the text: Colega da Fila` (resumo `Tests 1 failed | 3 passed (4)`); com o componente corrigido o mesmo comando fecha em `Tests 4 passed (4)`.
- Teste 1 (componente REAL `BulkActionsToolbar` + `TransferDialog`): o diálogo do lote lista o colega e a confirmação chama `onTransfer('agent','colleague-profile',undefined)`.
- Teste 2 (`TransferDialog` com `queueId={null}`): lista "Eu Mesmo" e mantém "Colega da Fila" fora da lista.

## Régua do banco intacta
- Diff sem migration, RLS, policy, edge ou guarda; o trigger `trg_prevent_contact_assignee_hijack` segue como a régua.
- Conversa única (padrão `scope='single'`; consumidores `ChatDialogs.tsx` e `ConversationListSidebar.tsx` passam `queueId` e usam o padrão): segue restrita a você mesmo quando a conversa não tem fila — é o que o Teste 2 prova.
- Lote: cada conversa é validada pela RPC `transfer_conversation`, uma por contato; o diálogo só deixou de esconder os colegas.

## FAIXA DO PAI (trazida pela seção DEPENDÊNCIA do cartão): commits 4abb7b5b29 (cartão t_2901d317) e 5fcaba8a4b (cartão t_8016679b)
`src/hooks/inbox/useInboxBulkActions.ts` e `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` (4abb7b5b29) e parte de `src/components/inbox/BulkActionsToolbar.tsx` com o seu teste (5fcaba8a4b) vêm desses cartões pai, conforme a seção DEPENDÊNCIA. O commit deste cartão é o 70c341def0 (`fix(inbox): lote oferece colegas de verdade no dialogo de transferencia`).
