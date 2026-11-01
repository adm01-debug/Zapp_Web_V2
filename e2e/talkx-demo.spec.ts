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

test.describe('tela 01 — Campanhas — Visão geral (X003)', () => {
  test('exibe a lista de campanhas da fixture', async ({ page }) => {
    const slug = fixtureDaTela('01');
    test.skip(!slug, 'fixture da tela 01 ainda não tem dados');
    await mockTalkXVisual(page, slug!);
    await page.goto('/?view=talkx');
    await expect(page.getByRole('tab', { name: 'Visão geral' })).toBeVisible({ timeout: 30_000 });
    // .first() evita violação de strictness: nome aparece na tabela E no rail de recentes
    await expect(page.getByText('Lançamento Linha Office').first()).toBeVisible();
    await expect(page.getByText('Promoção de Outubro').first()).toBeVisible();
    await expect(page.getByText('Dia do Cliente').first()).toBeVisible();
  });
});
