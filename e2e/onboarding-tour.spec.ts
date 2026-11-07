import { test, expect, gotoOnboardingContacts } from './fixtures/onboarding-isolated';

test.use({ storageState: { cookies: [], origins: [] } });
// Each test creates its own local Auth user and completes a real UI login.
test.setTimeout(120_000);

/**
 * Overlay do tour de onboarding (`src/components/onboarding/WelcomeModal.tsx`):
 * um `div.fixed.inset-0.z-[9999]` que cobre a aplicação inteira e intercepta
 * pointer events. Dois defeitos reais, medidos em produção:
 *
 *  1. o tour reaparecia em TODO navegador/sessão nova, porque `useOnboarding`
 *     decide "já completou" pela existência de linha em `user_settings` mas
 *     `completeOnboarding()` gravava apenas no localStorage — e, reaparecendo,
 *     bloqueava os cliques da tela de Contatos;
 *  2. o overlay não fechava no Escape (é um `motion.div`, não um Dialog), então a
 *     única saída era achar o X ou o "Pular tour".
 *
 * Enquanto está aberto ele DEVE bloquear: é um modal, isso é o esperado. O que
 * estes testes garantem é que (a) ele é um diálogo de verdade, (b) tem saída por
 * teclado, (c) a decisão não volta em navegador novo e (d) dispensado o tour, o
 * app volta a responder ao clique.
 *
 * Cada teste/tentativa tem usuário sintético próprio, sessão vazia e a coluna
 * `user_settings.onboarding_completed` comprovadamente false. O modal precisa
 * abrir: sua ausência é falha, sem depender do estado de outro teste. A fixture
 * preserva os demais usuários e remove somente a conta cuja posse reconfirmou.
 */

/** Espera curta de propósito: overlay que intercepta cliques precisa falhar rápido. */
const PROBE = 5_000;

/**
 * Ausência de overlay só é significativa DEPOIS de dar tempo de a checagem
 * assíncrona (localStorage → banco) rodar: afirmar ausência cedo demais passa por
 * sorte num código quebrado.
 */
const SETTLE = 9_000;

const SKIP_TOUR = /pular tour/i;

type Page = import('@playwright/test').Page;

const skipButton = (page: Page) => page.getByRole('button', { name: SKIP_TOUR });

async function tourVisible(page: Page): Promise<boolean> {
  return skipButton(page)
    .waitFor({ state: 'visible', timeout: PROBE })
    .then(() => true)
    .catch(() => false);
}

/** Simula navegador/sessão nova sem deslogar: só a chave do tour sai do localStorage. */
async function forgetLocalTourFlag(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('onboarding_completed')) window.localStorage.removeItem(key);
    }
  });
}

/** O tour não pode estar por cima depois do tempo de acomodar a checagem. */
async function expectNoTour(page: Page): Promise<void> {
  await page.waitForTimeout(SETTLE);
  await expect(skipButton(page)).toHaveCount(0);
}

/** O clique precisa CHEGAR: o toggle é local e instantâneo, então o estado muda. */
async function expectClickLands(page: Page): Promise<void> {
  const toggle = page.getByRole('switch').first();
  await expect(toggle).toBeVisible();
  const antes = (await toggle.getAttribute('aria-checked')) === 'true';

  await toggle.click({ timeout: PROBE });
  await expect(toggle).toHaveAttribute('aria-checked', String(!antes), { timeout: PROBE });

  // Devolve o estado original.
  await toggle.click({ timeout: PROBE });
  await expect(toggle).toHaveAttribute('aria-checked', String(antes), { timeout: PROBE });
}

test.describe('tour de onboarding não pode bloquear a aplicação', () => {
  test('é um diálogo, fecha no Escape, não volta em navegador novo e libera o clique', async ({ page }) => {
    await gotoOnboardingContacts(page);

    const abriu = await tourVisible(page);
    test.info().annotations.push({
      type: 'tour-aberto',
      description: abriu ? 'sim' : 'não (usuário isolado ainda não concluiu o tour)',
    });
    expect(abriu, 'o usuário novo precisa exercitar o tour aberto').toBe(true);

    // O diálogo é o CARD do modal (o overlay é só backdrop) e o nome acessível vem do h2 via
    // aria-labelledby="welcome-modal-title" -> "Bem-vindo...". Antes o nome vinha de um
    // aria-label="Boas-vindas" no overlay, que era um SEGUNDO diálogo aninhado.
    await expect(page.getByRole('dialog', { name: /bem-vindo/i })).toHaveAttribute(
      'aria-modal',
      'true',
    );

    await page.keyboard.press('Escape');
    await expect(skipButton(page)).toBeHidden({ timeout: PROBE });

    // "Navegador novo": sem a chave local, a única memória possível é o banco.
    await forgetLocalTourFlag(page);
    await page.reload();
    await expectNoTour(page);

    // O invariante do relato: com o tour fora do caminho, o clique chega no app.
    await expectClickLands(page);
  });

  test('"Pular tour" fecha e a decisão sobrevive a navegador novo', async ({ page }) => {
    await gotoOnboardingContacts(page);
    expect(await tourVisible(page), 'o usuário novo precisa exercitar o tour aberto').toBe(true);

    await skipButton(page).click({ timeout: PROBE });
    await expect(skipButton(page)).toBeHidden({ timeout: PROBE });

    await forgetLocalTourFlag(page);
    await page.reload();
    await expectNoTour(page);

    await expectClickLands(page);
  });
});
