# E46 — Checklist manual de navegador: volume das mídias de conversa

> **Escopo lido no código:** `src/lib/mediaVolumeElement.ts`, `src/lib/mediaVolumeStore.ts`,
> `src/hooks/communication/useMediaVolume.ts`, `useMediaElementVolume.ts`, `useAudioPlayer.ts`,
> `src/hooks/ui/useVolumeRocker.ts`, `src/components/inbox/MediaVolumeControl.tsx`,
> `AudioMessagePlayer.tsx`, `MediaPreview.tsx`, `VideoFullscreen.tsx`,
> `src/components/layout/MediaVolumeToggle.tsx`.
>
> **Legenda de status:** `coberto por teste automatizado (arquivo:linha)` = um teste existente
> já prova; `verificável por código (arquivo:linha)` = o código decide, nada a perguntar ao
> navegador; `PENDENTE — precisa de aparelho` = só roda de verdade no navegador/aparelho.
> **Nada abaixo foi executado em navegador real.** O que está marcado como coberto é o que o
> `vitest`/Playwright já provam; o resto é honestamente pendente.

## Como executar (quem tiver os aparelhos)

1. `bun run test -- mediaVolume` (prova de unidade, sem navegador).
2. `npx playwright test e2e/media-volume.spec.ts --project=chromium-authenticated` (só Chromium —
   ver `e2e/media-volume.spec.ts:63`).
3. Para os itens `PENDENTE`: `bun run dev`, abrir em cada navegador, abrir uma conversa **com
   mensagem de áudio e com vídeo**, e seguir a coluna do meio. Registrar na coluna *evidência*
   o screenshot/vídeo e o texto exato do console (DevTools → Console).

## Tabela

| Navegador/plataforma | O que verificar (passo exato) | Como saber que passou | Status | Evidência |
|---|---|---|---|---|
| Todos (base) | Valor 80% → elemento recebe `volume = (80/100)² = 0.64` | `audio.volume === 0.64` | coberto por teste automatizado (`src/lib/__tests__/mediaVolumeElement.test.ts:124`) | teste unitário |
| Todos | Trocar de mensagem/áudio não zera o volume; dois players compartilham o mesmo valor | os dois `<audio>` com o mesmo `volume` após `setVolume(90)` | coberto por teste automatizado (`src/components/inbox/__tests__/MediaVolume.test.tsx:230`) | teste unitário |
| Todos | Mute global × alertas: silenciar mídia **não** altera o botão de alertas | rótulo do botão de alertas inalterado após mutar mídia | coberto por teste automatizado (`MediaVolume.test.tsx:126`, `:204`; E2E `e2e/media-volume.spec.ts:118`) | teste unitário + E2E Chromium |
| Chrome / Edge (Chromium desktop) | Caminho nativo: `element.volume` gravável, **sem** criar `AudioContext` | `volume` do `<audio>` muda e nenhum nó WebAudio é criado | coberto por teste automatizado (`mediaVolumeElement.test.ts:79`) | teste unitário (jsdom) |
| Edge | Mesmo motor do Chrome: paridade esperada, mas o projeto Playwright **não tem project `edge`** (`playwright.config.ts:14-127`) — Edge nunca é executado no CI | rodar o `media-volume.spec.ts` à mão no Edge e comparar com o Chrome | PENDENTE — precisa de aparelho | nenhuma (sem project Edge) |
| Firefox desktop | Sonda de faixa de áudio usa `mozHasAudio` e SÓ responde com metadados | `detectVideoAudioTrack` → `false` em vídeo sem áudio; `null` antes dos metadados | verificável por código (`src/lib/mediaVolumeElement.ts:159`); teste do contrato em `mediaVolumeElement.test.ts:173` | teste unitário simula a API; **Firefox real não roda** o spec (`media-volume.spec.ts:63` pula) |
| Firefox desktop | Autoplay do vídeo no hover do balão (mudo) | vídeo toca ao passar o mouse, sem tocar som | verificável por código (`MediaPreview.tsx:136`) | política de autoplay de mídia **muda** é permitida; confirmar visualmente no Firefox |
| Safari macOS (WebKit desktop) | Sonda de faixa de áudio usa `audioTracks`, só válida após `readyState >= 1` | controle de volume do fullscreen habilitado/desabilitado corretamente | verificável por código (`mediaVolumeElement.ts:166`); teste `mediaVolumeElement.test.ts:188` | teste unitário; Safari real não executa o spec |
| Safari macOS | `element.volume` é gravável no **desktop** → segue o caminho nativo, sem GainNode | `<audio>` obedece ao volume escolhido | verificável por código (`mediaVolumeElement.ts:100`); E2E WebKit existe só para auth/conversation, **não** para volume (`playwright.config.ts:117`) | PENDENTE confirmar no Safari macOS real |
| **Safari iOS (D5/E09/E10 — o caso crítico)** | `HTMLMediaElement.volume` é **read-only**; o app cai no caminho `GainNode` | sonda grava 0.5 e não lê de volta → `detectNativeVolumeSupport() === false` | coberto por teste automatizado com iOS simulado (`src/lib/__tests__/mediaVolumeElement.test.ts:93`, `:101`) | teste unitário; **simulação, não iOS real** |
| Safari iOS | Sem `AudioContext` disponível, o slider aparece **desabilitado** com a explicação ("o volume é do sistema") em vez de mentir | slider com `data-disabled` + texto de rodapé | coberto por teste automatizado (`mediaVolumeElement.test.ts:93`; texto em `MediaVolumeControl.tsx:172`) | teste unitário |
| Safari iOS | `webkitAudioContext` é usado quando `AudioContext` não existe | `isMediaVolumeControllable() === true` no iOS | verificável por código (`mediaVolumeElement.ts:58`) | **PENDENTE confirmar no iOS**: precisa de aparelho para provar que o construtor existe e o grafo soa |
| Safari iOS | **Risco de áudio mudo:** o `AudioContext` nasce suspenso fora de gesto; `resume()` é chamado em `mediaVolumeElement.ts:88` **fora** do gesto do clique e a rejeição é engolida (`void ... .catch(() => {})`), sem retry no `play()` | apertar play e **ouvir o áudio**; no console, `ctx.state` deve virar `running` | PENDENTE — precisa de aparelho | nenhuma prova; é o item (b) do plano. Se sair mudo, é bug real |
| Safari iOS — vídeo | `VideoFullscreen.tsx:94` **não tem `crossOrigin`** (diferente do `<audio>`, `AudioMessagePlayer.tsx:109`, que tem `anonymous`) → `createMediaElementSource` sobre URL assinada cross-origin pode lançar `SecurityError`; o `catch` (`mediaVolumeElement.ts:90`) cai no `element.volume = gain`, que no iOS é no-op silencioso | controlar o volume do vídeo em fullscreen e o som realmente mudar | PENDENTE — precisa de aparelho | **achado do código**; risco concreto do item (a)+(e) do plano |
| Safari iOS — vídeo | `VideoFullscreen.tsx:94` **não tem `playsInline`** (o preview tem, `MediaPreview.tsx:133`) → o iOS pode sequestrar o vídeo para o player nativo em tela cheia | o `<video>` toca embutido, com o botão de volume do app visível | PENDENTE — precisa de aparelho | **achado do código** |
| Chrome/Edge/Firefox/Safari — autoplay | Vídeo abre com `autoPlay muted` (`VideoFullscreen.tsx:94`); hover do balão chama `play()` já mudo (`MediaPreview.tsx:136`) → política de autoplay permite mídia muda | o preview/`hover` reproduz sem gesto; o áudio do balão só toca no clique | verificável por código (`useAudioPlayer.ts:202` — `audio.play()` dentro do clique) | PENDENTE confirmar visualmente que nada é bloqueado pelo navegador |
| Todos — atalhos de teclado | `↑`/`↓` = ±5 e `M`/`m` = mudo **com o foco no botão**; setas não capturadas globalmente | `ArrowUp` no `document.body` não muda nada; no botão muda | coberto por teste automatizado (`src/hooks/ui/__tests__/useVolumeRocker.test.tsx:169`, `:97`; `MediaVolume.test.tsx:357`) | teste unitário |
| Todos — atalhos de teclado | Com o foco em `input`/`textarea`/`contentEditable` (campo de mensagem), as setas são ignoradas | digitar no campo de mensagem e apertar `↑` não muda o volume | verificável por código (`src/hooks/ui/useVolumeRocker.ts:100-109`) | **sem teste direto** — só revisão de código; PENDENTE conferir com foco real no campo |
| Chrome/Edge — teclado no fullscreen | Com o `<video controls>` nativo focado, as setas são do controle nativo, não do app | focar o botão de volume (Tab) e aí usar `↑`/`↓` | PENDENTE — precisa de aparelho | o `MediaVolumeControl` overlay (`VideoFullscreen.tsx:63`) tem foco próprio |
| Todos — roda do mouse | Scroll sobre o ícone anda ±5 e **impede a página de rolar** | valor muda; página não rola | coberto por teste automatizado (`MediaVolume.test.tsx:322`; E2E `media-volume.spec.ts:59`) | listener nativo `passive:false` (`useVolumeRocker.ts:72`) |
| Todos — `createMediaElementSource` 1× por elemento | Chamar de novo no mesmo elemento lança e derrubaria o player; o registry `WeakMap` reusa o nó | dois `applyMediaVolume` → **1** chamada de `createMediaElementSource` | coberto por teste automatizado (`mediaVolumeElement.test.ts:111`) | teste unitário |
| Todos — troca de vídeo no preview | Cada `<video>` novo tem seu próprio GainNode (WeakMap por elemento) e o `<video>` é recriado por `key={resolvedUrl}` | trocar de vídeo e ainda poder controlar o volume | verificável por código (`MediaPreview.tsx:132`, `mediaVolumeElement.ts:16`) | E44 coberto para áudio (`MediaVolume.test.tsx:249`); **vídeo** PENDENTE |
| Todos — persistência/reload | Volume sobrevive ao reload e sincroniza entre abas | recarregar e ver o mesmo valor; duas abas se acompanham | coberto por teste automatizado (`src/lib/__tests__/mediaVolumeStore.test.ts:143`, `:191`; E2E `media-volume.spec.ts:102`) | teste unitário + E2E Chromium |
| Todos (ambiente real) | Sem `localStorage`/`BroadcastChannel` (aba anônima, cookies bloqueados) o app não quebra | volume vale na aba, cai no default, sem exception | coberto por teste automatizado (`mediaVolumeStore.test.ts:119`) | teste unitário |

## Resumo honesto do que falta

- **Único item que exige aparelho de verdade e pode esconder bug:** Safari iOS (D5/E09/E10) —
  `resume()` fora de gesto sem retry, `crossOrigin` ausente no vídeo do fullscreen e
  `playsInline` ausente. Nenhum teste os cobre; o teste `:101` **simula** o iOS.
- **Edge nunca é executado** (não há project no Playwright): paridade com Chrome é esperada por
  motor, não medida.
- Firefox/WebKit reais não rodam o `media-volume.spec.ts` (pula em `:63`): as sondas de faixa de
  áudio são provadas apenas por teste unitário com API simulada.
