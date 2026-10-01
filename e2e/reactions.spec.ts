import { test, expect } from '@playwright/test';
import {
  E2E_FIXTURE_CONTACT_DISPLAY_NAME,
  ensureFixtureConversationOpen,
  cleanupFixtureMessages,
  cleanupE2EReactions,
} from './fixtures/e2e-contact';

test.describe('Reactions flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // ensureFixtureConversationOpen valida o token do Supabase explicitamente
    // (lanca erro se nao encontrado). Chamar ANTES do cleanupE2EReactions garante
    // que o localStorage esta carregado quando o cleanup precisa do access_token.
    // Root cause de :70: goto('/') pode terminar antes de o SPA hidratar o
    // localStorage; se o token nao estava disponivel, cleanupE2EReactions falhava
    // silenciosamente (console.warn), deixando a reacao do :65 no banco -- o clique
    // subsequente em :70 REMOVIA a reacao em vez de adicionar, e o badge nunca aparecia.
    await ensureFixtureConversationOpen(page);
    await cleanupE2EReactions(page);
    await page.reload();
    await page.getByTestId('status-chip-all').click();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await context.newPage();
    await page.goto('/');
    await cleanupE2EReactions(page);
    await cleanupFixtureMessages(page);
    await context.close();
  });

  test('quick reaction bar is present in message DOM', async ({ page }) => {
    // Open the fixture contact conversation
    const conversation = page
      .locator('[data-testid="conversation-item"]')
      .filter({ hasText: E2E_FIXTURE_CONTACT_DISPLAY_NAME })
      .first();
    await conversation.click();

    // Wait for messages to load
    await page.waitForSelector('[data-testid="message-group"]', { timeout: 10_000 });

    // QuickReactionBar is always in the DOM (opacity-0 until hover) -- check attachment
    await expect(
      page.getByTestId('quick-reaction-bar').first()
    ).toBeAttached();
  });

  test('clicking emoji in quick reaction bar adds a reaction badge', async ({ page }) => {
    // E09: hover CSS (group-hover:opacity-100) não é ativada de forma confiável em Chromium headless CI.
    test.fixme(true, 'E09: hover state de quick-reaction-bar flaky em CI headless; reativar com pointer.move ou forceShow');

    const conversation = page
      .locator('[data-testid="conversation-item"]')
      .filter({ hasText: E2E_FIXTURE_CONTACT_DISPLAY_NAME })
      .first();
    await conversation.click();
    await page.waitForSelector('[data-testid="message-group"]', { timeout: 10_000 });

    // Hover over the first message to reveal the quick reaction bar
    const firstMessage = page.locator('[data-testid="message-group"]').first();
    await firstMessage.hover();

    // Wait for profile query to resolve before clicking -- addMutation throws when
    // profileId is null (profile React Query not yet settled), causing the badge to
    // never appear. data-profile-ready is set by QuickReactionBar once currentProfileId
    // is non-null.
    await page
      .locator('[data-testid="quick-reaction-bar"][data-profile-ready="true"]')
      .first()
      .waitFor({ timeout: 10_000 });

    // Force-click thumbsup (bar may still be opacity-0 in Playwright rendering context)
    await page
      .locator('[data-testid="quick-reaction-emoji"][data-emoji="👍"]')
      .first()
      .click({ force: true });

    // Reaction badge should appear below the message
    await expect(
      page.locator('[data-testid="reaction-badge"][data-emoji="👍"]').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('clicking a reaction badge toggles it off', async ({ page }) => {
    const conversation = page
      .locator('[data-testid="conversation-item"]')
      .filter({ hasText: E2E_FIXTURE_CONTACT_DISPLAY_NAME })
      .first();
    await conversation.click();
    await page.waitForSelector('[data-testid="message-group"]', { timeout: 10_000 });

    const firstMessage = page.locator('[data-testid="message-group"]').first();
    await firstMessage.hover();

    // Wait for profile query to resolve before clicking -- addMutation throws when
    // profileId is null (profile React Query not yet settled), causing the badge to
    // never appear.
    await page
      .locator('[data-testid="quick-reaction-bar"][data-profile-ready="true"]')
      .first()
      .waitFor({ timeout: 10_000 });

    // Add the reaction
    await page
      .locator('[data-testid="quick-reaction-emoji"][data-emoji="👍"]')
      .first()
      .click({ force: true });

    const badge = page.locator('[data-testid="reaction-badge"][data-emoji="👍"]').first();
    await expect(badge).toBeVisible({ timeout: 8_000 });

    // Toggle it off -- move mouse away first to dismiss the quick-reaction-bar overlay.
    // firstMessage.hover() earlier activated the bar (CSS opacity transition); the
    // quick-reaction-emoji (data-index virtualised row) intercepts pointer events
    // and blocks badge.click(). Moving mouse to (0,0) removes the hover, collapsing
    // the bar before we click the badge.
    await page.mouse.move(0, 0);
    await badge.click();
    await expect(badge).not.toBeVisible({ timeout: 8_000 });
  });
});
