import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mockEmailNavy } from './fixtures/email-navy';

const output = join(import.meta.dirname, 'email-navy-visual');

/**
 * Teto de boot declarado AO app (index.html usa `window.__BOOT_DEADLINE_MS`, 8 s por padrão
 * em produção). O beforeEach injeta este valor; a espera de prontidão abaixo usa a MESMA
 * constante para a spec nunca esperar menos do que ela própria autoriza o app a levar.
 */
const BOOT_DEADLINE_MS = 60000;
const PRIMEIRA_CONVERSA = 'Preview deployment failed for departamento-pessoal-v3';

/**
 * O app pode levar até BOOT_DEADLINE_MS para montar (é o que esta spec declara a ele), então o
 * orçamento do teste precisa cobrir essa espera. O teto padrão do Playwright é 30 s e cortava a
 * espera de prontidão ao meio: medido na RUN 08 da primeira série do cartão t_fd2a03ec —
 * "Test timeout of 30000ms exceeded" estourando DENTRO do `abrirEmail`, com a tela ainda sem a
 * lista. Mesmo padrão já usado em `e2e/onboarding-dispensar.spec.ts`. Nada é afrouxado: o teto
 * maior só dá tempo de a tela ficar pronta; se ela não ficar, a asserção continua falhando.
 */
test.setTimeout(BOOT_DEADLINE_MS + 30_000);

/**
 * Espera a tela de Email TERMINAR o boot antes de qualquer asserção/medição.
 *
 * O teto PADRÃO do `expect` do Playwright é 5 s, e medir nesse teto assume que o app já
 * montou. Medido no cartão t_c13c7283 (10 rodadas, 930 testes): as 5 falhas foram todas
 * `expect(...).toBeVisible()` com "element(s) not found" em 5 000 ms — a tela ainda estava
 * montando (heading "Email" ausente) ou a lista de conversas ainda não tinha a fixture
 * carregada, sempre em vítima diferente e sempre sob contenção do host.
 *
 * A linha da primeira conversa só existe com o workspace montado E a primeira leitura da
 * fixture concluída, então cobrir os dois sintomas; nenhuma asserção do teste foi trocada —
 * aqui é só a espera de prontidão, com o teto que o próprio app conhece.
 */
async function abrirEmail(page: import('@playwright/test').Page) {
  await page.goto('/?view=email-chat');
  await expect(page.getByText(PRIMEIRA_CONVERSA).first()).toBeVisible({ timeout: BOOT_DEADLINE_MS });
}

async function clearTransientToasts(page: import('@playwright/test').Page) {
  await page.locator('[data-sonner-toast]').evaluateAll(toasts => toasts.forEach(toast => toast.remove()));
}

/**
 * O tema global anima a troca de variáveis de cor. Para a aferição estática do
 * axe, uma cor interpolada não representa o estado que o usuário recebe ao
 * final da troca e pode gerar falsos contrastes no WebKit.
 */
async function freezeVisualTransitions(page: import('@playwright/test').Page) {
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
}

interface AxeViolationResult {
  violations: Array<{
    id: string;
    impact: string | null;
    nodes: Array<{ target: string[]; failureSummary?: string }>;
  }>;
}

/**
 * Confirma que o tema pedido já está APLICADO no documento antes de medir contraste.
 *
 * A classe em `<html>` não é prova suficiente: `applyThemePreset` grava os tokens do preset
 * como variáveis INLINE no próprio `<html>` (vencem `.light`/`.dark`) e a troca de tema anima
 * as cores por 0,3 s. Medido nesta task, com a espera fixa de 400 ms removida: o WebKit leu
 * `rgb(14, 14, 16)` (fundo do tema escuro) e valores INTERPOLADOS (`rgb(88, 88, 90)`,
 * `rgb(138, 138, 140)`) na iteração do tema claro — a superfície animando contra uma sonda
 * recém-criada, que já estava no valor final. Aqui esperamos o CSS RESOLVIDO do `body` (fundo
 * e texto, que é o que o axe lê) ficar coerente com o modo pedido e a classe global de
 * transição sair; nenhuma espera fixa sobrou no lugar disso.
 */
async function waitForAppliedTheme(page: import('@playwright/test').Page, mode: 'light' | 'dark') {
  await page.waitForFunction((esperado: 'light' | 'dark') => {
    const luminancia = (cor: string) => {
      const [r, g, b] = (cor.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const linear = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    };
    const amostra = (className: string) => {
      const probe = document.createElement('div');
      probe.className = className;
      document.body.appendChild(probe);
      const cor = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return cor;
    };
    const estavel = !document.documentElement.classList.contains('theme-transitioning')
      && !document.body.classList.contains('theme-transitioning');
    const fundo = luminancia(amostra('bg-background'));
    const texto = luminancia(getComputedStyle(document.body).color);
    return estavel && (esperado === 'light' ? fundo > 0.5 && texto < 0.5 : fundo < 0.5 && texto > 0.5);
  }, mode);
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript((deadline: number) => { (window as Window & { __BOOT_DEADLINE_MS?: number }).__BOOT_DEADLINE_MS = deadline; }, BOOT_DEADLINE_MS);
  await mockEmailNavy(page, {
    includeExtreme: testInfo.title.includes('corpus extremo'),
    crmContext: testInfo.title.includes('CRM completo') ? 'available'
      : testInfo.title.includes('escolha explícita CRM') ? 'ambiguous'
        : testInfo.title.includes('CRM sem permissão') ? 'permission_denied' : undefined,
  });
});

test('rota real renderiza lista, conversa e compositor com o tema do sistema sem chamadas externas mutáveis', async ({ page }) => {
  mkdirSync(output, { recursive: true });
  await abrirEmail(page);
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
  await abrirEmail(page);
  await expect(page.getByRole('heading', { name: 'Email', exact: true })).toBeVisible();
  await freezeVisualTransitions(page);
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as Window & {
      axe: { run: (target: string, options: Record<string, unknown>) => Promise<AxeViolationResult>; _running?: boolean };
    }).axe;
    // O app roda @axe-core/react em DEV sobre a MESMA instancia global `window.axe` desta
    // spec: esperar a instancia ficar livre no mesmo frame que dispara o nosso run evita o
    // "Axe is already running" intermitente, sem mexer em nenhuma assercao.
    while (axe._running) await new Promise(resolve => setTimeout(resolve, 25));
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
  await abrirEmail(page);
  await expect(page.getByTestId('email-workspace')).toBeVisible();
  await freezeVisualTransitions(page);
  await page.addScriptTag({ path: join(process.cwd(), 'node_modules/axe-core/axe.min.js') });

  for (const mode of ['light', 'dark'] as const) {
    const themeToggle = page.getByRole('button', { name: mode === 'light' ? 'Modo claro' : 'Modo escuro' });
    if (await themeToggle.count()) await themeToggle.click();
    await expect(page.locator('html')).toHaveClass(new RegExp(`(?:^|\\s)${mode}(?:\\s|$)`));
    // Confirma o tema ANTES de medir: sem isso a leitura pegava a troca em andamento (classe
    // ja do tema novo, tokens inline ainda do anterior ou cores interpoladas pela animacao).
    await waitForAppliedTheme(page, mode);
    // Reaplica o congelamento dentro do modo: `html.theme-transitioning *` (mais especifico)
    // vence o `*` de freezeVisualTransitions durante a troca; congelar de novo depois que os
    // tokens assentaram evita que o axe leia cor interpolada.
    await freezeVisualTransitions(page);

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
        axe: { run: (target: string, options: Record<string, unknown>) => Promise<AxeViolationResult>; _running?: boolean };
      }).axe;
      // O app roda @axe-core/react em DEV a cada commit do React sobre a MESMA instância global
      // `window.axe` que esta spec injeta. Como o laço de tema acima provoca commits, disparar a
      // nossa auditoria enquanto a dele roda falhava de forma intermitente no Firefox com
      // "Axe is already running". Esperar a instância ficar ociosa no MESMO frame síncrono que
      // dispara o nosso run torna o estado final determinístico, sem tocar em nenhuma asserção.
      while (axe._running) await new Promise(resolve => setTimeout(resolve, 25));
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
  await abrirEmail(page);
  const search = page.getByRole('textbox', { name: 'Busca global do Email' });
  // A lista mostra o resultado ANTERIOR até a busca chegar ao servidor (a espera curta de
  // 300 ms junta as teclas) e fica vazia enquanto a resposta não volta. Assertar antes disso
  // passava por dois motivos que não são "a lista filtrou": a lista antiga ainda na tela (com
  // o termo já digitado) e a lista vazia do carregamento. Era assim que este teste passava na
  // 1ª tentativa de forma intermitente nos PRs #1908/#1910. Esperar a resposta do termo
  // digitado prende as asserções ao resultado REAL da busca — sem `waitForTimeout` e sem
  // inflar teto de tempo.
  const respostaDaBusca = page.waitForResponse(response =>
    response.url().includes('/rest/v1/email_threads') && response.url().includes('Sentry'));
  await search.fill('Sentry');
  await respostaDaBusca;
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
  await abrirEmail(page);
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
  await abrirEmail(page);
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
  await abrirEmail(page);
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
  await abrirEmail(page);
  await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  await page.getByRole('button', { name: 'Detalhes' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('Empresa Exemplo', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Cliente', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Fornecedor', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /abrir site da empresa/i })).toHaveAttribute('href', 'https://empresa.example.test/catalogo?origem=email#sobre');
  await expect(drawer.getByRole('link', { name: /abrir linkedin da empresa/i })).toBeVisible();
  await expect(drawer.getByRole('link', { name: /abrir instagram da empresa/i })).toBeVisible();
  // A gaveta entra deslizando por animação CSS (Sheet data-[state=open]:slide-in-from-right,
  // 500 ms). Medir o botão antes do fim/freeze da animação lia uma posição intermediária
  // (x + largura > 320) e derrubava o teste de forma intermitente. Congelar as transições ANTES
  // da medição fixa a posição final da gaveta; o congelamento segue valendo para a aferição do axe.
  await freezeVisualTransitions(page);
  const close = await drawer.getByRole('button', { name: 'Fechar detalhes' }).boundingBox();
  expect(close && close.x >= 0 && close.x + close.width <= 320).toBeTruthy();
  await page.addScriptTag({ path: join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as Window & {
      axe: { run: (target: string, options: Record<string, unknown>) => Promise<AxeViolationResult>; _running?: boolean };
    }).axe;
    // O app roda @axe-core/react em DEV sobre a MESMA instancia global `window.axe` desta
    // spec: esperar a instancia ficar livre no mesmo frame que dispara o nosso run evita o
    // "Axe is already running" intermitente, sem mexer em nenhuma assercao.
    while (axe._running) await new Promise(resolve => setTimeout(resolve, 25));
    return (await axe.run('[role="dialog"]', {})).violations.map(violation => violation.id);
  });
  expect(violations).toEqual([]);
});

test('escolha explícita CRM não vincula automaticamente e resolve a empresa selecionada', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await abrirEmail(page);
  await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  await expect(page.getByRole('region', { name: 'Escolher empresa CRM' })).toBeVisible();
  await page.getByRole('button', { name: 'Empresa Exemplo' }).click();
  await expect(page.getByText('Empresa Exemplo', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vincular empresa ao contato' })).toBeVisible();
});

test('escolha explícita CRM envia o vínculo somente após confirmação e reflete a persistência', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await abrirEmail(page);
  await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  await page.getByRole('button', { name: 'Outra Empresa' }).click();
  await expect(page.getByText('Outra Empresa', { exact: true })).toBeVisible();
  const linkResponse = page.waitForResponse(response => {
    if (!response.url().includes('/functions/v1/crm-integration')) return false;
    const body = response.request().postDataJSON() as { action?: string; externalContactId?: string };
    return body.action === 'linkEmailContactCompany' && body.externalContactId === 'crm-contact-other';
  });
  await page.getByRole('button', { name: 'Vincular empresa ao contato' }).click();
  await linkResponse;
  await expect(page.getByText('Empresa vinculada', { exact: true })).toBeVisible();
});

test('escolha explícita CRM funciona para conversa sem contato local e não oferece vínculo persistente', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await abrirEmail(page);
  await page.getByText('Alerta sobre término da cotação').click();
  await expect(page.getByRole('region', { name: 'Escolher empresa CRM' })).toBeVisible();
  await page.getByRole('button', { name: 'Outra Empresa' }).click();
  await expect(page.getByText('Outra Empresa', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vincular empresa ao contato' })).toHaveCount(0);
});

test('CRM desativado não simula empresa ausente', async ({ page }) => {
  await abrirEmail(page);
  await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  await expect(page.getByText(/integração crm desativada/i)).toBeVisible();
});

test('CRM sem permissão informa a restrição sem expor dados da empresa', async ({ page }) => {
  await abrirEmail(page);
  await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  await expect(page.getByText(/não tem permissão para consultar os dados empresariais/i)).toBeVisible();
  await expect(page.getByText('Empresa Exemplo', { exact: true })).toHaveCount(0);
});

test('marcadores Gmail reais podem ser gerenciados sem envio externo real', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await abrirEmail(page);
  await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  await page.getByRole('button', { name: 'Gerenciar marcadores' }).click();
  const label = page.getByRole('menuitemcheckbox', { name: 'Clientes importantes' });
  await expect(label).toBeVisible();
  await label.click();
});

test('editor WYSIWYG aplica formatação, link e histórico de desfazer sem execCommand', async ({ page }) => {
  await abrirEmail(page);
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
  await abrirEmail(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.getByRole('heading', { name: 'Email', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nova mensagem' }).first()).toBeVisible();
  const firstThreadButton = page.getByText('Preview deployment failed for departamento-pessoal-v3').first().locator('xpath=ancestor::button');
  await firstThreadButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Detalhes' })).toBeVisible();
  // O zoom É o cenário da medição abaixo: se ele tiver se perdido (um reload disparado por chunk
  // error repõe o app do zero e o tema do app regrava o `style` do `<html>`), o overflow mediria
  // uma tela sem 200% e passaria em falso. O zoom entra DEPOIS do boot (`abrirEmail`), e não por
  // `addInitScript`: no init script o `<html>` ainda não existe (`document.documentElement === null`).
  expect(await page.evaluate(() => document.documentElement.style.fontSize)).toBe('200%');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});

test('rascunho e referência de anexo permanecem isolados no ciclo conta A → B → A', async ({ page }) => {
  await abrirEmail(page);
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
  await abrirEmail(page);
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
  await abrirEmail(page);
  await expect(page.getByRole('heading', { name: 'Email', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/high-contrast/);
  await expect(page.locator('html')).toHaveClass(/reduced-motion/);
  // As classes acima existem já no PRIMEIRO paint (script inline do index.html), então não provam
  // que o app terminou o boot: o `initializeTheme` do React reaplica o tema com transição de 300 ms
  // e, sem esperar ela fechar, o axe lia a cor INTERPOLADA da troca — medido no cartão t_c13c7283:
  // 148 violações falsas de `color-contrast` com texto rgb(24, 24, 24) sobre rgb(0, 0, 0).
  // O `freezeVisualTransitions` abaixo NÃO resolve isso: `html.theme-transitioning *` é mais
  // específico e vence o `*` dele. Espera o tema ASSENTADO — a mesma checagem que o teste de tokens
  // acima usa antes de medir — e só então congela e mede.
  await waitForAppliedTheme(page, 'dark');
  await freezeVisualTransitions(page);
  await page.addScriptTag({ path: join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as Window & { axe: { run: (target: string) => Promise<AxeViolationResult>; _running?: boolean } }).axe;
    // O app roda @axe-core/react em DEV sobre a MESMA instancia global `window.axe` desta
    // spec: esperar a instancia ficar livre no mesmo frame que dispara o nosso run evita o
    // "Axe is already running" intermitente, sem mexer em nenhuma assercao.
    while (axe._running) await new Promise(resolve => setTimeout(resolve, 25));
    return (await axe.run('.email-workspace')).violations.map(item => ({
      id: item.id,
      impact: item.impact,
      nodes: item.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })),
    }));
  });
  expect(violations).toEqual([]);
});

test('workspace do Email é desmontado ao alternar entre módulos', async ({ page }) => {
  await abrirEmail(page);
  await expect(page.locator('.email-workspace')).toHaveCount(1);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page).toHaveURL(/view=dashboard/);
  await expect(page.locator('.email-workspace')).toHaveCount(0);
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await expect(page.locator('.email-workspace')).toHaveCount(1);
});

test('consumidor Omnichannel incorpora Email sem duplicar o cabeçalho autônomo', async ({ page }) => {
  await page.goto('/?view=omni-inbox');
  // Mesma espera de prontidão da tela de Email, com o teto que o app conhece: a view do Omni
  // também chega por chunk lazy e a aba só existe depois do boot.
  await expect(page.getByRole('tab', { name: 'Email Chat' })).toBeVisible({ timeout: BOOT_DEADLINE_MS });
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
    await abrirEmail(page);
    await expect(page.getByRole('heading', { name: 'Email', exact: true })).toBeVisible();
    await expect(page.getByText('Preview deployment failed for departamento-pessoal-v3').first()).toBeVisible();
    await page.waitForTimeout(400);
    await clearTransientToasts(page);
    await page.screenshot({ path: join(output, `${viewport.name}.png`), fullPage: true, animations: 'disabled' });
  });
}
