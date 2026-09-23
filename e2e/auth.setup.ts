import { test as setup } from '@playwright/test';
import path from 'node:path';

const AUTH_FILE = path.join(import.meta.dirname, '.auth', 'user.json');

// Projeto Playwright "setup" (ver playwright.config.ts): roda antes de
// "chromium-authenticated" via dependsOn, nunca antes de "chromium"
// (auth.spec.ts), que testa a tela de login deslogada e nao pode depender
// de uma sessao ja autenticada.
setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_TEST_EMAIL e/ou E2E_TEST_PASSWORD nao estao definidas. Os testes que dependem de ' +
        'sessao autenticada (e2e/conversation.spec.ts, e2e/messaging.spec.ts, e2e/talkx.spec.ts) ' +
        'usam essas variaveis para logar um usuario de teste real e gerar o storageState salvo ' +
        'em e2e/.auth/user.json. Defina as duas variaveis em um .env local (nunca commitado) ou ' +
        'como secrets do GitHub Actions antes de rodar "npm run test:e2e". Veja e2e/README.md ' +
        'para instrucoes completas.'
    );
  }

  // Mesmo fluxo exercitado (sem login) em e2e/auth.spec.ts: tab "Entrar",
  // campo de e-mail, campo de senha, botao "Entrar".
  await page.goto('/auth');
  await page.getByRole('tab', { name: /^entrar$/i }).click();
  await page.getByRole('textbox', { name: /e-?mail/i }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /^entrar$/i }).click();

  // Sidebar da app shell (#main-navigation) so aparece apos login bem-sucedido.
  await page.locator('#main-navigation').waitFor({ state: 'visible', timeout: 30_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
