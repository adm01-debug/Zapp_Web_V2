import { test, expect, type Page } from '@playwright/test';
import { gotoContacts, limparContatosPorTelefone } from './fixtures/contacts-page';

/**
 * Regressão do e2e/contacts-crud.spec.ts:26.
 *
 * Em 1280x720 (viewport do runner do CI — faixa de laptop 1366x768) o botão de
 * rodapé do modal de contato ficava FORA da viewport e o clique estourava
 * "locator.click: Test timeout ... element is outside of the viewport": o Radix
 * trava o scroll do body, então um `<DialogContent>` mais alto que a viewport não
 * tinha como ser rolado. A correção é na PRIMITIVA
 * (src/components/ui/dialog.tsx: `max-h-[calc(100dvh-2rem)] overflow-y-auto` na
 * string base do cva) — vale para os 115 arquivos que usam DialogContent.
 *
 * Roda no projeto "chromium-authenticated": depende de E2E_TEST_EMAIL/
 * E2E_TEST_PASSWORD (e2e/auth.setup.ts), portanto só é executável no CI/onde as
 * secrets existirem.
 */
const VIEWPORT = { width: 1280, height: 720 };

/** A caixa do diálogo tem de caber inteira na viewport de 720px de altura. */
async function expectDialogInsideViewport(dialog: ReturnType<Page['getByRole']>) {
  const box = await dialog.boundingBox();
  expect(box, 'o diálogo precisa estar renderizado para medir a caixa').not.toBeNull();
  expect(box!.y, 'topo do diálogo acima da viewport (conteúdo cortado)').toBeGreaterThanOrEqual(0);
  expect(
    box!.y + box!.height,
    'base do diálogo abaixo da viewport (rodapé inalcançável)',
  ).toBeLessThanOrEqual(VIEWPORT.height + 1);
}

test.describe('DialogContent — rodapé alcançável em 1280x720', () => {
  // Telefones criados nesta spec. A limpeza roda no afterEach, por telefone, com um
  // contexto de request proprio: se o teste morrer por timeout, a pagina morre junto
  // mas a limpeza continua possivel (E97). Antes, o `finally` usava `page.request` e
  // falhava em silencio, deixando contato no banco.
  const criados: string[] = [];

  test.afterEach(async ({ request }) => {
    const pendentes = criados.splice(0);
    await limparContatosPorTelefone(request, pendentes);
  });

  test('modal Adicionar Contato: diálogo cabe na viewport e o rodapé é clicável', async ({ page }) => {
    const phone = `5511${Date.now().toString().slice(-9)}`;
    criados.push(phone);
    const name = `[E2E] RODAPE ADD ${phone.slice(-6)}`;
    {
      await page.setViewportSize(VIEWPORT);
      await gotoContacts(page);

      await page.getByRole('button', { name: 'Novo contato' }).click();
      const addDialog = page.getByRole('dialog', { name: 'Adicionar Contato' });
      await expect(addDialog).toBeVisible();

      await expectDialogInsideViewport(addDialog);

      const submit = addDialog.getByRole('button', { name: 'Adicionar' });
      await submit.scrollIntoViewIfNeeded();
      await expect(submit).toBeInViewport();

      await addDialog.locator('#name').fill(name);
      await addDialog.locator('#phone').fill(phone);
      // Era exatamente este clique que estourava no CI; sem a correção o
      // Playwright não consegue nem rolar o botão para dentro da viewport.
      await submit.click({ timeout: 10_000 });
      await expect(addDialog).toBeHidden({ timeout: 15_000 });
    }
  });

  test('modal Editar Contato: diálogo cabe na viewport e o rodapé é clicável', async ({ page }) => {
    const phone = `5512${Date.now().toString().slice(-9)}`;
    criados.push(phone);
    const name = `[E2E] RODAPE EDIT ${phone.slice(-6)}`;
    {
      await page.setViewportSize(VIEWPORT);
      await gotoContacts(page);

      // Cria via UI para ter um contato real e abrir o modal de edição.
      await page.getByRole('button', { name: 'Novo contato' }).click();
      const addDialog = page.getByRole('dialog', { name: 'Adicionar Contato' });
      await addDialog.locator('#name').fill(name);
      await addDialog.locator('#phone').fill(phone);
      await addDialog.getByRole('button', { name: 'Adicionar' }).click();
      await expect(addDialog).toBeHidden({ timeout: 15_000 });
      await page.keyboard.press('Escape');

      const search = page.getByPlaceholder(/Buscar por nome, telefone/);
      await search.fill(phone.slice(-9));
      const row = page.getByTestId('contact-card').filter({ hasText: name });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.hover();
      await row.locator('button[aria-haspopup="menu"]').click();
      await page.getByRole('menuitem', { name: /Editar/ }).click();

      const editDialog = page.getByRole('dialog', { name: 'Editar Contato' });
      await expect(editDialog).toBeVisible();
      await expectDialogInsideViewport(editDialog);

      const save = editDialog.getByRole('button', { name: 'Salvar' });
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
      await save.click({ timeout: 10_000 });
      await expect(editDialog).toBeHidden({ timeout: 15_000 });
    }
  });
});
