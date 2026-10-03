import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mockEmailNavy } from './fixtures/email-navy';

const output = join(import.meta.dirname, 'email-navy-visual');

async function clearTransientToasts(page: import('@playwright/test').Page) {
  await page.locator('[data-sonner-toast]').evaluateAll(toasts => toasts.forEach(toast => toast.remove()));
}

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
  await clearTransientToasts(page);
  await page.screenshot({ path: join(output, '01-lista.png'), fullPage: true, animations: 'disabled' });

  await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  await expect(page).toHaveURL(/emailThread=20000000-0000-4000-8000-000000000001/);
  await expect(page.getByText('deployment-log.txt').first()).toBeVisible();
  await expect(page.getByText('Obrigado pelo aviso. Já estou verificando')).toBeVisible();
  await clearTransientToasts(page);
  await page.screenshot({ path: join(output, '02-conversa.png'), fullPage: true, animations: 'disabled' });

  await page.getByRole('button', { name: 'Nova mensagem' }).first().click();
  await expect(page.getByPlaceholder('destinatario@email.com')).toBeVisible();
  const composerRoot = page.getByText('Nova mensagem', { exact: true }).last().locator('xpath=ancestor::*[contains(@class,"fixed")]');
  await expect(composerRoot.getByRole('button', { name: 'Descartar' })).toBeVisible();
  await expect(composerRoot.getByRole('button', { name: 'Enviar', exact: true })).toBeVisible();
  const composer = await composerRoot.boundingBox();
  const viewport = page.viewportSize();
  expect(composer && viewport && composer.y >= 0 && composer.y + composer.height <= viewport.height + 1).toBeTruthy();
  const voiceFab = await page.getByRole('button', { name: 'Assistente de voz' }).boundingBox();
  expect(composer && voiceFab && (composer.x + composer.width <= voiceFab.x || voiceFab.x + voiceFab.width <= composer.x || composer.y + composer.height <= voiceFab.y || voiceFab.y + voiceFab.height <= composer.y)).toBeTruthy();
  await clearTransientToasts(page);
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

test('sidebar expandida e recolhida preservam a composição NAVY', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('zapp-sidebar-collapsed', 'false'));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/?view=email-chat');
  await expect(page.getByRole('button', { name: 'Recolher menu' })).toBeVisible();
  await expect(page.getByText('Comunicação profissional, organizada como uma conversa.')).toBeVisible();
  await clearTransientToasts(page);
  await page.screenshot({ path: join(output, '04-sidebar-expandida.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Recolher menu' }).click();
  await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible();
  await expect(page.getByText('Preview deployment failed for departamento-pessoal-v3').first()).toBeVisible();
});

test('painel contextual vira drawer intermediário e expõe dados reais', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/?view=email-chat');
  await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  await expect(page.getByRole('button', { name: 'Detalhes' })).toBeVisible();
  await page.getByRole('button', { name: 'Detalhes' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('notifications@vercel.com').first()).toBeVisible();
  await expect(drawer.getByText('deployment-log.txt')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('button', { name: 'Detalhes' })).toBeFocused();
});

test('marcadores Gmail reais podem ser gerenciados sem envio externo real', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/?view=email-chat');
  await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  await page.getByRole('button', { name: 'Gerenciar marcadores' }).click();
  const label = page.getByRole('menuitemcheckbox', { name: 'Clientes importantes' });
  await expect(label).toBeVisible();
  await label.click();
});

test('editor WYSIWYG aplica formatação, link e histórico de desfazer sem execCommand', async ({ page }) => {
  await page.goto('/?view=email-chat');
  await page.getByRole('button', { name: 'Nova mensagem' }).first().click();
  const editor = page.getByRole('textbox', { name: 'Mensagem' });
  await editor.fill('Texto rico');
  await editor.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.getByRole('button', { name: 'Negrito' }).click();
  await expect(editor.locator('strong')).toHaveText('Texto rico');

  await editor.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  page.once('dialog', dialog => dialog.accept('example.com/proposta'));
  await page.getByRole('button', { name: 'Inserir link' }).click();
  await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com/proposta');

  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(editor.locator('a')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refazer' }).click();
  await expect(editor.locator('a')).toHaveCount(1);
});

test('reflow equivalente a zoom de 200% mantém ações essenciais acessíveis', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await page.goto('/?view=email-chat');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.getByRole('heading', { name: 'Email', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nova mensagem' }).first()).toBeVisible();
  const firstThreadButton = page.getByText('Preview deployment failed for departamento-pessoal-v3').first().locator('xpath=ancestor::button');
  await firstThreadButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Detalhes' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
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
    await clearTransientToasts(page);
    await page.screenshot({ path: join(output, `${viewport.name}.png`), fullPage: true, animations: 'disabled' });
  });
}
