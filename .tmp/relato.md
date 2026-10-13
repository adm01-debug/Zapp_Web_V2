Especialista: iris

## O que mudou e por quê
- `src/hooks/chat/useConversationActions.ts`: método `reopenConversation(contactId)` — chama a RPC `reopen_conversation` (migration 20261013210003, do cartão pai), avisa por toast ("Conversa reaberta"; "A conversa já está ativa" quando `reopened=false`) e devolve `{ status, reopened }` para quem chamou levar a lista ao chip certo.
- `src/components/inbox/conversation-list/ConversationReopenDialog.tsx` (novo): confirmação leve (AlertDialog) "Reabrir conversa?" / "Desarquivar conversa?", com nome do contato, botão travado e espera visível enquanto a RPC roda, e motivo do erro dentro do diálogo (não fecha em silêncio). O giro da espera usa `motion-safe:animate-spin` (regra permanente de movimento reduzido).
- `src/components/inbox/conversation-list/reopenChip.ts` (novo): mapa status→chip ('waiting'→Aguardando, resto→Em atendimento) — fonte única para a linha e para o cabeçalho.
- `src/components/inbox/chat/ChatPanelHeader.tsx`: item "Reabrir conversa"/"Desarquivar conversa" no menu de ações, só quando `conversation.contact.conversation_status` é `resolved`/`archived`.
- `src/components/inbox/VirtualizedRealtimeList.tsx`: botão na linha da lista (barra de ações do hover) com `aria-label` e tooltip, só para resolvida/arquivada, usando os MESMOS predicados dos chips (`isResolved`/`isArchived` de `chipCounts`) — a ação e o filtro não divergem.
- `src/components/inbox/ConversationListSidebar.tsx`, `src/components/inbox/ChatPanel.tsx`, `src/components/inbox/RealtimeInboxView.tsx`: fiação do handler (RPC → troca de chip → refetch) para a linha e para o cabeçalho; o painel não faz acesso a dados, o hook é a única porta.

## Prova
- vermelho antes: `npx vitest run src/components/inbox/__tests__/VirtualizedRealtimeList.reabrir.test.tsx src/components/inbox/chat/__tests__/ChatPanelHeader.reabrir.test.tsx src/hooks/chat/__tests__/useConversationActions.reopen.test.ts` sem o commit — os 3 arquivos novos falham (não existem botão, item de menu nem `reopenConversation` na base).
- verde depois: mesmo comando → `Test Files 3 passed (3); Tests 16 passed (16)`
- sem regressão nos vizinhos: `npx vitest run` dos 9 arquivos da Inbox tocados pela mudança (VirtualizedRealtimeList.test.tsx, ChatPanelHeader.test.tsx, coresCruasInboxCrm.test.tsx, menus-r2-inb-021.test.tsx, useConversationActions.test.ts/.snooze, ConversationListSidebar.test.tsx, RealtimeContactUpdateE2E.test.tsx e os 3 novos) → `Test Files 9 passed (9); Tests 94 passed (94)`
- `npx tsc -b --force` → sem nenhuma linha de saída (0 erros); `npx eslint` nos arquivos tocados → nenhum erro e nenhum warning novo (o guard de cores da Inbox, `coresCruasInboxCrm.test.tsx`, lê os hovers de `VirtualizedRealtimeList.tsx` e passou com o botão novo).

## Arquivos fora da lista do cartão (por quê)
O cartão lista `ChatPanelHeader.tsx`, `conversation-list/ConversationItem.tsx` (que NÃO existe na V2) e "testes". O critério "reabre ou desarquiva em um clique" nas DUAS superfícies (menu do cabeçalho e linha da lista) não fecha só com o cabeçalho, e a camada de dados não pode viver em componente (guarda de lint: componente não importa o client do Supabase). Cada arquivo extra e o motivo:
- `VirtualizedRealtimeList.tsx`: é onde a linha da lista da V2 realmente mora (o `ConversationRow`) — o "ConversationItem.tsx" do cartão é o nome do V3.
- `ConversationListSidebar.tsx`: dono do handler da linha (já tem `conversationActions` e `inboxFilters`) — RPC + troca de chip + refetch.
- `ChatPanel.tsx` e `RealtimeInboxView.tsx`: passam o handler até o cabeçalho (o painel já recebe `onArchiveConversation` por esse mesmo caminho); nenhum dos dois faz acesso a dados.
- `useConversationActions.ts`: porta única da RPC `reopen_conversation` (o RPC novo não está em `types.ts`, então usa o idioma já existente no repositório, `(supabase as any).rpc(...)` com aviso de lint pontual).
- `conversation-list/ConversationReopenDialog.tsx` e `conversation-list/reopenChip.ts` (novos): diálogo de confirmação compartilhado pelas duas superfícies e o mapa status→chip (fonte única do "retorno ao filtro certo").

## O que NÃO fiz e por quê
- SQL/migration: nenhum no meu diff. A CONFERÊNCIA automática sobre `supabase/migrations/20261013210003_reabre_conversa_com_nova_mensagem.sql` (gatilho BEFORE UPDATE e `updated_at`) é do cartão PAI (t_0d2e2dec), trazido por DEPENDÊNCIA como o cartão manda; a prova já está no commit pai `66932f000` ("prova updated_at de 1 linha e o bump do caminho canonico") e na suíte `supabase/tests/reabre_conversa_nova_mensagem.sql`.
- Captura de tela: NÃO versionei. Não existe projeto Playwright visual da Inbox com sessão falsa (a regra R1 proíbe `chromium-authenticated` e `e2e/.auth`); os projetos visuais do repositório são contacts/talkx/email/theme, nenhum cobre a Inbox. A parte visual desta entrega são um item de menu e um ícone de hover com tokens já existentes no mesmo arquivo, e o guard que lê os hovers da lista roda verde.
- `src/components/inbox/conversation-list/ConversationItem.tsx` (citado no cartão) NÃO existe na V2 — é o nome do arquivo no V3. A linha da lista da V2 mora em `VirtualizedRealtimeList.tsx`; por isso a ação foi colocada lá, e não criei um arquivo novo com aquele nome.
- `CloseConversationDialog.tsx` também tem "Desarquivar / Reabrir", mas pela RPC genérica `set_conversation_status` (anterior ao `reopen_conversation`); não mexi nele (fora dos arquivos citados) — deixei comentário no cartão.
- Ferramenta do pai: o `git cherry-pick --empty=drop` do cartão não existe no git 2.43 local; trouxe a mesma faixa com `git cherry-pick -x <3 sha>` e nada ficou vazio.

## Conclusão
Concluído: reabrir/desarquivar existe no menu do cabeçalho e na linha da lista, com confirmação leve, estado de espera, toast e retorno ao chip certo; verificação rápida verde no fechar.
