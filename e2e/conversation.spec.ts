import { test, expect } from '@playwright/test';
import { E2E_FIXTURE_CONTACT_NAME, ensureFixtureConversationOpen } from './fixtures/e2e-contact';

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
// O reload() depois do PATCH e obrigatorio: ensureFixtureConversationOpen
// reabre a conversa direto via REST (bypassa qualquer estado otimista da
// UI), entao a unica forma da pagina saber que o status mudou e via
// realtime (canal 'global-contacts-realtime'). Confirmado na run 36257595651
// (pos PR #869, apos o combobox ser corrigido): o teste 'resolving
// conversation' passou a COMPLETAR o close_conversation_atomic de verdade
// pela primeira vez, deixando o contato 'resolved' no banco antes do fetch
// inicial do teste seguinte carregar a pagina — se o canal realtime ainda
// nao tiver se inscrito quando o PATCH de reabertura commita, o evento
// nunca chega e a conversa nunca aparece sob "Todas", nao importa quanto se
// espere (15000ms de timeout no assert nao resolveu). O reload forca um
// fetch inicial novo que le o status certo direto do banco, sem depender de
// realtime.
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

    await page.getByRole('button', { name: /mais ações/i }).click();
    await page.getByRole('menuitem', { name: /marcar como resolvido/i }).click();

    // CloseConversationDialog tem 3 comboboxes (Motivo do encerramento,
    // Resultado, Classificação) — getByRole('combobox') sozinho é ambíguo
    // (strict mode violation, confirmado nas runs 36255009332 e 36256161950
    // do e2e-logado.yml). A opção "Resolvido" pertence à lista CLOSE_REASONS
    // do combobox "Motivo do encerramento" (placeholder "Selecione o
    // motivo"), não à de Resultado — é o único campo obrigatório (label com
    // "*") que também habilita o botão "Encerrar".
    await page.getByRole('combobox').filter({ hasText: /selecione o motivo/i }).click();
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
