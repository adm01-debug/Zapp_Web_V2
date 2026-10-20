Especialista: hugo
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 82s;OK lint 3s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (14/10 08:29, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  67 ++++--
 .../__tests__/audioExclusivo.players.test.tsx      | 231 +++++++++++++++++++++
 src/hooks/communication/useAudioPlayer.ts          | 140 ++++++++++++-
 src/lib/__tests__/audioPlayerState.test.ts         | 103 +++++++++
 src/lib/audioPlayerState.ts                        | 107 ++++++++++
 5 files changed, 619 insertions(+), 29 deletions(-)
```
- Testes alterados neste cartão (2 arquivo[s]) rodados AGORA no seu commit: Test Files 2 passed (2);Tests 10 passed (10)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:verifyHmac|signature


## O que mudou e por quê
- `src/hooks/communication/useAudioPlayer.ts`: registra o elemento no store de exclusividade por
  `messageId` (tocar este áudio assume a exclusividade e pausa quem tocava; um áudio de outro cartão
  pausa este), escuta `play`/`pause` do próprio elemento para o botão acompanhar pausa externa
  (store, controles do sistema) e reaplica `playbackRate` depois de `audio.load()`. Preserva posição
  e velocidade no store em `timeupdate`, `ratechange` e no desmonte, e restaura na montagem.
- `src/lib/audioPlayerState.ts` (novo): estado por `messageId` fora do React
  (`currentTime`/`playbackRate`/`paused`), TTL de 30 min e teto de 200 entradas com descarte do mais
  antigo — é o que faz a lista virtualizada do chat (que monta e desmonta balões ao rolar) devolver o
  ponto onde o atendente parou em vez de zero em 1x.
- `src/hooks/communication/__tests__/audioExclusivo.players.test.tsx` (novo): dois players (B pausa A
  e o botão de A volta a "tocar"), pausa externa pelo evento `pause` do elemento, desmonte/remontagem
  do mesmo `messageId` devolvendo posição e velocidade, e `load()` reaplicando a velocidade sem
  rebobinar a posição.
- `src/lib/__tests__/audioPlayerState.test.ts` (novo): cópia na leitura, fusão de campos sem apagar o
  que existe, expiração em 30 min e teto de 200 com rejuvenescimento de quem tocou de novo.

## Decisões (o que o diff mostra, e por quê)
- `ratechange` NÃO adota a velocidade do elemento: reafirma a escolha do atendente. O `load()` da
  renovação da URL assinada reinicia o elemento em 1x e dispara `ratechange`; adotar esse valor
  apagaria a velocidade escolhida — o teste `load() reaplica a velocidade` cobre isso.
- O store guarda SESSÃO DE ESCUTA: a entrada nasce quando há posição (`currentTime > 0`), não quando o
  balão só foi renderizado. Sem isso a virtualização do chat gastaria o teto de 200 entradas com
  áudios que ninguém ouviu, expulsando justamente os que estavam sendo ouvidos.
- O elemento é guardado em `elementRef` porque o `ref` do JSX já está `null` quando as limpezas de
  efeito rodam: sem isso o desmonte não pausava o som nem gravava o ponto (o teste do desmonte pegou
  exatamente isso).
- Nada de autoplay na remontagem: restaura posição e velocidade, e o botão continua em "tocar".
- `src/hooks/chat/useExclusiveAudio.ts` está nos arquivos que o cartão permite e NÃO precisou mudar:
  o store já expõe `playExclusiveAudio`/`pauseExclusiveAudio`/`registerExclusiveAudio` e a limpeza do
  registro já pausa e libera o dono do áudio.

## Prova
- vermelho antes: `npx vitest run src/hooks/communication/__tests__/audioExclusivo.players.test.tsx`
  (com o registro de exclusividade e a restauração desligados no hook) →
  `AssertionError: o elemento de A foi pausado: expected "vi.fn()" to be called at least once` e
  `AssertionError: desmontar pausou o som (sem som fantasma): expected "vi.fn()" to be called at least once`;
  `Tests  2 failed | 2 passed (4)`
- verde depois: `npx vitest run src/lib/__tests__/audioPlayerState.test.ts src/hooks/communication/__tests__/ src/components/inbox/__tests__/PlaybackSpeed.test.tsx src/hooks/__tests__/useAudioPlayer.test.tsx src/hooks/chat/__tests__/useExclusiveAudio.test.tsx`
  → `Test Files  12 passed (12)` / `Tests  103 passed (103)`
- suíte larga das áreas afetadas: `npx vitest run src/components/inbox src/hooks src/lib` →
  `Test Files  686 passed | 3 skipped (689)` / `Tests  6517 passed | 24 expected fail | 29 todo (6570)`

## O que NÃO fiz e por quê
- Não toquei em teste existente: `src/components/inbox/__tests__/PlaybackSpeed.test.tsx` (28 casos)
  continua passando sem alteração de expectativa — os casos que clicam velocidade/play sem ouvir
  áudio não criam entrada no store (regra da sessão de escuta) e por isso seguem vendo 1x na montagem.
- Não guardei a velocidade escolhida antes de o áudio começar (posição 0): a entrada nasce com a
  sessão de escuta, pelo motivo do teto de 200 entradas.
- Não mexi no lado servidor nem em Edge Function: nenhuma chamada nova.
