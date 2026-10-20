Especialista: iris
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 20s;OK lint 5s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (15/10 23:34, gerados por máquina: valem mais que números escritos à mão)
```
 src/components/inbox/VoiceChangerPicker.tsx        |  45 +++++---
 .../__tests__/VoiceChangerPicker.falhas.test.tsx   |   2 +-
 .../VoiceChangerPicker.preview-send.test.tsx       | 115 +++++++++++++++----
 .../VoiceChangerPicker.reduced-motion.test.tsx     |   2 +-
 .../inbox/__tests__/VoiceChangerPicker.test.tsx    |  10 +-
 .../useChatMediaSending.audio-meme-falha.test.ts   |  55 +++++----
 src/components/inbox/chat/ChatInputToolbars.tsx    |  11 +-
 src/components/team-chat/TeamChatInputArea.tsx     |   6 +-
 supabase/tests/voice_changer_audio_bucket.sql      | 125 +++++++++++++++++++++
 9 files changed, 298 insertions(+), 73 deletions(-)
```
- Testes alterados neste cartão (5 arquivo[s]) rodados AGORA no seu commit: Test Files 5 passed (5);Tests 25 passed (25)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/tests/voice_changer_audio_bucket.sql; padrão sensível: caminho:supabase/tests/, padrão:auth\.(uid|role)\(\), padrão:service_role|SERVICE, padrão:storage\.buckets


O QUE MUDOU (por arquivo)
- src/components/inbox/VoiceChangerPicker.tsx: parou de subir o mp3 em
  `audio-memes/voice-changer/<ts>_<uuid>.mp3` (bucket PÚBLICO, cache de 1 ano) e de passar a URL
  pública. Converte a prévia em `Blob` e entrega por `onSendAudioBlob` ao MESMO caminho do áudio
  gravado (bucket privado, locator assinado na leitura). `false`/rejeição seguem contando como
  falha e preservam a prévia (#350). É o único arquivo em que o Storage saiu: não há mais
  `storage.from`/`getPublicUrl` nele.
- src/components/inbox/chat/ChatInputToolbars.tsx e src/components/team-chat/TeamChatInputArea.tsx:
  fiação dos dois painéis — `VoiceChangerPicker onSendAudioBlob={onAudioSend}`. `AudioMemePicker`
  continua em `onSendAudioMeme` (meme não mudou).
- supabase/tests/voice_changer_audio_bucket.sql (novo): prova estrutural/de lógica das policies
  reais (buckets, predicados, policies intactas).
- Testes: `VoiceChangerPicker.preview-send.test.tsx` (Blob entregue, nenhum bucket tocado, prévia
  preservada em rejeição/false/erro síncrono, guard de fiação e do caminho antigo),
  `VoiceChangerPicker.test.tsx`/`.falhas`/`.reduced-motion` (nome da prop),
  `useChatMediaSending.audio-meme-falha.test.ts` (a fiação da voz deixou o handler de meme).

CRITÉRIO DE PRONTO (item → prova)
1. Nenhuma chamada `getPublicUrl('audio-memes','voice-changer/…')` no `src`:
   `git grep -n "getPublicUrl" -- src` não devolve o picker (nem `from('audio-memes')`), e o guard
   em `preview-send.test.tsx` varre os 3 arquivos exigindo `getPublicUrl(`, `from('audio-memes')`
   e `'voice-changer/` ausentes — passa.
2. Atendente comum envia áudio transformado: banco LOCAL, papel `authenticated` não admin, com as
   migrations reais — T1 sobe `audio-messages/<contato>/…` OK; T2 `audio-memes/voice-changer/…`
   RECUSADO por RLS; T3 o atendente atribuído lê; T4 outro atendente não lê; T5 meme em
   `audio-memes/<auth.uid()>/` segue OK; T6 `anon` não escreve. (transação com ROLLBACK)
3. `zapp-verify . --rapido` verde: `OK tipos`, `OK lint`, `OK db_guard`, `OK migrations`,
   `VERIFY: VERDE SEM BANCO`.

O QUE FAZER (itens 1–4 do cartão)
1. Blob → caminho do áudio gravado (`onAudioSend` → `audio-messages/<contato>/` no inbox):
   feito. 2. Chat interno: `onAudioSend` do painel (caminho privado do chat interno, que resolve
   a extensão/contentType do Blob): feito. 3. Falha mantém a prévia + aviso pt-BR: mantido (#350).
   4. Teste do picker + prova no banco local: acima.
   Os "hooks de upload de áudio (somente reutilizar)" foram só REUTILIZADOS (`onAudioSend`), sem
   edição.

POR QUE TOQUEI ARQUIVOS FORA DA LISTA (aviso do juiz)
- `ChatInputToolbars.tsx` e `TeamChatInputArea.tsx` são INDISPENSÁVEIS: a prop do picker mudou de
  `onSendAudio(url)` para `onSendAudioBlob(blob)`; sem reescrever as duas únicas chamadas eles
  ficariam com a prop antiga ignorada e o envio da voz simplesmente não aconteceria. Nada de
  comportamento novo neles: só a ponte do áudio gravado que já existia.
- `supabase/tests/voice_changer_audio_bucket.sql` é a prova de banco que o próprio cartão exige
  (item 4). Não pude usar `scripts/db-audit/*.test.sh`: `scripts/ci/check-test-inventory.mjs`
  reprova `.test.sh` sem citação nominal no workflow (arquivo de outro dono) — a checagem segue
  acusando os MESMOS 6 órfãos pré-existentes do BASE, nenhum meu.

PROVA
- vermelho antes (teste novo × componente da base):
  `npx vitest run src/components/inbox/__tests__/VoiceChangerPicker.preview-send.test.tsx`
  → `Test Files 1 failed (1); Tests 5 failed | 1 passed (6)`
- verde depois (mesmo comando, com a correção) → `Test Files 1 passed (1); Tests 9 passed (9)`
- vizinhança: `npx vitest run src/components/inbox src/components/team-chat`
  → `Test Files 259 passed | 1 skipped (260); Tests 2249 passed | 1 expected fail | 5 todo (2255)`
- banco local: `zapp-db-local psql . v2-26101522455c4c < supabase/tests/voice_changer_audio_bucket.sql`
  → `g2_voz: T0 ok … T3 ok`; `< .tmp/enforce-voz.sql` → `ENFORCEMENT OK: 6 asserções` + `ROLLBACK`
- lote: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (298s)`

NÃO FIZ (registrado no cartão, área de worker/hooks-services)
- `src/services/chat.service.ts:111 uploadAudio` e `useAudioRecorder.uploadAudio` gravam sempre
  `.webm`/`audio/webm` (a gravação do microfone é webm); o mp3 do Voice Changer fica rotulado como
  webm no inbox. `kanban_comment` de 15/10 23:09 com arquivo, sintoma e o ajuste sugerido.
