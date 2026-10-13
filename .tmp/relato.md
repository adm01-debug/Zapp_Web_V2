Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `src/lib/audio/pttLimits.ts` (novo): fonte única dos limites de PTT do WhatsApp (16 min, 16 MB, mínimo 0,5 s) com `validatePttBlob` (só inspeciona, não sobe nada) e `probeAudioDuration` (mede a duração pelo `<audio>`; devolve `undefined` quando o ambiente não decodifica — jsdom/SSR — para não recusar áudio válido só por falta de medição).
- `src/hooks/inbox/useRealtimeInbox.ts`: `handleSendAudio` valida o blob ANTES de `ChatService.uploadAudio`; fora dos limites avisa o motivo (toast "Áudio não enviado" com a mensagem exata) e rejeita — nada sobe para o bucket.
- `src/hooks/communication/useAudioRecorder.ts`: decisão registrada — o teto padrão de gravação sobe de 300 s para `MAX_PTT_DURATION_SEC` (16 min), o limite real do WhatsApp para voz. Antes a gravação era cortada na metade do teto.
- Testes: `src/lib/audio/__tests__/pttLimits.test.ts` (novo: bordas dos limites e ambientes sem medição), `src/hooks/inbox/__tests__/useRealtimeInbox.sendAudio.test.tsx` (recusa antes do upload, com aviso) e `src/hooks/__tests__/useAudioRecorder.lifecycle.test.ts` (teto padrão de 16 min).

## Prova
- vermelho antes: `npx vitest run src/hooks/inbox/__tests__/useRealtimeInbox.sendAudio.test.tsx` → `Tests 2 failed | 13 passed (15)` (áudio de 16 MB+ e áudio vazio subiam para o upload e resolviam `true`).
- vermelho antes: `npx vitest run src/hooks/__tests__/useAudioRecorder.lifecycle.test.ts` → `Tests 1 failed | 5 passed (6)` (a captura era cortada em 301 s, o teto antigo de 300 s).
- verde depois: `npx vitest run src/lib/audio/__tests__/pttLimits.test.ts src/hooks/inbox/__tests__/useRealtimeInbox.sendAudio.test.tsx src/hooks/__tests__/useAudioRecorder.lifecycle.test.ts` → `Test Files 3 passed (3); Tests 25 passed (25)`.
- regressão: `npx vitest run src/hooks/inbox/__tests__` → `Test Files 19 passed (19); Tests 126 passed | 1 expected fail (127)`.
- regressão: `npx vitest run src/hooks/__tests__/useAudioRecorder.test.ts src/components/inbox/chat/__tests__ src/components/inbox/__tests__/useChatMediaSending.audio-meme-falha.test.ts src/components/team-chat/__tests__/useTeamChatPanel.audio-send.test.tsx` → `Test Files 45 passed (45); Tests 336 passed (336)`.

## O que NÃO fiz e por quê
- As outras portas de upload de áudio ficam fora dos arquivos que o cartão permite tocar e foram registradas no `kanban_comment` (12138): `src/components/omnichannel/OmnichannelChatPanel.tsx:69` (upload direto, sem limites), `src/components/inbox/VoiceChangerPicker.tsx:208-213` (o blob do voice changer sobe para o bucket `audio-memes`) e o chat interno (`src/components/team-chat/useTeamChatPanel.ts:310`, outro bucket, não é WhatsApp).
- `src/hooks/chat/useChatMediaSending.ts` (caminho citado no cartão) não existe na V2: o arquivo real é `src/components/inbox/useChatMediaSending.ts`, onde o envio de meme/voz recebe URL remota — sem blob nesse caminho, o limite de PTT não se aplica ali.
- Registrado também que `useChatPanelHandlers.handleAudioSend` (arquivo fora da minha lista) avisa com o texto genérico "Tente novamente." quando o envio rejeita, e com `TOAST_LIMIT = 1` esse texto substitui o motivo específico. O bloqueio de não subir funciona; o texto final do aviso é que fica genérico.
