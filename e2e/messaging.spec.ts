import { test, expect } from '@playwright/test';

// The auth fixture (e2e/auth.setup.ts, via the "setup" -> "chromium-authenticated" dependsOn)
// now provides a logged-in session, but both tests below still need at least
// one real conversation already seeded in the inbox — there is no seeded test
// data in this environment yet, so they stay skipped rather than inventing a
// fake fixture.
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
