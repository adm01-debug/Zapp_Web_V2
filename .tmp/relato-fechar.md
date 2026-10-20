- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 119s;OK lint 3s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (13/10 19:06, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     | 132 ++++++++--
 e2e/a11y-toque-44px.spec.ts                        | 278 +++++++++++++++++++++
 playwright.config.ts                               |   4 +-
 .../ui/__tests__/alvos-toque-44px.test.tsx         | 147 +++++++++++
 src/components/ui/button.tsx                       |  18 +-
 src/components/ui/checkbox.tsx                     |   2 +-
 src/components/ui/dialog.tsx                       |   2 +-
 src/components/ui/icon-button.tsx                  |   5 +-
 src/components/ui/micro-interactions/buttons.tsx   |  11 +-
 src/components/ui/micro-interactions/feedback.tsx  |   2 +-
 src/components/ui/radio-group.tsx                  |   2 +-
 src/components/ui/sheet.tsx                        |   2 +-
 src/styles/utilities.css                           |  31 +++
 13 files changed, 601 insertions(+), 35 deletions(-)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 6 passed (6)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial do [refazer]: sem pontos refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: playwright.config.ts

Especialista: designer

## O que mudou e por quê
- src/styles/utilities.css: a regra `@media (pointer: coarse) .alvo-toque-44` deixou de inflar a
  caixa (saiu `display/align-items/justify-content/min-width/min-height`) e passou a criar só um
  `::after` centrado de 44x44 — área de toque sem mexer no desenho. Motivo: o `display: inline-flex`
  sobrescrevia `hidden`/`sm:inline-flex` de quem consome (ex.: src/components/chat/EmailChatInbox.tsx:260
  usa `hidden sm:inline-flex` num Button — no toque ele reaparecia) e inflar a caixa do checkbox/radio
  (borda) e do X do sheet (`data-[state=open]:bg-secondary`) pintava um bloco de 44px.
- src/components/ui/button.tsx e icon-button.tsx: os tamanhos pequenos (`default`, `sm`, `icon`,
  `icon-sm`) ganharam a variante Tailwind exportada `ALVO_TOQUE_GROSSO`
  (`[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]`), resolvida pelo
  twMerge na camada de utilitários. `lg`/`xl`/`icon-lg` já têm 44px+ e não mudam.
- src/components/ui/checkbox.tsx e radio-group.tsx: receberam `relative` (para o `::after` ancorar) e
  mantêm `alvo-toque-44`; o desenho continua 16x16.
- src/components/ui/dialog.tsx e sheet.tsx: o X mantém `alvo-toque-44` e o `z-10`; com o `::after` o
  desenho (X de 16px; 24px com `p-1` no dialog) fica do tamanho de sempre.
- src/components/ui/micro-interactions/buttons.tsx: comentário do ripple corrigido — o token
  `hsl(var(--primary-foreground) / 0.3)` é branco em tokens.css (claro:110, escuro:446) e no alto
  contraste CLARO (accessibility.css:12), mas no ALTO CONTRASTE ESCURO é `0 0% 0%`
  (accessibility.css:35) porque o `--primary` de lá é o violeta claro 258 100% 65%; nesse modo o
  ripple fica escuro sobre o violeta, que é o par de contraste do próprio botão. Está registrado no
  comentário do arquivo.
- e2e/a11y-toque-44px.spec.ts: a medição virou ÁREA DE TOQUE — `areaToque44()` lê os 4 cantos de um
  quadrado de 44x44 centrado no controle com `document.elementFromPoint` (o `::after` pertence à
  caixa de hit-test do próprio elemento). Somado a isso, o teste afirma que o DESENHO continua
  pequeno no toque (checkbox ≤20px, X ≤32px) e que o botão pequeno cresce só no toque
  (`size="icon"` + `w-8 h-8`: ≥44px e `min-height` computado `44px`), além da prova de ponteiro fino
  (checkbox ≤24px, X ≤32px, botão de ações ≤32px) e do fechamento por clique.
- src/components/ui/__tests__/alvos-toque-44px.test.tsx: contrato atualizado — X/checkbox/radio
  carregam `alvo-toque-44` + `relative`; Button/IconButton carregam `ALVO_TOQUE_GROSSO` e NÃO a
  classe; a regra coarse do CSS só declara `::after` (guarda contra a volta do `display`/`min-width`
  no elemento) e não existe fora do media query. O teste lê o CSS sem comentários (os comentários
  citam a classe e dariam falso positivo).
- playwright.config.ts: mantido o ponto do refazer anterior — `a11y-toque-44px.spec.ts` entra no
  `testIgnore` do `chromium-authenticated` para não ser coletado pelo catch-all autenticado (que
  exigiria sessão real, proibida pela R1); o `chromium-a11y` já o coleta pelo `testMatch`.

## Prova
- vermelho antes (área de toque inflava o desenho — a versão recusada do CSS): editei
  `src/styles/utilities.css` para repor `min-width/min-height/display` no `.alvo-toque-44` e rodei
  `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5271 npx playwright test e2e/a11y-toque-44px.spec.ts
  --project=chromium-a11y -g "celular"` → `Error: largura do checkbox: 44px` /
  `expect(received).toBeLessThanOrEqual(expected) Expected: <= 20 Received: 44` → `1 failed`.
- vermelho antes (variante de tamanho do botão ausente): tirei `ALVO_TOQUE_GROSSO` do `size: icon` e
  rodei o mesmo teste → `Error: largura das ações: 32px` / `Expected: >= 44 Received: 32`
  (`min-height computado das ações` na linha seguinte) → `1 failed`.
- vermelho antes (contrato vitest): com `min-width`/`min-height`/`display` de volta no elemento,
  `npx vitest run src/components/ui/__tests__/alvos-toque-44px.test.tsx` →
  `AssertionError: expected '\n  .alvo-toque-44 {\n    display: in…' not to match /\.alvo-toque-44\s*\{/`
  → `Tests 1 failed | 5 passed (6)`.
- verde depois (e2e, pixel real, depois de reverter as 3 mutações):
  `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5275 npx playwright test e2e/a11y-toque-44px.spec.ts
  --project=chromium-a11y --timeout=180000` → `3 passed (59.1s)`.
- verde depois (contrato): `npx vitest run src/components/ui/__tests__/alvos-toque-44px.test.tsx` →
  `Test Files 1 passed (1)`; `Tests 6 passed (6)`.
- Diagnóstico usado no meio (e revertido): medi no navegador `getComputedStyle(el, '::after')` e
  `elementFromPoint` — `content: ""`, `width/height: 44px`, `position: absolute`, e os 4 cantos
  devolvendo o próprio checkbox (`isEl: true`). Nada disso ficou no diff.

## Pontos do revisor ([refazer t_9a266076])
- Ponto 1: tirei `display`/`align-items`/`justify-content` (e `min-width`/`min-height`) da regra
  coarse; os tamanhos de botão agora usam a variante Tailwind `ALVO_TOQUE_GROSSO`
  (`[@media(pointer:coarse)]:min-h-[44px] min-w-[44px]`, mesma forma que `src/components/layout/Sidebar.tsx`
  já usa) em src/components/ui/button.tsx e icon-button.tsx. Prova: vermelho `largura das ações: 32px`
  × verde `3 passed`.
- Ponto 2: checkbox e radio mantêm o desenho de 16x16 (`aspect-square h-4 w-4`) e ganharam `relative`
  para o `::after` de 44x44 ancorar; a área de toque é medida por `elementFromPoint` nos 4 cantos.
  Prova: `largura do checkbox: 44px` (vermelho) × checkbox ≤20px e cantos OK (verde).
- Ponto 3: o X do sheet e do dialog usam o mesmo `::after` (nada de inflar a caixa), com o `z-10`
  mantido; o `data-[state=open]:bg-secondary` do sheet agora pinta só os 16px do X. Prova: no toque o
  X é ≤32px desenhado e os 4 cantos do alvo de 44 acertam o botão (3 passed).
- Ponto 4: a medição deixou de ser `boundingBox` do desenho e passou a ser a área de toque
  (`areaToque44()`, 4 cantos de 44x44 via `elementFromPoint`); a prova de desktop inalterado e o teste
  de contrato vitest ficaram. Prova: `3 passed`; mutação do CSS derruba o teste (`... 44px` ≠ ≤20).
- Ponto 5: registrei no comentário de src/components/ui/micro-interactions/buttons.tsx que
  `--primary-foreground` vira `0 0% 0%` no alto contraste ESCURO (accessibility.css:35), então o ripple
  fica escuro sobre o `--primary` violeta claro daquele modo — que é o par de contraste do botão. Não
  troquei o token (nenhum token novo, `--primary-foreground` é o par de contraste do `--primary`).

## Escopo dos arquivos (por que entram)
- src/styles/utilities.css, e2e/a11y-toque-44px.spec.ts e playwright.config.ts: os três são a
  própria matéria do cartão. A regra coarse que precisa deixar de inflar a caixa mora em
  utilities.css; a medição de área de toque que o revisor pediu para trocar mora no spec; e o spec
  precisa estar no `chromium-a11y` (pelo `testMatch` que a base já trazia) e fora do
  `chromium-authenticated` (via `testIgnore`) para não ser coletado pelo catch-all autenticado, que
  exigiria sessão real (proibida pela R1). Sem essas três linhas o defeito ou não é corrigido ou não
  é medido.

## O que NÃO fiz e por quê
- Não mexi no `display` de nenhum consumidor nem em `src/components/layout/Sidebar.tsx` (já tinha o
  padrão da variante coarse) — fora do defeito do cartão.
- `npm run typecheck` (`tsc -b --force`) e `npx tsc -p tsconfig.app.json --noEmit` foram MORTOS por
  OOM nesta sessão do WSL (`Killed`, inclusive com `--max-old-space-size=4096`), com outros dev
  servers da máquina no ar; a tipagem entra pela verificação do fechar. Não consegui rodar typecheck
  local então não afirmo que ele passou aqui.
- Não rodei a suíte vitest inteira (memória da fábrica: 1 suite por vez no WSL); rodei só o contrato
  alterado e o e2e do cartão.

## Critérios de pronto do cartão
- Critério 1 (alvos >=44px medidos por teste): e2e/a11y-toque-44px.spec.ts mede a ÁREA DE TOQUE
  por `elementFromPoint` nos 4 cantos de um quadrado 44x44 centrado no controle (verde, 3 passed) e
  o contrato vitest trava as classes (`Test Files 1 passed (1), Tests 6 passed (6)`); o vermelho foi
  provado por mutação do CSS (`largura do checkbox: 44px` != <=20).
- Critério 2 (grep de cor literal em src/components/ui): `git grep -nE "#[0-9a-fA-F]{3,8}|rgba?\(|hsl\([0-9]"
  -- src/components/ui` só devolve (a) os seletores ESTRUTURAIS do recharts em
  src/components/ui/chart.tsx:48 (`[stroke='#ccc']`/`[stroke='#fff']`, variantes arbitrárias do Tailwind
  que casam os nós internos do recharts, não pintam cor) e (b) um `linear-gradient(#fff 0 0)` de máscara
  em micro-interactions/buttons.tsx:264. NENHUMA cor literal pintada sobra. Os dois literais do cartão
  (rgba(255,255,255,0.3) em buttons.tsx; hsl(142 76% 36%) em feedback.tsx) viraram
  `hsl(var(--primary-foreground) / 0.3)` e `hsl(var(--success))`.
- Critério 3 (contraste do X do dialog/sheet registrado): o X é `opacity-70` sobre `bg-background`.
  Compondo `--foreground` a 70% sobre o fundo (sRGB, hsl do tokens.css: claro fg 221 20% 12% / bg
  221 20% 97%; escuro fg 210 40% 98% / bg 240 6% 6%; alto contraste accessibility.css:7/32/35),
  mediu-se claro 6,06:1 / escuro 9,19:1 / alto-contraste-claro 8,45:1 / alto-contraste-escuro 9,58:1 —
  todos acima do 3:1 de objeto gráfico (WCAG 1.4.11). O `opacity-70` FICA; nada a subir.
- Critério 4 (`zapp-verify . --rapido` verde): rodado no `hermes-tarefa-fechar`.
