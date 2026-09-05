import { test, expect } from '@playwright/test';

// Requires authenticated session — stubs skipped until auth fixture is set up.
test.describe('Conversation state transitions', () => {
  test.skip('resolving conversation changes status badge', async ({ page }) => {
    await page.goto('/inbox');
    const conversation = page.locator('[data-testid="conversation-item"]').first();
    await conversation.click();
    const resolveButton = page.getByRole('button', { name: /resolver|resolve/i });
    await resolveButton.click();
    const confirmButton = page.getByRole('button', { name: /confirmar|confirm/i });
    if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmButton.click();
    }
    await expect(page.getByText(/resolvida|resolved/i)).toBeVisible();
  });

  test.skip('conversation list filters by status', async ({ page }) => {
    await page.goto('/inbox');
    const filter = page.getByRole('button', { name: /aberto|open/i });
    await filter.click();
    const conversations = page.locator('[data-testid="conversation-item"]');
    await expect(conversations.first()).toBeVisible();
  });
});
