Especialista: workertestes
Skills: area-testes-do-produto

## DIFF DESTE REFAZER (sobre o commit 217369440)
- Apenas `.tmp/relato.md`. Nenhum arquivo de `src/`, nenhum spec e nenhum config foi tocado neste refazer.
- O diff total do cartão (sobre a branch do dia) contém: `e2e/auth-a11y.spec.ts` (novo), `e2e/auth-teclado.spec.ts` (novo), `e2e/auth-sessao-guard.spec.ts` (novo) e `playwright.config.ts` (projeto `chromium-auth-deslogado` + `testIgnore` dos 3 specs no `chromium-authenticated`).

## O que mudou e por quê
- `e2e/auth-a11y.spec.ts` (novo): axe real no navegador nas 3 telas (/auth, /forgot-password, /reset-password) x 2 temas; ancora visivel + campos obrigatorios por tela (anti-vacuidade); catraca `BLOQUEANTES_CONHECIDAS` por rota|tema.
- `e2e/auth-teclado.spec.ts` (novo): ordem de TAB (e-mail -> senha -> "Esqueci minha senha" -> Entrar), foco visivel (compara com o estado SEM foco do mesmo campo), erro de validacao que nao rouba o foco e botao do olho operavel sem mouse.
- `e2e/auth-sessao-guard.spec.ts` (novo): sessao ausente, EXPIRADA e CORROMPIDA caem em /auth UMA vez guardando `state.from`; sessao valida NAO cai no login (prova que a chave do storage e a certa).
- `playwright.config.ts`: projeto `chromium-auth-deslogado` (`testMatch` auth-(a11y|teclado|sessao-guard), `storageState` vazio explicito) e os 3 specs fora do `chromium-authenticated`, que faz login real no `setup`. Sem o projeto dedicado, os 3 specs seriam absorvidos pelo `chromium-authenticated` e rodariam COM a sessao do `setup` — o oposto do que o cartao pede.

## Prova
- Verde antes da mutacao: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5391 npx playwright test --project=chromium-auth-deslogado e2e/auth-sessao-guard.spec.ts --workers=1` -> `8 passed (32.5s)`.
- Verde depois de reverter: mesmo comando -> `8 passed (1.5m)`.
- Vermelho com a mutacao (detalhe no Ponto 1): mesmo comando -> `6 failed` + `2 passed (16.6s)`.
- Guarda do config: `node scripts/ci/playwright-config-e81.unit.mjs` -> `pass 6 / fail 0`.
- `git status --short` apos reverter a mutacao: vazio (limpo).
- R1: as 3 specs usam `bloquearRedeReal`, `storageState` vazio e JWT falso via `addInitScript`; o afterEach exige que so o host oficial tenha sido barrado (403 local). Sem secrets, sem sessao salva, sem producao.

## Pontos do revisor
- Ponto 1 (mutacao do `e2e/auth-sessao-guard.spec.ts`): mutacao aplicada em `src/components/auth/ProtectedRoute.tsx:194`, removendo `state={{ from: location }}` do `<Navigate to="/auth" ... replace />` (arquivo restaurado em seguida; nao consta no diff). Comando: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5391 npx playwright test --project=chromium-auth-deslogado e2e/auth-sessao-guard.spec.ts --workers=1`. Linha vermelha (igual nos 6 testes de redirect): `Error: origem não preservada em {"usr":null,"key":"580v0s8k","idx":0}` em `e2e/auth-sessao-guard.spec.ts:162` (`expect(caminhoDaOrigem(entrada), ...).toBe(rota)`), com `Expected: "/sla"` / `Received: undefined` (e o equivalente `/queues/comparison`). Cenários afetados: `sessão ausente manda para /auth guardando a origem (/queues/comparison)`, `sessão expirada manda para /auth guardando a origem (/queues/comparison)`, `sessão corrompida manda para /auth guardando a origem (/queues/comparison)`, `sessão ausente manda para /auth guardando a origem (/sla)`, `sessão expirada manda para /auth guardando a origem (/sla)`, `sessão corrompida manda para /auth guardando a origem (/sla)` — resumo: `6 failed` e `2 passed (16.6s)` (os 2 de sessao valida continuam passando, como esperado). Após reverter: `8 passed (1.5m)` e `git status --short` vazio.
- Ponto 2 (primeira linha): corrigida para exatamente `Especialista: workertestes`; as skills foram para a linha `Skills:` abaixo.

## O que NAO fiz e por que
- Nao toquei codigo-fonte, specs nem `playwright.config.ts` neste refazer: o cartão mandou corrigir SÓ o relato.
- Nao corrigi os 2 defeitos REAIS de producao que o axe reprova (registrados em comentario no cartao): `src/pages/ResetPassword.tsx:199` (botao de mostrar/ocultar senha do form "Nova Senha" sem nome acessivel) e o link "Esqueci minha senha" em `/auth` no tema escuro. Sao arquivo de outro cartao; ficaram como catraca explicita.
- Nao mexi em `.github/workflows/ci.yml`: incluir o projeto novo no job deslogado e de outro cartao (arquivo fora do escopo).
- Nao alterei nenhuma regra de producao: o diff de producao e zero (so specs + `playwright.config.ts` no diff total; so relato no diff deste refazer).
