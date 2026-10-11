Especialista: iris (area-front-componentes)

## O que mudou e por quê
- src/components/inbox/conversation-list/StatusChips.tsx: o useMemo local de contagens (regras antigas: Resolvidas = sem
  mensagem carregada, Aguardando = sem responsável) virou `countByChip(conversations, profile?.id, { snoozedIds, showAll,
  selectedQueueId })` — o mesmo cálculo que useInboxFilters aplica em filteredConversations, então o número do chip é o
  length que a lista mostra ao clicar nele. Abertas 3 props novas (snoozedIds/showAll/selectedQueueId) e removido o
  comentário que justificava as regras antigas.
- src/components/inbox/ConversationListSidebar.tsx: passa ao StatusChips as mesmas opções que useInboxFilters usa na lista
  (`snoozedIds={conversationActions?.snoozedIds}`, `showAll`, `selectedQueueId`).
- src/components/inbox/__tests__/StatusChips.test.tsx: cada contador provado pelo critério da lista (contacts.conversation_status);
  cobre Resolvidas que não conta só por ter 0 mensagens (c6 resolvida com mensagem conta; c4 open sem mensagem não conta),
  Aguardando por status 'waiting', arquivadas só em Arquivadas, e as 3 props novas (adiadas, showAll, fila).
- Fora da lista do cartão, necessários para o critério #3 (verify verde) e para não afrouxar teste existente:
  - src/hooks/inbox/chipCounts.ts: `isAttending` ganhou o guard `profileId != null` (antes `undefined === undefined` fazia
    conversa sem responsável entrar em Em atendimento quando o perfil era nulo — defeito do predicado compartilhado, então
    lista e contador ficavam iguais no erro). Mantém a proteção do teste de identidade (R2-INB-056).
  - src/components/inbox/__tests__/StatusChips.identidade-profile.test.tsx: as fixtures passaram a trazer
    conversation_status (o arquivo é companheiro do mesmo componente e ficava vermelho com o novo critério); nenhuma
    asserção foi afrouxada — as expectativas de attending/waiting seguem iguais.

## Prova
- vermelho antes: `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx` com StatusChips.tsx da base
  (git show HEAD:...) → `Test Files 1 failed (1)` · `Tests 7 failed | 5 passed (12)` (ex.: "expected '2' to be '1'" no
  contador com fila).
- verde depois: `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx` → `Test Files 1 passed (1)` ·
  `Tests 12 passed (12)`.
- regressão dos consumidores: `npx vitest run` (StatusChips.test, StatusChips.contrasteChipAtendendo,
  StatusChips.identidade-profile, ConversationListSidebar.test e src/hooks/inbox/__tests__) →
  `Test Files 23 passed (23)` · `Tests 132 passed | 1 expected fail (133)`.

## Integração dos pais (não são alterações minhas)
O cartão informa que H1 (t_2bcde689) e H2 (t_9637c51a) já estão prontos; os commits deles não são ancestrais da base do dia,
então integrei-os por cherry-pick no início (452075a32, 16f60f5de, df5d7885e). Por isso o diff da branch aparece com
src/hooks/inbox/useInboxFilters.ts, src/hooks/inbox/__tests__/chipCounts.test.ts e
src/hooks/inbox/__tests__/useInboxFilters.arquivadas.test.tsx: são arquivos dos pais, não meus, e não os editei. O único
arquivo de hooks que editei foi chipCounts.ts (1 linha, guard `profileId != null` em isAttending), explicado acima.

## O que NÃO fiz e por quê
- ContactDetails.tsx (item 3 do cartão): o comentário da linha ~67 diz que archiveContact "zera assigned_to"; conferi que
  o cartão E2 NÃO está no meu código (useConversationActions.archiveContact só faz update de assigned_to) → o comentário
  continua verdadeiro e NÃO foi alterado. Quando E2 integrar, o comentário precisará ser revisto.
- Não mexi na assinatura de countByChip (criado pelo pai H1); apenas consumi a existente.
