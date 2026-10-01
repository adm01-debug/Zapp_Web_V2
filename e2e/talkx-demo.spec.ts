import { test, expect } from '@playwright/test';
import { mockTalkXBackend, ESCRITA_NAO_PREVISTA } from './fixtures/talkx-demo';

/**
 * Demonstração determinística do Talk X (plano V4, etapa X003).
 *
 * A Visão geral é renderizada com os dados do mock (tela 01) — sem login no
 * banco de produção para os dados do módulo, sem gravar nem enviar nada. O
 * relógio é fixado com page.clock; qualquer escrita não prevista é bloqueada
 * pelo mock com 403 "escrita não prevista".
 */
test.describe('Talk X — demo determinística (fixture da tela 01)', () => {
  test('Visão geral renderiza o mock e bloqueia escrita não prevista', async ({ page }) => {
    await mockTalkXBackend(page, '01-campanhas-visao-geral');

    // Relógio fixo: o mesmo "agora" em toda execução (base da régua visual em X004).
    await page.clock.install({ time: new Date('2026-10-01T12:00:00Z') });

    await page.goto('/?view=talkx');
    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();

    // KPI "Total de campanhas" = 24 (a fixture tem 24 campanhas).
    await expect(page.getByText('Total de campanhas')).toBeVisible();
    await expect(page.getByText('24', { exact: true }).first()).toBeVisible();

    // Campanha mais recente da fixture aparece na tabela (e no rail de "Últimas").
    await expect(page.getByText('Lançamento Linha Office').first()).toBeVisible();

    // Escrita não prevista é bloqueada pelo mock.
    const result = await page.evaluate(async () => {
      const res = await fetch('/rest/v1/talkx_campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'não deve gravar' }),
      });
      return { status: res.status, body: await res.text() };
    });
    expect(result.status).toBe(403);
    expect(result.body).toContain(ESCRITA_NAO_PREVISTA);
  });
});
