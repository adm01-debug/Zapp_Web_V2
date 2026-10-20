# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.setup.ts >> authenticate
- Location: e2e/auth.setup.ts:10:1

# Error details

```
Error: E2E_TEST_EMAIL e/ou E2E_TEST_PASSWORD nao estao definidas. Os testes que dependem de sessao autenticada (e2e/conversation.spec.ts, e2e/messaging.spec.ts, e2e/talkx.spec.ts) usam essas variaveis para logar um usuario de teste real e gerar o storageState salvo em e2e/.auth/user.json. Defina as duas variaveis em um .env local (nunca commitado) ou como secrets do GitHub Actions antes de rodar "npm run test:e2e". Veja e2e/README.md para instrucoes completas.
```

# Test source

```ts
  1  | import { expect, test as setup } from '@playwright/test';
  2  | import path from 'node:path';
  3  | 
  4  | const AUTH_FILE = path.join(import.meta.dirname, '.auth', 'user.json');
  5  | 
  6  | // Projeto Playwright "setup" (ver playwright.config.ts): roda antes de
  7  | // "chromium-authenticated" via dependsOn, nunca antes de "chromium"
  8  | // (auth.spec.ts), que testa a tela de login deslogada e nao pode depender
  9  | // de uma sessao ja autenticada.
  10 | setup('authenticate', async ({ page }) => {
  11 |   const email = process.env.E2E_TEST_EMAIL;
  12 |   const password = process.env.E2E_TEST_PASSWORD;
  13 | 
  14 |   if (!email || !password) {
> 15 |     throw new Error(
     |           ^ Error: E2E_TEST_EMAIL e/ou E2E_TEST_PASSWORD nao estao definidas. Os testes que dependem de sessao autenticada (e2e/conversation.spec.ts, e2e/messaging.spec.ts, e2e/talkx.spec.ts) usam essas variaveis para logar um usuario de teste real e gerar o storageState salvo em e2e/.auth/user.json. Defina as duas variaveis em um .env local (nunca commitado) ou como secrets do GitHub Actions antes de rodar "npm run test:e2e". Veja e2e/README.md para instrucoes completas.
  16 |       'E2E_TEST_EMAIL e/ou E2E_TEST_PASSWORD nao estao definidas. Os testes que dependem de ' +
  17 |         'sessao autenticada (e2e/conversation.spec.ts, e2e/messaging.spec.ts, e2e/talkx.spec.ts) ' +
  18 |         'usam essas variaveis para logar um usuario de teste real e gerar o storageState salvo ' +
  19 |         'em e2e/.auth/user.json. Defina as duas variaveis em um .env local (nunca commitado) ou ' +
  20 |         'como secrets do GitHub Actions antes de rodar "npm run test:e2e". Veja e2e/README.md ' +
  21 |         'para instrucoes completas.'
  22 |     );
  23 |   }
  24 | 
  25 |   // Mesmo fluxo exercitado (sem login) em e2e/auth.spec.ts: tab "Entrar",
  26 |   // campo de e-mail, campo de senha, botao "Entrar".
  27 |   await page.goto('/auth');
  28 |   await page.getByRole('tab', { name: /^entrar$/i }).click();
  29 |   await page.getByRole('textbox', { name: /e-?mail/i }).fill(email);
  30 |   await page.locator('input[type="password"]').fill(password);
  31 |   await page.getByRole('button', { name: /^entrar$/i }).click();
  32 | 
  33 |   // Sidebar da app shell (#main-navigation) so aparece apos login bem-sucedido.
  34 |   //
  35 |   // Espera o DESFECHO, nao so' o sucesso: sem isso, um login RECUSADO vira
  36 |   // "timeout aguardando #main-navigation" e nao diz nada sobre a causa (medido
  37 |   // em 02/10: senha invalida reproduz exatamente essa mensagem muda).
  38 |   const shell = page.locator('#main-navigation');
  39 |   const erroLogin = page
  40 |     .getByRole('alert')
  41 |     .or(page.getByText(/inv[aá]lid|credenci|senha incorreta|e-?mail ou senha|erro ao entrar|temporariamente indispon[ií]vel|tente novamente|sem resposta|timeout/i));
  42 |   await expect(shell.or(erroLogin).first()).toBeVisible({ timeout: 30_000 });
  43 | 
  44 |   const entrou = await shell.isVisible().catch(() => false);
  45 |   if (!entrou) {
  46 |     const resposta = ((await erroLogin.first().textContent().catch(() => null)) ?? '').trim();
  47 |     throw new Error(
  48 |       'Login nao concluiu (o app nao montou a sidebar). O app respondeu: ' +
  49 |         (resposta || '(nenhuma mensagem visivel na tela)'),
  50 |     );
  51 |   }
  52 |   await shell.waitFor({ state: 'visible', timeout: 10_000 });
  53 | 
  54 |   await page.context().storageState({ path: AUTH_FILE });
  55 | });
  56 | 
```