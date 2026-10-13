Especialista: Íris (area-front-componentes)

CONCLUÍ. As duas falhas do cartão estão corrigidas e provadas por teste que renderiza a tela real.
comando rodado: `npx vitest run src/components/voice/__tests__/VoiceSearchOverlay.ttsAviso.test.tsx src/components/inbox/__tests__/VideoPreview.erro.test.tsx src/hooks/communication/__tests__/useVoiceAgent.ttsAviso.test.ts`
linha de resultado: `Test Files 3 passed (3)` / `Tests 10 passed (10)` (zero falhas, zero pulados).

## O que mudou
- src/hooks/communication/useVoiceAgent.ts (hook do agente de voz): passou a escutar o `play()` recusado (`onAutoplayBlocked` do playTtsAudio) e o fim do TTS com falha, guardando o motivo em `ttsIssue`; ganhou `replayResponse()`, que toca a resposta de novo. Antes o erro do TTS morria num `log.warn` e o operador ficava sem som e sem explicação.
- src/hooks/voice/types.ts: tipo `VoiceTtsIssue` ('autoplay-blocked' | 'playback-failed') e os dois campos novos no retorno do hook.
- src/components/voice/VoiceSearchOverlay.tsx: aviso `role="alert"` em pt-BR com o motivo e a ação ("Tocar resposta" quando o navegador bloqueou; "Tentar de novo" quando o TTS falhou), ligada a `onRetrySpeak`; sugestões escondidas enquanto o aviso está na tela.
- src/components/voice/VoiceSearchOverlayConnected.tsx: passa `ttsIssue` e `onRetrySpeak` para a tela que o VoiceActionBridge carrega.
- src/components/inbox/MediaPreview.tsx (componente VideoPreview): o erro do `<video>` (ou da resolução da URL) tira o spinner e mostra "Não foi possível carregar o vídeo." com "Tentar de novo", que remonta o vídeo; uma URL renovada limpa o erro sozinha (o estado guarda QUAL src falhou, sem `setState` dentro de efeito). Tela cheia não abre com mídia em erro.

## Prova
- verde depois: `npx vitest run` dos três arquivos novos → `Test Files 3 passed (3)` / `Tests 10 passed (10)`
- vermelho antes: com as fontes da base restauradas (`git show dia/2026-10-13:<arquivo> > <arquivo>` nos 5 arquivos de produção) e o MESMO teste rodado → `Test Files 3 failed (3)` / `Tests 8 failed | 2 passed (10)`; depois `git show HEAD:<arquivo>` devolveu tudo e `git status --short` ficou limpo
- sem regressão no entorno: `npx vitest run` de 9 arquivos de voz/mídia/inbox → `Test Files 9 passed (9)` / `Tests 59 passed (59)`

## Critério de pronto, item por item
1. "se `play()` for recusado ou o TTS falhar, o overlay mostra mensagem em pt-BR e uma ação" — useVoiceAgent.ts: estado `ttsIssue` alimentado pelo `onAutoplayBlocked` e pelo catch do playback + `replayResponse`; VoiceSearchOverlay.tsx: `TTS_ISSUE_META` e o bloco `role="alert"` com o botão. Provam: useVoiceAgent.ttsAviso.test.ts (autoplay recusado vira 'autoplay-blocked', TTS e fallback falhando vira 'playback-failed', replay limpa o aviso e toca de novo) e VoiceSearchOverlay.ttsAviso.test.tsx (mensagem, rótulo e clique chamando a ação).
2. "o erro tem estado na tela (nada de spinner eterno)" — MediaPreview.tsx: `loadFailed` derivado do erro do `<video>`/da resolução da URL, bloco de erro com "Tentar de novo". Prova: VideoPreview.erro.test.tsx (spinner sai e aviso entra; retry limpa o erro e remonta o vídeo; vídeo que carrega não mostra aviso).

## Notas de revisão (para o revisor)
- Três arquivos do escopo de hooks entraram junto e foram indispensáveis: `useVoiceAgent.ts` é quem chama o `playTtsAudio` — o item 1 do cartão só existe se alguém escutar a recusa do `play()` e expor isso à tela; `types.ts` é o contrato tipado desse retorno (sem ele a tela não lê `ttsIssue`/`replayResponse`); `useVoiceAgent.ttsAviso.test.ts` é a prova do item 1 no hook real com o `playTtsAudio` real (sem ele o aviso seria provado só por mock da tela). O ajuste no hook é o mínimo: um estado, uma ação e um callback na chamada que já existia.
- `src/hooks/voice/playTtsAudio.ts` segue intacto: `onAutoplayBlocked` e `onError` já existiam; faltava quem os escutasse.
- O teste do vídeo seleciona o spinner por `svg.lucide-loader-circle`; as classes `animate-pulse`/`animate-spin` do spinner são da base e este cartão não adiciona animação nenhuma.
- O `.tmp/relato.md` é arquivo rastreado nesta branch (veio da base) e foi commitado porque o fechar exige a árvore limpa.
