import { test, expect } from '@playwright/test';

// Requires authenticated session — use storageState when auth fixture is set up.
// Stubs are skipped until then.
test.describe('Messaging flows', () => {
  test.skip('send text message appears in conversation', async ({ page }) => {
    await page.goto('/inbox');
    const conversation = page.locator('[data-testid="conversation-item"]').first();
    await conversation.click();
    const input = page.locator('[data-testid="message-input"]');
    await input.fill('Mensagem de teste E2E');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="message-bubble"]').last()).toContainText(
      'Mensagem de teste E2E'
    );
  });

  test.skip('media attachment button opens file picker', async ({ page }) => {
    await page.goto('/inbox');
    const conversation = page.locator('[data-testid="conversation-item"]').first();
    await conversation.click();
    const attachBtn = page.getByRole('button', { name: /anexar|attach/i });
    await expect(attachBtn).toBeEnabled();
  });
});
