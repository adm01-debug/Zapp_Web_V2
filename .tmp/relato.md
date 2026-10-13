Especialista: hugo

## O que mudou e por quê

- `src/services/realtime.service.ts`: a leitura deixou de ser um UPDATE por seleção. `markMessagesAsRead(contactId)` agora entra numa fila (Set, dedupe) e o PATCH sai em lote (`update({is_read:true}).in('contact_id', ids).eq('sender','contact').eq('is_read',false)`) 250 ms depois, com retry e backoff quando a falha é transitória e descarte quando é permanente. A promise resolve no enfileiramento, então o commit otimista do hook deixa de esperar o banco. `markManyMessagesAsRead(ids)` é a entrada em lote (o próprio `markMessagesAsRead` delega para ela); `flushPendingMarkRead(allowRetry)` existe para a saída da tela. Ids que não são UUID de contato (JID do WhatsApp) são descartados sem PATCH e sem vazar o valor no log.
- `src/hooks/inbox/useRealtimeInbox.ts`: conversa ABERTA agora se marca sozinha — um efeito observa o unread da conversa selecionada e chama `markAsRead`; como o hook zera o unread no commit otimista, o efeito converge em um passe. Ao desmontar a Inbox o lote pendente é descarregado (`flushPendingMarkRead(false)`), em vez de morrer com o timer. `isOnline` inicial agora vem de `navigator.onLine` (era `useState(true)`, ignorando o estado real da conexão).
- `src/hooks/crm/useAgentPresence.ts`: `pagehide` publica 'offline' na hora (antes a linha ficava 'online' no banco até o heartbeat expirar, 75 s). Aba oculta pausa heartbeat e recálculo — os timers são limitados pelo navegador em aba oculta e um heartbeat atrasado fazia o agente piscar offline na tela dos outros; ao voltar para `visible` o status é republicado e o heartbeat retomado.

## Arquivos que aparecem no diff SEM serem edição minha (cherry-pick do cartão-pai)

- `src/hooks/chat/useRealtimeMessages.ts` (18 linhas) e `src/components/inbox/ConversationListSidebar.tsx` (2 linhas) vêm do cherry-pick de `e863a7413` (commit `23108b061` no meu histórico), o cartão-pai "a lista de conversas não pisca mais (esqueleto) a cada refetch/reconexão", que não estava na base do dia. As 18 linhas do hook acrescentam `initialLoading` + `firstFetchSettledRef` e fazem só a PRIMEIRA carga resolvida encerrar o estado de esqueleto; o `return` passa a devolver `initialLoading` e o componente lê esse campo. Eu não abri nem editei esses dois arquivos — o único commit em que eles mudam é o trazido do pai. A minha mudança preservou o contrato que o hook consome (`markMessagesAsRead` continua `Promise<void>`), e é por isso que a fila de leitura entrou sem precisar tocar nele.

## Prova

- vermelho antes (os 4 arquivos de teste novos rodados sobre as fontes da base `dia/2026-10-13`): `npx vitest run <os 4 testes novos>` → `Test Files 3 failed | 1 passed (4); Tests 14 failed | 4 passed (18)` (10 de 10 do lote, 2 de 3 de visibilidade, 2 de 3 da conversa aberta).
- verde depois (os 5 arquivos de teste do cartão, rodados agora no meu commit): `Test Files 5 passed (5); Tests 19 passed (19)`.
- sem regressão na vizinhança: `npx vitest run src/hooks/crm/__tests__/useAgentPresence.test.ts src/services/__tests__/realtime.service.inbox-janela-global.test.ts src/hooks/chat/__tests__/useRealtimeMessages.primeiraCarga.test.tsx src/hooks/chat/__tests__/useRealtimeMessages.reconexao.test.tsx src/hooks/inbox/__tests__/` → `Test Files 24 passed (24); Tests 142 passed | 1 expected fail (143)`.
- portão local no workspace: `zapp-verify <workspace> --rapido` → `VERIFY: VERDE SEM BANCO (110s)`; passos `db_guard OK`, `tipos OK`, `lint OK`, `migrations OK`. O banco local não foi verificado porque nenhum nome de conjunto foi passado a este passo (aviso do próprio portão).
- Contrato coberto (12 casos entre serviço e hooks): rajada → 1 PATCH; união sem duplicar; mesma conversa 2x → id único; chamadas espaçadas → PATCHes separados; lote vazio → no-op sem timer; guarda de UUID; flush na saída; otimista imediato; conversa não aberta intacta; erro permanente sem retry; erro transitório com retry/backoff; erro de contrato com log e sem retry. Os casos de banco (1-7, 10-12) ficaram no teste do serviço e os de estado (8 e 9) no teste do hook, porque no V2 o commit otimista mora no hook de mensagens.

## O que NÃO fiz e por quê

- Não editei `useRealtimeMessages.ts` nem `ConversationListSidebar.tsx`: aparecem no diff apenas pelo cherry-pick do cartão-pai (acima); nenhuma linha de tela é da minha autoria.
- Não pluguei `markManyMessagesAsRead` em nenhuma tela: hoje nenhuma tela marca várias conversas de uma vez; ela é a entrada em lote usada por `markMessagesAsRead` e pelos casos 2 e 5 do contrato.
- Não tratei o "flapping" do `selectedContactId` (estabilização da conversa selecionada): é estado de UI em `useInboxUIState`, fora dos arquivos que o cartão autoriza, e o sintoma que o cartão descreve na leitura (contador que não zera) está coberto pelo efeito novo da Inbox.
- O aviso "padrão sensível: verifyHmac|signature" do portão simulado não aponta código meu: `git diff` não contém `verifyHmac` nem `signature` (conferido por busca no diff); é casamento de texto, não de código.

## Conclusão

Concluí o cartão: a leitura marcada em lote e a presença publicada offline ao fechar a aba estão nos arquivos autorizados, com os testes acima verdes e o portão local verde.
