/**
 * Prova do duplo `dispensarOnboarding` (e2e/fixtures/onboarding.ts).
 *
 * O DEFEITO (item 385 / R2-INF-043): a fixture esperava o modal de boas-vindas com
 * `getByRole('dialog', { name: 'Boas-vindas' })`, nome acessível que o componente
 * JÁ NÃO TEM. O `WelcomeModal` virou diálogo único (o overlay deixou de ser um
 * segundo `role=dialog` aninhado) e o nome passou a vir do h2 via
 * `aria-labelledby="welcome-modal-title"` → "Bem-vindo...".
 *
 * Como o antigo nome não resolve mais, `modal.count()` dava 0 e a fixture SAÍA
 * SEM DISPENSAR. O overlay `z-[9999]` continuava por cima do app e engolia o
 * clique seguinte — e o sintoma no Playwright é enganoso: o alvo resolve, está
 * visível, estável e habilitado, e mesmo assim o click nunca completa (é o
 * hit-target que reprova). Nenhum `toBeVisible` enxerga isso.
 *
 * Por isso a prova abaixo NÃO se contenta em ver o modal: depois de dispensar,
 * ela exige que um clique REAL chegue na tela (o único juiz da oclusão) e que o
 * overlay esteja fora do DOM.
 *
 * Hermético por construção: sessão falsa (`installFakeSession`) + backend do app
 * shell mockado (`mockAppShell`) + `bloquearRedeReal`, que barra qualquer
 * requisição ao Supabase/Mapbox que escape dos mocks e é conferido no afterEach.
 * Nenhum dado real, nenhuma credencial, nenhum secret.
 */
import { test, expect, type Page } from '@playwright/test';

import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession, FAKE_USER_ID } from './fixtures/talkx-demo';
import { dispensarOnboarding, OVERLAY_ONBOARDING } from './fixtures/onboarding';

test.use({ storageState: { cookies: [], origins: [] } });

// O servidor vite frio (optimizeDeps.force) compila o app inteiro na primeira
// navegação e leva bem mais que os 30s padrão do Playwright. Sem isto a prova
// reprova por tempo de build, não pelo defeito.
test.setTimeout(120_000);

/** Chave que `useOnboarding` lê primeiro; com ela fora, a decisão vem de `user_settings` (null). */
const CHAVE_TOUR = `onboarding_completed_${FAKE_USER_ID}`;

test.describe('dispensarOnboarding fecha o modal de boas-vindas de verdade', () => {
  let registro: Registro;

  test.beforeEach(async ({ page }) => {
    // Watchdog de boot (index.html): com o dev server frio o React 19 pode levar
    // mais de 8s para montar e o watchdog apaga o #root. Mesmo ajuste do
    // talkx-visual.spec.ts — sem ele a falha não teria relação com o produto.
    await page.addInitScript(() => {
      (window as Window & { __BOOT_DEADLINE_MS?: number }).__BOOT_DEADLINE_MS = 60_000;
    });
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    // Registre o guarda ANTES dos mocks: o Playwright casa na ordem inversa.
    await bloquearRedeReal(page, registro);
    // `user_settings` responde null → o tour ainda não foi concluído → o modal abre.
    await mockAppShell(page, registro);
    await installFakeSession(page);
    // `installFakeSession` marca o tour como concluído (o spec visual do Talk X
    // depende disso). Aqui o alvo é o contrário — o OVERLAY, que engole o clique —
    // então a chave local sai logo depois, simulando um navegador novo.
    await page.addInitScript((chave) => localStorage.removeItem(chave), CHAVE_TOUR);
    // Leitura de contatos da tela: sem isto a tela dispara `contacts` e o guarda
    // de rede a barra (o catch-all do app shell exclui `contacts` de propósito).
    await page.route(/\/rest\/v1\/contacts/, (route) => json(route, []));
    await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
  });

  test.afterEach(() => {
    expect(registro.redeBarrada).toEqual([]);
  });

  test('o overlay sai do DOM e o clique volta a chegar na tela', async ({ page }) => {
    await page.goto('/?view=contacts');

    const modal = page.getByRole('dialog', { name: /bem-vindo/i });
    // Pré-condição, não conclusão: sem o modal aberto a prova não significa nada.
    await expect(modal).toBeVisible({ timeout: 20_000 });

    await dispensarOnboarding(page);

    await expect(modal).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator(OVERLAY_ONBOARDING)).toHaveCount(0, { timeout: 10_000 });

    // O invariante que o defeito quebrava EM SILÊNCIO: o clique chega.
    // `toBeVisible` não enxerga oclusão; o hit-target do `click` enxerga.
    await expectClickLands(page);
  });
});

/** O clique só "chega" se o hit-target do Playwright resolver a aba sem overlay por cima. */
async function expectClickLands(page: Page): Promise<void> {
  const aba = page.getByRole('tab', { name: /Todos/ });
  await expect(aba).toBeVisible({ timeout: 20_000 });
  await aba.click({ timeout: 5_000 });
  await expect(aba).toHaveAttribute('data-state', 'active');
}


