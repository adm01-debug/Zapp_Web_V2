import { test, expect } from '@playwright/test';
import { gotoContacts, liveContactsByPhone, softDeleteContact } from './fixtures/contacts-page';

// Plano de Contatos, etapa 87: fixture própria com prefixo [E2E], criada e
// excluída pela UI. O afterEach limpa pela RPC caso algum passo falhe no meio.
test.describe('Contatos — criar, editar e excluir', () => {
  const stamp = Date.now().toString().slice(-9);
  const phone = `5511${stamp}`;
  const name = `[E2E] CRUD ${stamp}`;
  const edited = `${name} editado`;

  test.afterEach(async ({ page }) => {
    for (const row of await liveContactsByPhone(page, phone).catch(() => [])) {
      await softDeleteContact(page, row.id).catch(() => undefined);
    }
  });

  test('ciclo completo some da lista e do banco', async ({ page }) => {
    await gotoContacts(page);
    const search = page.getByPlaceholder(/Buscar por nome, telefone/);

    await page.getByRole('button', { name: 'Novo contato' }).click();
    const addDialog = page.getByRole('dialog', { name: 'Adicionar Contato' });
    await addDialog.locator('#name').fill(name);
    await addDialog.locator('#phone').fill(phone);
    await addDialog.getByRole('button', { name: 'Adicionar' }).click();
    await expect(addDialog).toBeHidden({ timeout: 15_000 });
    await page.keyboard.press('Escape');

    await expect.poll(async () => (await liveContactsByPhone(page, phone)).length).toBe(1);

    await search.fill(stamp);
    const row = page.getByTestId('contact-card').filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.hover();
    await row.locator('button[aria-haspopup="menu"]').click();
    await page.getByRole('menuitem', { name: /Editar/ }).click();
    const editDialog = page.getByRole('dialog', { name: 'Editar Contato' });
    await editDialog.locator('#name').fill(edited);
    await editDialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(editDialog).toBeHidden({ timeout: 15_000 });
    await expect.poll(async () => (await liveContactsByPhone(page, phone))[0]?.name).toBe(edited);

    const editedRow = page.getByTestId('contact-card').filter({ hasText: edited });
    await editedRow.hover();
    await editedRow.locator('button[aria-haspopup="menu"]').click();
    await page.getByRole('menuitem', { name: /Excluir/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /Excluir/ }).click();

    await expect(editedRow).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(async () => (await liveContactsByPhone(page, phone)).length).toBe(0);
  });
});
