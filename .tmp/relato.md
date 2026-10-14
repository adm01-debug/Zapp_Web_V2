Especialista: hugo
## O que mudou e por quê
- `src/hooks/chat/useInitialHighlight.ts`: reescrito no modelo por tempo do cartão — `setInterval` de 250 ms, até 20 tentativas, `onLoadOlder` UMA vez na 5ª tentativa, `onNotFound` UMA vez ao esgotar; cleanup no desmontar/trocar de alvo. Saíram `hasOlderMessages`/`loadingOlderMessages`/`maxRounds` (o modelo por render foi recusado); entrou `onLoadOlder` (nome do contrato do cartão).
- `src/components/inbox/ChatPanel.tsx`: `handleInitialHighlightFound` não chama mais `handleOpenMessageFromFiles` (sem rolar/realçar aqui — é do cartão seguinte) e devolve o id resolvido só por `onInitialHighlightConsumed(messageId)`; o tipo do callback passou a receber o id.
- `src/components/inbox/RealtimeInboxView.tsx`: `activeTabVisivel` só força `chat` com alvo pendente quando o ChatPanel está montado (mesma condição que o monta: com conversa, sem erro vazio, sem carga); sem painel, o clique do usuário na aba vale.
- `src/hooks/inbox/useRealtimeInbox.ts`: `handleSelectConversation` aposenta o alvo do link anterior (`setInitialHighlightMessageId(null)`) para ele não ser procurado na conversa nova; e o fechamento do `return` voltou ao alinhamento anterior (`};`/`}`).
- Testes: `src/hooks/chat/__tests__/useInitialHighlight.test.tsx` reescrito com timers falsos; `+1` teste de aposentadoria do alvo em `src/hooks/inbox/__tests__/useRealtimeInbox.deep-link.test.tsx`; `+3` testes da trava da aba (sonda `data-aba-ativa` no mock de `ConversationTabs`) em `src/components/inbox/__tests__/RealtimeInboxView.deep-link.test.tsx`.

## Prova
- vermelho antes (hook novo vs hook antigo restaurado): `npx vitest run src/hooks/chat/__tests__/useInitialHighlight.test.tsx` → `Tests  5 failed | 4 passed (9)`
- verde depois: `npx vitest run src/hooks/chat/__tests__/useInitialHighlight.test.tsx` → `Test Files  1 passed (1)` / `Tests  9 passed (9)`
- vizinhos: `npx vitest run src/hooks/inbox/__tests__/useRealtimeInbox.deep-link.test.tsx src/components/inbox/__tests__/RealtimeInboxView.deep-link.test.tsx src/components/inbox/__tests__/GlobalSearch.r2-inb-018.test.tsx` → `Test Files  3 passed (3)` / `Tests  15 passed (15)`
- regressão do hook: `npx vitest run src/hooks/inbox/__tests__/useRealtimeInbox.sendAudio.test.tsx src/hooks/inbox/__tests__/useRealtimeInbox.offline-cache.test.tsx src/hooks/inbox/__tests__/useRealtimeInbox.selectedMessagesError.test.tsx src/hooks/inbox/__tests__/useRealtimeInbox.reply.test.tsx` → `Test Files  4 passed (4)` / `Tests  12 passed (12)`
- `npx tsc -b --force` → saída vazia, exit 0
- `npx eslint` nos 7 arquivos tocados → `0 errors` (2 warnings pré-existentes no ChatPanel, linhas 3 e 260, fora do diff)

## Pontos do revisor
- Ponto 1: resolvido — `src/hooks/chat/useInitialHighlight.ts`: timer de 250 ms (`HIGHLIGHT_ATTEMPT_INTERVAL_MS`), teto de 20 (`HIGHLIGHT_MAX_ATTEMPTS`), `onLoadOlder` UMA vez na 5ª (`HIGHLIGHT_LOAD_OLDER_AT_ATTEMPT` + trava `olderPaid`), `onNotFound` ao esgotar, cleanup no `return` do efeito. Prova: `useInitialHighlight.test.tsx` ("acha depois de pagar a página anterior — onLoadOlder UMA única vez", "não acha em 20 tentativas", vermelho→verde acima).
- Ponto 2: resolvido — teto de 20 tentativas resolve o `hasOlderMessages === undefined` (teste "com contrato desconhecido o teto resolve"); sem painel montado a aba não é forçada (`RealtimeInboxView.tsx`, `chatPanelMontado` espelha a condição que monta o ChatPanel) e a troca explícita de conversa aposenta o alvo (`useRealtimeInbox.ts`, `handleSelectConversation`). Prova: 3 testes da trava da aba + 1 da aposentadoria (suítes verdes acima).
- Ponto 3: resolvido — `useInitialHighlight.test.tsx` com `vi.useFakeTimers`: "desmontar no meio: nenhum callback dispara depois" (desmonta após a página paga e avança o dobro do teto), "acha depois de pagar" e "não acha" com contagem exata de UM `onLoadOlder`. Os testes antigos do modelo por render saíram porque o ponto 1 mandou trocar o modelo ("não tem timer" → com timer); os do modelo novo estão no arquivo citado.
- Ponto 4: resolvido — `ChatPanel.tsx`: `handleOpenMessageFromFiles` removido do `handleInitialHighlightFound`; o id resolvido sai só por `onInitialHighlightConsumed(messageId)` (tipo atualizado; o pai em `RealtimeInboxView.tsx` continua `() =>` sem param, compatível). Prova: tsc limpo + suíte da view verde; o registro de navegação do "Ver na conversa" continua usando `handleOpenMessageFromFiles` (sem chamador órfão).
- Ponto 5: resolvido — `useRealtimeInbox.ts`: fechamento do `return` de volta a `   };` / `}` (fim do arquivo).

## O que NÃO fiz e por quê
- Não criei teste de ChatPanel com alvo setado: os handlers viraram repasse de 1 linha (sem ramo novo) e o comportamento está coberto com o hook real nos testes de timer + render real da view; tsc e eslint passam.
- O erro do `onLoadOlder` é engolido no hook de propósito e documentado no código: o dono do erro de paginação é o loader (publica em `error`); se a página não chegar, o teto de 20 tentativas desiste com o toast — o alvo nunca fica preso nem falha em silêncio.

## Arquivos (`git diff --name-only`)
- .tmp/relato.md
- src/components/inbox/ChatPanel.tsx
- src/components/inbox/RealtimeInboxView.tsx
- src/components/inbox/__tests__/RealtimeInboxView.deep-link.test.tsx
- src/hooks/chat/__tests__/useInitialHighlight.test.tsx
- src/hooks/chat/useInitialHighlight.ts
- src/hooks/inbox/__tests__/useRealtimeInbox.deep-link.test.tsx
- src/hooks/inbox/useRealtimeInbox.ts
