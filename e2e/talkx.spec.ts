import { test, expect } from '@playwright/test';

// Requires authenticated session — same gap as e2e/conversation.spec.ts and
// e2e/messaging.spec.ts: there is no seeded test user or storageState fixture
// in this repo yet, so every test below is skipped until an auth fixture
// exists. Selectors follow the real DOM (see src/services/navigation.service.ts
// and src/components/talkx/*) so the tests are ready to enable as soon as a
// login helper lands — no auth bypass hacks, no mocks.
test.describe('Talk X module', () => {
  test.skip('campaigns overview renders after navigating from the sidebar', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Menu de navegação principal' })
      .getByRole('button', { name: 'Campanhas', exact: true })
      .first()
      .click();

    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('data-state', 'active');
    await expect(page.getByRole('button', { name: /nova campanha/i })).toBeVisible();
  });

  test.skip('new campaign wizard opens on the audience step', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Menu de navegação principal' })
      .getByRole('button', { name: 'Campanhas', exact: true })
      .first()
      .click();

    await page.getByRole('button', { name: /nova campanha/i }).click();
    await expect(page.getByRole('heading', { name: /nova campanha/i })).toBeVisible();

    await page.getByLabel(/nome da campanha/i).fill('Campanha E2E de teste');

    // Advancing past step 1 requires a seeded WhatsApp connection plus a
    // segment or selected contacts (src/components/talkx/useCampaignEditor.ts
    // canProceed[1]) — not available as test fixture data yet, so this test
    // only verifies the wizard renders and "Continuar" is present.
    await expect(page.getByRole('button', { name: /continuar/i })).toBeVisible();

    await page.getByRole('button', { name: 'Voltar', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();
  });

  // TalkXHelp / aria-label="Ajuda" is not implemented anywhere in this
  // codebase yet (verified via grep across src/components/talkx and
  // src/hooks/integrations — no TalkXHelp component, no "Ajuda" button in
  // TalkXView). Written ahead of time so it can be enabled once both the
  // help modal and an auth fixture exist; do not remove the skip until then.
  test.skip('help modal opens and closes', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Menu de navegação principal' })
      .getByRole('button', { name: 'Campanhas', exact: true })
      .first()
      .click();

    await page.getByRole('button', { name: /ajuda/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test.skip('segments and templates tabs render', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Menu de navegação principal' })
      .getByRole('button', { name: 'Campanhas', exact: true })
      .first()
      .click();

    await page.getByRole('tab', { name: 'Segmentos' }).click();
    await expect(page.getByRole('tab', { name: 'Segmentos' })).toHaveAttribute('data-state', 'active');
    await expect(page.getByPlaceholder('Buscar segmentos…')).toBeVisible();

    await page.getByRole('tab', { name: 'Templates' }).click();
    await expect(page.getByRole('tab', { name: 'Templates' })).toHaveAttribute('data-state', 'active');
    await expect(page.getByPlaceholder('Buscar templates…')).toBeVisible();
  });
});
