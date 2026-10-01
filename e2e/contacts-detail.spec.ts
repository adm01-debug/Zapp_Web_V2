import { test, expect } from '@playwright/test';
import { contactCards, gotoContacts } from './fixtures/contacts-page';

// Plano de Contatos, etapa 88.
test.describe('Contatos — painel de detalhe', () => {
  test.beforeEach(async ({ page }) => {
    await gotoContacts(page);
    await page.getByTitle('Cards').click();
    await expect(contactCards(page).first()).toBeVisible({ timeout: 15_000 });
  });

  test('abre ao clicar no card e fecha com Esc', async ({ page }) => {
    await contactCards(page).first().click({ position: { x: 80, y: 90 } });
    const panel = page.getByRole('dialog', { name: /^Detalhes do contato / });
    await expect(panel).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('"Conversar" leva ao inbox com o contato aberto', async ({ page }) => {
    await contactCards(page).first().click({ position: { x: 80, y: 90 } });
    const panel = page.getByRole('dialog', { name: /^Detalhes do contato / });
    await expect(panel).toBeVisible();
    const label = await panel.getAttribute('aria-label');
    const name = (label ?? '').replace(/^Detalhes do contato /, '');

    await panel.getByRole('button', { name: /Conversar/ }).click();
    await expect(page).toHaveURL(/[?&]view=inbox/);
    await expect(page.getByRole('heading', { level: 3, name })).toBeVisible({ timeout: 15_000 });
  });
});
