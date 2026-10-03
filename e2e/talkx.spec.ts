import { test, expect, type Page } from '@playwright/test';
import {
  cleanupE2EDraftCampaigns,
  E2E_TALKX_CONNECTION_LABEL,
  E2E_TALKX_SEGMENT_REGEX,
} from './fixtures/e2e-talkx';

// SidebarNavGroup defaults to closed (defaultOpen=false). Fresh auth storageState
// has no saved group-open state, so the group must be expanded before clicking
// any item inside "Automação & IA".
//
// The 1920×1080 viewport (configured with test.use below) renders the sidebar in
// full mode — no compact/icon layout, no pointer-event interception.
async function expandCampanhasGroup(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Menu de navegação principal' });
  const groupBtn = nav.getByRole('button', { name: /automação & ia/i }).first();
  if ((await groupBtn.getAttribute('aria-expanded')) === 'false') {
    await groupBtn.click();
  }
}

test.describe('Talk X module', () => {
  // Full-width viewport: sidebar renders in full mode (not compact/icon), eliminating
  // the pointer-event interception that required force: true at 1280×720.
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('campaigns overview renders after navigating from the sidebar', async ({ page }) => {
    await page.goto('/');
    await expandCampanhasGroup(page);
    await page
      .getByRole('navigation', { name: 'Menu de navegação principal' })
      .getByRole('button', { name: 'Campanhas', exact: true })
      .first()
      .click();

    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('data-state', 'active');
    // .first() because TalkXView and TalkXOverview both render a 'Nova campanha' button
    await expect(page.getByRole('button', { name: /nova campanha/i }).first()).toBeVisible();
  });

  test('new campaign wizard opens on the audience step', async ({ page }) => {
    await page.goto('/');
    await expandCampanhasGroup(page);
    await page
      .getByRole('navigation', { name: 'Menu de navegação principal' })
      .getByRole('button', { name: 'Campanhas', exact: true })
      .first()
      .click();

    // .first() because TalkXView and TalkXOverview both render a 'Nova campanha' button
    await page.getByRole('button', { name: /nova campanha/i }).first().click();
    await expect(page.getByRole('heading', { name: /nova campanha/i })).toBeVisible();

    // Do NOT fill the campaign name: useCampaignEditor's autosave timer fires
    // ~3 s after the field is touched, creating real draft records on every run
    // and retry. Advancing past step 1 also requires a seeded WhatsApp connection
    // + segment — not available as fixture data, so this test only verifies the
    // wizard renders and "Continuar" is present.
    await expect(page.getByRole('button', { name: /continuar/i })).toBeVisible();

    await page.getByRole('button', { name: 'Voltar', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();
  });

  test('help modal opens and closes', async ({ page }) => {
    await page.goto('/');
    await expandCampanhasGroup(page);
    await page
      .getByRole('navigation', { name: 'Menu de navegação principal' })
      .getByRole('button', { name: 'Campanhas', exact: true })
      .first()
      .click();

    await page.getByRole('button', { name: /ajuda/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('segments and templates render via deep links', async ({ page }) => {
    // Após X007, "Segmentos" e "Templates" deixaram de ser abas (role=tab) e viraram
    // itens de menu ("Analytics ▾" / "Templates ▾"). Cada aba tem endereço próprio
    // (?tab=), que é o comportamento aceite da etapa — a régua visual (X004) navega assim.
    await page.goto('/?view=talkx&tab=segments');
    await expect(page.getByPlaceholder('Buscar segmentos…')).toBeVisible();

    await page.goto('/?view=talkx&tab=templates');
    await expect(page.getByPlaceholder('Buscar templates…')).toBeVisible();
  });

  test('wizard step 1 shows audience fields and stepper', async ({ page }) => {
    // Navigate directly via URL to the campaigns overview, bypassing sidebar clicks.
    // This exercises the deep-link routing path (?view=talkx) independently of the
    // sidebar-navigation tests above.
    await page.goto('/?view=talkx');
    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();

    // .first() because TalkXView and TalkXOverview both render a 'Nova campanha' button
    await page.getByRole('button', { name: /nova campanha/i }).first().click();
    await expect(page.getByRole('heading', { name: /nova campanha/i })).toBeVisible();

    // Step 1 label ("Público") is visible in the stepper
    await expect(page.getByText('Público').first()).toBeVisible();

    // Campaign name input is present and empty.
    // IMPORTANT: do NOT use fill() — useCampaignEditor autosave fires ~3 s after
    // first keystroke, creating real draft records on every CI run and retry.
    const nameInput = page.getByPlaceholder('Ex: Lançamento Linha Office');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue('');

    // Step 1 always shows "Continuar"
    await expect(page.getByRole('button', { name: /continuar/i })).toBeVisible();

    // Close the wizard via the header Voltar button (aria-label="Voltar", calls onClose).
    // On step 1 the footer Voltar is hidden (only shown when step > 1), so .first()
    // reliably targets the header button.
    await page.getByRole('button', { name: 'Voltar', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();
  });

  test('wizard stepper shows all four steps and continuar is initially disabled', async ({ page }) => {
    await page.goto('/?view=talkx');
    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();

    // .first() because TalkXView and TalkXOverview both render a 'Nova campanha' button
    await page.getByRole('button', { name: /nova campanha/i }).first().click();
    await expect(page.getByRole('heading', { name: /nova campanha/i })).toBeVisible();

    // The stepper renders all four step labels simultaneously regardless of the current step.
    // STEPS in TalkXCampaignWizard.tsx: Público | Mensagem | Entrega | Revisão
    await expect(page.getByText('Público').first()).toBeVisible();
    await expect(page.getByText('Mensagem').first()).toBeVisible();
    await expect(page.getByText('Entrega').first()).toBeVisible();
    await expect(page.getByText('Revisão').first()).toBeVisible();

    // "Continuar" is disabled until canProceed[1] is satisfied:
    //   name.trim().length >= 3 && !!connectionId && (segmentId || selectedContacts.length > 0)
    // V25: o mínimo do nome subiu de "não vazio" para 3 caracteres (e o passo 1
    // passou a mostrar "O nome precisa de pelo menos 3 caracteres" com 1 ou 2).
    // The wizard starts with an empty form, so canProceed[1] is always false on open.
    // IMPORTANT: do NOT fill any field — useCampaignEditor autosave fires ~3 s after
    // the first keystroke and creates real draft records on every CI run.
    const continuar = page.getByRole('button', { name: /continuar/i });
    await expect(continuar).toBeVisible();
    await expect(continuar).toBeDisabled();

    await page.getByRole('button', { name: 'Voltar', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();
  });

  test('wizard advances to step 2 (Mensagem) after filling step 1', async ({ page, browserName }) => {
    // E09: seleção de combobox via getByRole('combobox') é inconsistente no WebKit em CI.
    test.fixme(browserName === 'webkit', 'E09: combobox aria-label flaky no WebKit headless; reativar quando seletor for ajustado para webkit');

    // Navigate directly to campaigns overview via URL deep-link.
    await page.goto('/?view=talkx');

    // O parametro `view` so' e' aplicado depois que o SPA hidrata. Sem esperar o
    // shell, a assercao do titulo corre contra o boot -- e o Firefox, que hidrata
    // mais devagar, e' quem perde a corrida no CI (nao reproduzido localmente em
    // 3 execucoes em 02/10; endurecido pelo mecanismo, nao por timeout maior).
    await page.locator('#main-navigation').waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();

    // .first() because TalkXView and TalkXOverview both render a 'Nova campanha' button.
    await page.getByRole('button', { name: /nova campanha/i }).first().click();
    await expect(page.getByRole('heading', { name: /nova campanha/i })).toBeVisible();

    // Step 1 — fill campaign name.
    // The name field must be non-empty for canProceed[1] to be satisfied.
    // NOTE: useCampaignEditor autosave fires ~3s after first keystroke.
    // afterAll calls cleanupE2EDraftCampaigns() to remove the resulting draft.
    await page.getByPlaceholder('Ex: Lançamento Linha Office').fill('[E2E] Campanha de Teste');

    // Step 1 — select WhatsApp connection (fixture connection, may be disconnected).
    // StepAudience renders three comboboxes: index 0 = Objetivo, index 1 = Conexão
    // WhatsApp e, desde a V25, index 2 = Responsável. Os dois primeiros índices
    // seguem valendo — o campo novo entrou depois.
    // O trigger do Select de conexão agora tem aria-label="Conexão WhatsApp", então
    // miramos pelo nome (determinístico) em vez de .nth(1) — .nth(1) é ambíguo quando o
    // overview renderiza comboboxes atrás do wizard, e o Radix Select é flaky no WebKit
    // se o conteúdo do portal não é aguardado explicitamente.
    const connectionCombo = page.getByRole('combobox', { name: 'Conexão WhatsApp' });
    await connectionCombo.click();
    const connectionOption = page.getByRole('option', { name: E2E_TALKX_CONNECTION_LABEL });
    await expect(connectionOption).toBeVisible();
    await connectionOption.click();

    // Step 1 — select audience source "Segmento salvo" and pick the fixture segment.
    // The SourceCard is only clickable when segments.length > 0 (fixture segment is seeded).
    await page.getByRole('button', { name: /segmento salvo/i }).click();
    const segmentButton = page.getByRole('button', { name: E2E_TALKX_SEGMENT_REGEX });
    await expect(segmentButton).toBeVisible();
    await segmentButton.click();

    // canProceed[1]: name ✓, connectionId ✓, segmentId ✓ → "Continuar" becomes enabled.
    const continuar = page.getByRole('button', { name: /continuar/i });
    await expect(continuar).toBeEnabled();
    await continuar.click();

    // Step 2 header ("Mensagem") should be active in the stepper.
    await expect(page.getByText('Mensagem').first()).toBeVisible();

    // Close the wizard before cleanup.
    await page.getByRole('button', { name: 'Voltar', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();
  });
});

// Remove draft campaigns created during the wizard step-2 test.
// Runs once after all specs to keep the production DB clean on every CI run.
// try/finally ensures context.close() is called even if goto or cleanup throws.
test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({
    storageState: 'e2e/.auth/user.json',
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await cleanupE2EDraftCampaigns(page);
  } finally {
    await context.close();
  }
});
