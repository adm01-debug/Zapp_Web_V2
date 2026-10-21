import { test, expect } from '@playwright/test';

test.describe('Auth flows (public, sem login real)', () => {
  test('login page renders the current access screen', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('main', { name: /acesso à plataforma/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ZAPP Web', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByLabel('Senha')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
    await expect(page.getByText(/peça ao administrador da sua equipe/i)).toBeVisible();
  });

  test('malformed email is rejected by native email validation without submitting', async ({ page }) => {
    await page.goto('/');
    const emailInput = page.getByRole('textbox', { name: 'Email' });

    await emailInput.fill('notanemail');

    // type=email prevents submit; this validates the browser constraint only and never
    // invokes the real sign-in flow or contacts an authentication service.
    expect(await emailInput.evaluate((input) => (input as HTMLInputElement).validity.typeMismatch)).toBe(true);
  });

  test('email input respects maxLength', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveAttribute('maxlength', '255');
  });

  test('password input respects maxLength', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Senha')).toHaveAttribute('maxlength', '200');
  });

  test('public signup is absent and access is administrator-managed', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /criar conta|cadastro|sign.?up/i })).toHaveCount(0);
    await expect(page.locator('#signup-email, #signup-password')).toHaveCount(0);
    await expect(page.getByText(/peça ao administrador da sua equipe/i)).toBeVisible();
  });
});
