import { test, expect } from '@playwright/test';
import {
  E2E_FIXTURE_CONTACT_DISPLAY_NAME,
  ensureFixtureConversationOpen,
  cleanupFixtureMessages,
} from './fixtures/e2e-contact';

// e2e/inbox-contact-sidebar.spec.ts — etapa 90 do plano
// `docs/design/PLANO_SIDEBAR_CONTATO_3_SECOES_100_ETAPAS_2026-10-02.md`.
// Cobre o novo painel de 3 seções no contexto real do app (projeto
// "chromium-authenticated" do e2e-logado.yml — cai nele automaticamente por
// não constar em testIgnore).
//
// Dependência de flag: `crm.integration` fica DESLIGADA até a Fase 9 do plano
// (D1). Com ela off as seções Pessoal/Perfil Singu renderizam o estado
// `disabled` ("Integração com o Singu desligada") e a Profissional o fallback
// local — todos estados honestos previstos pelo plano. As asserções toleram
// `disabled` ou `not_found` para o teste continuar verde quando a flag ligar;
// o teste do Sheet de detalhe é skipado (com motivo) enquanto a linha
// Metaprogramas estiver desabilitada — vira verde sozinho na Fase 9 se o
// contato `[E2E]` ganhar avaliação no Singu.

test.describe('Sidebar "Detalhes do Contato" — 3 seções', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ensureFixtureConversationOpen(page);
    await page.reload();
    await page.getByTestId('status-chip-all').click();
    await page.getByTestId('conversation-item').filter({ hasText: E2E_FIXTURE_CONTACT_DISPLAY_NAME }).first().click();
    // Abre o painel pelo botão "Detalhes do contato" do header do chat.
    await page.getByRole('button', { name: 'Detalhes do contato' }).first().click();
    await expect(page.getByTestId('contact-panel')).toBeVisible();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await context.newPage();
    await page.goto('/');
    await cleanupFixtureMessages(page);
    await context.close();
  });

  test('renderiza exatamente as 3 seções do plano', async ({ page }) => {
    const panel = page.getByTestId('contact-panel');
    await expect(panel.getByTestId('sidebar-section-professional')).toBeVisible();
    await expect(panel.getByTestId('sidebar-section-personal')).toBeVisible();
    await expect(panel.getByTestId('sidebar-section-singu')).toBeVisible();
    // Título/subtítulo do mock em cada seção.
    await expect(panel.getByText('Dados Profissionais')).toBeVisible();
    await expect(panel.getByText('Dados Pessoais')).toBeVisible();
    await expect(panel.getByText('Perfil Singu')).toBeVisible();
    // Nenhuma seção do accordion antigo sobrou (rótulos de
    // contactDetailSections.ts removidos na etapa 86).
    for (const velho of ['CRM 360°', 'Notas Privadas', 'Linha do Tempo', 'Scoring & LGPD']) {
      await expect(panel.getByText(velho)).toHaveCount(0);
    }
  });

  test('copiar WhatsApp chama o clipboard com +E164', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const panel = page.getByTestId('contact-panel');
    const copiar = panel.getByRole('button', { name: 'Copiar WhatsApp' });
    // Fallback local: o contato [E2E] tem telefone, então a linha existe
    // mesmo com a flag desligada.
    await expect(copiar).toBeVisible();
    await copiar.click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^\+\d{10,15}$/);
  });

  test('Perfil Singu mostra estado honesto para contato sem vínculo/avaliação', async ({ page }) => {
    const singu = page.getByTestId('contact-panel').getByTestId('sidebar-section-singu');
    // Flag off → "Integração com o Singu desligada"; flag on + contato [E2E]
    // inexistente no Singu → "Contato não vinculado ao Singu"; vinculado sem
    // avaliação → "Sem avaliação no Singu". Nunca inventa perfil.
    await expect(
      singu.getByText(/Integração com o Singu desligada|Contato não vinculado ao Singu|Sem avaliação no Singu/),
    ).toBeVisible();
  });

  test('Sheet de Metaprogramas abre e Esc fecha sem fechar o painel', async ({ page, browserName }) => {
    // Portal Radix + Esc em Firefox/WebKit reproduz o problema já conhecido
    // de conversation.spec.ts (:58-62) — cobertura em Chromium.
    test.skip(browserName !== 'chromium',
      'Radix portal + Esc coberto em Chromium (mesmo padrão de conversation.spec.ts)');

    const metaprogramas = page.getByTestId('singu-row-metaprograms');
    // A linha só fica habilitada quando a RPC devolve metaprograms para o
    // contato — o [E2E] não tem avaliação no Singu até a Fase 9. Skip com
    // motivo honesto em vez de assert falso.
    const habilitada = await metaprogramas.isVisible().catch(() => false)
      && await metaprogramas.isEnabled().catch(() => false);
    test.skip(!habilitada,
      'Linha Metaprogramas desabilitada — sem perfil Singu neste contato ' +
      '(flag crm.integration desligada até a Fase 9 ou contato sem avaliação)');

    await metaprogramas.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Metaprogramas')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    // Esc fechou o Sheet mas o painel continua aberto (handler do
    // ContactDetails ignora eventos com defaultPrevented).
    await expect(page.getByTestId('contact-panel')).toBeVisible();
  });
});
