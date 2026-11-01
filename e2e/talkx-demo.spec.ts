/**
 * Suíte de aceitação do Talk X (plano V4, etapa X003).
 *
 * Verifica comportamento observável de cada tela com a fixture de demo.
 * Roda DESLOGADO — sessão falsa via mockTalkXVisual, sem setup e sem secrets —
 * para entrar no workflow de PR (e2e-talkx.yml).
 *
 * Contrato de crescimento: o arquivo cresce junto com as etapas — cada tela
 * ganha seu test.describe quando a fixture dela fica não-vazia
 * (docs/talkx/v4/etapas/).
 */
import { test, expect } from '@playwright/test';
import { mockTalkXVisual, fixtureDaTela } from './fixtures/talkx-demo';

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

// ---------------------------------------------------------------------------
// Tela 01 — Campanhas — Visão geral (X003)
// ---------------------------------------------------------------------------

test.describe('tela 01 — Campanhas — Visão geral (X003)', () => {
  test('exibe a lista de campanhas da fixture', async ({ page }) => {
    const slug = fixtureDaTela('01');
    test.skip(!slug, 'fixture da tela 01 ainda não tem dados');

    await mockTalkXVisual(page, slug!);
    await page.goto('/?view=talkx');

    await expect(page.getByRole('tab', { name: 'Visão geral' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Lançamento Linha Office')).toBeVisible();
    await expect(page.getByText('Promoção de Outubro')).toBeVisible();
    await expect(page.getByText('Dia do Cliente')).toBeVisible();
  });
});
