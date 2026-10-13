Especialista: workertestes (area-testes-do-produto, armadilhas-workertestes, relato-que-passa)

## O que mudou e por quê
- e2e/auth-a11y.spec.ts (novo): axe real no navegador nas 3 telas (/auth, /forgot-password, /reset-password) x 2 temas; ancora visivel + campos obrigatorios por tela (anti-vacuidade); mede so quando duas leituras seguidas concordam (a tela entra com fade e tem animacao continua, medir no meio reprovava contraste que nao existe); catraca `BLOQUEANTES_CONHECIDAS` por rota|tema.
- e2e/auth-teclado.spec.ts (novo): ordem de TAB (e-mail -> senha -> "Esqueci minha senha" -> Entrar), foco visivel (compara com o estado SEM foco do mesmo campo), erro de validacao que nao rouba o foco e botao do olho operavel sem mouse.
- e2e/auth-sessao-guard.spec.ts (novo): sessao ausente, EXPIRADA e CORROMPIDA caem em /auth UMA vez guardando `state.from`; sessao valida NAO cai no login (prova que a chave do storage e a certa).
- playwright.config.ts: projeto `chromium-auth-deslogado` (testMatch `auth-(a11y|teclado|sessao-guard)`, `storageState` vazio explicito) e os 3 specs fora do `chromium-authenticated`, que faz login real no `setup`.

## Prova
- verde (rodada final dos 3 specs): `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5390 npx playwright test --project=chromium-auth-deslogado e2e/auth-a11y.spec.ts e2e/auth-teclado.spec.ts e2e/auth-sessao-guard.spec.ts --workers=1` -> `18 passed (3.1m)`; antes dela, duas rodadas seguidas `18 passed (2.4m)` e `18 passed (2.2m)`.
- guarda do config: `node scripts/ci/playwright-config-e81.unit.mjs` -> `pass 6 / fail 0`.
- vermelho por mutacao (cada teste falha quando o comportamento quebra; mutacoes revertidas, `git status` limpo antes do commit):
  1. `aria-label` removido do botao do olho (`src/components/auth/PasswordInput.tsx`) -> auth-a11y: `/auth (light): violacao SERIOUS/CRITICAL fora do previsto` com `"id": "button-name"`; auth-teclado: `locator.focus: Test timeout of 30000ms exceeded ... waiting for getByRole('button', { name: 'Mostrar senha' })`.
  2. `role="alert"` do erro de e-mail trocado por `role="presentation"` (`src/pages/Auth.tsx`) -> auth-teclado: `Expected pattern: /e-?mail/i` / `Received string: "Senha e obrigatoria"`.
  3. `tabIndex={1}` no campo de senha (`src/pages/Auth.tsx`) -> auth-teclado: `senha precisa vir na ordem; trilha: login-email -> Esqueci minha senha -> Entrar`.
  4. indicador de foco zerado (`src/components/ui/input.tsx` variante glow sem anel + `src/styles/base.css` `:focus-visible` e `input:focus-visible` com `box-shadow: none`) -> auth-teclado: `sem indicador de foco visivel (nada mudou em relacao ao estado sem foco: {"semFoco":{"contorno":false,"sombra":"none"},"foco":{"id":"login-password","focusVisible":true,"contorno":false,"sombra":"none"}})`.
- R1: as 3 specs usam `bloquearRedeReal`, `storageState` vazio e JWT falso via `addInitScript`; o afterEach exige que so o host oficial tenha sido barrado (403 local). Sem secrets, sem sessao salva, sem producao.

## O que NAO fiz e por que
- Nao corrigi os 2 defeitos REAIS de producao que o axe reprova (registrados em comentario no cartao): `src/pages/ResetPassword.tsx:199` (botao de mostrar/ocultar senha do form "Nova Senha" sem nome acessivel — `button-name`, critical) e o link "Esqueci minha senha" em `/auth` no tema escuro (`text-primary` 12 px, 3,42:1 sobre #18181b — `color-contrast`, serious). Sao arquivo de outro cartao; ficaram como catraca explicita, com comentario mandando esvaziar a lista quando a tela for corrigida.
- Nao mexi em `.github/workflows/ci.yml`: incluir o projeto novo no job deslogado e de outro cartao (arquivo fora do escopo).
- Nao alterei nenhuma regra de producao: o diff de producao e zero (so specs + playwright.config.ts).
