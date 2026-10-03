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

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(() => { (window as Window & { __BOOT_DEADLINE_MS?: number }).__BOOT_DEADLINE_MS = 60000; });
  await mockEmailNavy(page, {
    includeExtreme: testInfo.title.includes('corpus extremo'),
    crmContext: testInfo.title.includes('CRM completo') ? 'available' : testInfo.title.includes('escolha explícita CRM') ? 'ambiguous' : undefined,
  });
});

test('rota real renderiza lista, conversa e compositor com o tema do sistema sem chamadas externas mutáveis', async ({ page }) => {
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

test('workspace do Email não introduz violações axe', async ({ page }) => {
  await page.goto('/?view=email-chat');
  await expect(page.getByRole('heading', { name: 'Email', exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as Window & {
      axe: { run: (target: string, options: Record<string, unknown>) => Promise<AxeViolationResult> };
    }).axe;
    const result = await axe.run('.email-workspace', {
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

test('superfícies do Email herdam os mesmos tokens do sistema em claro e escuro', async ({ page }) => {
  mkdirSync(output, { recursive: true });
  await page.goto('/?view=email-chat');
  await expect(page.getByTestId('email-workspace')).toBeVisible();
  await page.addScriptTag({ path: join(process.cwd(), 'node_modules/axe-core/axe.min.js') });

  for (const mode of ['light', 'dark'] as const) {
    const themeToggle = page.getByRole('button', { name: mode === 'light' ? 'Modo claro' : 'Modo escuro' });
    if (await themeToggle.count()) await themeToggle.click();
    await expect(page.locator('html')).toHaveClass(new RegExp(`(?:^|\\s)${mode}(?:\\s|$)`));
    await page.waitForTimeout(400); // aguarda a transição global de tema (300 ms)

    const colors = await page.evaluate(() => {
      const resolveBackground = (className: string) => {
        const probe = document.createElement('div');
        probe.className = className;
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      };
      const background = resolveBackground('bg-background');
      const inboxPanel = resolveBackground('bg-inbox-panel');
      const colorOf = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`) as HTMLElement).backgroundColor;

      return {
        background,
        inboxPanel,
        workspace: colorOf('email-workspace'),
        header: colorOf('email-header'),
        threadList: colorOf('email-thread-list'),
        conversation: colorOf('email-conversation'),
      };
    });

    expect(colors.workspace, `${mode}: workspace`).toBe(colors.background);
    expect(colors.conversation, `${mode}: conversation`).toBe(colors.background);
    expect(colors.header, `${mode}: header`).toBe(colors.inboxPanel);
    expect(colors.threadList, `${mode}: thread list`).toBe(colors.inboxPanel);

    const contrastViolations = await page.evaluate(async () => {
      const axe = (window as unknown as Window & {
        axe: { run: (target: string, options: Record<string, unknown>) => Promise<AxeViolationResult> };
      }).axe;
      const result = await axe.run('.email-workspace', { rules: { 'color-contrast': { enabled: true } } });
      return result.violations.filter(violation => violation.id === 'color-contrast').map(violation => ({
        id: violation.id,
        nodes: violation.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })),
      }));
    });
    expect(contrastViolations, `${mode}: contrast`).toEqual([]);
    await clearTransientToasts(page);
    await page.screenshot({ path: join(output, mode === 'light' ? '05-tema-claro.png' : '06-tema-escuro.png'), fullPage: true, animations: 'disabled' });
  }
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

test('sidebar expandida e recolhida preservam a composição do sistema', async ({ page }) => {
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

test('painel CRM completo preserva ações, acessibilidade e fechamento em 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/?view=email-chat');
  await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  await page.getByRole('button', { name: 'Detalhes' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('Empresa Exemplo', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Cliente', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Fornecedor', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /abrir site da empresa/i })).toHaveAttribute('href', 'https://empresa.example.test/catalogo?origem=email#sobre');
  await expect(drawer.getByRole('link', { name: /abrir linkedin da empresa/i })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /abrir instagram da empresa/i })).toBeVisible();
  const close = await drawer.getByRole('button', { name: 'Fechar detalhes' }).boundingBox();
  expect(close && close.x >= 0 && close.x + close.width <= 320).toBeTruthy();
  await page.addScriptTag({ path: join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => (await (window as unknown as Window & { axe: { run: (target: string, options: Record<string, unknown>) => Promise<AxeViolationResult> } }).axe.run('[role="dialog"]', {})).violations.map(violation => violation.id));
  expect(violations).toEqual([]);
});

test('escolha explícita CRM não vincula automaticamente e resolve a empresa selecionada', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?view=email-chat');
  await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  await expect(page.getByRole('region', { name: 'Escolher empresa CRM' })).toBeVisible();
  await page.getByRole('button', { name: 'Empresa Exemplo' }).click();
  await expect(page.getByText('Empresa Exemplo', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vincular empresa ao contato' })).toBeVisible();
});

test('escolha explícita CRM funciona para conversa sem contato local e não oferece vínculo persistente', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?view=email-chat');
  await page.getByText('Alerta sobre término da cotação').click();
  await expect(page.getByRole('region', { name: 'Escolher empresa CRM' })).toBeVisible();
  await page.getByRole('button', { name: 'Outra Empresa' }).click();
  await expect(page.getByText('Empresa Exemplo', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vincular empresa ao contato' })).toHaveCount(0);
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

test('rascunho e referência de anexo permanecem isolados no ciclo conta A → B → A', async ({ page }) => {
  await page.goto('/?view=email-chat');
  await page.getByRole('button', { name: 'Nova mensagem' }).first().click();
  await page.getByPlaceholder('destinatario@email.com').fill('cliente@example.com');
  await page.getByPlaceholder('Assunto do email').fill('Rascunho exclusivo da conta A');
  await page.getByRole('textbox', { name: 'Mensagem' }).fill('Conteúdo privado da conta A');
  await page.locator('input[type="file"]').setInputFiles({ name: 'proposta-a.txt', mimeType: 'text/plain', buffer: Buffer.from('arquivo A') });
  await expect(page.getByText('proposta-a.txt')).toBeVisible();

  const account = page.getByRole('combobox', { name: 'Conta de email ativa' });
  await account.click();
  await page.getByRole('option', { name: 'financeiro@zapp.local' }).click();
  await expect(page.getByPlaceholder('destinatario@email.com')).toHaveCount(0);
  await page.getByRole('button', { name: 'Nova mensagem' }).first().click();
  await expect(page.getByPlaceholder('destinatario@email.com')).toHaveValue('');
  await expect(page.getByPlaceholder('Assunto do email')).toHaveValue('');
  await expect(page.getByText('proposta-a.txt')).toHaveCount(0);

  await account.click();
  await page.getByRole('option', { name: 'admin@zapp.local' }).click();
  await expect(page.getByPlaceholder('destinatario@email.com')).toHaveCount(0);
  await page.getByRole('button', { name: 'Nova mensagem' }).first().click();
  await expect(page.getByPlaceholder('destinatario@email.com')).toHaveValue('cliente@example.com');
  await expect(page.getByPlaceholder('Assunto do email')).toHaveValue('Rascunho exclusivo da conta A');
  await expect(page.getByRole('textbox', { name: 'Mensagem' })).toContainText('Conteúdo privado da conta A');
  await expect(page.getByText('O rascunho foi restaurado,', { exact: false })).toContainText('proposta-a.txt');
});

test('corpus extremo com texto sem quebra e muitos anexos não cria overflow global', async ({ page }) => {
  await page.goto('/?view=email-chat');
  await page.getByRole('textbox', { name: 'Busca global do Email' }).fill('Corpus extremo');
  await page.getByText('Corpus extremo', { exact: false }).first().click();
  const extremeMessage = page.getByRole('article', { name: /Mensagem de REMETENTESEMQUEBRA/ });
  await expect(extremeMessage).toBeVisible();
  await expect(extremeMessage.getByRole('button', { name: /Baixar ARQUIVO_EXTREMAMENTE_LONGO/ })).toHaveCount(100);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});

test('alto contraste e movimento reduzido mantêm o workspace acessível', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('highContrast', 'true');
    localStorage.setItem('reducedMotion', 'true');
  });
  await page.goto('/?view=email-chat');
  await expect(page.getByRole('heading', { name: 'Email', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/high-contrast/);
  await expect(page.locator('html')).toHaveClass(/reduced-motion/);
  await page.addScriptTag({ path: join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as Window & { axe: { run: (target: string) => Promise<AxeViolationResult> } }).axe;
    return (await axe.run('.email-workspace')).violations.map(item => ({
      id: item.id,
      impact: item.impact,
      nodes: item.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })),
    }));
  });
  expect(violations).toEqual([]);
});

test('workspace do Email é desmontado ao alternar entre módulos', async ({ page }) => {
  await page.goto('/?view=email-chat');
  await expect(page.locator('.email-workspace')).toHaveCount(1);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page).toHaveURL(/view=dashboard/);
  await expect(page.locator('.email-workspace')).toHaveCount(0);
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await expect(page.locator('.email-workspace')).toHaveCount(1);
});

test('consumidor Omnichannel incorpora Email sem duplicar o cabeçalho autônomo', async ({ page }) => {
  await page.goto('/?view=omni-inbox');
  await page.getByRole('tab', { name: 'Email Chat' }).click();
  await expect(page.locator('.email-workspace')).toBeVisible();
  await expect(page.getByText('Comunicação profissional, organizada como uma conversa.')).toHaveCount(0);
  await expect(page.getByText('admin@zapp.local').first()).toBeVisible();
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
