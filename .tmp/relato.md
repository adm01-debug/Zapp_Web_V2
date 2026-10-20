Especialista: hugo
Especialista: Hugo (area-front-hooks)

## O que mudou e por quê

Título: reusa upload e id de entrega na retentativa do áudio (Inbox)

- src/hooks/inbox/useRealtimeInbox.ts: `handleSendAudio` ganhou estado de retentativa
  (`pendingAudioSendRef`) POR GRAVAÇÃO — guarda o blob, o `contactId`, a url do objeto já
  subido e o `client_message_id` daquela tentativa. Enquanto a entrega não é aceita, a
  retentativa do MESMO blob reenvia a mídia já subida e o MESMO id (o servidor deduplica
  pelo `UNIQUE (contact_id, client_message_id)`, índice `ux_messages_contact_client_message_id`).
  Antes, cada tentativa chamava `ChatService.uploadAudio` de novo (nome com `Date.now()`) e
  o serviço gerava outro id — duas notas de voz no WhatsApp do cliente quando a resposta se
  perde depois de o POST já ter saído.
- src/hooks/inbox/useRealtimeInbox.ts: `discardPendingAudioSend()` no retorno do hook — o
  descarte explícito da gravação (cancelamento) encerra a retentativa; gravação diferente,
  conversa diferente ou envio ACEITO também limpam o estado (condições testadas).
- src/hooks/chat/useRealtimeMessages.ts + src/hooks/realtime/messageSender.ts: 7º parâmetro
  OPCIONAL `clientMessageId` repassado até `sendOutboundMessage` (que já aceitava
  `clientMessageId`). Aditivo: `git grep sendMessageToContact` mostra os outros chamadores
  (OmnichannelChatPanel, ChatPopup) usando no máximo 6 argumentos — nenhum quebra.

## Prova

- vermelho antes (com o fix guardado por `git stash push`, base = `dia/2026-10-15`):
  `npx vitest run src/hooks/inbox/__tests__/useRealtimeInbox.audio-idempotencia.test.tsx`
  → `Tests 5 failed (5)` — `AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times`
  (base subia o áudio duas vezes) e `expected undefined not to be undefined` (base não mandava
  id de entrega algum).
- verde depois:
  `npx vitest run src/hooks/inbox/__tests__/useRealtimeInbox.audio-idempotencia.test.tsx src/hooks/inbox/__tests__/useRealtimeInbox.sendAudio.test.tsx`
  → `Test Files 2 passed (2); Tests 14 passed (14)`
- vizinhos (contrato alterado + envio de áudio):
  `npx vitest run src/services/__tests__/outbound-message.service.test.ts src/components/inbox/chat/__tests__/useChatPanelHandlers.audio.test.tsx src/hooks/inbox/__tests__ src/components/inbox/__tests__/FileUploader.retry-envio.test.tsx src/hooks/__tests__/useAudioRecorder.lifecycle.test.ts`
  → `Test Files 26 passed | 1 skipped (27); Tests 178 passed | 1 expected fail | 11 todo (190)`
  (o `1 expected fail` é `it.fails` pré-existente em `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts`, alheio a este diff).

Testes: `src/hooks/inbox/__tests__/useRealtimeInbox.audio-idempotencia.test.tsx` (novo, 5 casos:
reuso de upload+id; gravação nova; descarte por cancelamento; envio aceito encerra a
retentativa; troca de conversa) e `src/hooks/inbox/__tests__/useRealtimeInbox.sendAudio.test.tsx`
(1 expectativa atualizada: a chamada de áudio agora leva o 7º argumento, o id de entrega).

## Verificação do repositório

- `zapp-verify . --rapido` → `OK db_guard`, `OK tipos 352s`, `OK lint`, `OK migrations`;
  `VERIFY: VERDE SEM BANCO (363s)` (o banco não é tocado por este cartão). Antes deste passo o
  workspace não tinha dependências instaladas e o ratchet acusou
  `TypeScript local nao encontrado` — resolvido com `bun install` (`651 packages installed`).

## Escopo (por que estes arquivos)

Todos os quatro arquivos fora da lista literal do cartão são o MESMO assunto — envio de áudio —
e todos moram na minha área (src/hooks/**), porque é aqui que o áudio é enviado:

- `src/hooks/inbox/useRealtimeInbox.ts` é O hook do envio de áudio (`handleSendAudio`), não uma
  cópia: `git grep -n "handleSendAudio"` mostra que ChatPanel/TextToAudioButton chegam nele.
- `src/hooks/realtime/messageSender.ts` + `src/hooks/chat/useRealtimeMessages.ts` são a fachada
  por onde o id de entrega precisa passar para chegar ao serviço; sem o 7º parâmetro opcional
  não existe idempotência possível no front.
- Os dois testes ficam ao lado dos hooks que provam (`src/hooks/inbox/__tests__/`), é onde o
  vitest os coleta e é o "teste novo" que o cartão pede.

Nenhum arquivo de outro assunto entrou; nenhum arquivo do cartão ficou de fora.

## O que NÃO fiz e por quê

- Não toquei em `src/components/inbox/**` (área da Íris): ligar `discardPendingAudioSend` ao
  gesto de cancelar a gravação (AudioRecorder → ChatPanel) é uma linha lá. O hook já expõe a
  função e o próprio `handleSendAudio` descarta o estado quando chega gravação/conversa
  diferente. Registrado em comentário no cartão.
- Não mexi em limpeza de objeto órfão no bucket quando uma gravação falha e é abandonada
  (tema de outro cartão).
