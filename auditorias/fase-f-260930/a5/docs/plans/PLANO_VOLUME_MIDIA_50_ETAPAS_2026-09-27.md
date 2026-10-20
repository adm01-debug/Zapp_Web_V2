# PLANO — CONTROLE DE VOLUME DE MÍDIA (ÁUDIOS E VÍDEOS DAS MENSAGENS) — 50 ETAPAS

> **Data:** 2026-09-27 · **Escopo:** front-end (Vercel) · **Sem DDL, sem edge function, sem migration.**
> **Objetivo de negócio:** o atendente consegue subir e baixar o volume dos áudios e vídeos que
> recebe e que envia, dentro do inbox, sem que isso mexa no volume dos alertas do sistema
> (mensagem nova, menção, SLA, meta, chamada entrando).
>
> Este documento é **plano**. Nenhuma linha de código foi alterada.

---

## 1. Por que os dois volumes são independentes (verificado no código, não assumido)

| Canal | Como o som sai hoje | Arquivo |
|---|---|---|
| **Alertas do sistema** | `AudioContext` → `OscillatorNode` → `GainNode` → `ctx.destination`. Ganho = `config.gains[i] * (settings.soundVolume/100)` | `src/utils/notificationSounds.ts:15-46`, `src/utils/notificationSound.ts:14-50` |
| **Ringtone de chamada entrante** | Mesmo caminho WebAudio (oscilador 440 Hz, `gain.gain.value = soundVolume/100*0.2`) | `src/components/calls/IncomingCallAlert.tsx:23-50` |
| **Áudio/vídeo das mensagens** | Elemento `<audio>` / `<video>` do DOM (`HTMLMediaElement`) | `AudioMessagePlayer.tsx:108`, `MediaPreview.tsx:124`, `VideoFullscreen.tsx:67`, etc. |

`HTMLMediaElement.volume` **não tem efeito nenhum** sobre nós WebAudio criados fora dele. Logo,
o controle novo (que só escreve em `element.volume` / `element.muted`) é fisicamente incapaz de
alterar o volume dos alertas. A E38–E41 transformam essa garantia em teste automatizado, para que
uma refatoração futura não quebre a separação em silêncio.

## 2. Estado verificado hoje (2026-09-27, commit `c80ec5f`)

- **Nenhum** `<audio>`/`<video>` do app seta `volume`. Todos tocam a 100% do volume do sistema
  operacional. Único controle de áudio existente no player é a velocidade (`cycleSpeed`,
  `useAudioPlayer.ts`).
- `VideoPreview` (`MediaPreview.tsx:110`) nasce **`muted`** e toca no hover — logo, vídeo no balão
  hoje é sempre mudo até abrir o fullscreen.
- `VideoFullscreen.tsx:67` também abre `muted`, com `autoPlay`.
- `soundVolume` (volume dos alertas) **não é persistido**: não existe coluna `sound_volume` em
  `user_settings` (conferido em `supabase/schema-catalog.json`), e `useNotificationSettings.ts:120-133`
  não o inclui em `dbUpdates`. Hoje o slider de volume do painel de notificações volta a 70% a
  cada reload. **Achado colateral — fora do escopo deste plano**, registrado em "Próximos passos".
- Sidebar → "Controles rápidos" (`Sidebar.tsx:210-226`) tem 4 botões: proteção de tela, push,
  `SoundMuteToggle` (mute dos **alertas**) e tema. O controle novo entra como 5º item.
- Sem `zustand` no projeto. Estado compartilhado = React Context / react-query / `localStorage`
  (precedente: `ScreenProtectionToggle.tsx`, `HighContrastToggle.tsx`).

### Superfícies de mídia mapeadas (todas entram no escopo, exceto onde marcado)

| # | Superfície | Arquivo | Fase |
|---|---|---|---|
| 1 | Áudio de mensagem (recebido e enviado) | `inbox/AudioMessagePlayer.tsx` + `hooks/communication/useAudioPlayer.ts` | F1–F2 |
| 2 | Vídeo no balão (hover) | `inbox/MediaPreview.tsx` (`VideoPreview`) | F3 |
| 3 | Vídeo em tela cheia | `inbox/VideoFullscreen.tsx` | F3 |
| 4 | Galeria de mídia (áudio e vídeo) | `inbox/media-gallery/MediaPreviewDialog.tsx` | F3 |
| 5 | Status/stories do WhatsApp | `inbox/contact-details/StoryViewer.tsx` | F3 |
| 6 | Chat interno da equipe (áudio/vídeo) | `team-chat/TeamChatPanel.tsx` | F5 |
| 7 | Player de transcrições (autoplay) | `transcriptions/TranscriptionContactGroup.tsx` | F5 |
| 8 | Gravação de chamada | `calls/VoIPPanel.tsx` | F5 |
| 9 | Prévias de TTS / voice changer / memes | `inbox/TextToAudioButton.tsx`, `VoiceChanger.tsx`, `VoiceChangerPicker.tsx` | F5 |
| — | Ringtone e alertas | `IncomingCallAlert.tsx`, `utils/notificationSound*.ts` | **excluído por definição** |
| — | Biblioteca de mídia do admin | `settings/media-library/*` | **fora de escopo** (é gestão de arquivo, não conversa) |

## 3. Decisões de arquitetura (já tomadas — não precisam de resposta do Joaquim)

- **D1 — Onde mora o valor:** `localStorage` (`zapp.media.volume`, `zapp.media.muted`), por
  dispositivo. Volume é característica do fone/máquina do atendente, não da conta; e evita DDL,
  evita round-trip e não entra no fluxo de migration.
- **D2 — Fonte única:** um store minúsculo com `useSyncExternalStore` (sem lib nova), exposto por
  `useMediaVolume()`. Todo player lê do mesmo lugar; mudar num lugar muda em todos, inclusive em
  outra aba.
- **D3 — Curva:** o slider é 0–100 em passo de 5; o ganho aplicado é `(v/100)²` (percepção de
  volume é logarítmica — linear faz tudo parecer alto entre 30% e 100% e inaudível abaixo).
- **D4 — Mute é estado próprio**, não `volume=0`: desmutar devolve o volume anterior.
- **D5 — iOS/Safari:** `HTMLMediaElement.volume` é somente-leitura no iOS (o sistema manda). Nessas
  plataformas o app usa `GainNode` via `MediaElementAudioSourceNode` (possível porque o `<audio>`
  do player já tem `crossOrigin="anonymous"`); se nem isso funcionar, o slider aparece desabilitado
  com a explicação, em vez de mentir para o usuário.
- **D6 — Zero churn:** `SoundMuteToggle` (alertas) fica **exatamente como está**. O controle de
  mídia é um botão novo, com ícone diferente (fone), para ninguém confundir os dois.

---

# PLANO EM 50 ETAPAS

## Fase 0 — Fundação do estado (E01–E06)

- **E01.** Criar `src/lib/mediaVolumeStore.ts`: store com `getSnapshot`/`subscribe`/`setVolume`/
  `setMuted`/`toggleMuted`, estado `{ volume: number; muted: boolean }`, default `{ volume: 80, muted: false }`.
  *Aceite:* módulo puro, sem React, testável em Node.
- **E02.** Persistência com chaves `zapp.media.volume` / `zapp.media.muted`; leitura tolerante
  (valor corrompido, `localStorage` bloqueado em aba anônima → cai no default sem lançar).
  *Aceite:* teste com `localStorage.getItem` lançando exceção não quebra o app.
- **E03.** Clamp e saneamento: `volume` sempre inteiro 0–100; `NaN`/`null`/fora de faixa → default.
- **E04.** Conversão perceptual `toGain(volume) = (volume/100) ** 2`, exportada como função pura e
  coberta por teste de tabela (0→0, 50→0.25, 100→1).
- **E05.** Sincronização entre abas: `BroadcastChannel('zapp-media-volume')` com fallback no evento
  `storage`. *Aceite:* mudar o volume na aba A reflete na aba B sem reload.
- **E06.** `src/hooks/communication/useMediaVolume.ts` — hook React sobre o store via
  `useSyncExternalStore`, retornando `{ volume, muted, gain, setVolume, setMuted, toggleMuted, isSupported }`.

## Fase 1 — Aplicação nos elementos de mídia (E07–E12)

- **E07.** `src/hooks/communication/useMediaElementVolume.ts`: recebe `RefObject<HTMLMediaElement>`,
  aplica `gain`/`muted` no mount, a cada mudança do store e no evento `loadedmetadata`
  (elemento recriado quando a URL assinada troca perde o volume, por isso o listener).
- **E08.** Helper imperativo `attachMediaVolume(el): () => void` para os players criados com
  `new Audio(...)` (TTS, voice changer), que não têm ref React.
- **E09.** Detecção de suporte (D5): escreve `0.5` em `volume`, lê de volta; se não mudou, marca
  `isSupported=false` e liga o caminho `GainNode`.
- **E10.** Caminho `GainNode`: `AudioContext` dedicado de mídia (**instância separada** da usada
  pelos alertas — nunca reutilizar `getAudioContext()` de `notificationSounds.ts`), com
  `createMediaElementSource` + `gain`, criado sob demanda e liberado no unmount.
- **E11.** Integrar em `useAudioPlayer.ts`: consumir `useMediaElementVolume(audioRef)` e expor
  `volume`, `muted`, `setVolume`, `toggleMuted` no retorno do hook, sem mexer na lógica de URL
  assinada / progresso / velocidade.
- **E12.** Garantir que a troca de mensagem (`createInitialPlaybackState`) não zera o volume:
  volume é global, não faz parte do `playbackState` por mensagem.

## Fase 2 — UI no player de áudio (E13–E19)

- **E13.** `src/components/inbox/MediaVolumeControl.tsx`: botão com ícone (`Volume2`/`Volume1`/
  `VolumeX` conforme faixa) + `Popover` com `Slider` vertical, rótulo em % e botão "mudo".
  Props: `variant: 'bubble' | 'overlay' | 'sidebar'`, `className`.
- **E14.** Encaixar no `AudioMessagePlayer.tsx`, entre o botão de velocidade e o de transcrição,
  respeitando as variantes de cor `isSent` (enviado usa `primary-foreground`, recebido usa `primary`).
- **E15.** Clique curto no ícone = mudo/desmudo; clique e segurar / clique no chevron = abre slider.
  Scroll sobre o ícone ajusta ±5.
- **E16.** Atalhos de teclado no player focado: `↑`/`↓` = ±5, `M` = mudo. Não capturar as setas
  quando o foco estiver no campo de mensagem.
- **E17.** Acessibilidade: `role="slider"`, `aria-valuenow/min/max`, `aria-label="Volume das mídias"`,
  `aria-pressed` no mudo, foco visível (`focus-visible:ring-primary/50`, padrão do projeto).
- **E18.** Estilo: nada de cor literal. Usar tokens (`bg-muted/50`, `text-primary`,
  `--inbox-panel-bg` quando for painel) — lição documentada no CLAUDE.md sobre `bg-black` fixo.
  Conferir contraste ≥ 4.5:1 em claro, escuro e alto-contraste.
- **E19.** `prefers-reduced-motion`: sem animação de escala no popover quando ligado.

## Fase 3 — Vídeos (E20–E26)

- **E20.** `VideoPreview` (`MediaPreview.tsx`): manter o mudo no hover (comportamento atual,
  deliberado), mas passar a respeitar `muted` global quando o usuário der play explícito.
- **E21.** `VideoFullscreen.tsx`: aplicar `useMediaElementVolume(videoRef)`; abrir com o volume
  global em vez de `muted` fixo, mantendo `muted` se o global estiver mudo.
- **E22.** Adicionar `MediaVolumeControl variant="overlay"` na barra de ações do fullscreen
  (ao lado de download/fechar), já que os controles nativos ficam sobrepostos.
- **E23.** `MediaPreviewDialog.tsx` (galeria): aplicar em `<video>` e `<audio>` via ref.
- **E24.** `StoryViewer.tsx`: aplicar no `<video>` do status; status hoje abre com `autoPlay` e som
  no talo — passa a abrir no volume escolhido.
- **E25.** Garantir que só **um** player toca por vez não é objetivo deste plano; se dois tocarem,
  ambos respeitam o mesmo volume. (Registrado para não virar escopo escondido.)
- **E26.** Vídeo sem faixa de áudio: o controle aparece desabilitado com tooltip "Vídeo sem áudio".

## Fase 4 — Controle global na sidebar (E27–E32)

- **E27.** `src/components/layout/MediaVolumeToggle.tsx` — botão 36×36 com ícone de fone
  (`Headphones`/`HeadphoneOff`), usando `MediaVolumeControl variant="sidebar"`.
- **E28.** Inserir em `Sidebar.tsx:217-226` como 5º controle, **depois** do `SoundMuteToggle`.
  Verificar que a linha continua cabendo na sidebar recolhida (layout vira coluna quando `collapsed`).
- **E29.** Tooltips em PT-BR sem ambiguidade: alertas = "Silenciar sons de alerta" (já existe);
  mídia = "Volume dos áudios e vídeos" / "Áudios e vídeos mudos".
- **E30.** Badge/indicador: ponto no ícone quando o volume está abaixo de 30% ou mudo, para o
  atendente descobrir sozinho por que "não escuta o áudio do cliente".
- **E31.** Conflito de UI conhecido: a PR aberta `#1040` mexe nos botões do **header do chat**, não
  nos "Controles rápidos" da sidebar. Antes do push, reconferir se ela ainda está aberta e se
  encostou em `Sidebar.tsx`.
- **E32.** Responsivo: em telas estreitas, o popover do slider abre para o lado (`side="right"`)
  e nunca fora da viewport.

## Fase 5 — Superfícies secundárias (E33–E37)

- **E33.** `TeamChatPanel.tsx`: aplicar em `<audio>`/`<video>` do chat interno (mesmo hook, via ref).
- **E34.** `TranscriptionContactGroup.tsx`: o `<audio autoPlay>` passa a nascer no volume global —
  hoje um autoplay a 100% é o pior caso de susto em open space.
- **E35.** `VoIPPanel.tsx`: gravação de chamada é mídia, não alerta → entra no controle.
- **E36.** `TextToAudioButton.tsx`, `VoiceChanger.tsx`, `VoiceChangerPicker.tsx`: usar
  `attachMediaVolume` (E08) nos `new Audio(...)`.
- **E37.** Revisão final de cobertura: `grep -rn "<audio\|<video\|new Audio(" src` e conferir que
  toda ocorrência de mídia de conversa está coberta ou explicitamente excluída com comentário.

## Fase 6 — Blindagem das notificações (E38–E41)

- **E38.** Teste unitário: alterar o volume de mídia **não** chama `updateSettings` de
  `useNotificationSettings` e não muda `soundVolume`.
- **E39.** Teste unitário: com volume de mídia em 0 e mudo ligado, `playNotificationSound` continua
  criando oscilador com ganho derivado de `settings.soundVolume` (mock de `AudioContext` conferindo
  `gain.gain` e `ctx.destination`).
- **E40.** Teste: o `AudioContext` de mídia (E10) é uma instância diferente da de
  `notificationSounds.ts` — evita que um `ctx.close()` num caminho mate o outro.
- **E41.** Comentário-âncora nos dois módulos ("alertas = WebAudio; mídia = HTMLMediaElement — não
  unifique") + linha no `CLAUDE.md` sobre a separação, para a próxima sessão não "consolidar" os dois.

## Fase 7 — Testes e verificação (E42–E46)

- **E42.** `src/components/inbox/__tests__/MediaVolume.test.tsx` no molde do
  `PlaybackSpeed.test.tsx` existente (mesmos mocks de supabase, framer-motion e toast).
- **E43.** Testes do store: persistência, clamp, curva, mute/unmute preservando valor, `localStorage`
  indisponível, sincronização entre abas (dois subscribers).
- **E44.** Teste do ciclo de URL assinada: trocar `resolvedUrl` recria o elemento → volume é
  reaplicado (regressão que só aparece depois de 50 min de sessão, quando a URL é renovada).
- **E45.** E2E Playwright em `e2e/` (projeto `chromium-authenticated`, contato fixo de teste
  `04dff4dc-…` já seedado): abrir conversa com áudio, mudar volume, recarregar, conferir que
  persistiu. Seguir `e2e/README.md` e `e2e/fixtures/e2e-contact.ts`.
- **E46.** Checklist manual de navegador: Chrome, Edge, Firefox, Safari macOS e Safari iOS
  (este último é o caso do D5/E09 — confirmar o comportamento real, não presumir).

## Fase 8 — Entrega (E47–E50)

- **E47.** Branch única `claude/feat-media-volume-<AAMMDD-HHMM>` a partir de `main` atualizada,
  commits em PT-BR (`feat:`), diff mínimo por arquivo.
- **E48.** PR com os 6 required checks verdes (Lint & TypeCheck, Unit Tests, Build, Security Audit,
  Contrato DB offline, E2E Playwright). Nenhum DDL ⇒ `db-live-guard` não muda.
- **E49.** Merge = deploy do front na Vercel. Confirmar o deploy e abrir uma conversa real com
  áudio e outra com vídeo em produção, validando: volume muda, persiste no reload, **e um alerta
  de mensagem nova continua saindo no volume de sempre com a mídia em mudo**.
- **E50.** Fechamento: atualizar este arquivo com o que foi verificado ao vivo (print/log), apagar a
  branch mergeada no mesmo turno e registrar os achados colaterais (volume de alerta não persistido)
  como tarefa separada — não emendar no mesmo PR.

---

## 4. Critérios de aceite do conjunto

1. Um controle, um valor: mudar o volume em qualquer player muda em todos, e sobrevive ao reload e
   à troca de aba.
2. Áudio recebido **e** áudio enviado respondem ao controle. Idem vídeo, nas 5 superfícies da F3.
3. Com mídia em mudo, os alertas do sistema (mensagem, menção, SLA, meta, chamada) continuam
   audíveis no volume configurado em Notificações — provado por teste (E38–E40) e à mão (E49).
4. Nada do painel de Notificações muda de comportamento.
5. Sem migration, sem edge function, sem secret novo.
6. Sem dependência nova no `package.json`.

## 5. Riscos

| Risco | Mitigação |
|---|---|
| iOS ignora `volume` | E09/E10 (GainNode) e, no pior caso, slider desabilitado com explicação |
| URL assinada renova e recria o elemento, perdendo o volume | E07 (listener `loadedmetadata`) + E44 |
| Confusão entre os dois botões de som na sidebar | Ícone e texto distintos (E27/E29) + indicador de mudo (E30) |
| Sessão paralela mexendo em `Sidebar.tsx` | E31: reconferir PRs abertas antes do push |
| `AudioContext` de mídia esbarrar no autoplay policy | Criar sob demanda, no primeiro play do usuário |

## 6. Fora de escopo (deliberado)

Volume por conversa; volume separado para enviados e recebidos; normalização/boost de áudio baixo;
equalizador; persistência do volume no banco; correção do `soundVolume` não persistido dos alertas;
tocar só um player por vez.
