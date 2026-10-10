import { test, expect } from '@playwright/test';
import {
  E2E_FIXTURE_CONTACT_DISPLAY_NAME,
  ensureFixtureConversationOpen,
  cleanupFixtureMessages,
  cleanupE2EReactions,
  ensureReactionAbsent,
} from './fixtures/e2e-contact';
import { dispensarOnboarding } from './fixtures/onboarding';

test.describe('Reactions flow', () => {
  // Orcamento explicito (o padrao do projeto e 30 s): este fluxo e multi-etapa --
  // no beforeEach vai goto + onboarding + fixture + cleanup + reload, e no corpo
  // hover, espera da barra, normalizacao do estado e duas assercoes de 8 s. Com o
  // teto global de 30 s o teste estourava por TEMPO em execucao lenta (repeat2
  // medido em 03/10/2026), nao por ausencia de reacao: se a reacao nao aparecer,
  // o toBeVisible de 8 s continua falhando normalmente.
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dispensarOnboarding(page);
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
    const conversation = page
      .locator('[data-testid="conversation-item"]')
      .filter({ hasText: E2E_FIXTURE_CONTACT_DISPLAY_NAME })
      .first();
    await conversation.click();
    await page.waitForSelector('[data-testid="message-group"]', { timeout: 10_000 });

    // Alvo ESTAVEL (causa raiz do vermelho do workflow e2e-logado): a lista de
    // mensagens e virtualizada e o PRIMEIRO `message-group` fica ACIMA da viewport
    // (medido: y=-547 numa viewport de 720). O hover nao se sustenta ali -- a lista
    // reancora na mensagem mais nova -- entao a barra de reacao fica `opacity: 0` e
    // o clique com `force` cai em coordenadas vazias (elementFromPoint = null):
    // nenhuma mutacao e disparada, nada e inserido em message_reactions e o badge
    // nunca aparece (so o DELETE do cleanup aparece na rede). O ULTIMO grupo esta em
    // tela; escopar barra/emoji/badge a ele e esperar a barra ativa (opacity 1)
    // torna o teste deterministico em vez de depender do instante do auto-scroll.
    const message = page.locator('[data-testid="message-group"]').last();
    await message.scrollIntoViewIfNeeded();
    await message.hover();

    // data-profile-ready e setado pela QuickReactionBar quando currentProfileId
    // deixa de ser nulo (addMutation lanca com profileId nulo).
    const bar = message.locator('[data-testid="quick-reaction-bar"][data-profile-ready="true"]');
    await bar.waitFor({ timeout: 10_000 });
    await expect(bar).toHaveCSS('opacity', '1', { timeout: 5_000 });

    // Normaliza o estado pela UI ANTES de clicar: se uma reacao de run anterior
    // sobreviveu na mensagem alvo, o clique abaixo REMOVERIA em vez de adicionar
    // (root cause medido das falhas :53/:88). O cleanup por API nao garante isso:
    // depende de RLS e de o profile do caller estar certo.
    await ensureReactionAbsent(page, message, '👍');
    await message.hover();
    // 3 s basta: a barra ja foi confirmada acima com opacity 1; este waitFor so
    // reconfirma que ela voltou depois de o mouse sair e voltar. Os 10 s de antes
    // somavam ao orcamento do teste sem necessidade.
    await bar.waitFor({ timeout: 3_000 });

    await message.locator('[data-testid="quick-reaction-emoji"][data-emoji="👍"]').click();

    // Reaction badge should appear below the message
    await expect(
      message.locator('[data-testid="reaction-badge"][data-emoji="👍"]')
    ).toBeVisible({ timeout: 8_000 });
  });

  test('clicking a reaction badge toggles it off', async ({ page }) => {
    const conversation = page
      .locator('[data-testid="conversation-item"]')
      .filter({ hasText: E2E_FIXTURE_CONTACT_DISPLAY_NAME })
      .first();
    await conversation.click();
    await page.waitForSelector('[data-testid="message-group"]', { timeout: 10_000 });

    // Mesmo alvo estavel do teste anterior: a lista e virtualizada e o primeiro
    // `message-group` fica acima da viewport (hover nao se sustenta la).
    const message = page.locator('[data-testid="message-group"]').last();
    await message.scrollIntoViewIfNeeded();
    await message.hover();

    const bar = message.locator('[data-testid="quick-reaction-bar"][data-profile-ready="true"]');
    await bar.waitFor({ timeout: 10_000 });
    await expect(bar).toHaveCSS('opacity', '1', { timeout: 5_000 });

    // Normaliza o estado pela UI antes de 'adicionar' (mesmo motivo do teste acima:
    // reacao sobrevivente de run anterior faz o clique remover em vez de adicionar).
    await ensureReactionAbsent(page, message, '👍');
    await message.hover();
    // 3 s basta: a barra ja foi confirmada acima com opacity 1; este waitFor so
    // reconfirma que ela voltou depois de o mouse sair e voltar. Os 10 s de antes
    // somavam ao orcamento do teste sem necessidade.
    await bar.waitFor({ timeout: 3_000 });

    // Add the reaction
    await message.locator('[data-testid="quick-reaction-emoji"][data-emoji="👍"]').click();

    const badge = message.locator('[data-testid="reaction-badge"][data-emoji="👍"]');
    await expect(badge).toBeVisible({ timeout: 8_000 });

    // Toggle it off -- move mouse away first to dismiss the quick-reaction-bar overlay
    // (com o hover ativo a barra fica por cima do badge e intercepta o clique).
    await page.mouse.move(0, 0);
    await badge.click();
    await expect(badge).not.toBeVisible({ timeout: 8_000 });
  });
});
