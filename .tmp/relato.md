Especialista: Hugo (area-front-hooks)

## O que mudou e por quê

Arquivar conversa deixava de ser estado e virava "tirar o responsável": o UPDATE em `contacts.assigned_to`.
Agora arquiva pela RPC `set_conversation_status`, a mesma do CloseConversationDialog.

- `src/hooks/chat/useConversationActions.ts:268-287` (novo `setConversationStatus`) e `:289-305` (`archiveContact`): arquiva com `p_next:'archived'` e o Desfazer reabre com `p_next:'open'` pela mesma RPC. `assigned_to` não é mais zerado em lugar nenhum do arquivamento (o `grep assigned_to` no arquivo só devolve o comentário da linha 271). Cada chamada dispara `zapp:contact-status-changed`, o mesmo evento do CloseConversationDialog: `src/hooks/chat/useRealtimeMessages.ts:239-246` aplica o patch em `contact.conversation_status`, que é exatamente o campo que `src/hooks/inbox/chipCounts.ts:75-77` lê para o chip "Arquivadas" — por isso a arquivada aparece no chip sem esperar refetch.
- `src/hooks/chat/useConversationActions.ts:127-141` (fixar), `:143-159` (desafixar), `:161-177` (favoritar), `:179-196` (desfavoritar): falha deixou de ser silenciosa. `if (!profileId) return` e o retorno calado no erro viraram toast de erro + `return`, e o `setPinnedIds`/`setFavoriteIds` só roda depois do sucesso — na falha o item continua como estava.
- `src/hooks/inbox/useInboxBulkActions.ts:49-80` (`bulkMarkAsRead`): ganhou `.eq('sender','contact')` (mesma regra da unitária `RealtimeService.markMessagesAsRead`, `src/services/realtime.service.ts:209-221`) e `.select('contact_id')`. O toast anuncia a contagem REAL de conversas alteradas; zero linha alterada → aviso e nenhum recarregamento da lista inteira.
- `src/hooks/inbox/useInboxBulkActions.ts:82-118` (`bulkTransfer`): o lote deixou de ser UPDATE direto em `contacts` e passa conversa a conversa pela RPC `transfer_conversation` (`p_to_agent_id` ou `p_to_queue_id`, e a nota em `p_note` — antes ignorada), que grava o dono E a trilha da transferência. Conta sucesso e falha de cada conversa; sucesso em todas → contagem real, falha em algumas → "N transferido(s); M falhou(aram)", falha em todas → erro e a seleção fica.
- `src/hooks/inbox/useInboxBulkActions.ts:120-175` (`bulkArchive`): arquiva cada conversa pela RPC e só conta o que a RPC confirmou; o toast mostra a contagem real (inclusive "N de M"); o Desfazer reabre exatamente os contatos arquivados naquela chamada (alvo congelado: mexer na seleção depois não troca o que reverte). Saiu o SELECT prévio de `assigned_to` que existia só para poder restaurar à mão.

## Prova

- vermelho antes (fontes antigas restauradas com `git checkout --`, testes novos no lugar):
  `npx vitest run src/hooks/chat/__tests__/useConversationActions.test.ts src/hooks/inbox/__tests__/useInboxBulkActions.test.ts`
  → `Test Files  2 failed (2)` / `Tests  21 failed | 31 passed (52)`
- verde depois (mesmos arquivos + vizinhança do inbox):
  `npx vitest run src/hooks/chat/__tests__/useConversationActions.test.ts src/hooks/inbox src/components/inbox`
  → `Test Files  223 passed | 2 skipped (225)` / `Tests  1812 passed | 14 todo (1826)`
- verde depois (só os dois arquivos do defeito, para leitura rápida):
  `npx vitest run src/hooks/chat/__tests__/useConversationActions.test.ts src/hooks/inbox/__tests__/useInboxBulkActions.test.ts`
  → `Test Files  2 passed (2)` / `Tests  52 passed (52)`

## CRITÉRIO DE PRONTO

1. "Arquivadas aparecem no chip e ninguém perde o responsável, provado."
   - chip: `src/hooks/inbox/useInboxBulkActions.ts:137-141` (evento no lote) e `src/hooks/chat/useConversationActions.ts:282-286` (evento no individual) → consumidos em `src/hooks/chat/useRealtimeMessages.ts:239-246`, campo lido em `src/hooks/inbox/chipCounts.ts:75-77`. Teste: `src/hooks/chat/__tests__/useConversationActions.test.ts:214` ('anuncia o novo estado no evento que atualiza chip/lista sem esperar refetch', que confere `{contactId:'contact-1', status:'archived'}` e depois `status:'open'` no Desfazer).
   - responsável: `src/hooks/chat/useConversationActions.ts:289-305`. Testes: `src/hooks/chat/__tests__/useConversationActions.test.ts:187` (RPC `set_conversation_status` + `contactsUpdateCalls` vazio + Desfazer reabrindo) e `src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx:164` (o caminho real do botão "Arquivar" do painel de detalhes).
2. `zapp-verify --rapido` verde: rodado pelo próprio `hermes-tarefa-fechar` nesta entrega.

Itens 2, 3 e 4 do corpo do cartão (transferir em lote pela RPC com contagem real; marcar lido com a regra da unitária e contagem real; fixar/favoritar avisando em erro sem mentir no estado visual) estão nos arquivos citados acima, com testes em `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts:350-440` (transferir), `:257-330` (marcar lido) e `:449-566` (arquivar em lote), e `src/hooks/chat/__tests__/useConversationActions.test.ts:488-543` (fixar/favoritar em erro).

## O que NÃO fiz e por quê

- Não toquei em `src/components/inbox/ContactDetails.tsx` — não está na lista de arquivos do cartão. O componente já delega certo (`:76 case 'archive': void archiveContact(contact.id)`), mas o comentário `:69-71` ainda descreve a semântica antiga ("zera assigned_to ... decisão do dono em 06/10, cartão #241"), que é justamente o que este cartão reverte. Registrado em `kanban_comment` do cartão para o cartão de telas corrigir 1 linha.
- Não mexi em `CloseConversationDialog.tsx`: já usava a RPC e o mesmo evento, não precisava.
- `bulkMarkAsRead` continua chamando `refetch()` quando houve linha alterada: o estado das conversas (não lidas em memória) vive no `useRealtimeMessages`, que não está na lista de arquivos deste cartão; o que este cartão pede — a regra da unitária e a contagem real — está feito, e o no-op deixou de recarregar nada.
