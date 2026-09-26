import { test, expect } from '@playwright/test';

// Seletores confirmados lendo src/components/inbox/chat/ChatInputArea.tsx: o
// textarea não tem data-testid, o aria-label default (sem edição/resposta em
// andamento) é "Digite sua mensagem"; o botão de anexo de imagem tem aria-label
// "Enviar imagem" (não existe um botão genérico "anexar"). Enter sem Shift
// envia (useChatPanelHandlers.ts: handleKeyDown), confirmado pelo tooltip
// "Enviar (Enter)" no próprio botão de enviar.
//
// beforeEach clica no chip "Todas" antes de cada teste — o chip padrão ("Em
// atendimento") depende do feature flag inbox.status-fsm e de assigned_to
// bater com o profile logado; "Todas" não filtra por isso, então é o caminho
// determinístico para garantir que o contato fixo apareça.
test.describe('Messaging flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/inbox');
    await page.getByTestId('status-chip-all').click();
  });

  test('send text message appears in conversation', async ({ page }) => {
    const conversation = page.locator('[data-testid="conversation-item"]').first();
    await conversation.click();

    const input = page.getByRole('textbox', { name: /digite sua mensagem/i });
    const text = `Mensagem de teste E2E ${Date.now()}`;
    await input.fill(text);
    await page.keyboard.press('Enter');

    await expect(page.getByText(text)).toBeVisible();
  });

  test('image attachment button is enabled', async ({ page }) => {
    const conversation = page.locator('[data-testid="conversation-item"]').first();
    await conversation.click();

    await expect(page.getByRole('button', { name: /enviar imagem/i })).toBeEnabled();
  });
});
