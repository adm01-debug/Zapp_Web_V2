# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: email-navy-visual.spec.ts >> rota real renderiza lista, conversa e compositor com o tema do sistema sem chamadas externas mutáveis
- Location: e2e/email-navy-visual.spec.ts:41:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Email', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: 'Email', exact: true }) with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Email', exact: true })

```

```yaml
- navigation "Links de navegação rápida":
  - link "Pular para conteúdo principal":
    - /url: "#main-content"
- status
- region "Notifications (F8)":
  - list
- region "Notifications alt+T":
  - list:
    - listitem:
      - button "Close toast"
      - text: Erro ao conectar ao servidor SIP. Verifique sua sessão e tente novamente.
- main "Acesso à plataforma":
  - text: ZAPP Web · v2 · Online
  - heading "O centro de comando do atendimento moderno." [level=1]
  - paragraph: Uma plataforma para conversar, automatizar e mensurar — sem trocar de aba, sem perder o cliente.
  - list:
    - listitem:
      - text: "01"
      - heading "Inbox omnichannel" [level=2]
      - paragraph: WhatsApp, Email, Voz e Web em uma única caixa, com SLA e filas inteligentes.
    - listitem:
      - text: "02"
      - heading "IA que responde por você" [level=2]
      - paragraph: Sugestões, resumos e atendimento autônomo treinados na sua operação.
    - listitem:
      - text: "03"
      - heading "Segurança corporativa" [level=2]
      - paragraph: Criptografia, MFA, RLS estrita e auditoria completa de cada conversa.
    - listitem
  - text: 10k+ Times ativos 1.4M Msgs / dia 99.9% Uptime < 30s Resposta ZAPP Web Suite v2 Seguro
  - heading "Bem-vindo de volta" [level=2]
  - paragraph: Acesse seu painel e continue de onde parou.
  - tablist:
    - tab "Entrar" [selected]
    - tab "Criar Conta"
  - tabpanel "Entrar":
    - text: Email
    - textbox "Email":
      - /placeholder: seu@email.com
    - text: Senha
    - textbox "Senha":
      - /placeholder: ••••••••
    - button "Mostrar senha"
    - link "Esqueci minha senha":
      - /url: /forgot-password
    - button "Entrar"
    - text: ou continue com
    - button "Google":
      - img
      - text: Google
    - text: Conexão criptografada SOC 2 · LGPD · 99.9% SLA
  - paragraph: © 2026 ZAPP Web · Todos os direitos reservados
- region "Notificações"
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | import { mkdirSync } from 'node:fs';
  3   | import { join } from 'node:path';
  4   | import { mockEmailNavy } from './fixtures/email-navy';
  5   | 
  6   | const output = join(import.meta.dirname, 'email-navy-visual');
  7   | 
  8   | async function clearTransientToasts(page: import('@playwright/test').Page) {
  9   |   await page.locator('[data-sonner-toast]').evaluateAll(toasts => toasts.forEach(toast => toast.remove()));
  10  | }
  11  | 
  12  | /**
  13  |  * O tema global anima a troca de variáveis de cor. Para a aferição estática do
  14  |  * axe, uma cor interpolada não representa o estado que o usuário recebe ao
  15  |  * final da troca e pode gerar falsos contrastes no WebKit.
  16  |  */
  17  | async function freezeVisualTransitions(page: import('@playwright/test').Page) {
  18  |   await page.addStyleTag({
  19  |     content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  20  |   });
  21  | }
  22  | 
  23  | interface AxeViolationResult {
  24  |   violations: Array<{
  25  |     id: string;
  26  |     impact: string | null;
  27  |     nodes: Array<{ target: string[]; failureSummary?: string }>;
  28  |   }>;
  29  | }
  30  | 
  31  | test.beforeEach(async ({ page }, testInfo) => {
  32  |   await page.addInitScript(() => { (window as Window & { __BOOT_DEADLINE_MS?: number }).__BOOT_DEADLINE_MS = 60000; });
  33  |   await mockEmailNavy(page, {
  34  |     includeExtreme: testInfo.title.includes('corpus extremo'),
  35  |     crmContext: testInfo.title.includes('CRM completo') ? 'available'
  36  |       : testInfo.title.includes('escolha explícita CRM') ? 'ambiguous'
  37  |         : testInfo.title.includes('CRM sem permissão') ? 'permission_denied' : undefined,
  38  |   });
  39  | });
  40  | 
  41  | test('rota real renderiza lista, conversa e compositor com o tema do sistema sem chamadas externas mutáveis', async ({ page }) => {
  42  |   mkdirSync(output, { recursive: true });
  43  |   await page.goto('/?view=email-chat');
> 44  |   await expect(page.getByRole('heading', { name: 'Email', exact: true })).toBeVisible();
      |                                                                           ^ Error: expect(locator).toBeVisible() failed
  45  |   await expect(page.getByText('Preview deployment failed for departamento-pessoal-v3').first()).toBeVisible();
  46  |   await page.waitForTimeout(400);
  47  |   await clearTransientToasts(page);
  48  |   await page.screenshot({ path: join(output, '01-lista.png'), fullPage: true, animations: 'disabled' });
  49  | 
  50  |   await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  51  |   await expect(page).toHaveURL(/emailThread=20000000-0000-4000-8000-000000000001/);
  52  |   await expect(page.getByText('deployment-log.txt').first()).toBeVisible();
  53  |   await expect(page.getByText('Obrigado pelo aviso. Já estou verificando')).toBeVisible();
  54  |   await clearTransientToasts(page);
  55  |   await page.screenshot({ path: join(output, '02-conversa.png'), fullPage: true, animations: 'disabled' });
  56  | 
  57  |   await page.getByRole('button', { name: 'Nova mensagem' }).first().click();
  58  |   await expect(page.getByPlaceholder('destinatario@email.com')).toBeVisible();
  59  |   const composerRoot = page.getByText('Nova mensagem', { exact: true }).last().locator('xpath=ancestor::*[contains(@class,"fixed")]');
  60  |   await expect(composerRoot.getByRole('button', { name: 'Descartar' })).toBeVisible();
  61  |   await expect(composerRoot.getByRole('button', { name: 'Enviar', exact: true })).toBeVisible();
  62  |   const composer = await composerRoot.boundingBox();
  63  |   const viewport = page.viewportSize();
  64  |   expect(composer && viewport && composer.y >= 0 && composer.y + composer.height <= viewport.height + 1).toBeTruthy();
  65  |   const voiceFab = await page.getByRole('button', { name: 'Assistente de voz' }).boundingBox();
  66  |   expect(composer && voiceFab && (composer.x + composer.width <= voiceFab.x || voiceFab.x + voiceFab.width <= composer.x || composer.y + composer.height <= voiceFab.y || voiceFab.y + voiceFab.height <= composer.y)).toBeTruthy();
  67  |   await clearTransientToasts(page);
  68  |   await page.screenshot({ path: join(output, '03-compositor.png'), fullPage: true, animations: 'disabled' });
  69  | });
  70  | 
  71  | test('workspace do Email não introduz violações axe', async ({ page }) => {
  72  |   await page.goto('/?view=email-chat');
  73  |   await expect(page.getByRole('heading', { name: 'Email', exact: true })).toBeVisible();
  74  |   await freezeVisualTransitions(page);
  75  |   await page.waitForTimeout(400);
  76  |   await page.addScriptTag({ path: join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  77  |   const violations = await page.evaluate(async () => {
  78  |     const axe = (window as unknown as Window & {
  79  |       axe: { run: (target: string, options: Record<string, unknown>) => Promise<AxeViolationResult> };
  80  |     }).axe;
  81  |     const result = await axe.run('.email-workspace', {
  82  |       rules: {
  83  |         'color-contrast': { enabled: true },
  84  |       },
  85  |     });
  86  |     return result.violations.map(violation => ({
  87  |       id: violation.id,
  88  |       impact: violation.impact,
  89  |       nodes: violation.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })),
  90  |     }));
  91  |   });
  92  |   expect(violations).toEqual([]);
  93  | });
  94  | 
  95  | test('superfícies do Email herdam os mesmos tokens do sistema em claro e escuro', async ({ page }) => {
  96  |   mkdirSync(output, { recursive: true });
  97  |   await page.goto('/?view=email-chat');
  98  |   await expect(page.getByTestId('email-workspace')).toBeVisible();
  99  |   await freezeVisualTransitions(page);
  100 |   await page.addScriptTag({ path: join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  101 | 
  102 |   for (const mode of ['light', 'dark'] as const) {
  103 |     const themeToggle = page.getByRole('button', { name: mode === 'light' ? 'Modo claro' : 'Modo escuro' });
  104 |     if (await themeToggle.count()) await themeToggle.click();
  105 |     await expect(page.locator('html')).toHaveClass(new RegExp(`(?:^|\\s)${mode}(?:\\s|$)`));
  106 |     await page.waitForTimeout(400); // aguarda a transição global de tema (300 ms)
  107 | 
  108 |     const colors = await page.evaluate(() => {
  109 |       const resolveBackground = (className: string) => {
  110 |         const probe = document.createElement('div');
  111 |         probe.className = className;
  112 |         document.body.appendChild(probe);
  113 |         const color = getComputedStyle(probe).backgroundColor;
  114 |         probe.remove();
  115 |         return color;
  116 |       };
  117 |       const background = resolveBackground('bg-background');
  118 |       const inboxPanel = resolveBackground('bg-inbox-panel');
  119 |       const colorOf = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`) as HTMLElement).backgroundColor;
  120 | 
  121 |       return {
  122 |         background,
  123 |         inboxPanel,
  124 |         workspace: colorOf('email-workspace'),
  125 |         header: colorOf('email-header'),
  126 |         threadList: colorOf('email-thread-list'),
  127 |         conversation: colorOf('email-conversation'),
  128 |       };
  129 |     });
  130 | 
  131 |     expect(colors.workspace, `${mode}: workspace`).toBe(colors.background);
  132 |     expect(colors.conversation, `${mode}: conversation`).toBe(colors.background);
  133 |     expect(colors.header, `${mode}: header`).toBe(colors.inboxPanel);
  134 |     expect(colors.threadList, `${mode}: thread list`).toBe(colors.inboxPanel);
  135 | 
  136 |     const contrastViolations = await page.evaluate(async () => {
  137 |       const axe = (window as unknown as Window & {
  138 |         axe: { run: (target: string, options: Record<string, unknown>) => Promise<AxeViolationResult> };
  139 |       }).axe;
  140 |       const result = await axe.run('.email-workspace', { rules: { 'color-contrast': { enabled: true } } });
  141 |       return result.violations.filter(violation => violation.id === 'color-contrast').map(violation => ({
  142 |         id: violation.id,
  143 |         nodes: violation.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })),
  144 |       }));
```