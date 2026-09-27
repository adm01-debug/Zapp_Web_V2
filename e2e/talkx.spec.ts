import { test, expect, type Page } from '@playwright/test';

// SidebarNavGroup defaults to closed (defaultOpen=false). Fresh auth storageState
// has no saved group-open state, so the group must be expanded before clicking
// any item inside "Automação & IA".
//
// force: true bypasses pointer-event interception from overlapping sidebar elements
// (a parent div intercepts clicks in the compact sidebar layout used in CI).
async function expandCampanhasGroup(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Menu de navegação principal' });
  const groupBtn = nav.getByRole('button', { name: /automação & ia/i }).first();
  if ((await groupBtn.getAttribute('aria-expanded')) === 'false') {
    await groupBtn.click({ force: true });
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
      .click({ force: true });

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
      .click({ force: true });

    // .first() because TalkXView and TalkXOverview both render a 'Nova campanha' button
    await page.getByRole('button', { name: /nova campanha/i }).first().click();
    await expect(page.getByRole('heading', { name: /nova campanha/i })).toBeVisible();

    // Do NOT fill the campaign name: useCampaignEditor's autosave timer fires
    // ~3 s after the field is touched, creating real draft records on every run
    // and retry. Advancing past step 1 also requires a seeded WhatsApp connection
    // + segment — not available as fixture data, so this test only verifies the
    // wizard renders and "Continuar" is present.
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
      .click({ force: true });

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
      .click({ force: true });

    await page.getByRole('tab', { name: 'Segmentos' }).click();
    await expect(page.getByRole('tab', { name: 'Segmentos' })).toHaveAttribute('data-state', 'active');
    await expect(page.getByPlaceholder('Buscar segmentos…')).toBeVisible();

    await page.getByRole('tab', { name: 'Templates' }).click();
    await expect(page.getByRole('tab', { name: 'Templates' })).toHaveAttribute('data-state', 'active');
    await expect(page.getByPlaceholder('Buscar templates…')).toBeVisible();
  });

  test('wizard step 1 shows audience fields and stepper', async ({ page }) => {
    // Navigate directly via URL to the campaigns overview, bypassing sidebar clicks.
    // This exercises the deep-link routing path (?view=talkx) independently of the
    // sidebar-navigation tests above.
    await page.goto('/?view=talkx');
    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();

    // .first() because TalkXView and TalkXOverview both render a 'Nova campanha' button
    await page.getByRole('button', { name: /nova campanha/i }).first().click();
    await expect(page.getByRole('heading', { name: /nova campanha/i })).toBeVisible();

    // Step 1 label ("Público") is visible in the stepper
    await expect(page.getByText('Público').first()).toBeVisible();

    // Campaign name input is present and empty.
    // IMPORTANT: do NOT use fill() — useCampaignEditor autosave fires ~3 s after
    // first keystroke, creating real draft records on every CI run and retry.
    const nameInput = page.getByPlaceholder('Ex: Lançamento Linha Office');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue('');

    // Step 1 always shows "Continuar"
    await expect(page.getByRole('button', { name: /continuar/i })).toBeVisible();

    // Close the wizard via the header Voltar button (aria-label="Voltar", calls onClose).
    // On step 1 the footer Voltar is hidden (only shown when step > 1), so .first()
    // reliably targets the header button.
    await page.getByRole('button', { name: 'Voltar', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();
  });
});
