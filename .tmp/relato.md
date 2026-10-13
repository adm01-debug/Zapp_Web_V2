Especialista: Íris (area-front-componentes)

# fix(mobile): define area segura e rolagem sem barra no celular

## O que mudou e por quê
- `src/styles/utilities.css`: `.safe-area-top`/`.safe-area-bottom` passam a
  `padding-top/bottom: env(safe-area-inset-*, 0)`; no `@media (max-width: 767px)`
  entram `.scrollbar-none` (`scrollbar-width: none`, `-ms-overflow-style: none`,
  `::-webkit-scrollbar { display: none }`) e `body { overscroll-behavior-y: none }`.
  O `index.html` já traz `viewport-fit=cover`, mas as 15 classes de área segura usadas
  em `src/` não tinham regra nenhuma — o cabeçalho ia sob o notch e a barra inferior
  sob o indicador de home. O seletor é repetido (`.safe-area-bottom.safe-area-bottom`),
  como o `.chip-active.chip-active` do próprio arquivo: `@tailwind utilities` é injetado
  depois e `ChatInputArea`/`TeamChatInputArea` usam `py-2 safe-area-bottom`, então sem a
  classe a mais o utilitário do Tailwind venceria por ordem. `env(..., 0)` deixa 0 fora
  do iOS: no desktop nada muda.
- `src/styles/__tests__/mobileAreaSeguraRolagem.test.ts` (novo): o CSS entra como folha
  REAL no jsdom (mesmo caminho de `densityTextSizeCascade.test.ts`); o teste confere as
  3 regras, o bloco de celular, que o elemento real casa o seletor, e o contrato
  "toda classe `safe-area-*`/`scrollbar-none` usada em `src/` tem definição".
- `src/index.css` e `src/styles/base.css`: não precisaram mudar (o CSS novo mora no
  arquivo de utilidades, que o cartão citou).

Nota de vocabulário: aqui "área segura" é recorte físico da tela do celular
(`env(safe-area-inset-*)`); não há assinatura, HMAC ou segredo em nenhum ponto do diff.

## Prova
- vermelho antes: o teste roda contra o CSS base do git (`ZAPP_CSS_UNDER_TEST=.tmp/base-utilities.css`,
  escrito com `git show HEAD:src/styles/utilities.css`; **não** usei `git stash`, que é
  compartilhado entre worktrees) →
  `Tests  4 failed (4)` (`.safe-area-top`, `.safe-area-bottom`, o bloco de celular e o contrato).
- verde depois: `npx vitest run src/styles/__tests__/mobileAreaSeguraRolagem.test.ts` →
  `Test Files  1 passed (1); Tests  4 passed (4)` (0 falhas, 0 pulados).
- captura real em 390x844 com área segura simulada por CDP
  (`Emulation.setSafeAreaInsetsOverride`, Chromium do Playwright, carregando o
  `utilities.css` de verdade): `envTopo=47px`, `envBaixa=34px`, `pyTailwindVencido=true`,
  `corpoOverscrollY=none`, `larguraBarraRolagem=none`, `itensDentro=true`. Mesma página
  em 1024x800 com insets 0: `larguraBarraRolagem=auto`, `corpoOverscrollY=auto`,
  `envBaixa=0px` → nada muda no desktop. PNG:
  `.tmp/evidencia-mobile-390x844.png`; números: `.tmp/evidencia-mobile-medida.json`.
  (O harness reproduz a estrutura real do `MobileHeader`/`MobileTabBar`: elemento fixo
  com a classe, barra interna com altura própria.)

## Casos de tela conferidos
- consumidores lidos antes de mexer: `MobileHeader.tsx:65`, `MobileDrawerMenu.tsx:180,311`,
  `InAppNotification.tsx:44`, `NotificationsPanel.tsx:86`, `MobileNavigation.tsx:29`,
  `FloatingActionButtons.tsx:42,67`, `BottomSheet.tsx:54`, `mobile-components.tsx:125`,
  `ChatInputArea.tsx:166`, `ChatMessageInput.tsx:131`, `TeamChatInputArea.tsx:112`.
- melhor caso (iPhone, inset 47/34 px) e pior caso (sem inset = 0) medidos na captura.

## O que NÃO fiz e por quê
- `src/components/catalog/ProductDetailDialog.tsx:214` usa `scrollbar-hide`, que não tem
  definição em lugar nenhum (nem é utilitário do Tailwind v3). Não é da família deste
  cartão (`safe-area-*`/`scrollbar-none`) e é de outro assunto; ficou em `kanban_comment`.
- Nenhum arquivo fora dos citados no cartão foi tocado (`git diff --stat`: 2 arquivos,
  222 inserções, 0 remoções).

## Conclusão
CONCLUÍ: as classes de área segura e de rolagem do celular têm definição, provado pelo
contrato verde e pela medição real em 390x844.
