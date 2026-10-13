/**
 * Auth flows — tela de login DESLOGADA (projeto Playwright "chromium").
 *
 * t_62a7ee39: removidos os dois testes de "aba de cadastro", que sobraram do tempo
 * em que o cadastro público existia. R3/SG1 tirou o cadastro da tela, então o gate
 * passou a ser a AUSÊNCIA da aba. Somado a isso, um scan real do axe na tela.
 */
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { filtrarViolacoesBloqueantes } from './support/a11y-impactos';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

test.describe('Auth flows', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main', { name: /acesso à plataforma/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /bem-vindo de volta/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^entrar$/i })).toHaveAttribute('data-state', 'active');
    await expect(page.getByRole('button', { name: /^entrar$/i })).toBeVisible();
  });

  test('login form validates email format', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: /e-?mail/i }).fill('notanemail');
    await page.getByRole('button', { name: /entrar|login/i }).click();
    await expect(page.getByText(/e-?mail inv|e-?mail obr/i)).toBeVisible();
  });

  test('login email input respects maxLength', async ({ page }) => {
    await page.goto('/');
    const emailInput = page.getByRole('textbox', { name: /e-?mail/i }).first();
    await expect(emailInput).toHaveAttribute('maxlength', '255');
  });

  test('login password input respects maxLength', async ({ page }) => {
    await page.goto('/');
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toHaveAttribute('maxlength', '200');
  });

  // SG1/R3: o cadastro público saiu da tela. O gate agora é a AUSÊNCIA da aba —
  // não basta o fluxo "entrar" funcionar, alguém pode reintroduzir a aba sem querer.
  test('não oferece aba de cadastro público', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: /criar conta|cadastro|sign.?up/i })).toHaveCount(0);
  });

  // Gate que o jsdom não dá: contraste e nomes acessíveis medidos no Chromium real
  // na tela de login. Nasce verde (medido em 13/10, 0 violações SERIOUS/CRITICAL) e
  // fica vermelho se a tela perder contraste ou nome de botão/campo.
  test('tela de login sem violação séria de acessibilidade (axe)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main', { name: /acesso à plataforma/i })).toBeVisible();

    await page.addScriptTag({ path: AXE });
    const violacoes = await page.evaluate(async () => {
      const axe = (window as unknown as {
        axe: {
          run: (ctx: unknown, opt: unknown) => Promise<{
            violations: { id: string; impact: string; nodes: unknown[] }[];
          }>;
        };
      }).axe;
      const r = await axe.run(document.body, {
        runOnly: { type: 'rule', values: ['color-contrast', 'button-name', 'label', 'aria-input-field-name'] },
      });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, nos: v.nodes.length }));
    });

    expect(
      filtrarViolacoesBloqueantes(violacoes),
      `nenhuma violação SERIOUS ou CRITICAL na tela de login\n${JSON.stringify(violacoes, null, 2)}`,
    ).toHaveLength(0);
  });
});
