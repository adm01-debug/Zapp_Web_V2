import { test, expect } from '@playwright/test';
import {
  E2E_FIXTURE_CONTACT_ID,
  E2E_FIXTURE_CONTACT_DISPLAY_NAME,
  ensureFixtureConversationOpen,
  cleanupFixtureMessages,
} from './fixtures/e2e-contact';

const CRM_ROUTE = '**/functions/v1/crm-integration';
const FLAGS_ROUTE = '**/rest/v1/feature_flags*';

const fullSidebar = {
  found: true,
  contact_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  professional: {
    whatsapp: { numero_e164: '+5511988776655', numero: '(11) 98877-6655', phone_type: 'celular_corporativo' },
    email_corporativo: { email: 'e2e.sidebar@example.com', is_verified: true },
    empresa: { id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff', nome: 'Empresa E2E', logo_url: null },
    departamento: 'Comercial',
    cargo: 'Diretor',
  },
  personal: { social: [], data_nascimento: null },
  singu_profile: {
    disc: { primary: 'C', blend: null, confidence: 95, notes: null },
    vak: null, big_five: null, mbti: null, enneagram: null, temperament: null,
    metaprograms: {
      toward: 80, away_from: 20, internal: 70, external: 30,
      options: null, procedures: null, proactive: null, reactive: null,
      global: null, detail: null, notes: 'Fixture determinística do E2E',
    },
    fears_motivation: null, decision: null, budget: null, influencers: [],
    rapport: null, objection_scripts: [], assessed_at: '2026-10-03T12:00:00Z',
  },
};

async function installSidebarMocks(page: import('@playwright/test').Page, sidebarData: unknown = fullSidebar) {
  await page.route(FLAGS_ROUTE, async (route) => {
    const response = await route.fetch();
    const flags = await response.json() as Array<Record<string, unknown>>;
    const next = flags.filter((flag) => flag.key !== 'crm.integration');
    next.push({ key: 'crm.integration', enabled: true, description: 'E2E', updated_at: '2026-10-03T12:00:00Z' });
    await route.fulfill({ response, json: next });
  });
  await page.route(CRM_ROUTE, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown> | null;
    if (body?.action !== 'contactLookup' || body?.lookup !== 'sidebar' || body?.contactId !== E2E_FIXTURE_CONTACT_ID) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: sidebarData, meta: { record_count: 1, duration_ms: 4, severity: 'ok' } }),
    });
  });
}

async function openContactPanel(page: import('@playwright/test').Page) {
  await page.getByTestId('status-chip-all').click();
  await page.getByTestId('conversation-item').filter({ hasText: E2E_FIXTURE_CONTACT_DISPLAY_NAME }).first().click();
  await page.getByRole('button', { name: 'Detalhes do contato' }).first().click();
  await expect(page.getByTestId('contact-panel')).toBeVisible();
}

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
    await installSidebarMocks(page);
    await page.goto('/');
    await ensureFixtureConversationOpen(page);
    await page.reload();
    await openContactPanel(page);
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

  test('WhatsApp é texto simples: sem copiar e sem link para o wa.me', async ({ page }) => {
    const panel = page.getByTestId('contact-panel');
    const linha = panel.getByTestId('sidebar-row-whatsapp');
    await expect(linha).toBeVisible();
    await expect(linha.getByRole('button', { name: 'Copiar WhatsApp' })).toHaveCount(0);
    await expect(linha.locator('a[href^="https://wa.me"]')).toHaveCount(0);
    // Número inteiro na linha: nada de reticências.
    await expect(linha).not.toContainText('…');
  });

  test('Perfil Singu mostra seis métricas honestas quando ainda não há avaliação', async ({ page }) => {
    await page.unroute(CRM_ROUTE);
    await page.route(CRM_ROUTE, async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown> | null;
      if (body?.action !== 'contactLookup' || body?.lookup !== 'sidebar') return route.continue();
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { ...fullSidebar, singu_profile: null }, meta: { record_count: 1, duration_ms: 4, severity: 'ok' } }),
      });
    });
    await page.reload();
    await openContactPanel(page);
    const singu = page.getByTestId('contact-panel').getByTestId('sidebar-section-singu');
    await expect(singu.getByText('Não avaliado')).toHaveCount(6);
    await expect(singu.getByText('Sem avaliação no Singu')).toHaveCount(1);
  });

  test('Sheet de Metaprogramas abre e Esc fecha sem fechar o painel', async ({ page, browserName }) => {
    // Portal Radix + Esc em Firefox/WebKit reproduz o problema já conhecido
    // de conversation.spec.ts (:58-62) — cobertura em Chromium.
    test.skip(browserName !== 'chromium',
      'Radix portal + Esc coberto em Chromium (mesmo padrão de conversation.spec.ts)');

    const metaprogramas = page.getByTestId('singu-row-metaprograms');
    await expect(metaprogramas).toBeEnabled();
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
