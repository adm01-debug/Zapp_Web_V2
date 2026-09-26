import { test, expect } from '@playwright/test';
import { E2E_FIXTURE_CONTACT_NAME, ensureFixtureConversationOpen } from './fixtures/e2e-contact';

// beforeEach navega para /inbox e clica no chip "Todas" ANTES de reabrir o
// fixture: 1) ensureFixtureConversationOpen le o token via page.evaluate ->
// window.localStorage, que lanca SecurityError numa pagina ainda em
// about:blank (origem opaca) — por isso a navegacao vem primeiro; 2) o chip
// padrao ("Em atendimento") depende do feature flag inbox.status-fsm e de
// assigned_to bater com o profile logado, enquanto "Todas" nao filtra por
// isso — mais determinístico para o teste.
test.describe('Conversation state transitions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/inbox');
    await ensureFixtureConversationOpen(page);
    await page.getByTestId('status-chip-all').click();
  });

  test('resolving conversation via CloseConversationDialog succeeds', async ({ page }) => {
    const conversation = page.locator('[data-testid="conversation-item"]').first();
    await conversation.click();

    await page.getByRole('button', { name: /mais ações/i }).click();
    await page.getByRole('menuitem', { name: /marcar como resolvido/i }).click();

    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /^resolvido$/i }).click();
    await page.getByRole('button', { name: /^encerrar$/i }).click();

    await expect(page.getByText(/conversa encerrada com registro/i)).toBeVisible();
  });

  test('"Todas" filter shows the seeded conversation', async ({ page }) => {
    await expect(
      page.locator('[data-testid="conversation-item"]').filter({ hasText: E2E_FIXTURE_CONTACT_NAME })
    ).toBeVisible();
  });
});
