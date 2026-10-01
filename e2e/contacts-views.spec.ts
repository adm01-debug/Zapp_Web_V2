import { test, expect, type Page } from '@playwright/test';
import { contactCards, gotoContacts } from './fixtures/contacts-page';

// Plano de Contatos, etapa 86.
function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    // Falha de rede/recurso não é erro do código da vista.
    if (msg.type() === 'error' && !/Failed to load resource|net::ERR_/.test(msg.text())) errors.push(msg.text());
  });
  return errors;
}

async function pickSecondaryView(page: Page, label: string) {
  await page.getByTitle('Mais visualizações').click();
  await page.getByRole('menuitem', { name: label }).click();
}

test.describe('Contatos — vistas', () => {
  test('Cards, Lista, Tabela, Pipeline, Mapa e Analytics renderizam sem erro', async ({ page }) => {
    const errors = trackPageErrors(page);
    await gotoContacts(page);

    await page.getByTitle('Cards').click();
    await expect(contactCards(page).first()).toBeVisible({ timeout: 15_000 });

    await page.getByTitle('Lista').click();
    await expect(contactCards(page)).toHaveCount(0);

    await page.getByTitle('Tabela').click();
    await expect(page.getByRole('grid', { name: 'Lista de contatos' })).toBeVisible();

    await pickSecondaryView(page, 'Pipeline');
    await expect(page.locator('[data-rfd-droppable-id]').first()).toBeVisible();

    await pickSecondaryView(page, 'Mapa');
    await expect(page.getByText('contatos mapeados')).toBeVisible();

    await pickSecondaryView(page, 'Analytics');
    await expect(page.getByRole('heading', { name: 'Analytics de Contatos' })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('3 colunas e agrupar por empresa na vista Cards', async ({ page }) => {
    await gotoContacts(page);
    await page.getByTitle('Cards').click();

    await page.getByRole('button', { name: /Colunas/ }).click();
    await page.getByRole('menuitem', { name: '3 colunas' }).click();
    await expect(contactCards(page).first()).toBeVisible();

    await page.getByRole('button', { name: /Colunas/ }).click();
    await page.getByRole('menuitem', { name: 'Por empresa' }).click();
    await expect(contactCards(page).first()).toBeVisible();
  });

  test('paginação vai para a página 2 e volta', async ({ page }) => {
    await gotoContacts(page);
    const next = page.getByRole('button', { name: 'Próxima página' });
    test.skip((await next.count()) === 0 || (await next.isDisabled()), 'menos de uma página de contatos');

    await next.click();
    await expect(page.getByText(/Página\s*2\s*de/)).toBeVisible();
    await page.getByRole('button', { name: 'Página anterior' }).click();
    await expect(page.getByText(/Página\s*1\s*de/)).toBeVisible();
  });
});
