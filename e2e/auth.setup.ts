import { expect, test as setup } from '@playwright/test';
import path from 'node:path';

const AUTH_FILE = path.join(import.meta.dirname, '.auth', 'user.json');

// W72: teto de 180 s para o setup — senha errada → ❌ em segundos (mensagem de recusa
// ganha a corrida contra a sidebar); partida a frio do dev server pode levar > 30 s.
setup.setTimeout(180_000);

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

  // Sidebar da app shell (#main-navigation) so aparece apos login bem-sucedido.
  //
  // Espera o DESFECHO: a sidebar OU a mensagem ESPECIFICA de recusa, o que vier
  // primeiro. A recusa chega num toast que some em poucos segundos (useAuthForm),
  // entao nao da' para esperar a sidebar por inteiro e so' depois procurar o erro.
  // Nao usar getByRole('alert') generico: o app dispara toasts alheios ao login
  // (ex.: "Erro ao conectar ao servidor SIP") que viravam falso "credencial recusada"
  // (run 38703841548, W06).
  //
  // O teto de 120 s cobre a partida a frio do `vite dev` do CI: o otimizador de
  // dependencias (`optimizeDeps.force`) re-empacota e recarrega a pagina uma vez, e a
  // rota principal e' compilada sob demanda. Localmente isso leva ~12 s; no runner,
  // varias vezes mais. Recusa de credencial continua falhando em segundos.
  const shell = page.locator('#main-navigation');
  const erroLogin = page.getByText(
    /erro ao entrar|e-?mail ou senha incorretos|conta bloqueada|invalid login|credenciais? inv[aá]lid|temporariamente indispon[ií]vel/i,
  );
  // "Login temporariamente indisponivel" NAO e recusa de credencial: e o caminho
  // `unavailable` do AuthService.signIn -- a edge `auth-login` nao respondeu dentro de
  // AUTH_LOGIN_TIMEOUT_MS (12 s, src/lib/serverLogin.ts) ou devolveu 5xx/429. Medido no
  // run 38773362900 (W06): clique as 17:00:35.7, o front desistiu as 17:00:48.4 (12,4 s),
  // a edge so gravou o primeiro rate limit as 17:00:52.4 e o GoTrue criou a sessao as
  // 17:00:55.9 -- a edge levou ~20 s, e a credencial estava certa. A propria tela manda
  // "Tente novamente em instantes"; o setup faz o que o usuario faria, com teto de
  // tentativas. Tentativa `unavailable` nao conta para o lockout (a edge so registra
  // falha quando o GoTrue RECUSA a credencial -- R2-AUTH-021).
  const indisponivel = page.getByText(/temporariamente indispon[ií]vel/i);
  const TENTATIVAS = 3;
  const ESPERA_ENTRE_TENTATIVAS_MS = 5_000;

  for (let tentativa = 1; ; tentativa += 1) {
    if (tentativa > 1) {
      // Recarrega /auth: zera o toast anterior (senao ele mesmo "responderia" a proxima
      // espera) e o formulario, que limpa a senha depois de qualquer erro.
      await page.waitForTimeout(ESPERA_ENTRE_TENTATIVAS_MS);
      await page.goto('/auth', { timeout: 15_000 });
    }

    // Mesmo fluxo exercitado (sem login) em e2e/auth.spec.ts: a tela de acesso nao tem
    // abas (auth.spec.ts afirma getByRole('tab') = 0); campo de e-mail, campo de senha,
    // botao "Entrar".
    await page.getByRole('textbox', { name: /e-?mail/i }).fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /^entrar$/i }).click();

    try {
      await expect(shell.or(erroLogin).first()).toBeVisible({ timeout: 120_000 });
    } catch {
      const carregando = await page
        .getByRole('status', { name: /carregando p[aá]gina/i })
        .isVisible()
        .catch(() => false);
      throw new Error(
        carregando
          ? '[E2E setup] Login aceito, mas a rota principal nao terminou de carregar em 120 s ' +
              '(tela presa em "Carregando pagina..."). Provavel partida a frio do dev server ' +
              'ou chunk da rota principal travado; veja o trace do Playwright.'
          : '[E2E setup] Login nao concluiu e nao ha mensagem de recusa visivel em 120 s — ' +
              'o app pode estar sem resposta apos o POST de autenticacao.',
      );
    }

    if (await shell.isVisible().catch(() => false)) break;

    if (await indisponivel.first().isVisible().catch(() => false)) {
      if (tentativa < TENTATIVAS) {
        console.warn(
          `[E2E setup] tentativa ${tentativa}/${TENTATIVAS}: "Login temporariamente indisponivel" ` +
            '(edge auth-login sem resposta em 12 s, ou 5xx/429) -- tentando de novo.',
        );
        continue;
      }
      throw new Error(
        `[E2E setup] Login indisponivel em ${TENTATIVAS} tentativas: a edge auth-login nao ` +
          'respondeu em 12 s (AUTH_LOGIN_TIMEOUT_MS) ou devolveu 5xx/429. NAO e credencial ' +
          'errada -- verifique os logs da edge auth-login no Supabase.',
      );
    }

    // `last()`: o toast tem titulo ("Erro ao entrar") e descricao; a descricao diz o motivo.
    const resposta = ((await erroLogin.last().textContent({ timeout: 2_000 }).catch(() => null)) ?? '').trim();
    throw new Error(
      `[E2E setup] Credencial recusada — o app mostrou: "${resposta}". ` +
        'Verifique E2E_TEST_EMAIL/E2E_TEST_PASSWORD ou se o usuario de teste esta ativo.',
    );
  }

  await page.context().storageState({ path: AUTH_FILE });
});
