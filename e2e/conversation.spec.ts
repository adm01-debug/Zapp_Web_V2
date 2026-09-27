import { test, expect } from '@playwright/test';
import {
  E2E_FIXTURE_CONTACT_DISPLAY_NAME,
  ensureFixtureConversationOpen,
} from './fixtures/e2e-contact';

// beforeEach navega para "/" (raiz) e clica no chip "Todas" ANTES de reabrir
// o fixture: 1) ensureFixtureConversationOpen le o token via page.evaluate ->
// window.localStorage, que lanca SecurityError numa pagina ainda em
// about:blank (origem opaca) — por isso a navegacao vem primeiro; 2) o chip
// padrao ("Em atendimento") depende do feature flag inbox.status-fsm e de
// assigned_to bater com o profile logado, enquanto "Todas" nao filtra por
// isso — mais determinístico para o teste.
//
// IMPORTANTE: a rota e "/", nunca "/inbox" — confirmado lendo
// src/routes/AppRoutes.tsx (so existe a raiz + rotas nomeadas, sem /inbox;
// catch-all "*" cai no NotFound) e src/pages/Index.tsx
// (useNavigationHistory('inbox') e estado interno da SPA, nao rota de URL).
// Reproduzido ao vivo com magiclink real: "/inbox" devolve 404.
//
// O reload() depois do PATCH fica por robustez, nao por causa comprovada:
// ensureFixtureConversationOpen reabre a conversa direto via REST, e sem
// reload a pagina so saberia do novo status via realtime (canal
// 'global-contacts-realtime'), cuja inscricao pode ainda nao estar pronta
// quando o PATCH commita. A run 36257595651 (workflow_dispatch, pos PR
// #869) foi citada aqui antes como prova desse mecanismo — mas essa run
// teve conclusion=failure, e o teste que ela quebrou tinha causa raiz
// diferente e ja identificada (ver comentario abaixo: truncamento do nome
// exibido, PR #816). O reload() nunca foi isolado como a correcao real da
// falha; mantido por forcar um fetch inicial fresco e nao ter custo
// perceptivel no teste.
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
    await page.goto('/');
    await ensureFixtureConversationOpen(page);
    await page.reload();
    await page.getByTestId('status-chip-all').click();
  });

  test('resolving conversation via CloseConversationDialog succeeds', async ({ page }) => {
    const conversation = page.locator('[data-testid="conversation-item"]').first();
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
    await page.getByRole('button', { name: /^encerrar$/i }).click();

    await expect(page.getByText(/conversa encerrada com registro/i)).toBeVisible();
  });

  test('"Todas" filter shows the seeded conversation', async ({ page }) => {
    await expect(
      page
        .locator('[data-testid="conversation-item"]')
        .filter({ hasText: E2E_FIXTURE_CONTACT_DISPLAY_NAME })
    ).toBeVisible();
  });
});
