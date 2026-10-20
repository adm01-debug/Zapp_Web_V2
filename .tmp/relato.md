Especialista: hugo

# fix(inbox): arquivar tem uma só semântica e o desfazer restaura o status anterior

## O que mudou e por quê
- `src/hooks/inbox/conversationArchive.ts` (NOVO): helper canônico de arquivar/desarquivar.
  `archiveConversations(ids)` lê o status anterior, grava `conversation_status = 'archived'` (+ `updated_at`) numa
  ÚNICA escrita agrupada (`.update(...).in('id', ids)`) — SEM tocar em `assigned_to` — confere as linhas devolvidas
  (zero linhas = erro, o RLS filtra sem dar erro) e devolve o status anterior de cada conversa confirmada.
  `restoreConversationStatuses(mapa)` (o Desfazer) agrupa os ids pelo valor anterior e faz UMA escrita por valor
  distinto, restaurando o status real que a conversa tinha (não força `open`). Cada escrita confirmada dispara
  `zapp:contact-status-changed`, o mesmo evento que o `CloseConversationDialog` já usava.
- `src/hooks/chat/useConversationActions.ts`: `archiveContact` deixa de zerar `assigned_to` (o que devolvia a conversa
  à fila em vez de arquivar) e passa a chamar o helper; o Desfazer chama `restoreConversationStatuses`.
- `src/hooks/inbox/useInboxBulkActions.ts`: `bulkArchive` usa o mesmo helper (uma escrita do estado, não uma por
  contato) e o Desfazer restaura por valor anterior.
- `src/components/inbox/chat/useChatPanelHandlers.ts` (comando `/archive` do cabeçalho): mesma chamada — o cabeçalho
  deixou de ter a segunda implementação e agora também oferece Desfazer.
- `src/components/inbox/ContactDetails.tsx`: só o comentário — ele prometia "zera assigned_to", que deixou de ser
  verdade com a semântica única.
- Caminhos cobertos sem edição própria: `ContactDetails` (qui→Visão Geral → Arquivar), `ConversationListSidebar`
  (`handleArchive`) e `RealtimeInboxView` chamam `archiveContact`, então já usam o helper. O contador de "Arquivadas"
  vem de `chipCounts` sobre `conversation_status`, que o evento `zapp:contact-status-changed` atualiza na lista viva.
- Testes: `src/hooks/chat/__tests__/useConversationActions.test.ts` (unitário), `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts`
  (lote), `src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx` (painel de detalhes) e
  `src/components/inbox/chat/__tests__/useChatPanelHandlers.sem-falso-sucesso.test.tsx` (cabeçalho).

## Prova
- vermelho antes (código da base + só os testes novos):
  `npx vitest run src/hooks/chat/__tests__/useConversationActions.test.ts src/hooks/inbox/__tests__/useInboxBulkActions.test.ts src/components/inbox/chat/__tests__/useChatPanelHandlers.sem-falso-sucesso.test.tsx`
  → `Test Files 3 failed (3); Tests 6 failed | 52 passed (58)` — as 6 falhas são exatamente as asserções novas (o código
  antigo grava `assigned_to: null` e filtra com `.eq`, não com `.in`).
- verde depois:
  `npx vitest run src/hooks/chat/__tests__/useConversationActions.test.ts src/hooks/inbox/__tests__/useInboxBulkActions.test.ts src/components/inbox/chat/__tests__/useChatPanelHandlers.sem-falso-sucesso.test.tsx src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx`
  → `Test Files 4 passed (4); Tests 62 passed (62)`
- sem regressão: `npx vitest run src/hooks/inbox src/hooks/chat src/components/inbox` →
  `Test Files 305 passed | 3 skipped (308); Tests 2539 passed | 3 expected fail | 27 todo (2569)`

## Testes existentes que mudei (e por quê não é afrouxamento)
- `useInboxBulkActions.test.ts`: o bloco `it.fails` documentava o bug "SELECT dos originais fora do try, `error`
  ignorado → botão Desfazer que não restaura nada". A correção faz o SELECT falhar FECHADO, então esse caso deixou de
  ser bug documentado e virou um `it` normal que PROVA o comportamento novo (nenhuma escrita, nenhum Desfazer,
  seleção mantida). `it.fails` que passa é falha de suíte; manter o `it.fails` seria impossível.
- Os demais casos de arquivamento trocaram a expectativa antiga (`payload { assigned_to: null }`, `restauração por
  contato`) pela nova (`payload { conversation_status: 'archived' }`, desfazer agrupado por valor anterior) — é
  exatamente o bug do cartão, e a prova vermelha acima mostra que as asserções novas reprovam o código antigo.
- `ContactDetails.quickActions.test.tsx` e `useChatPanelHandlers.sem-falso-sucesso.test.tsx`: mock estendido para a
  leitura do status atual e para o filtro `.in('id', ids)` que o helper usa; o caminho de escrita continua provado
  no nível do hook real.

## Cartões irmãos (não dupliquei; conferi antes de codar)
`t_70d06027` (PH-01 doc07) e `t_07adfede` estão `done` mas NÃO estão na ponta: as entradas deles em
`~/hermes-workspaces/.v2-fila/` (`26101323400f07` sha `45de2ff3ca`, `26101301191d6d` sha `9305240ff3`) respondem
NAO integrado em `git merge-base --is-ancestor <sha> dia/2026-10-15`. Não havia o que cherry-pickar; o que implementei
cobre a união das três famílias de caminho e o helper canônico que o cartão pede.

## Por que criei `src/hooks/inbox/conversationArchive.ts` (arquivo fora da lista, pedido pelo próprio cartão)
O cartão pede, no "O que quero": "Crie UM helper/hook canônico de arquivar/desarquivar (unitário e em lote, uma só
escrita agrupada por valor anterior)". Um helper compartilhado por hooks e componentes não tem onde morar sem um
arquivo novo: dentro de `useConversationActions` ele voltaria a ser a segunda implementação que o cartão manda
eliminar. Ele fica em `src/hooks/inbox/` (área do meu perfil, `src/hooks/**`) e é o único arquivo fora da lista de
"ARQUIVOS QUE PODE TOCAR" — indispensável para cumprir o pedido, sem tocar em nada de outro assunto.

## O que NÃO fiz e por quê
- `src/hooks/inbox/useBulkActions.ts` não existe nesta base (o arquivo foi removido por `485c487bdd`/`1ad0af52c7`);
  o "segundo hook de lote" que o cartão cita já não está no código. Só resta `useInboxBulkActions`, unificado.
- `CloseConversationDialog.tsx` (menu do diálogo de encerramento) já grava o estado certo pela RPC e não está em
  ARQUIVOS QUE PODE TOCAR; deixei como está.
