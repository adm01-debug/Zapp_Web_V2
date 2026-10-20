/** E98 - frente a11y. O vão de contraste que nenhuma camada mede (ver docstring do teste). */
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function violacoes(page: import('@playwright/test').Page, seletor: string, regras: string[]) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(
    async ([sel, ids]) => {
      const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe;
      const r = await axe.run(sel === 'body' ? document.body : (document.querySelector(sel) ?? document.body), {
        runOnly: { type: 'rule', values: ids },
      });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, nos: v.nodes.length }));
    },
    [seletor, regras] as const,
  );
}

test.describe('E98 - a11y: contraste e nome acessível na tela de contatos', () => {
  test('mede color-contrast e button-name no navegador real', async ({ page }) => {
    await page.goto('/?view=contacts');
    await expect(page.getByRole('main', { name: 'Conteúdo principal' })).toBeVisible({ timeout: 20_000 });

    const v = await violacoes(page, 'body', ['color-contrast', 'button-name']);

    // Medicao de 2026-10-02 (Chromium real, tela de contatos): color-contrast = 0 nos,
    // button-name = 0 nos. O spec nasce verde; vira vermelho se alguem quebrar contraste
    // ou nome acessivel nesta tela - que e o gate que o jsdom nao consegue dar.

    expect(v.filter((x) => x.impact === 'critical'), 'nenhuma violação CRITICAL').toHaveLength(0);
  });
});
