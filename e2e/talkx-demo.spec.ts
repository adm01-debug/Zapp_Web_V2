/**
 * X003 — Base de demonstração determinística das 17 telas.
 *
 * Este spec NUNCA grava no banco de produção:
 *   - todas as chamadas de API são interceptadas por mockTalkXBackend
 *   - chamadas de escrita retornam 403 e falham o teste
 *
 * Contrato de crescimento: a fixture de cada tela é {} até a etapa daquela
 * tela nascer. loadDemoData(tela) lança FixtureVaziaError quando o fixture
 * tem zero chaves — nunca mais data[table] ?? [] renderizando a tela vazia.
 */
import { test, expect } from '@playwright/test';
import { loadDemoData, mockTalkXBackend, FixtureVaziaError } from './fixtures/talkx-demo';

test.describe('Talk X — Demonstração determinística (X003)', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  // ── Aceite X003
  // Critério 1: visão geral exibe campanha "Lançamento Linha Office" e KPI "24"
  test('tela-01: Visão geral mostra Lançamento Linha Office e KPI 24', async ({ page }) => {
    await mockTalkXBackend(page, 1);
    await page.clock.install({ time: new Date('2026-11-01T21:00:00Z') });

    await page.goto('/?view=talkx');
    await page.locator('#main-navigation').waitFor({ state: 'visible', timeout: 15_000 });

    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();

    // A campanha seedada na fixture deve aparecer na lista
    await expect(page.getByText('Lançamento Linha Office')).toBeVisible();

    // O KPI "Total de campanhas" deve exibir "24"
    await expect(page.getByText('24').first()).toBeVisible();
  });

  // Critério 2: chamada POST a talkx_campaigns retorna 403 (escrita não prevista)
  test('tela-01: POST a talkx_campaigns aborta com escrita não prevista', async ({ page }) => {
    await mockTalkXBackend(page, 1);

    await page.goto('/?view=talkx');

    const response = await page.evaluate(async () => {
      const supaUrl =
        (window as unknown as Record<string, string>).__SUPABASE_URL__ ??
        document.querySelector<HTMLMetaElement>('meta[name="supabase-url"]')?.content ??
        location.origin;
      const res = await fetch(`${supaUrl}/rest/v1/talkx_campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'escrita-nao-prevista' }),
      });
      return { status: res.status };
    });

    expect(response.status).toBe(403);
  });

  // Contrato de crescimento: loadDemoData({}) lança FixtureVaziaError
  test('loadDemoData(tela vazia) lança FixtureVaziaError', async () => {
    // tela-02 é {} — deve lançar FixtureVaziaError
    await expect(loadDemoData(2)).rejects.toBeInstanceOf(FixtureVaziaError);
  });

  // Telas 02-17: test.skip até a etapa popular a fixture
  for (let tela = 2; tela <= 17; tela++) {
    test(`tela-${String(tela).padStart(2, '0')}: aguardando etapa da tela`, async () => {
      let hasData = false;
      try {
        await loadDemoData(tela);
        hasData = true;
      } catch (e) {
        if (!(e instanceof FixtureVaziaError)) throw e;
      }
      // eslint-disable-next-line playwright/no-conditional-in-test
      if (!hasData) {
        test.skip();
      }
    });
  }
});
