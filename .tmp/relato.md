Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/chat/useInitialHighlight.ts (NOVO): acha a mensagem alvo por `id` OU `external_id` na
  lista já carregada; se não achou e há histórico, paga `onLoadOlderMessages` uma rodada por render
  (respeitando `loadingOlderMessages` em voo) até um teto, e desiste com `onNotFound`. Entrega o id
  REAL por callback e marca o alvo como resolvido — sem repetir o realce a cada render, e com o
  estado rearmado quando o alvo muda (conversa A → B).
- src/hooks/inbox/useRealtimeInbox.ts: aceita `?message=` (id ou external_id) e `?contact=` na URL
  da Inbox — o alvo é lido no init do estado (sem setState dentro de efeito) e o parâmetro é limpo
  da URL depois de consumido; o evento `open-contact-chat` passa a carregar `messageId`; o hook
  devolve `initialHighlightMessageId`/`setInitialHighlightMessageId`.
- src/components/inbox/RealtimeInboxView.tsx: resultado de mensagem/transcrição da busca global
  publica o id do alvo (contato/CRM abre só a conversa); com alvo pendente a aba ativa DERIVADA vira
  'chat' (sem setState em efeito) e o consumo mantém o Chat visível.
- src/components/inbox/chat/ChatDialogs.tsx: o contrato `onSelectConversation` leva `messageId`
  opcional quando o resultado é mensagem/transcrição (contato/CRM mantém a chamada antiga).
- src/components/inbox/ChatPanel.tsx: recebe `initialHighlightMessageId` e o repassa ao
  `useInitialHighlight`, reusando o MESMO realce+rolagem do "Ver na conversa"; quando desiste,
  avisa "Mensagem não encontrada" por toast.

## Prova
- vermelho antes (hook): restaurando `src/hooks/inbox/useRealtimeInbox.ts` da base dia/2026-10-12 →
  `npx vitest run src/hooks/inbox/__tests__/useRealtimeInbox.deep-link.test.tsx`
  → `Test Files 1 failed (1); Tests 4 failed (4)` (ex.: `AssertionError: expected undefined to be 'm42'`).
  Depois o arquivo do diff voltou e passou.
- vermelho antes (view): idem restaurando `RealtimeInboxView.tsx` da base →
  `Tests 1 failed | 1 passed (2)` (o caso de resultado de mensagem falha; o de contato, que já era
  contrato antigo, segue passando).
- verde depois: `npx vitest run src/hooks/chat/__tests__/useInitialHighlight.test.tsx
  src/hooks/inbox/__tests__/useRealtimeInbox.deep-link.test.tsx
  src/components/inbox/__tests__/RealtimeInboxView.deep-link.test.tsx
  src/components/inbox/__tests__/GlobalSearch.r2-inb-018.test.tsx
  src/hooks/inbox/__tests__/useRealtimeInbox.offline-cache.test.tsx
  src/components/inbox/__tests__/RealtimeInboxView.pagination.test.tsx`
  → `Test Files 6 passed (6); Tests 24 passed (24)`.
- suíte da área: `npx vitest run src/components/inbox src/hooks/inbox src/hooks/chat`
  → `Test Files 258 passed (258); Tests 2122 passed | 3 expected fail | 2 todo`.
- lint do commit (husky/ratchet): `OK: nenhuma nova divida de lint foi introduzida.`

## O que NÃO fiz e por quê
- Não toquei em ConversationTabContent.tsx nem na ponte chatMessageNavigation: o "Ver na conversa"
  (C2r) já entrega o alvo quando a mensagem está carregada e segue coberto pelos testes da área
  (critério 3).
- Não mexi em ViewRouter/rota: o deep link é lido na própria Inbox, arquivo citado no cartão.
- Ajustei a expectativa de UM teste existente (GlobalSearch.r2-inb-018): o resultado do mock é uma
  mensagem, então o contrato correto agora é `('contact-9', 'msg-1')` — é aperto do contrato, não
  afrouxamento de teste.
