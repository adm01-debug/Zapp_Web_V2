/** E98 - frente a11y. O vão de contraste que nenhuma camada mede (ver docstring do teste). */
import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { gotoContacts } from './fixtures/contacts-page';
import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession } from './fixtures/talkx-demo';
import { filtrarViolacoesBloqueantes } from './support/a11y-impactos';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function violacoes(page: import('@playwright/test').Page, seletor: string, regras: string[]) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(
    async ([sel, ids]) => {
      const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[]; html: string; failureSummary?: string }[] }[] }> } }).axe;
      const r = await axe.run(sel === 'body' ? document.body : (document.querySelector(sel) ?? document.body), {
        runOnly: { type: 'rule', values: ids },
      });
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nos: v.nodes.length,
        alvos: v.nodes.map((node) => ({
          seletor: node.target.join(' '),
          html: node.html,
          motivo: node.failureSummary ?? '',
        })),
      }));
    },
    [seletor, regras] as const,
  );
}

async function mockContatosVazios(page: Page): Promise<void> {
  await page.route(/\/rest\/v1\/contacts/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/rpc\/(search_contacts|contacts_count_by_type|get_last_message_dates|can_delete_contacts)/,
    (route) => json(route, []));
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('E98 - a11y: contraste e nome acessível na tela de contatos', () => {
  let registro: Registro;

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    await bloquearRedeReal(page, registro);
    await mockAppShell(page, registro);
    await mockContatosVazios(page);
    await installFakeSession(page);
  });

  test.afterEach(() => {
    expect(registro.redeBarrada).toEqual([]);
  });

  test('mede color-contrast e button-name no navegador real', async ({ page }) => {
    await gotoContacts(page);
    await expect(page.getByRole('main', { name: 'Conteúdo principal' })).toBeVisible({ timeout: 20_000 });

    const v = await violacoes(page, 'body', ['color-contrast', 'button-name']);

    // Medicao de 2026-10-02 (Chromium real, tela de contatos): color-contrast = 0 nos,
    // button-name = 0 nos. O spec nasce verde; vira vermelho se alguem quebrar contraste
    // ou nome acessivel nesta tela - que e o gate que o jsdom nao consegue dar.

    expect(
      filtrarViolacoesBloqueantes(v),
      'nenhuma violação SERIOUS ou CRITICAL',
    ).toHaveLength(0);
  });
});
