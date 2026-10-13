Especialista: worker (design) (design-system-zapp)

ESCOPO — playwright.config.ts (justificativa em 1 linha): o cartão pede o teste de medição no
Playwright e um spec novo SÓ roda se estiver atribuído a um projeto; foram 2 linhas — o spec novo
entra no `testMatch` do projeto sem sessao (chromium-a11y) e no `testIgnore` do projeto logado,
para não ser tratado como teste logado. Sem isso o teste de medição que o cartão exige não roda.

## O que mudou e por quê
- `src/styles/utilities.css`: nova regra `.alvo-toque-44` DENTRO de `@media (pointer: coarse)` — `min-width/min-height: 44px` + `inline-flex` centralizado. O alvo só cresce em toque; em ponteiro fino a página renderiza exatamente como antes.
- `src/components/ui/dialog.tsx` e `src/components/ui/sheet.tsx`: o botão de fechar (o X) recebe `alvo-toque-44`. Ele também recebeu `z-10`: sem isso, o título (h2) ganhava o hit-test no ponto central do alvo maior e o X ficava SEM resposta ao toque — quem pegou isso foi o próprio teste (o clique do Playwright parou de fechar o dialog). O X continua fechando.
- `src/components/ui/checkbox.tsx` e `src/components/ui/radio-group.tsx`: `alvo-toque-44` nos primitivos (h-4 w-4 = 16px).
- `src/components/ui/button.tsx` e `src/components/ui/icon-button.tsx`: `alvo-toque-44` nos tamanhos abaixo de 44px (default/sm/icon/icon-sm, e sm/default do icon-button). Os tamanhos que já medem ≥44px (lg/xl/icon-lg) NÃO receberam a classe.
- `src/components/ui/micro-interactions/buttons.tsx`: o branco do ripple deixou de ser cor literal e virou `hsl(var(--primary-foreground) / 0.3)`; `--primary-foreground` é `0 0% 100%` no claro e no escuro, então o pixel renderizado é o mesmo.
- `src/components/ui/micro-interactions/feedback.tsx`: o verde literal do check virou `hsl(var(--success))` (token que já existe em tokens.css, com valor no claro e no escuro).
- `src/components/ui/__tests__/alvos-toque-44px.test.tsx`: trava o contrato — cada primitivo carrega a classe, e a regra CSS existe dentro de `@media (pointer: coarse)` com 44px.
- `e2e/a11y-toque-44px.spec.ts` (+ o registro dele em `playwright.config.ts`): mede o PIXEL no Chromium emulado como celular (Pixel 5: `isMobile` + `hasTouch`) e prova que o centro do alvo 44x44 recebe o toque (`elementFromPoint`); e mede o desktop para provar que nada mudou lá.

## Prova
- vermelho antes: `npx vitest run src/components/ui/__tests__/alvos-toque-44px.test.tsx` → `Tests  5 failed | 1 passed (6)`
- vermelho antes: `npx playwright test e2e/a11y-toque-44px.spec.ts --project=chromium-a11y` → `largura do checkbox: 16px` (o alvo era 16px em toque)
- verde depois: `npx vitest run src/components/ui/__tests__/alvos-toque-44px.test.tsx` → `Test Files  1 passed (1); Tests  6 passed (6)`
- verde depois: `npx playwright test e2e/a11y-toque-44px.spec.ts --project=chromium-a11y` → `3 passed` (celular: checkbox e fechar medem 44x44 e o dialog fecha; desktop: alvos seguem compactos e o clique do mouse ainda fecha)
- regressão: `npx vitest run src/components/ui` → `Test Files  18 passed (18); Tests  124 passed (124)`
- estático: `npx tsc --noEmit` sem saída (limpo); `npx eslint` nos arquivos tocados → `0 errors, 3 warnings` (os 3 warnings de react-refresh são pré-existentes nesses arquivos)
- literal de cor em `src/components/ui`: `grep -rnE "rgba?\(|hsla?\(" src/components/ui --include=*.tsx --include=*.ts | grep -v "var(--"` → `0` linhas

## O que NÃO fiz e por quê
- `playwright.config.ts` não está na lista de arquivos do cartão: eu o incluí porque o cartão pede "teste de medição" no Playwright e um spec novo só roda se estiver atribuído a um projeto. Mudei duas linhas: `a11y-toque-44px` entrou no `testMatch` do projeto `chromium-a11y` e no `testIgnore` do `chromium-authenticated` (para não ser pego como teste logado).
- Não mexi em `scripts/ci/a11y-button-name-baseline.json`: o guard `a11y-button-name-ratchet` roda verde e sugere apertar a baseline (236 → 94), mas apertar baseline é do worker (ci), não deste cartão.
- Um checkbox decorativo (`w-[18px] h-[18px]`, com `pointer-events-none`) dentro de um rótulo de filtro com `h-9` (36px) também passou a medir 44px em toque — é efeito direto de mexer no primitivo, que o cartão pede. O rótulo que o contém continua com 36px, então nesse uso específico há um estouro sutil de 4px; se o rótulo também deve crescer, é do worker (telas), não deste cartão.
- No celular emulado o Playwright não consegue clicar no X (o viewport visual não coincide com o de layout e o ponto do clique cai no overlay), então nesse teste o fechamento é por teclado (`Enter`); a recepção do toque no alvo é provada por `elementFromPoint` no centro do 44x44, e o fechamento por clique de mouse é provado no teste de desktop. Não é falha da correção: é limite da emulação de toque do Chromium.
