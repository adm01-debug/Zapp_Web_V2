Especialista: iris (area-front-componentes)

## O que mudou e por quê
- src/components/inbox/VoiceChanger.tsx: o preparo ("Usar esta voz") deixou de ser `void fetch(...).then(r => r.blob())` sem catch. Virou async com try/catch: falha de fetch ou de leitura do blob agora mostra aviso inline (ícone AlertCircle + "Tentar de novo") na própria prévia, com o motivo detalhado no tooltip e toast de erro; o popover continua aberto e utilizável, e o botão "Usar esta voz" ganhou estado "Preparando".
- src/components/inbox/VoiceChanger.tsx e VoiceChangerPicker.tsx: `audio.play()` passou a ser aguardado dentro de try/catch. Quando o navegador recusa a reprodução, `isPlaying` volta a false (o botão não fica preso em "tocando"/"Pausar"), o áudio é desanexado do volume global e aparece o aviso "O navegador bloqueou a reprodução. Toque no botão de novo.".
- src/components/inbox/VoiceChangerPicker.tsx: a transformação também ganhou aviso inline (ícone + "Tentar de novo", motivo detalhado no tooltip) além do toast, então dá para tentar de novo sem regravar; o botão de reprodução passou a ter largura fixa (w-28) e alterna Ouvir → Pausar → Carregando sem mudar o layout; "Transformar voz", "Enviar" e os botões de retry ficaram com alvo de 40 px (h-10).
- Movimento: `useReducedMotion` respeitado nos dois componentes — com movimento reduzido nada se desloca (entrada só por opacidade) e as animações de escala (pulso da gravação e ponto piscando) somem; sem redução o aviso inline entra com mola curta (spring 220 ms). Os spinners novos usam `motion-safe:animate-spin`.
- src/components/inbox/__tests__/VoiceChangerPicker.preview-send.test.tsx: uma linha no mock de framer-motion (`useReducedMotion: () => false`), que o componente agora consome. Nenhuma asserção do teste foi alterada ou afrouxada.

Testes novos (critério do cartão): src/components/inbox/__tests__/VoiceChanger.falhas.test.tsx, VoiceChangerPicker.falhas.test.tsx e VoiceChanger.reduced-motion.test.tsx.

## Prova
- vermelho antes (componentes restaurados da base):
  `git show <base>:src/components/inbox/VoiceChanger.tsx > .../VoiceChanger.tsx` (idem Picker) e
  `npx vitest run VoiceChanger.falhas VoiceChanger.reduced-motion VoiceChangerPicker.falhas`
  → `Test Files 3 failed (3)` / `Tests 9 failed (9)`; exemplos de falha: `Unable to find an element by: [data-testid="voz-erro-preparo"]`, `Unable to find an element by: [data-testid="voz-erro-transformacao"]`, `Unable to find an accessible element with the role "button" and name "Ouvir prévia"` (botão preso em "tocando" na base).
- verde depois (mesmos testes, componentes corrigidos):
  `npx vitest run VoiceChanger.falhas VoiceChanger.reduced-motion VoiceChangerPicker.falhas`
  → `Test Files 3 passed (3)` / `Tests 9 passed (9)`.
- regressão dos testes que já existiam no módulo + telas que renderizam estes componentes:
  `npx vitest run VoiceChangerPicker.test.tsx VoiceChangerPicker.preview-send.test.tsx AudioRecorder.test.tsx team-chat-n182-a11y.test.tsx ChatInputArea.limite-enter.test.tsx`
  → `Test Files 5 passed (5)` / `Tests 18 passed (18)` (roda junto com os 3 novos: nenhum teste existente foi apagado, pulado ou afrouxado).
- typecheck: `npx tsc --noEmit` → sem saída, 0 erros.

## Critério de pronto, item a item
- falha de fetch/blob avisa e o popover continua utilizável → VoiceChanger.falhas.test.tsx (aviso inline, retry que entrega o blob via `onVoiceChanged` e fecha só no sucesso).
- reprodução recusada não deixa `isPlaying` verdadeiro e avisa → VoiceChanger.falhas.test.tsx e VoiceChangerPicker.falhas.test.tsx (o botão volta a "Ouvir").
- aviso inline com ícone + "Tentar de novo" e motivo detalhado no tooltip → os dois componentes e os testes acima.
- botão play/pausa/carregando sem mudar largura → VoiceChangerPicker.falhas.test.tsx (w-28 nos três estados).
- movimento reduzido só com opacidade → VoiceChanger.reduced-motion.test.tsx (framer-motion real, só `useReducedMotion` controlado; com redução não há translate).
- alvos de interação ≥40 px nos botões que o cartão mexeu → h-10.

## O que NÃO fiz e por quê
- Não mexi em VoiceSelector.tsx nem em AudioRecorder.tsx (fora do cartão); só fui neles como consumidores, lendo o contrato.
- O diff é grande porque o cartão pede tratamento de erro + movimento reduzido nos dois componentes e os três testes novos; nenhum arquivo de outro assunto entrou no commit.
