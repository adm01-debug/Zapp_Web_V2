import { expect, test as setup } from '@playwright/test';
import path from 'node:path';
import { assertAuthenticatedTarget, diagnoseAuthFailure, isAuthLoginRequest, type AuthObservation } from './auth-diagnostics';
import { assertIsolatedAuthEnvironment } from '../scripts/e2e-isolated/admission.mjs';

const AUTH_FILE = path.join(import.meta.dirname, '.auth', 'user.json');

// W72: teto de 180 s para o setup — senha errada → ❌ em segundos (mensagem de recusa
// ganha a corrida contra a sidebar); partida a frio do dev server pode levar > 30 s.
setup.setTimeout(180_000);

// Projeto Playwright "setup" (ver playwright.config.ts): roda antes de
// "chromium-authenticated" via dependsOn, nunca antes de "chromium"
// (auth.spec.ts), que testa a tela de login deslogada e nao pode depender
// de uma sessao ja autenticada.
setup('authenticate', async ({ page, baseURL }) => {
  // O setup mutador exige prova do namespace, backend e fixtures descartáveis
  // antes de ler credenciais. A primeira guarda recusa origens remotas sem I/O.
  assertAuthenticatedTarget(baseURL);
  await assertIsolatedAuthEnvironment({ page, baseURL });
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

  // Observamos metadados e marcadores específicos da UI. Não ler/logar body, headers, senha,
  // email, access token ou storageState para diagnosticar uma falha de login.
  let observation: AuthObservation = {};
  let currentLoginRequest: object | undefined;
  page.on('request', request => {
    if (request.method() === 'POST' && isAuthLoginRequest(request.url())) {
      currentLoginRequest = request;
      observation.backendOrigin = new URL(request.url()).origin;
    }
  });
  page.on('response', response => {
    if (response.request() === currentLoginRequest) {
      observation.status = response.status();
    }
  });
  page.on('requestfailed', request => {
    if (request === currentLoginRequest) {
      observation.transportFailed = true;
    }
  });

  // Sidebar da app shell (#main-navigation) so aparece apos login bem-sucedido.
  //
  // Espera o DESFECHO: a sidebar OU a mensagem ESPECIFICA de recusa/bloqueio, o que vier
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
  // Título do ramo networkBlocked em useAuthForm: não equivale a senha incorreta.
  const bloqueioAcesso = page.getByText(/^acesso bloqueado$/i);
  // O toast "indisponivel" também cobre falha de fetch/CORS. Só a resposta HTTP
  // observada permite atribuir 5xx/429; retries não corrigem origem incompatível.
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

    observation = {};
    currentLoginRequest = undefined;
    // Mesmo fluxo exercitado (sem login) em e2e/auth.spec.ts: a tela de acesso nao tem
    // abas (auth.spec.ts afirma getByRole('tab') = 0); campo de e-mail, campo de senha,
    // botao "Entrar".
    await page.getByRole('textbox', { name: /e-?mail/i }).fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /^entrar$/i }).click();

    try {
      await expect(shell.or(erroLogin).or(bloqueioAcesso).first()).toBeVisible({ timeout: 120_000 });
    } catch {
      const diagnostic = diagnoseAuthFailure(baseURL, { ...observation, timedOut: true });
      throw new Error(
        `[E2E setup/${diagnostic.code}] ${diagnostic.message} Veja o trace do Playwright.`,
      );
    }

    if (await shell.isVisible().catch(() => false)) break;

    observation.accessBlocked = await bloqueioAcesso.first().isVisible().catch(() => false);
    if (await indisponivel.first().isVisible().catch(() => false)) {
      const diagnostic = diagnoseAuthFailure(baseURL, observation);
      if (diagnostic.retryable && tentativa < TENTATIVAS) {
        console.warn(
          `[E2E setup/${diagnostic.code}] tentativa ${tentativa}/${TENTATIVAS}: ` +
            `${diagnostic.message} Tentando novamente.`,
        );
        continue;
      }
      throw new Error(
        `[E2E setup/${diagnostic.code}] ${diagnostic.message} Tentativas realizadas: ${tentativa}.`,
      );
    }

    const credentialRejected = await page.getByText(
      /e-?mail ou senha incorretos|conta bloqueada|invalid login|credenciais? inv[aá]lid/i,
    ).first().isVisible().catch(() => false);
    const diagnostic = diagnoseAuthFailure(baseURL, { ...observation, credentialRejected });
    throw new Error(
      `[E2E setup/${diagnostic.code}] ${diagnostic.message}`,
    );
  }

  await page.context().storageState({ path: AUTH_FILE });
});
