import { test, expect } from '@playwright/test';
import { mockTalkXVisual, fixtureDaTela, ESCRITA_NAO_PREVISTA } from './fixtures/talkx-demo';

declare global {
  interface Window {
    __BOOT_DEADLINE_MS?: number;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__BOOT_DEADLINE_MS = 60000;
  });
});

test.describe('tela 01 — Campanhas — Visão geral (X003)', () => {
  test('exibe a lista de campanhas da fixture', async ({ page }) => {
    const slug = fixtureDaTela('01');
    test.skip(!slug, 'fixture da tela 01 ainda não tem dados');
    await mockTalkXVisual(page, slug!);
    await page.goto('/?view=talkx');
    await expect(page.getByRole('tab', { name: 'Visão geral' })).toBeVisible({ timeout: 30_000 });
    // Label do KPI é hardcoded no JSX de TalkXOverview — verifica que a seção renderizou
    await expect(page.getByText('Total de campanhas')).toBeVisible();
    // Usa campanhas completed/scheduled/draft: não aparecem no rail de recentes
    // (apenas campanhas em andamento aparecem lá), evitando falso positivo se a
    // tabela não renderizar mas o rail sim.
    await expect(page.getByText('Reativação Clientes Inativos').first()).toBeVisible();
    await expect(page.getByText('Promoção de Outubro').first()).toBeVisible();
    await expect(page.getByText('Volta às Aulas 2027').first()).toBeVisible();
  });

  test('mock bloqueia escritas inesperadas', async ({ page }) => {
    const slug = fixtureDaTela('01');
    test.skip(!slug, 'fixture da tela 01 ainda não tem dados');
    await mockTalkXVisual(page, slug!);
    await page.goto('/?view=talkx');
    const result = await page.evaluate(async () => {
      const r = await fetch(
        'https://tnnnlkbymytvtqngbbqh.supabase.co/rest/v1/talkx_campaigns',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'teste' }),
        },
      );
      return { status: r.status, body: await r.json().catch(() => ({})) };
    });
    expect(result.status).toBe(403);
    expect(result.body.message).toBe(ESCRITA_NAO_PREVISTA);
  });
});
