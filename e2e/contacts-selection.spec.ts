import { test, expect } from '@playwright/test';
import { contactCards, gotoContacts } from './fixtures/contacts-page';

// Plano de Contatos, etapa 85. Nenhuma ação é confirmada: os diálogos abrem e fecham.
test.describe('Contatos — seleção e ações em lote', () => {
  test.beforeEach(async ({ page }) => {
    await gotoContacts(page);
    await expect(contactCards(page).first()).toBeVisible({ timeout: 15_000 });
  });

  test('selecionar todos abre a barra de ações em lote e o diálogo de tags', async ({ page }) => {
    await page.getByRole('button', { name: 'Selecionar todos os contatos' }).click();
    await expect(page.getByText(/\d+ selecionados?/).first()).toBeVisible();

    await page.getByRole('button', { name: /^Tags \(\d+\)/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('Comparar e Mesclar com dois contatos abrem sem confirmar', async ({ page }) => {
    test.skip((await contactCards(page).count()) < 2, 'usuário E2E enxerga menos de 2 contatos');

    for (const card of [contactCards(page).nth(0), contactCards(page).nth(1)]) {
      await card.hover();
      await card.getByRole('checkbox').click();
    }

    await page.getByRole('button', { name: /Comparar/ }).click();
    await expect(page.getByRole('dialog', { name: 'Comparar Contatos' })).toBeVisible();
    await page.keyboard.press('Escape');

    const merge = page.getByRole('button', { name: /Mesclar/ });
    test.skip((await merge.count()) === 0, 'Mesclar exige perfil admin/supervisor');
    await merge.click();
    await expect(page.getByRole('dialog', { name: /Mesclar Contatos/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});
