import { test, expect } from '@playwright/test';
import { E2E_FIXTURE_CONTACT_NAME, ensureFixtureConversationOpen } from './fixtures/e2e-contact';

// A fixture de auth (e2e/auth.setup.ts) loga o usuário de teste, que enxerga
// exatamente um contato no inbox: o fixo "[E2E] Contato de teste - nao apagar"
// (e2e/fixtures/e2e-contact.ts). O fluxo de "resolver" real é
// ChatPanelHeader ("Mais ações" -> "Marcar como resolvido") -> CloseConversationDialog
// (exige selecionar um motivo) -> RPC close_conversation_atomic. Confirmado lendo
// src/components/inbox/chat/ChatPanelHeader.tsx e src/components/inbox/CloseConversationDialog.tsx.
test.describe('Conversation state transitions', () => {
  test.beforeEach(async ({ page }) => {
    // Garante open antes de cada teste: se uma run anterior resolveu a
    // conversa, o teste de resolução precisa dela aberta para repetir o fluxo.
    await ensureFixtureConversationOpen(page);
  });

  test('resolving conversation via CloseConversationDialog succeeds', async ({ page }) => {
    await page.goto('/inbox');
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
    await page.goto('/inbox');
    await page.getByTestId('status-chip-all').click();
    await expect(
      page.locator('[data-testid="conversation-item"]').filter({ hasText: E2E_FIXTURE_CONTACT_NAME })
    ).toBeVisible();
  });
});
