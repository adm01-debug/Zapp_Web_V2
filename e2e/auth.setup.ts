import { expect, test as setup } from '@playwright/test';
import path from 'node:path';

const AUTH_FILE = path.join(import.meta.dirname, '.auth', 'user.json');

// W72: teto de 90 s para o setup — senha errada → ❌ em < 2 min sem esperar o
// timeout de 15 min do job; login bem-sucedido costuma levar 10–20 s.
setup.setTimeout(90_000);

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

  // W72: timeout curto na navegação — distingue "app fora do ar / DNS falhou"
  // de "credencial recusada" logo no primeiro passo.
  try {
    await page.goto('/auth', { timeout: 15_000 });
  } catch (err) {
    throw new Error(
      '[E2E setup] O app nao respondeu em 15 s ao navegar para /auth. ' +
        'Verifique se o servidor esta rodando (VITE_ZAPP_LOCAL_SUPABASE_URL, ' +
        'ou o app de producao esta acessivel). Detalhe: ' + String(err),
    );
  }

  // Mesmo fluxo exercitado (sem login) em e2e/auth.spec.ts: tab "Entrar",
  // campo de e-mail, campo de senha, botao "Entrar".
  await page.getByRole('tab', { name: /^entrar$/i }).click();
  await page.getByRole('textbox', { name: /e-?mail/i }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /^entrar$/i }).click();

  // Sidebar da app shell (#main-navigation) so aparece apos login bem-sucedido.
  //
  // W06: aguarda #main-navigation diretamente (sem race condition .or()).
  // A abordagem anterior usava shell.or(getByRole('alert')) que capturava
  // alertas SIP/telefonia pos-login como falso positivo de credencial recusada.
  // Agora: waitFor no #main-navigation; so se falhar verifica mensagem de erro
  // especifica de autenticacao (sem getByRole('alert') generico).
  const shell = page.locator('#main-navigation');
  try {
    await shell.waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    const erroLogin = page.getByText(
      /inv[aá]lid|credenci|senha incorreta|e-?mail ou senha|erro ao entrar|temporariamente indispon[ií]vel/i,
    );
    const resposta = ((await erroLogin.first().textContent({ timeout: 2_000 }).catch(() => null)) ?? '').trim();
    const causa = resposta
      ? `[E2E setup] Credencial recusada — o app mostrou: "${resposta}". ` +
        'Verifique E2E_TEST_EMAIL/E2E_TEST_PASSWORD ou se o usuario de teste esta ativo.'
      : '[E2E setup] Login nao concluiu e nao ha mensagem visivel — ' +
        'o app pode estar sem resposta apos o POST de autenticacao.';
    throw new Error(causa);
  }

  await page.context().storageState({ path: AUTH_FILE });
});
