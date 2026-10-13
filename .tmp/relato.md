Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/inbox/TransferDialog.tsx`: nova prop `scope?: 'single' | 'bulk'` (padrão `'single'`). O filtro "sem fila → só você mesmo" (que existe por causa do trigger `trg_prevent_contact_assignee_hijack`) passou a valer só em `scope='single'`, onde `queueId` é a fila daquela conversa. Em `scope='bulk'` a fila muda de conversa para conversa e não há `queueId` único, então o seletor volta a oferecer os colegas ativos; quem valida cada conversa é o caminho canônico `transfer_conversation` (uma RPC por contato), que recusa as conversas sem fila. Também entrou uma nota curta no modo lote explicando essa regra (`text-xs text-muted-foreground`, token já usado pela nota irmã).
- `src/components/inbox/BulkActionsToolbar.tsx`: o diálogo do lote passou a ser renderizado com `scope="bulk"` (uma linha). O diálogo da conversa única não muda: `ChatDialogs.tsx` e `ConversationListSidebar.tsx` seguem passando `queueId` sem `scope` → continuam `'single'`.
- `src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx`: o mock `useAgents` ganhou um colega ativo ("Colega da Fila") e entrou um `describe` novo com 2 testes; o resto do arquivo está igual.

Decisão executada (PD-84/PD-85): encontrei no código da base a opção **(b) — RPC por contato com resultado por linha**: `bulkTransfer` em `src/hooks/inbox/useInboxBulkActions.ts` chama `supabase.rpc('transfer_conversation')` uma vez por contato, em série, e agrega as falhas. Por isso o diálogo do lote oferece colegas: a régua por conversa é do banco, não do seletor.

## Prova
- vermelho antes (componente antigo de `HEAD~1` + teste novo): `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx` → `TestingLibraryElementError: Unable to find an element with the text: Colega da Fila` / `Tests 1 failed | 3 passed (4)`
- verde depois: `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx` → `Test Files 1 passed (1)` / `Tests 4 passed (4)`
- hook do caminho canônico continua verde: `npx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` → `Test Files 1 passed (1)` / `Tests 27 passed | 1 expected fail (28)`

Os 2 testes novos: (1) pelo componente REAL do lote (`BulkActionsToolbar` + `TransferDialog`), abre o diálogo, clica no colega e confirma → `onTransfer('agent','colleague-profile',undefined)`; (2) `TransferDialog` com `queueId={null}` (conversa única) mostra "Eu Mesmo" e NÃO mostra o colega — a regra do trigger continua respeitada no diálogo individual.

## Estados da tela alterada
- vazio (nenhum agente/listado): o diálogo mostra a lista vazia, sem mudança de comportamento.
- carregando: o botão de confirmar fica desabilitado durante a transferência (`isTransferring`), já existia.
- erro: `onTransfer` rejeitado é tratado no diálogo e o diálogo permanece aberto; o resultado do lote (quantas falharam) é o toast do callback canônico no hook, não foi alterado aqui.

## O que NÃO fiz e por quê
- Não mexi no hook `useInboxBulkActions.ts` (fora dos arquivos do cartão): o resultado por linha (contagem de falhas) já vem dele.
- Não escolhi a opção (a): a decisão do PD-84/85 está no código como (b), e o cartão manda seguir a decisão encontrada.
