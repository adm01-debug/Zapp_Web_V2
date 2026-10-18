import { test, expect } from '@playwright/test';

test.describe('Auth flows', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main', { name: /acesso à plataforma/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /zapp web/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^entrar$/i })).toBeVisible();
  });

  test('login email input accepts only email format', async ({ page }) => {
    await page.goto('/');
    const emailInput = page.getByRole('textbox', { name: /e-?mail/i }).first();
    await expect(emailInput).toHaveAttribute('type', 'email');
  });

  test('login email input respects maxLength', async ({ page }) => {
    await page.goto('/');
    const emailInput = page.getByRole('textbox', { name: /e-?mail/i }).first();
    await expect(emailInput).toHaveAttribute('maxlength', '255');
  });

  test('login password input respects maxLength', async ({ page }) => {
    await page.goto('/');
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toHaveAttribute('maxlength', '200');
  });

  // Registro de novo usuário ocorre por convite — a página de Auth é somente
  // login. Estes testes ficam como skip até a UI de signup ser implementada.
  test.skip('signup tab switches to registration form', async ({ page }) => {
    await page.goto('/');
    const signupTab = page.getByRole('tab', { name: /criar conta|cadastro|sign.?up/i });
    await signupTab.click();
    await expect(page.getByRole('textbox', { name: /nome/i })).toBeVisible();
  });

  test.skip('signup name input respects maxLength', async ({ page }) => {
    await page.goto('/');
    const signupTab = page.getByRole('tab', { name: /criar conta|cadastro|sign.?up/i });
    await signupTab.click();
    const nameInput = page.getByRole('textbox', { name: /nome/i });
    await expect(nameInput).toHaveAttribute('maxlength', '100');
  });
});
