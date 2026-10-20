import { test, expect } from '@playwright/test';

// Seletores confirmados lendo src/components/inbox/chat/ChatInputArea.tsx: o
// textarea nao tem data-testid, o aria-label default (sem edicao/resposta em
// andamento) e "Digite sua mensagem"; o botao de anexo de imagem tem aria-label
// "Enviar imagem" (nao existe um botao generico "anexar"). Enter sem Shift
// envia (useChatPanelHandlers.ts: handleKeyDown), confirmado pelo tooltip
// "Enviar (Enter)" no proprio botao de enviar.
//
// beforeEach clica no chip "Todas" antes de cada teste -- o chip padrao ("Em
// atendimento") depende do feature flag inbox.status-fsm e de assigned_to
// bater com o profile logado; "Todas" nao filtra por isso, entao e o caminho
// deterministico para garantir que o contato fixo apareca.
//
// IMPORTANTE: a rota e "/", nunca "/inbox" -- confirmado lendo
// src/routes/AppRoutes.tsx (so existe a raiz + rotas nomeadas, sem /inbox;
// catch-all "*" cai no NotFound) e src/pages/Index.tsx
// (useNavigationHistory('inbox') e estado interno da SPA, nao rota de URL).
// Reproduzido ao vivo com magiclink real: "/inbox" devolve 404.
//
// messaging.spec.ts:35 -- usa getByRole('log', { name: 'Mensagens da conversa' })
// para escopar o seletor a area de mensagens abertas. Sem escopo, getByText(text)
// resolvia 2 elementos: (1) preview na lista de conversas e (2) corpo da mensagem
// na conversa aberta -- causando strict mode violation.
test.describe('Messaging flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('status-chip-all').click();
  });

  test('send text message appears in conversation', async ({ page }) => {
    const conversation = page.locator('[data-testid="conversation-item"]').first();
    await conversation.click();

    const input = page.getByRole('textbox', { name: /digite sua mensagem/i });
    const text = `Mensagem de teste E2E ${Date.now()}`;
    await input.fill(text);
    await page.keyboard.press('Enter');

    // Escopo para a area de mensagens da conversa aberta (role=log aria-label="Mensagens da conversa").
    // Sem escopo, getByText(text) encontra 2 elementos: o preview na lista de conversas
    // e o corpo da mensagem -- causando strict mode violation.
    //
    // O envio e ASSINCRONO: a UI chama rpc/enqueue_outbound_message (HTTP 200, medido no
    // trace do Playwright) e o worker da fila grava a linha em messages depois. Latencia
    // medida nesta fixture (02/10/2026, 6 envios): 2,8 s a 8,5 s -- acima do timeout
    // padrao de 5 s do expect, o que fazia o teste falhar em ~metade das execucoes
    // (3 falhas em 6 no webkit-conversation, o mesmo projeto vermelho no CI).
    // 20 s cobre a cauda observada sem esconder fila travada.
    await expect(
      page.getByRole('log', { name: 'Mensagens da conversa' }).getByText(text)
    ).toBeVisible({ timeout: 20_000 });
  });

  test('image attachment button is enabled', async ({ page }) => {
    const conversation = page.locator('[data-testid="conversation-item"]').first();
    await conversation.click();

    await expect(page.getByRole('button', { name: /enviar imagem/i })).toBeEnabled();
  });
});
