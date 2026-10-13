Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê

Regressão de frota do cartão pai: o tour de onboarding passou a ser decidido pela
coluna `user_settings.onboarding_completed` (commit 5d537a705) e o caminho
DESLOGADO continuava respondendo `user_settings` vazio / marcando a conclusão com
uma flag de `localStorage` que o hook deixou de ler (MORTA). Resultado: o
`WelcomeModal` abria por cima de toda tela, o Radix marcava o `<main>` como
`aria-hidden` e o `getByRole` não achava o heading de cada tela.

- `e2e/fixtures/mapa-mocks.ts`: `user_settings` (em `mockAppShell`) passa a ser
  respondido por `responderUserSettingsFake`, que devolve a linha da sessão falsa
  com `onboarding_completed: true` (`USER_SETTINGS_SESSAO_FAKE`). É a origem do
  conserto: toda spec deslogada passa por aqui.
- `e2e/fixtures/talkx-demo.ts`: removida a flag MORTA
  `onboarding_completed_<user_id>` gravada no `localStorage` pelo
  `installFakeSession` (e o `onboardingKey` que só existia para ela); no lugar, a
  sessão falsa registra a rota `user_settings` com a coluna concluída. O catch-all
  de `mockTalkXBackend` deixou de capturar `user_settings` (senão responderia `[]`
  por cima da rota da sessão).
- `e2e/fixtures/email-navy.ts`, `e2e/ct94-ui-429.spec.ts`,
  `e2e/talkx-launch.spec.ts`: os catch-alls/dispatchers que respondiam `[]` para
  `user_settings` deixam a rota da sessão falsa vencer (lookahead) ou respondem
  `responderUserSettingsFake` — sem isso o overlay voltaria só nesses specs.
- `e2e/a11y-config-admin.spec.ts`: `mockConfigVazio` deixa de devolver
  `user_settings` VAZIO (`onboarding_completed` ausente ⇒ tour abre).
- `e2e/onboarding-dispensar.spec.ts`: é o único spec que QUER o overlay aberto;
  re-registra `user_settings` com a coluna em false (no Playwright a última rota
  registrada vence) e some a flag morta `CHAVE_TOUR`.

## Prova

- vermelho antes (mutação de 1 linha: `onboarding_completed: false` em
  `mapa-mocks.ts`):
  `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5279 npx playwright test --project=chromium-a11y -g "Configuracoes" --workers=1 --timeout=120000`
  → `1 failed` com
  `Error: expect(locator).toBeVisible() failed — Locator: getByRole('main', { name: 'Conteúdo principal' }).getByRole('heading', { name: 'Administração' }) — Error: element(s) not found`;
  `test-results/a11y-config-admin-N-*/error-context.md` → `dialog "Bem-vindo, Visual! 🎉"` (mesma evidência do cartão). Mutação revertida antes do commit.
- verde depois (comando de referência do cartão, mesmos flags da evidência):
  - `npx playwright test --project=chromium-a11y --workers=1 --timeout=120000` → `11 passed`
  - `npx playwright test --project=chromium-settings --workers=1 --timeout=120000` → `3 passed`
  - `npx playwright test --project=chromium-onboarding-dispensar --workers=1 --timeout=120000` → `1 passed`
  - `npx playwright test --project=chromium-telefonia --workers=1 --timeout=120000` → `8 passed`

## O que NÃO fiz e por quê

- `playwright.config.ts` aparece no diff do cartão (ESCOPO GLOBAL) por CHERRY-PICK
  dos 6 commits do cartão pai (`67d7c72a4 8a891ca5e 863b52422 177e2e792 776e021a1
  4c9a29ce4`), não por edição minha — o critério de pronto exige
  `e2e/settings-persistencia.spec.ts` verde no projeto `chromium-settings`, que o
  pai criou ali; sem o projeto a spec cairia no `chromium-authenticated` (sessão
  REAL, viola a R1). Meu commit de trabalho é o `9a4ed0d81` (só fixtures/specs
  e2e); o `playwright.config.ts` já chegou pronto no cherry-pick.

- Não toquei na regra de produção do tour (o cartão proíbe; é do cartão pai).
  Nenhum arquivo de `src/` mudou — o diff é só de fixture/spec e2e.
- `e2e/a11y-contraste.spec.ts:136` (E98 "lista populada", 3 vistas + hover, ~6
  varreduras axe): estoura o teto DEFAULT de 30s do Playwright sob a carga de
  agora e passa com `--timeout=120000` (medido `1 passed (48.5s)`; o snapshot
  mostra a página normal, SEM overlay — não é a regressão deste cartão). Não
  aumentei o timeout: limite do meu perfil manda não mexer em timeout de teste
  sem o cartão mandar. Abri cartão de acompanhamento e comentei.
- Não rodei as specs pesadas de imagem (`chromium-email-navy`/`talkx-visual`):
  só ajustei o mock de `user_settings` delas pelo caminho compartilhado; a prova
  de tela continua sendo `chromium-telefonia` + `chromium-a11y` (8 + 11 verdes).
