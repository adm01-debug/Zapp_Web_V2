Especialista: hugo

## O que mudou e por quê
- `src/hooks/communication/audioPlaybackBus.ts` (novo): `toggleMuteActive()` é o porte do barramento do app antigo, encostado no que a V2 já faz melhor. A V2 não tem mudo por player: o volume das mídias é UM valor global (`src/lib/mediaVolumeStore.ts`, D2/E4/D4) — o gatilho do balão, o do fullscreen e o da sidebar leem o mesmo valor, e é isso que faz o botão do balão mostrar o que o som toca. Então o barramento é fino: pergunta "tem áudio tocando?" ao store de reprodução exclusiva (A01/PH-22, `src/hooks/chat/useExclusiveAudio.ts`) e delega o mudo ao store único; sem áudio tocando devolve `null` e o toque é inerte.
- `src/hooks/shortcuts/defaultShortcuts.ts`: entrada `audio-toggle-mute` — tecla `m`, sem modificador, sem escopo, categoria `chat`, com `name` e `description` (casa a tecla no registry e aparece no diálogo do `?`).
- `src/hooks/ui/useGlobalKeyboardShortcuts.ts`: ação `audio-toggle-mute` (toast pt-BR "Áudio silenciado" / "Volume em N%") + a cedência ao gatilho de volume. A guarda de campo de texto e a de modificador já vêm do registry: o id não está na lista branca de input, então em INPUT/TEXTAREA/contentEditable o `M` é ignorado, sem código novo.
- `src/hooks/ui/useVolumeRocker.ts` e `src/components/ui/VolumeTriggerButton.tsx`: constante `VOLUME_CONTROL_ATTRIBUTE` (`data-volume-control`) marcando o gatilho do controle de volume. Sem ela o `M` global, que captura o `keydown` na janela e faz `stopPropagation`, tornaria inalcançável o `M` local do `useVolumeRocker` (E16) — e no gatilho dos ALERTAS esse `M` muda o mudo dos ALERTAS, não o das mídias. Com a marca, o `M` global cede o toque quando o foco já está no gatilho.
- Testes novos: `src/hooks/communication/__tests__/audioPlaybackBus.test.ts` e `src/hooks/__tests__/useGlobalKeyboardShortcuts.audioMute.test.tsx`.

## Sobre o único arquivo fora da lista do cartão
`src/components/ui/VolumeTriggerButton.tsx` (apontado pelo juiz barato, e registrado em comentário no cartão): é o gatilho de volume que o player de áudio (`AudioMessagePlayer` → `MediaVolumeControl`) e o controle de ALERTAS (`SoundVolumeControl`) renderizam. A mudança é uma linha — o atributo `data-volume-control` (lido pelo registry através da constante exportada em `src/hooks/ui/useVolumeRocker.ts`, arquivo da lista) — e é o que evita a regressão do `M` dos alertas descrita acima. Sem mudança de visual. O barramento e o teste dele ficaram em `src/hooks/communication/` e `src/hooks/communication/__tests__/`, dentro de "src/hooks/ (audio)" e "testes".

## Prova
- vermelho antes (atalho novo): `npx vitest run src/hooks/__tests__/useGlobalKeyboardShortcuts.audioMute.test.tsx` com o registry e as duas fontes de atalho no estado de `HEAD` → `Tests 2 failed | 3 passed (5)` — o `M` não silenciava e o botão não refletia.
- vermelho antes (canal do controle de volume): mesma execução sem a cedência no laço → `AssertionError: expected "vi.fn()" to be called with arguments: [ { soundEnabled: false } ] / Number of calls: 0` — com o foco no gatilho dos alertas, o mudo das mídias roubava o toque.
- verde depois: `npx vitest run` nos 11 arquivos atingidos (os 2 novos + `useGlobalKeyboardShortcuts`, `defaultShortcuts`, `taskShortcutLabels`, `MediaVolume`, `KeyboardShortcutsDialog`, `SoundVolumeControl`, `useVolumeRocker`, `useMediaVolume`, `audioExclusivo.players`) → `Test Files 11 passed (11); Tests 105 passed (105)`.
- verde depois: `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (52s)`.

## Critério de pronto
- Critério 1 (M silencia e restaura o áudio ativo): coberto — `useGlobalKeyboardShortcuts.audioMute.test.tsx` prova `M` silenciando com áudio tocando e o toque seguinte devolvendo o volume anterior (60%), e `audioPlaybackBus.test.ts` prova o contrato do barramento.
- Critério 2 (atalho ignora campos de texto): coberto — mesmo arquivo, caso "não dispara com modificador (Ctrl+M, Alt+M) nem dentro de campo de texto".
- Critério 3 (`zapp-verify . --rapido` verde): coberto — linha acima, `VERIFY: VERDE SEM BANCO (52s)`.
- O `aria-pressed` e o rótulo pt-BR do gatilho já existiam (`VolumeTriggerButton` + `src/lib/volumeLabels.ts`, E22); o que faltava era o caminho do teclado: o teste novo prova os dois juntos — com áudio tocando, `M` deixa o gatilho do balão em `aria-pressed="true"` com o rótulo "Áudios e vídeos mudos".
