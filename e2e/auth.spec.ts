import { test, expect } from '@playwright/test';

test.describe('Auth flows', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /entrar|login/i })).toBeVisible();
  });

  test('login form validates email format', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: /e-?mail/i }).fill('notanemail');
    await page.getByRole('button', { name: /entrar|login/i }).click();
    await expect(page.getByText(/e-?mail inv|e-?mail obr/i)).toBeVisible();
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

  test('signup tab switches to registration form', async ({ page }) => {
    await page.goto('/');
    const signupTab = page.getByRole('tab', { name: /criar conta|cadastro|sign.?up/i });
    await signupTab.click();
    await expect(page.getByRole('textbox', { name: /nome/i })).toBeVisible();
  });

  test('signup name input respects maxLength', async ({ page }) => {
    await page.goto('/');
    const signupTab = page.getByRole('tab', { name: /criar conta|cadastro|sign.?up/i });
    await signupTab.click();
    const nameInput = page.getByRole('textbox', { name: /nome/i });
    await expect(nameInput).toHaveAttribute('maxlength', '100');
  });
});
