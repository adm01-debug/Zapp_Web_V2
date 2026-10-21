import { test, expect } from '@playwright/test';

test.describe('Auth flows', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main', { name: /acesso à plataforma/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ZAPP Web' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^entrar$/i })).toBeVisible();
  });

  test('login form validates email format', async ({ page }) => {
    await page.goto('/');
    // type="email" blocks "notanemail" before submit, so the zod message never
    // mounts. "a@b" passes the browser and fails loginSchema → "Email inválido".
    await page.getByRole('textbox', { name: /e-?mail/i }).fill('a@b');
    await page.getByRole('button', { name: /^entrar$/i }).click();
    // Playwright 1.64 não tira nome acessível do conteúdo de role=alert
    // (allowsNameFromContent). O texto existe; o name fica vazio.
    await expect(page.getByRole('alert').filter({ hasText: 'Email inválido' })).toBeVisible();
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

  test('login column has email, password and Entrar and no signup tab', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: /e-?mail/i })).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^entrar$/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /criar conta/i })).toHaveCount(0);
  });
});
