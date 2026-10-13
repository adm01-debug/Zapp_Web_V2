Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/inbox/TransferDialog.tsx`: nova prop `scope?: 'single' | 'bulk'` (padrão `'single'`). O filtro "conversa sem fila → só você mesmo" passou a valer em `scope='single'`, onde `queueId` é a fila daquela conversa (regra do trigger `trg_prevent_contact_assignee_hijack`). Em `scope='bulk'` a fila muda de conversa para conversa e não existe um `queueId` único, então o seletor oferece os colegas ativos. Entrou também uma nota curta no modo lote com o mesmo `text-xs text-muted-foreground` da nota irmã.
- `src/components/inbox/BulkActionsToolbar.tsx`: o diálogo do lote passou a ser renderizado com `scope="bulk"` (uma linha).
- `src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx`: o mock `useAgents` ganhou um colega ativo ("Colega da Fila") e entrou um `describe` com 2 testes. Os testes que já existiam continuam como estavam e continuam passando.

## Decisão executada (PD-84/PD-85)
A opção **(b) — RPC por contato com resultado por linha** está no código: `bulkTransfer` em `src/hooks/inbox/useInboxBulkActions.ts` chama `supabase.rpc('transfer_conversation')` uma vez por contato, em série, e agrega o resultado de cada linha. É por isso que o diálogo do lote oferece colegas: a régua por conversa é do banco.

## Prova (comandos rodados agora, nesta máquina)
- verde depois: `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx` → `Test Files 1 passed (1)`, `Tests 4 passed (4)`, 0 falhas, 0 pulados.
- caminho canônico: `npx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` → `Test Files 1 passed (1)`, `Tests 27 passed | 1 expected fail (28)`, 0 falhas.
- vermelho antes (componente de `HEAD~1` com o teste novo): o clique em "Colega da Fila" interrompe com `TestingLibraryElementError: Unable to find an element with the text: Colega da Fila` e o resumo da execução é `Tests 1 failed | 3 passed (4)`; com o componente corrigido, o mesmo comando fecha em `Tests 4 passed (4)`.
- os 2 testes novos provam: (1) pelo componente REAL (`BulkActionsToolbar` + `TransferDialog`), o diálogo do lote lista o colega e a confirmação chama `onTransfer('agent','colleague-profile',undefined)`; (2) `TransferDialog` com `queueId={null}` lista "Eu Mesmo" e mantém o colega fora da lista.

## Proteção preservada (nada foi afrouxado)
- O trigger `trg_prevent_contact_assignee_hijack` continua sendo a régua e segue intacto: este diff tem zero migration, RLS, policy, edge ou guarda.
- Conversa única (`scope='single'`, que é o padrão dos consumidores `ChatDialogs.tsx` e `ConversationListSidebar.tsx` — ambos seguem passando `queueId` e sem `scope`): o seletor continua restrito a você mesmo quando a conversa não tem fila; é o que o teste 2 prova.
- Lote: cada conversa é validada pela RPC `transfer_conversation`, uma por contato. O diálogo só deixou de esconder os colegas; quem decide continua sendo o banco, linha a linha, com a mensagem na resposta da RPC.

## Estados da tela alterada
- vazio (nenhum atendente online): a lista do diálogo fica vazia.
- carregando: `isTransferring` desabilita o botão de confirmar.
- erro: `onTransfer` rejeitado mantém o diálogo aberto; o resumo do lote ("X de N transferidos, Y falharam") é o toast do hook, que segue o mesmo.

## Origem dos arquivos que o cartão não lista
`src/hooks/inbox/useInboxBulkActions.ts` e `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` aparecem no diff porque o cherry-pick do trabalho dos pais era indispensável aqui — este cartão manda clonar esse trabalho. Os dois vêm do commit do pai t_2901d317 (`git log --oneline` deste branch). Meu commit é o `70c341def0` (`fix(inbox): lote oferece colegas de verdade no dialogo de transferencia`).
