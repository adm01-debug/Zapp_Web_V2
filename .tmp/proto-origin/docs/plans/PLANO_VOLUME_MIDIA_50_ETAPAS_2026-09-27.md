# PLANO — CONTROLE DE VOLUME DE MÍDIA (ÁUDIOS E VÍDEOS DAS MENSAGENS) — 50 ETAPAS

> **Data:** 2026-09-27 · **Escopo:** front-end (Vercel) · **Sem DDL, sem edge function, sem migration.**
> **Objetivo de negócio:** o atendente consegue subir e baixar o volume dos áudios e vídeos que
> recebe e que envia, dentro do inbox, sem que isso mexa no volume dos alertas do sistema
> (mensagem nova, menção, SLA, meta, chamada entrando).
>
> Este documento é **plano**. Nenhuma linha de código foi alterada.
>
> **Atualização de 2026-10-01:** o plano foi **executado e fechado** — a evidência etapa por etapa
> está na seção "7. Estado de execução". O texto abaixo é o plano original, preservado como
> registro da intenção (onde ele diz "nenhuma linha de código foi alterada", vale para 2026-09-27).

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
   audíveis no volume configurado em Notificações — a fiação é provada por teste (E38–E40); a
   audição real do alerta em aparelho **não foi medida** (a E49 fechada foi um run de UI, não uma
   sessão ouvida — ver §7.4 e `docs/evidencias/plano-volume-50/e46-navegadores.md`).
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

---

## 7. Estado de execução (fechamento — 2026-10-01)

> O plano virou execução. Cada etapa fechada nesta rodada traz a evidência medida
> (`arquivo:linha`, teste ou run). As etapas conferidas antes desta rodada têm a evidência por
> etapa em `docs/audits/AUDITORIA_ENTREGAS_HERMES_2026-09-30.md` (auditoria do Claude na
> `main` `a1ddaafe`).

### 7.1 Etapas fechadas nesta rodada

| Etapa | O que ficou de fato | Evidência |
|---|---|---|
| **E10** | O `AudioContext` da mídia nasce no **primeiro play** (gesto do usuário) e é liberado no unmount: `disconnect` no ganho do elemento e `close` no contexto quando o **último** player solta (contagem — fechar sempre emudeceria quem continua na tela). Antes ele nascia no mount: o navegador entrega o contexto SUSPENSO, o áudio sai mudo e `resume()` não sai de `suspended` sem interação. | `src/lib/mediaVolumeElement.ts:113-137` (gate do gesto), `:160-186` (release + close), `:194-208` (`bindMediaVolume`) · `src/hooks/communication/useMediaElementVolume.ts:44-78` · testes `MediaVolume.test.tsx` ("o contexto da mídia nasce no primeiro play…" e "…só fecha quando o ÚLTIMO solta") + `mediaVolumeElement.test.ts:101` · mutações E10a/E10b/E10c |
| **E16** | ↑/↓ e `M` valem com o foco em **qualquer parte do player** (botão de play, barra de progresso, ...), não só no botão do volume; o mesmo teclado chegando pelos dois caminhos conta **uma vez** (dedup por `defaultPrevented`); e o ajuste passou a ler o valor atual do store (com o valor do render, a contagem dupla era invisível). | `src/hooks/ui/useVolumeRocker.ts:57-100` (núcleo + dedup) e `:141-153` (listener no container) · `MediaVolumeControl.tsx:57-70` · escopo do player em `AudioMessagePlayer.tsx:26,108,143` e `VideoFullscreen.tsx:20,57,68` · teste E16 · mutações E16a/E16b |
| **E18** | Conferido — e **reprovado em 6 pares**, todos por token/estilo do app, nenhum por cor literal no controle. Ver 7.2. | medição no Chromium (7.2) |
| **E37** | As 4 superfícies de mídia que **não** são de conversa (laboratório de voz e biblioteca do admin) passam a ter isenção **explícita** no código e no contrato — como já era o caso dos alertas. | comentários em `src/components/voice/ElevenLabsVoiceDesign.tsx:149`, `src/components/voice/ElevenLabsDialogue.tsx:157`, `src/components/settings/media-library/AIGenerateDialog.tsx:32`, `src/components/settings/media-library/useMediaLibrary.ts:221` · `tests/contracts/media-volume-surfaces.contract.test.ts:64-71` · mutações E37a/E37b |
| **E39** | O teste do alerta lê `settings.soundVolume` (não um literal) e confere que a cadeia termina num `ctx.destination` de verdade. | `src/components/inbox/__tests__/MediaVolume.test.tsx` (caso E38/E39) · mutação E39 |
| **E41** | A âncora `ÂNCORA (não unificar)` também no toque da chamada entrante — o módulo que mais tenta "consolidar" os canais, porque o ganho dele igualmente sai de `settings.soundVolume` — agora pinada por teste. (A linha correspondente no `CLAUDE.md` foi **decidida como não acrescentada** — ver 7.6.) | `src/components/calls/IncomingCallAlert.tsx:14-26` · asserção no caso E41 de `MediaVolume.test.tsx` · mutação E41 |
| **E45/E48** | O spec de volume do E2E logado perdeu a flake: o clique longo posicional (timer de 400 ms cancelado por qualquer `pointerleave`) deu lugar a `focus()` + `Enter`, o equivalente de teclado do mesmo `setOpen(true)`. **A causa citada pela auditoria (`media-volume.spec.ts:49`) era linha obsoleta** — nas runs o spec aparece como *flaky* (1ª tentativa vermelha, retry verde), e o `beforeEach` nunca falhou. | `e2e/media-volume.spec.ts:59-71` e `:106-108` · diagnóstico com 42 runs em `docs/evidencias/plano-volume-50/e45-e48-e2e.md` |
| **E46** | Checklist de navegadores registrado com o que é prova e o que depende de aparelho. Ver 7.3. | `docs/evidencias/plano-volume-50/e46-navegadores.md` |
| **E31/E47/E49** | Branch, PR e validação em produção. Ver 7.4. | 7.4 |
| **E50** | Cabeçalho deste arquivo corrigido + persistência do volume dos ALERTAS conferida com o código em mãos. Ver 7.5. | 7.5 |
| **D6** | O `SoundMuteToggle` — que esta decisão dizia intocado — foi substituído pelo `SoundVolumeControl` (com slider) em etapa anterior; o controle de MÍDIA entrou ao lado como `MediaVolumeToggle`, com ícone distinto (fone). **Decisão mantida, não revertida** (D6 descrevia o estado de 27/09; a UI evoluiu com a própria etapa do volume de alertas). | `src/components/layout/Sidebar.tsx:221` (alertas) e `:224` (mídia) |

### 7.2 E18 — contraste medido (e reprovado)

Método: CSS real compilado (`tailwindcss -c tailwind.config.ts -i src/index.css`), DOM montado com
as strings de classe dos componentes e `getComputedStyle` lido no **Chromium** (Playwright); o fundo
é a **cadeia real de `background-color` até o primeiro opaco** — é assim que `bg-muted/50` compõe.
Vars de tema aplicadas inline no `<html>`, como o app faz (preset `corporate`). Medição em repouso,
com transições desligadas.

| Par (fg × bg) | Claro | Escuro | Alto-contraste |
|---|---|---|---|
| sidebar, ícone ativo (`--primary` sobre `--muted/50`) | 4,71 ✅ | **3,29 ❌** | 4,71 ✅ |
| sidebar, ícone mudo | 4,60 ✅ | 8,96 ✅ | 4,60 ✅ |
| overlay do fullscreen (`--secondary-foreground` sobre `--secondary`) | **3,30 ❌** | 14,88 ✅ | **3,30 ❌** |
| balão RECEBIDO (`--muted-foreground` sobre `--muted/50`) | **4,17 ❌** | 7,33 ✅ | **4,17 ❌** |
| balão ENVIADO (`--primary-foreground/70` sobre `--primary-foreground/10`) | **2,94 ❌** | **2,94 ❌** | **2,94 ❌** |
| popover: título/rodapé (`--muted-foreground`) e valor (`--popover-foreground`) sobre `--popover` | 5,06 / 17,05 ✅ | 9,34 / 16,93 ✅ | 5,06 / 17,05 ✅ |
| botão "Mudo" do popover (`--primary-foreground` sobre `--primary`) | 5,17 ✅ | 5,17 ✅ | 5,17 ✅ |
| slider: trilha × range (`--primary` × `--secondary`) — 1.4.11 pede 3:1 | **1,30 ❌** | **2,88 ❌** | **1,30 ❌** |

**Três defeitos que a medição revelou — nenhum corrigido aqui (fora do escopo desta etapa):**

1. **O alto-contraste não chega ao app.** `applyThemePreset` grava `--primary/--muted/--secondary/...`
   **inline no `<html>`** (`src/lib/theme/presets.ts`) e estilo inline vence a classe
   `.high-contrast` (`src/styles/accessibility.css`). Com o toggle ligado, `--primary` continua
   `221 83% 53%` (corporate) — por isso a coluna de HC sai idêntica à do claro. Consequência dupla:
   **o E18 não é conferível em alto-contraste enquanto isto existir**, e todo usuário de
   alto-contraste está sem os tokens dele.
2. **O balão enviado reprova até o limiar de ícone (3:1)**, nos três temas: `--primary-foreground/70`
   sobre `bg-primary-foreground/10` (`AudioMessagePlayer.tsx:113` e `:146`). Subir para 100% chega a
   4,36; só passa (5,20) removendo o overlay `primary-foreground/10` da faixa de controles.
3. **Tokens que reprovam fora daqui**: `--muted-foreground` no claro (4,17 no balão recebido) e
   `--secondary` no claro (3,30 no overlay). Mexer neles atinge o app inteiro — é mudança de design
   system, decisão separada.

### 7.3 E46 — checklist de navegadores

Registrado em `docs/evidencias/plano-volume-50/e46-navegadores.md` (24 linhas, no formato
`plataforma | passo exato | critério de aprovação | status | evidência`). O que ficou **provado** e o
que **depende de aparelho**:

- **Provado por teste**: caminho nativo (`element.volume` gravável) sem criar contexto —
  `src/lib/__tests__/mediaVolumeElement.test.ts:79`; iOS read-only caindo no `GainNode`, com o nó
  reusado (`createMediaElementSource` uma vez por elemento) — `:93`, `:101`, `:111`; teclado com o
  foco no player e sem captura global — `MediaVolume.test.tsx` (E16); roda do mouse, persistência no
  reload e sincronização entre abas.
- **Decidido por código**: sondas de faixa de áudio por motor (`mozHasAudio`, `webkitAudioDecodedByteCount`,
  `audioTracks`), `webkitAudioContext`, e a guarda de `input/textarea/contentEditable`
  (`useVolumeRocker.ts:100-109`).
- **PENDENTE — precisa de aparelho**: Edge (o Playwright só tem chromium/firefox/webkit — paridade com
  o Chrome é esperada por motor, não medida); autoplay real; **Safari iOS inteiro**; teclado no
  fullscreen nativo; troca de vídeo no preview.

**Achados que o checklist levanta e que NÃO foram corrigidos aqui:** `VideoFullscreen.tsx:94` está
sem `crossOrigin` (o `<audio>` do player tem: `AudioMessagePlayer.tsx:109`) — em URL assinada
cross-origin o `createMediaElementSource` pode lançar, o `catch` cai num `element.volume` que no iOS
é no-op silencioso e **o caminho do E10 deixa de valer no vídeo**; e o mesmo elemento está sem
`playsInline`, o que no iOS entrega o vídeo ao player nativo.

### 7.4 E31/E47/E49 — branch, PR e produção

- **Branch:** `hermes/plano-volume-50-etapas-finalizacao-2610011018e48d`.
- **PR:** [#1395](https://github.com/adm01-debug/Zapp_Web_V2/pull/1395) — `feat(midia): fecha as
  etapas pendentes do plano de volume de mídia (E10/E16/E37/E39/E41/E45)`, 3 commits: as etapas de
  código, o spec do E2E e este plano.
- **E31 (conflito de UI):** conferido — a PR **#1040** mexeu no header do chat e na sidebar do
  contato, **não** nos "Controles rápidos" da sidebar (`Sidebar.tsx:210-226`); já está MERGED, então
  não há colisão pendente.
- **E49:** a validação em produção é o próprio **`e2e-logado`** na `main` depois do merge — é o CI
  autenticado (`--project=chromium-authenticated` inclui `e2e/media-volume.spec.ts`), e é ele que
  exercita o volume persistindo no reload e o botão de alertas intocado com a mídia muda.
  **Merge:** `1bab14c9` em 2026-10-01T11:30:23-03:00, `deploy:production=success`, `DDL_POS_MERGE=nenhum`;
  **run de validação:** [`36882291819`](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/36882291819)
  (push na `main` que já contém o merge) → **38 passaram, 1 falhou, e a falha não é de volume**:
  `e2e/reactions.spec.ts:84 › clicking a reaction badge toggles it off` (flake pré-existente, já
  citado na auditoria de 30/09). **O spec de volume passou em produção**, incluindo o caso do controle
  da sidebar que era flaky — é o deflake do E45 validado onde importa.

  **Qualificação da prova (o que este run NÃO prova):** o `e2e-logado` prova só os controles de UI
  registrados no spec — slider, persistência no reload, mudo e o `aria-label` do botão de alertas.
  Ele **não** prova audição nem playback real: o caso que mede `<audio>.volume` segue `test.fixme`
  (`e2e/media-volume.spec.ts:152`), porque o contato de fixture não tem mensagem de áudio — e
  **nenhuma** fixture de áudio foi criada ou semeada (escrever a mensagem exigiria o tenant de
  produção, não autorizado — §7.6, pendência 1). A metade audível do critério 3 (§4) fica, portanto,
  **sem medição em aparelho**: só a fiação é provada por teste (E38–E40), e a audição real segue
  PENDENTE em `docs/evidencias/plano-volume-50/e46-navegadores.md`.

### 7.5 E50 — persistência do volume dos ALERTAS

- **Código (leitura + escrita):** `useNotificationSettings.ts:88` lê `data.sound_volume` e `:154`
  grava `dbUpdates.sound_volume = clampSoundVolume(updates.soundVolume)` — a coluna entrou pela
  migration `supabase/migrations/20260929800000_user_settings_sound_volume.sql`.
- **Banco canônico (`tnnnlkbymytvtqngbbqh`), medido AO VIVO em 01/10 12:14** (gateway de leitura,
  após o banco voltar): `select count(*), count(sound_volume), min(sound_volume), max(sound_volume)
  from user_settings` → **2 linhas, 2 com `sound_volume`, mínimo = máximo = 70**. O valor persiste e
  está dentro da faixa dos CHECKs.
- Nota de método: a primeira re-medição do fechamento deu **timeout/HTTP 520** no gateway de leitura
  (ele não é meu para mexer); o banco voltou e a medição acima é a definitiva.

### 7.6 Contagem 50/50

| Etapas | Situação |
|---|---|
| E01–E09, E11–E15, E17, E19–E30, E32–E36, E38, E40, E42–E44 | **FEITAS** — conferidas na auditoria de 2026-09-30 (evidência por etapa no doc da auditoria) |
| E10, E16, E18, E31, E37, E39, E41, E45, E46, E47, E48, E49, E50 | **FEITAS nesta rodada** — evidência nas seções 7.1 a 7.5 |

**Pendências explícitas (nenhuma delas é "etapa não feita"):**

1. **Mensagem de ÁUDIO no contato de fixture (E45)** — **BLOQUEADO POR DECISÃO (Joaquim,
   2026-10-01 11h55): não autorizado.** O caminho exigiria gravar objeto no bucket `whatsapp-media`
   E linha em `messages` no **banco de produção** (tenant real — histórico de cliente fabricado,
   limpeza não garantida se o job morrer, efeito em badge/SLA/alerta). O caso segue `test.fixme` com
   o motivo escrito no próprio spec; caminho completo e riscos em
   `docs/evidencias/plano-volume-50/e45-e48-e2e.md`.
2. **E18 em alto-contraste** — bloqueado pelo defeito do tema (7.2, item 1), que é anterior a este
   plano. **Tarefa separada autorizada (Joaquim, 2026-10-01 11h55)**: abrir logo depois deste PR,
   com teste vermelho-antes.
3. **Linha no `CLAUDE.md` (E41)** — **DECIDIDO NÃO ACRESCENTAR (Joaquim, 2026-10-01 11h55)**: a
   lição fica neste plano e na âncora `ÂNCORA (não unificar)` já presente no código e pinada por
   teste. Nada a fazer.

**Divergências do enunciado encontradas e resolvidas com o código real** (registradas para a próxima
sessão não repetir): (a) os caminhos do E37 são `src/components/voice/ElevenLabs*.tsx` e
`src/components/settings/media-library/*` — não `src/components/settings/ElevenLabs*` nem
`src/hooks/settings/useMediaLibrary.ts`; (b) `media-volume.spec.ts:49` citado pela auditoria era
**linha obsoleta** (o `beforeEach` não falhava; o problema era flake no clique longo).
