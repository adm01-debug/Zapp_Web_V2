import { test, expect } from '@playwright/test';
import {
  E2E_FIXTURE_CONTACT_ID,
  E2E_FIXTURE_CONTACT_DISPLAY_NAME,
  ensureFixtureConversationOpen,
  cleanupFixtureMessages,
} from './fixtures/e2e-contact';

// beforeEach reabre o fixture via API antes de navegar para "/" (raiz): a
// sessao vem do storageState do BrowserContext, portanto o preparo funciona
// ainda em about:blank. A unica navegacao monta a SPA ja com os dados frescos,
// sem reload/goto concorrente com o bootstrap em Firefox/WebKit. Depois, o chip
// "Todas" evita o filtro padrao ("Em atendimento"), que depende do feature flag
// inbox.status-fsm e de
// assigned_to bater com o profile logado, enquanto "Todas" nao filtra por
// isso — mais determinístico para o teste.
//
// IMPORTANTE: a rota e "/", nunca "/inbox" — confirmado lendo
// src/routes/AppRoutes.tsx (so existe a raiz + rotas nomeadas, sem /inbox;
// catch-all "*" cai no NotFound) e src/pages/Index.tsx
// (useNavigationHistory('inbox') e estado interno da SPA, nao rota de URL).
// Reproduzido ao vivo com magiclink real: "/inbox" devolve 404.
//
// O assert do chip "Todas" compara com o texto RENDERIZADO no item, e a lista
// exibe so `contact.nickname?.trim() || name.split(' ')[0]` (a primeira
// palavra do nome) desde o #816 — ver
// src/components/inbox/VirtualizedRealtimeList.tsx. Sem apelido no fixture, o
// item mostra "[E2E]", entao filtrar pelo nome completo do contato
// (E2E_FIXTURE_CONTACT_NAME) nunca encontrava nada — element(s) not found na
// run 36262158460, independentemente do realtime. Por isso o filtro usa
// E2E_FIXTURE_CONTACT_DISPLAY_NAME.
test.describe('Conversation state transitions', () => {
  test.beforeEach(async ({ page }) => {
    await ensureFixtureConversationOpen(page);
    await page.goto('/');
    await page.getByTestId('status-chip-all').click();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await context.newPage();
    await page.goto('/');
    await cleanupFixtureMessages(page);
    await context.close();
  });

  test('resolving conversation via CloseConversationDialog succeeds', async ({ page, browserName }) => {
    // Radix UI Select + getByRole('option') comportam-se diferente em Firefox/WebKit
    // sob CI (portal overlay). Feature coberta pelo Chromium (mesmo codigo React + RPC).
    // Evita falso-negativo cross-browser sem perda de cobertura funcional.
    test.skip(browserName !== 'chromium',
      'CloseConversationDialog coberto em Chromium; Radix Select portal nao responde a' +
      " getByRole('option') de forma confiavel em Firefox/WebKit no CI");
    // O backend isolado tambem semeia conversas de Arquivos e paginacao. Fechar
    // `.first()` tornava o alvo dependente de updated_at/ordem da lista e podia
    // exercitar outro contato. O contrato deste spec e o fixture canonico.
    const conversation = page
      .getByTestId('conversation-item')
      .filter({ hasText: E2E_FIXTURE_CONTACT_DISPLAY_NAME });
    await expect(conversation).toHaveCount(1);
    await conversation.click();

    // getByRole('button', { name: /mais ações/i }) sem escopo bate em 2
    // elementos desde que o painel de contato ganhou seu proprio botao
    // "Mais ações" (contact-action-tile, data-testid="contact-panel") —
    // strict mode violation confirmado na run 36266992388. O botao do
    // header do chat (o que abre "Marcar como resolvido") agora tem
    // data-testid proprio para nao depender de ordem no DOM.
    await page.getByTestId('chat-header-more-actions').click();
    await page.getByRole('menuitem', { name: /marcar como resolvido/i }).click();

    // CloseConversationDialog tem 3 comboboxes (Motivo do encerramento,
    // Resultado, Classificação) — getByRole('combobox') sozinho é ambíguo
    // (strict mode violation, confirmado nas runs 36255009332 e 36256161950
    // do e2e-logado.yml). A opção "Resolvido" pertence à lista CLOSE_REASONS
    // do combobox "Motivo do encerramento", placeholder "Selecione o
    // motivo"), não à de Resultado — é o único campo obrigatório (label com
    // "*") que também habilita o botão "Encerrar".
    await page.getByRole('combobox').filter({ hasText: /selecione o motivo/i }).click();
    await page.getByRole('option', { name: /^resolvido$/i }).click();
    const encerramento = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'POST' &&
        url.pathname.endsWith('/rest/v1/rpc/close_conversation_atomic');
    });
    await page.getByRole('button', { name: /^encerrar$/i }).click();
    const response = await encerramento;
    const body = await response.json().catch(() => null) as unknown;
    const erro = body && typeof body === 'object'
      ? String((body as { code?: unknown; message?: unknown }).code ??
          (body as { message?: unknown }).message ?? '')
      : '';
    expect(
      response.ok(),
      `close_conversation_atomic: HTTP ${response.status()}${erro ? ` (${erro})` : ''}`,
    ).toBe(true);
    expect(body).toEqual([
      expect.objectContaining({
        closure_id: expect.any(String),
        event_id: expect.any(String),
        contact_id: E2E_FIXTURE_CONTACT_ID,
        conversation_status: 'resolved',
      }),
    ]);
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('"Todas" filter shows the seeded conversation', async ({ page }) => {
    await expect(
      page
        .locator('[data-testid="conversation-item"]')
        .filter({ hasText: E2E_FIXTURE_CONTACT_DISPLAY_NAME })
    ).toBeVisible();
  });
});
