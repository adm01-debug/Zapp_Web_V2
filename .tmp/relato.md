Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/inbox/TransferDialog.tsx`: nova prop `scope?: 'single' | 'bulk'` (padrão `'single'`). O filtro "conversa sem fila → só você mesmo" passou a valer só em `scope='single'`, onde `queueId` é a fila daquela conversa (regra do trigger `trg_prevent_contact_assignee_hijack`). Em `scope='bulk'` a fila muda de conversa para conversa e não existe um `queueId` único, então o seletor oferece os colegas ativos. Entrou também uma nota curta no modo lote com o mesmo `text-xs text-muted-foreground` da nota irmã.
- `src/components/inbox/BulkActionsToolbar.tsx`: o diálogo do lote passou a ser renderizado com `scope="bulk"` (uma linha).
- `src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx`: o mock `useAgents` ganhou um colega ativo ("Colega da Fila") e entrou um `describe` com 2 testes. Nenhum teste existente foi alterado, pulado ou afrouxado.

## Decisão executada (PD-84/PD-85)
A opção **(b) — RPC por contato com resultado por linha** está no código: `bulkTransfer` em `src/hooks/inbox/useInboxBulkActions.ts` chama `supabase.rpc('transfer_conversation')` uma vez por contato, em série, e agrega as falhas. Por isso o diálogo do lote oferece colegas: a régua por conversa é do banco.

## Prova (comandos rodados agora)
- vermelho antes, componente antigo (`git show HEAD~1:...`) mais o teste novo: `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx` → `TestingLibraryElementError: Unable to find an element with the text: Colega da Fila` e `Tests 1 failed | 3 passed (4)`.
- verde depois: `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx` → `Test Files 1 passed (1)`, `Tests 4 passed (4)`, 0 falhas, 0 pulados.
- teste do caminho canônico: `npx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` → `Test Files 1 passed (1)`, `Tests 27 passed | 1 expected fail (28)`, 0 falhas.
- os 2 testes novos: (1) pelo componente REAL (`BulkActionsToolbar` + `TransferDialog`), abre o diálogo, clica no colega e confirma → `onTransfer('agent','colleague-profile',undefined)`; (2) `TransferDialog` com `queueId={null}` mostra "Eu Mesmo" e não mostra o colega.

## Proteção preservada (nada foi afrouxado)
- O trigger `trg_prevent_contact_assignee_hijack` continua sendo a régua e não foi tocado: nenhuma migration, RLS, policy, edge ou guarda neste diff.
- Conversa única (`scope='single'`, o padrão dos consumidores `ChatDialogs.tsx` e `ConversationListSidebar.tsx`, que seguem passando `queueId` sem `scope`): o seletor continua restrito a você mesmo quando a conversa não tem fila — o teste 2 prova isso.
- Lote: cada conversa é validada pela RPC `transfer_conversation`, uma por contato. O diálogo só deixou de esconder os colegas; quem recusa continua sendo o banco, com a mensagem na resposta da RPC.

## Estados da tela alterada
- vazio (nenhum atendente online): a lista do diálogo fica vazia.
- carregando: `isTransferring` desabilita o botão de confirmar.
- erro: `onTransfer` rejeitado mantém o diálogo aberto; o resumo do lote ("X de N transferidos, Y falharam") é o toast do hook, inalterado.

## Fora do meu commit
Os arquivos `src/hooks/inbox/useInboxBulkActions.ts` e `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` aparecem no diff porque este cartão manda clonar o trabalho dos pais por cherry-pick; o conteúdo é do commit do pai t_2901d317. Meu commit é o `70c341def0` (`fix(inbox): lote oferece colegas de verdade no dialogo de transferencia`).
