import { test, expect, type Page } from '@playwright/test';

// SidebarNavGroup defaults to closed (defaultOpen=false). Fresh auth storageState
// has no saved group-open state, so the group must be expanded before clicking
// any item inside "Automação & IA".
async function expandCampanhasGroup(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Menu de navegação principal' });
  const groupBtn = nav.getByRole('button', { name: /automação & ia/i }).first();
  if ((await groupBtn.getAttribute('aria-expanded')) === 'false') {
    await groupBtn.click();
  }
}

test.describe('Talk X module', () => {
  test('campaigns overview renders after navigating from the sidebar', async ({ page }) => {
    await page.goto('/');
    await expandCampanhasGroup(page);
    await page
      .getByRole('navigation', { name: 'Menu de navegação principal' })
      .getByRole('button', { name: 'Campanhas', exact: true })
      .first()
      .click();

    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('data-state', 'active');
    // .first() because TalkXView and TalkXOverview both render a 'Nova campanha' button
    await expect(page.getByRole('button', { name: /nova campanha/i }).first()).toBeVisible();
  });

  test('new campaign wizard opens on the audience step', async ({ page }) => {
    await page.goto('/');
    await expandCampanhasGroup(page);
    await page
      .getByRole('navigation', { name: 'Menu de navegação principal' })
      .getByRole('button', { name: 'Campanhas', exact: true })
      .first()
      .click();

    // .first() because TalkXView and TalkXOverview both render a 'Nova campanha' button
    await page.getByRole('button', { name: /nova campanha/i }).first().click();
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

  test('help modal opens and closes', async ({ page }) => {
    await page.goto('/');
    await expandCampanhasGroup(page);
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

  test('segments and templates tabs render', async ({ page }) => {
    await page.goto('/');
    await expandCampanhasGroup(page);
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
