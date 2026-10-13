Especialista: Hugo (area-front-hooks)

## O que mudou e por quê

- `src/services/realtime.service.ts`: a leitura deixou de ser um UPDATE por seleção. `markMessagesAsRead(contactId)` agora entra numa fila (Set, dedupe) e o PATCH sai em lote (`update({is_read:true}).in('contact_id', ids).eq('sender','contact').eq('is_read',false)`) 250ms depois, com retry e backoff quando a falha é transitória e descarte quando é permanente. A promise resolve no enfileiramento, então o commit otimista do hook deixa de esperar o banco. `markManyMessagesAsRead(ids)` é a entrada em lote (o próprio `markMessagesAsRead` delega para ela); `flushPendingMarkRead(allowRetry)` existe para a saída da tela. Ids que não são UUID de contato (JID do WhatsApp) são descartados sem PATCH e sem vazar o valor no log.
- `src/hooks/inbox/useRealtimeInbox.ts`: conversa ABERTA agora se marca sozinha — um efeito observa o unread da conversa selecionada e chama `markAsRead`; como o hook zera o unread no commit otimista, o efeito converge em um passe. Ao desmontar a Inbox o lote pendente é descarregado (`flushPendingMarkRead(false)`), em vez de morrer com o timer. `isOnline` inicial agora vem de `navigator.onLine` (era `useState(true)`, ignorando o estado real da conexão).
- `src/hooks/crm/useAgentPresence.ts`: `pagehide` publica 'offline' na hora (antes a linha ficava 'online' no banco até o heartbeat expirar, 75s). Aba oculta pausa heartbeat e recálculo — os timers são limitados pelo navegador em aba oculta e um heartbeat atrasado fazia o agente piscar offline na tela dos outros; ao voltar para `visible` o status é republicado e o heartbeat retomado.
- `src/hooks/chat/useRealtimeMessages.ts` NÃO foi tocado (somente leitura no cartão): a assinatura `Promise<void>` de `markMessagesAsRead` foi preservada, por isso a fila entrou sem mudar o hook.
- Traga do cartão-pai: cherry-pick de `e863a7413` (lista de conversas sem esqueleto a cada refetch/reconexão), que não estava na base do dia.

## Prova

- vermelho antes (testes novos sobre as fontes da base `dia/2026-10-13`): `npx vitest run <os 4 arquivos de teste novos>` → `Test Files 3 failed | 1 passed (4); Tests 14 failed | 4 passed (18)` (10/10 do lote, 2/3 de visibilidade, 2/3 da conversa aberta).
- verde depois: `npx vitest run src/services/__tests__/realtime.service.markReadFlush.test.ts src/hooks/chat/__tests__/useRealtimeMessages.leituraLote.test.tsx src/hooks/inbox/__tests__/useRealtimeInbox.leituraLote.test.tsx src/hooks/crm/__tests__/useAgentPresence.visibilidade.test.ts` → `Test Files 4 passed (4); Tests 18 passed (18)`.
- sem regressão na vizinhança: `npx vitest run src/hooks/crm/__tests__/useAgentPresence.test.ts src/services/__tests__/realtime.service.inbox-janela-global.test.ts src/hooks/chat/__tests__/useRealtimeMessages.primeiraCarga.test.tsx src/hooks/chat/__tests__/useRealtimeMessages.reconexao.test.tsx src/hooks/inbox/__tests__/` → `Test Files 24 passed (24); Tests 142 passed | 1 expected fail (143)`.
- Contrato portado (12 casos): rajada → 1 PATCH; união sem duplicar; mesma conversa 2x → id único; chamadas espaçadas → PATCHes separados; lote vazio → no-op sem timer; guarda UUID; flush na saída; otimista imediato; conversa não aberta intacta; erro permanente sem retry; erro transitório com retry/backoff; erro de contrato com log e sem retry. Os casos de estado (8 e 9) ficaram no teste do hook e os de banco (1-7, 10-12) no teste do serviço, porque no V2 o commit otimista mora no hook de mensagens.

## O que NÃO fiz e por quê

- Não editei `useRealtimeMessages.ts` (somente leitura no cartão) nem telas (`RealtimeInboxView`, `ConversationListSidebar` vida da UI): o visual da Inbox é do worker (telas).
- Não pluguei `markManyMessagesAsRead` em nenhuma tela: hoje nenhuma tela marca várias conversas de uma vez; ela é a entrada em lote usada por `markMessagesAsRead` e pelos casos 2 e 5 do contrato.
- Não tratei o "flapping" da conversa selecionada (estabilização do `selectedContactId`): isso é estado de UI em `useInboxUIState`, fora dos arquivos que o cartão autoriza, e o sintoma que o cartão descreve na leitura (contador que não zera) está coberto pelo efeito novo.
