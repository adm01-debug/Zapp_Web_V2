Especialista: workertestes

## O que mudou e por quê
- `src/hooks/ui/__tests__/useDensity.test.ts` (novo): contrato do hook real `useDensity` — o `data-density` chega ao `<html>` (é o que `src/styles/accessibility.css` lê), o cache `localStorage['ui-density']` guarda a escolha, `setDensity` vale na hora e `cycleDensity` percorre confortável → compacto → denso → confortável; mais o caso do `localStorage` bloqueado, que cai no confortável sem derrubar o hook.
- `e2e/settings-persistencia.spec.ts` (novo): mede, no NAVEGADOR real e com o backend `user_settings` stateful em memória (`page.route`) + rede real barrada (R1), a promessa dos cartões pai: (1) tema e idioma — escolhe Claro/English (US), Salva preferências, confere o corpo do `PATCH`, recarrega SEM a muleta do cache e confere que o `<html>` e os selects voltam do banco; (2) notificação desligada não é ressuscitada pelo "Salvar preferências" (o corpo do upsert não leva a coluna); (3) Reiniciar Tour grava `onboarding_completed = false` e o overlay do tour volta no reload.
- `playwright.config.ts` (+14/-1): projeto dedicado `chromium-settings` (mesmo padrão deslogado de `chromium-a11y`/`chromium-telefonia`: sessão falsa + rotas mockadas, sem `setup` e sem segredo) e a spec somada ao `testIgnore` do `chromium-authenticated`. Motivo: sem projeto próprio a spec seria colhida pelo `chromium-authenticated`, que roda o `setup` de sessão e deixa a escrita alcançar o backend real — violação da R1. É infra de teste, não código de produção.

## Prova
- useDensity (3 rodadas seguidas, verde): `npx vitest run src/hooks/ui/__tests__/useDensity.test.ts` → `Test Files 1 passed (1)` / `Tests 5 passed (5)` em cada uma.
- vermelho antes (mutação): removi `document.documentElement.setAttribute('data-density', density)` de `src/hooks/ui/useDensity.ts` → a rodada falha e reprova o caso do atributo; restaurei a linha em seguida.
- e2e (3 rodadas seguidas, verde, o mesmo estado final do commit): `PLAYWRIGHT_BASE_URL=http://127.0.0.1:52xx npx playwright test --project=chromium-settings --workers=1 --timeout=120000` → `3 passed`.
- vermelho antes (mutação e2e): removi `setTheme(normalizeTheme(theme))` da hidratação em `src/hooks/system/useUserSettings.ts` → `Expected pattern: /light/` / `Received string: "dark"` (1 failed); restaurei a linha (o `git diff` do arquivo voltou a vazio).
- config de e2e: `node --test scripts/ci/playwright-config-e81.unit.mjs` e `node --test scripts/ci/ci-e2e-projects.unit.mjs` → OK; `npx playwright test --project=chromium-settings --list` lista os 3 casos.

## O que NÃO fiz e por quê
- Não alterei código de produção: as duas linhas mutadas para a prova foram restauradas e o `git diff` só tem os arquivos de teste e o `playwright.config.ts`.
- `playwright.config.ts` não está na lista "ARQUIVOS QUE PODE TOCAR" do cartão; entrou com a entrada mínima do projeto porque a alternativa (cair no `chromium-authenticated`) usaria a sessão REAL — a R1 proíbe. Se o revisor preferir, a spec pode ser movida para o `testMatch` de um dos projetos deslogados já existentes.

## Achado fora do escopo (vira comentário no cartão)
- `e2e/a11y-config-admin.spec.ts` (e outros especs deslogados) passaram a abrir o overlay do tour: a coluna `onboarding_completed` passou a decidir o tour, o `mapa-mocks` devolve `null` para `user_settings` e a flag antiga do `installFakeSession` no `localStorage` morreu — o modal cobre a tela e derruba as asserções. Não é do meu diff; é do cartão pai e precisa de um `user_settings` mockado com `onboarding_completed: true` nos especs deslogados.
