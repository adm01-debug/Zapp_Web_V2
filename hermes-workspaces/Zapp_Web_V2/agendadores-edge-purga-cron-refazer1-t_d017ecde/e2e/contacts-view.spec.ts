import { test, expect } from '@playwright/test';
import { CONTACT_TAB_LABELS, contactCards, gotoContacts, parseCount } from './fixtures/contacts-page';

// Plano de Contatos, etapas 84 e 89 (docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md).
test.describe('Contatos — visão geral', () => {
  test.beforeEach(async ({ page }) => {
    await gotoContacts(page);
  });

  test('KPI "Total de Contatos" bate com o badge da aba Todos', async ({ page }) => {
    const totalCard = page.getByTestId('kpi-card').filter({ hasText: 'Total de Contatos' });
    const badge = page.getByRole('tab', { name: /Todos/ }).getByTestId('tab-count');
    // O KPI anima (CountUp): espera estabilizar no mesmo valor do badge.
    await expect(async () => {
      const kpi = parseCount(await totalCard.getByTestId('kpi-value').textContent());
      expect(kpi).toBe(parseCount(await badge.textContent()));
    }).toPass({ timeout: 15_000 });
  });

  test('as 7 abas aparecem na ordem canônica', async ({ page }) => {
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(CONTACT_TAB_LABELS.length);
    for (const [i, label] of CONTACT_TAB_LABELS.entries()) {
      await expect(tabs.nth(i)).toContainText(label);
    }
  });

  test('busca por "a" traz resultados e limpar volta à lista completa', async ({ page }) => {
    const search = page.getByPlaceholder(/Buscar por nome, telefone/);
    await search.fill('a');
    await expect(contactCards(page).first()).toBeVisible({ timeout: 15_000 });
    await search.fill('');
    await expect(contactCards(page).first()).toBeVisible();
  });

  test('aba Cliente filtra e fica selecionada', async ({ page }) => {
    const tab = page.getByRole('tab', { name: /Cliente/ });
    await tab.click();
    await expect(tab).toHaveAttribute('data-state', 'active');
    await expect(page.getByRole('tab', { name: /Todos/ })).toHaveAttribute('data-state', 'inactive');
  });

  test('ordenação "Mais recentes", Filtros e Filtros Salvos', async ({ page }) => {
    const sort = page.getByRole('combobox', { name: 'Ordenar por' });
    await sort.click();
    await page.getByRole('option', { name: 'Mais recentes' }).click();
    await expect(sort).toContainText('Mais recentes');

    const filters = page.getByRole('button', { name: /^Filtros/ }).first();
    await filters.click();
    await expect(filters).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Painel de filtros avançados' })).toBeVisible();
    await filters.click();
    await expect(filters).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('button', { name: /Filtros Salvos/ }).click();
    await expect(page.getByText(/Nenhum filtro salvo|Salvar Filtro Atual|Aplique filtros primeiro/).first()).toBeVisible();
  });
});

test.describe('Contatos — tema claro e mobile (etapa 89)', () => {
  test.use({ colorScheme: 'light', viewport: { width: 390, height: 844 } });

  test('sem rolagem horizontal e KPIs acima das abas sem sobreposição', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('theme', 'light'));
    await gotoContacts(page);

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

    const lastKpi = await page.getByTestId('kpi-card').last().boundingBox();
    const tabs = await page.getByRole('tablist').first().boundingBox();
    expect(lastKpi && tabs).toBeTruthy();
    expect(tabs!.y).toBeGreaterThanOrEqual(lastKpi!.y + lastKpi!.height - 1);
  });
});
