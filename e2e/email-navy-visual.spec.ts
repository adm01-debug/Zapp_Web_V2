import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mockEmailNavy } from './fixtures/email-navy';

const output = join(import.meta.dirname, 'email-navy-visual');

interface AxeViolationResult {
  violations: Array<{
    id: string;
    impact: string | null;
    nodes: Array<{ target: string[]; failureSummary?: string }>;
  }>;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { (window as Window & { __BOOT_DEADLINE_MS?: number }).__BOOT_DEADLINE_MS = 60000; });
  await mockEmailNavy(page);
});

test('rota real renderiza lista, conversa e compositor NAVY sem chamadas externas mutáveis', async ({ page }) => {
  mkdirSync(output, { recursive: true });
  await page.goto('/?view=email-chat');
  await expect(page.getByRole('heading', { name: 'Email', exact: true })).toBeVisible();
  await expect(page.getByText('Preview deployment failed for departamento-pessoal-v3').first()).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(output, '01-lista.png'), fullPage: true, animations: 'disabled' });

  await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  await expect(page).toHaveURL(/emailThread=20000000-0000-4000-8000-000000000001/);
  await expect(page.getByText('deployment-log.txt')).toBeVisible();
  await expect(page.getByText('Obrigado pelo aviso. Já estou verificando')).toBeVisible();
  await page.screenshot({ path: join(output, '02-conversa.png'), fullPage: true, animations: 'disabled' });

  await page.getByRole('button', { name: 'Nova mensagem' }).first().click();
  await expect(page.getByPlaceholder('destinatario@email.com')).toBeVisible();
  const composer = await page.getByText('Nova mensagem', { exact: true }).last().locator('xpath=ancestor::*[contains(@class,"fixed")]').boundingBox();
  const voiceFab = await page.getByRole('button', { name: 'Assistente de voz' }).boundingBox();
  expect(composer && voiceFab && (composer.x + composer.width <= voiceFab.x || voiceFab.x + voiceFab.width <= composer.x || composer.y + composer.height <= voiceFab.y || voiceFab.y + voiceFab.height <= composer.y)).toBeTruthy();
  await page.locator('[data-sonner-toast]').evaluateAll(toasts => toasts.forEach(toast => toast.remove()));
  await page.screenshot({ path: join(output, '03-compositor.png'), fullPage: true, animations: 'disabled' });
});

test('workspace NAVY não introduz violações axe', async ({ page }) => {
  await page.goto('/?view=email-chat');
  await expect(page.getByRole('heading', { name: 'Email', exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as Window & {
      axe: { run: (target: string, options: Record<string, unknown>) => Promise<AxeViolationResult> };
    }).axe;
    const result = await axe.run('.email-navy', {
      rules: {
        'color-contrast': { enabled: true },
      },
    });
    return result.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })),
    }));
  });
  expect(violations).toEqual([]);
});

test('busca, ajuda e foco do diálogo funcionam por teclado', async ({ page }) => {
  await page.goto('/?view=email-chat');
  const search = page.getByRole('textbox', { name: 'Busca global do Email' });
  await search.fill('Sentry');
  await expect(page.getByText('SENTRY-GREEN-BASKET-VQ — 2 new alerts')).toBeVisible();
  await expect(page.getByText('Preview deployment failed for departamento-pessoal-v3')).toBeHidden();

  const help = page.getByRole('button', { name: 'Ajuda' });
  await help.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(help).toBeFocused();
});

test('ações históricas permanecem visíveis e acionáveis no touch', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?view=email-chat');
  await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  await expect(page.getByRole('button', { name: 'Responder' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Encaminhar' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Responder' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Respondendo à mensagem de Vercel/)).toBeVisible();
});

for (const viewport of [
  { name: 'mobile-360x800', width: 360, height: 800 },
  { name: 'mobile-320x800', width: 320, height: 800 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'tablet-1024x768', width: 1024, height: 768 },
  { name: 'desktop-1280x720', width: 1280, height: 720 },
  { name: 'desktop-1366x768', width: 1366, height: 768 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'desktop-1672x941', width: 1672, height: 941 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
]) {
  test(`matriz responsiva ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/?view=email-chat');
    await expect(page.getByRole('heading', { name: 'Email', exact: true })).toBeVisible();
    await expect(page.getByText('Preview deployment failed for departamento-pessoal-v3').first()).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(output, `${viewport.name}.png`), fullPage: true, animations: 'disabled' });
  });
}
