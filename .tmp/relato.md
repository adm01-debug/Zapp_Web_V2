Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/hooks/communication/useVoiceAgent.ts: passou a escutar o `play()` recusado (`onAutoplayBlocked` do playTtsAudio) e o fim do TTS com falha, guardando o motivo em `ttsIssue`; expôs `replayResponse()` (tocar de novo). Antes o erro do TTS morria num `log.warn` e o operador ficava sem som e sem explicação.
- src/hooks/voice/types.ts: tipo `VoiceTtsIssue` ('autoplay-blocked' | 'playback-failed') e os dois campos novos no retorno do hook — o hook diz O QUE aconteceu, a tela diz como aparece.
- src/components/voice/VoiceSearchOverlay.tsx: aviso `role="alert"` em pt-BR com a ação (Tocar resposta / Tentar de novo) ligada a `onRetrySpeak`; as sugestões ficam escondidas enquanto o aviso está na tela.
- src/components/voice/VoiceSearchOverlayConnected.tsx: passa `ttsIssue` e `onRetrySpeak` para a tela.
- src/components/inbox/MediaPreview.tsx (VideoPreview): o erro do `<video>` (e a falha de resolução da URL) tira o spinner e mostra "Não foi possível carregar o vídeo." com "Tentar de novo", que remonta o vídeo; o erro é guardado pelo `src` que falhou, então uma URL nova/renovada o limpa sozinha (sem `setState` em efeito). O `refresh()` do `onError` original foi mantido.

## Prova
- vermelho antes: recompus os 5 arquivos de fonte da base (`git show dia/2026-10-13:<arquivo> > <arquivo>`) e rodei `npx vitest run src/components/voice/__tests__/VoiceSearchOverlay.ttsAviso.test.tsx src/components/inbox/__tests__/VideoPreview.erro.test.tsx src/hooks/communication/__tests__/useVoiceAgent.ttsAviso.test.ts` → `Test Files 3 failed (3)` / `Tests 8 failed | 2 passed (10)` (falham as asserções do aviso, da ação e do `ttsIssue`).
- verde depois (mesmos arquivos restaurados do HEAD): `npx vitest run <os 3 arquivos>` → `Test Files 3 passed (3)` / `Tests 10 passed (10)`.
- sem regressão: `npx vitest run` nos 9 arquivos de teste do entorno de voz/mídia (useVoiceAgent.interrupcao, playTtsAudio.interrupcao, mediaVolume.players, MediaVolume, componentesDuplicados, FileThumb.video, VideoIosFallback, ImagePreviewVideoFullscreen.aria, VoiceActionBridge) → `Test Files 9 passed (9)` / `Tests 59 passed (59)`.
- `git status --short` limpo depois da prova vermelha (nada de arquivo da base sobrando).

## Critério de pronto
1. "se `play()` for recusado ou o TTS falhar, o overlay mostra mensagem em pt-BR e uma ação" — motivo no hook: useVoiceAgent.ts (ttsIssue no `onAutoplayBlocked` e no catch do playback) e `replayResponse`; aviso e ação na tela: VoiceSearchOverlay.tsx (TTS_ISSUE_META + bloco `role="alert"`). Provam: useVoiceAgent.ttsAviso.test.ts (autoplay-blocked, playback-failed, replay limpa o aviso) e VoiceSearchOverlay.ttsAviso.test.tsx (mensagem, rótulo e clique chamando a ação). Rótulos: "Tocar resposta" (autoplay recusado) e "Tentar de novo" (TTS falho).
2. "o erro tem estado na tela (nada de spinner eterno)" — MediaPreview.tsx (VideoPreview): `loadFailed` a partir do erro do `<video>`/da resolução + bloco de erro com "Tentar de novo". Prova: VideoPreview.erro.test.tsx (spinner sai, aviso entra; retry limpa o erro e remonta o vídeo; vídeo que carrega não mostra aviso).

## Juiz barato (ANTES DE ENTREGAR)
- "MOVIMENTO: animação sem 'motion-safe:'" apontou as quatro linhas do meu teste do vídeo que citavam `.animate-spin` num seletor. Não é classe aplicada na tela — era string de `querySelector`. Corrigi o teste para selecionar o spinner pela classe do lucide (`svg.lucide-loader-circle`), e re-rodei vermelho e verde. As animações do spinner (`animate-pulse`/`animate-spin`) são da base, não deste cartão.

## O que NÃO fiz e por quê
- Mexi em src/hooks/communication/useVoiceAgent.ts e src/hooks/voice/types.ts, que são da área de hooks (Hugo): sem eles a tela não teria de onde ler o motivo da falha de áudio. É o ajuste mínimo (um estado + uma ação), nomeado aqui para o revisor; o resto dos arquivos é das telas/componentes do cartão.
- Não toquei em `playTtsAudio.ts`: o `onAutoplayBlocked`/`onError` dele já existiam; o que faltava era o consumidor escutá-los.
