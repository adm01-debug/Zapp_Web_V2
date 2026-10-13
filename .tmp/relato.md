Especialista: iris

## O que mudou e por quê

- `src/hooks/communication/useAudioRecorder.ts`: pausa/retomada (`pauseRecording`/`resumeRecording`, cronômetro congelado enquanto pausado), descarte desfazível (o trecho descartado fica em memória + IndexedDB por 5 s e `undoDiscard` devolve para a prévia), rascunho recuperável por usuário em IndexedDB com expiração (`indexedDbDraftStore`, `DRAFT_TTL_MS`, injetável em teste), gravação concluída/não enviada e trecho interrompido pelo desmonte viram rascunho em vez de sumir, nível real do microfone (`AnalyserNode`; sem analisador `getLevel()` devolve `-1`) e `sendWithBackoff` (3 tentativas com espera progressiva de 1 s/2 s/4 s) — é o que o cartão pede nos itens 1 e 2 do critério.
- `src/components/inbox/AudioRecorder.tsx`: botão pausar/retomar (`aria-label` "Pausar gravação" / "Retomar gravação"), barra de espaço pausa/retoma e Esc descarta, `role="status" aria-live="polite"` anunciando "Gravando.", "Gravação pausada.", descarte com a contagem e falha de envio, `waveform` desenhado com as 30 alturas medidas (`levelBufferToHeights`) quando há analisador, barra de "Desfazer (Ns)" no descarte, oferta da gravação recuperada ("Usar gravação" / "Gravar nova") antes de abrir o microfone, e envio com recuo que, ao falhar as 3 tentativas, mantém a gravação na tela com botão de nova tentativa (`AlertTriangle`, `aria-label` "Tentar enviar o áudio novamente").
- `src/hooks/__tests__/useAudioRecorder.pausa-recuperacao.test.ts` (novo): pausa congela o cronômetro (5 s pausados não entram na duração), desfazer devolve o áudio, sem desfazer o rascunho fica no disco, gravação não enviada e desmonte no meio gravam rascunho, recuperação do órfão + expiração, `getLevel()` sem analisador, `sendWithBackoff` e `levelBufferToHeights` sem `Math.random`.
- `src/components/inbox/__tests__/AudioRecorder.pausa-recuperacao.test.tsx` (novo): componente REAL — pausa/retoma pelo botão com anúncio, espaço/Esc, descarte com contagem, oferta da gravação recuperada, e as 3 tentativas de envio.
- `src/hooks/__tests__/useAudioRecorder.lifecycle.test.ts` e `src/components/inbox/__tests__/AudioRecorder.test.tsx`: ajustados à API nova (o mock do hook ganhou os campos novos e a asserção de timer do cancel passou a provar a janela de desfazer + `undoDiscard`, em vez de só contar zero timers).

## Prova

- vermelho antes (arquivos de produção da base, `git show HEAD:<arquivo>` sobre o meu workspace): `npx vitest run src/hooks/__tests__/useAudioRecorder.pausa-recuperacao.test.ts src/components/inbox/__tests__/AudioRecorder.pausa-recuperacao.test.tsx` → `Test Files 2 failed (2); Tests 18 failed | 1 passed (19)`
- verde depois: mesmo comando → `Test Files 2 passed (2); Tests 19 passed (19)`
- hook + componente do áudio: `npx vitest run` nos 3 arquivos (novo hook, novo componente, `AudioRecorder.test.tsx`) → `Test Files 3 passed (3); Tests 21 passed (21)`
- hook do áudio (novo + os dois existentes): `npx vitest run src/hooks/__tests__/useAudioRecorder.pausa-recuperacao.test.ts src/hooks/__tests__/useAudioRecorder.test.ts src/hooks/__tests__/useAudioRecorder.lifecycle.test.ts` → `Test Files 3 passed (3); Tests 34 passed (34)`
- regressão nos consumidores do gravador: `npx vitest run src/components/inbox/chat/__tests__ src/components/team-chat/__tests__` → `Test Files 54 passed (54); Tests 504 passed (504)`

## Dependência (faixa do pai, trazida por cherry-pick)

O que o diff da branch mostra além do meu commit vem dos dois commits do cartão pai `t_65b3779c` (`ae44f0705` + `e732c507e`), que ainda não estavam integrados e por isso foram trazidos inteiros para o workspace: `src/lib/audio/pttLimits.ts`, `src/lib/audio/__tests__/pttLimits.test.ts`, `src/hooks/inbox/useRealtimeInbox.ts` e `src/hooks/inbox/__tests__/useRealtimeInbox.sendAudio.test.tsx` (limites de PTT — PE-24). Não os alterei.

## Decisões e limites

- **PD-63:** a janela do rascunho órfão não está no repositório da V2 nem nos assets da paridade; fixei `DRAFT_TTL_MS = 24 h` como constante exportada, com o dono do rascunho sendo o usuário da sessão (mesma convenção `zapp.<area>:<userId>` do `inboxDraftSession.ts`).
- **`onSend` com falha:** o recuo só vale quando o `onSend` sinaliza a falha (promise rejeitada); sigo mantendo o gravador aberto em falha, como o R2-INB-022 já pedia.
- **Escopo:** o cartão pedia 5 comportamentos em 2 arquivos, por isso o diff é grande; não movi nada para fora da minha área.
- **Fora da minha área (não corrigi, registro):** limpar o rascunho de áudio no `SIGNED_OUT` exigiria tocar `src/lib/inboxDraftSession.ts`/auth (dono: worker (auth)/(hooks)); hoje o rascunho já expira pela janela do PD-63, mas o logout não o apaga na hora.
