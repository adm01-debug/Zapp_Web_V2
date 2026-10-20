# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: email-navy-visual.spec.ts >> busca, ajuda e foco do diálogo funcionam por teclado
- Location: e2e/email-navy-visual.spec.ts:152:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('textbox', { name: 'Busca global do Email' })

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - navigation "Links de navegação rápida":
    - link "Pular para conteúdo principal" [ref=e3] [cursor=pointer]:
      - /url: "#main-content"
  - status [ref=e12]
  - region "Notifications (F8)":
    - list
  - region "Notifications alt+T"
  - main "Acesso à plataforma" [ref=e14]:
    - generic [ref=e16]:
      - generic [ref=e17]: ZAPP Web · v2 · Online
      - generic [ref=e22]:
        - heading "O centro de comando do atendimento moderno." [level=1] [ref=e23]
        - paragraph [ref=e24]: Uma plataforma para conversar, automatizar e mensurar — sem trocar de aba, sem perder o cliente.
      - list [ref=e25]:
        - listitem [ref=e26]:
          - generic [ref=e27]:
            - generic [ref=e28]: "01"
            - generic [ref=e33]:
              - heading "Inbox omnichannel" [level=2] [ref=e34]
              - paragraph [ref=e35]: WhatsApp, Email, Voz e Web em uma única caixa, com SLA e filas inteligentes.
        - listitem [ref=e36]:
          - generic [ref=e37]:
            - generic [ref=e38]: "02"
            - generic [ref=e43]:
              - heading "IA que responde por você" [level=2] [ref=e44]
              - paragraph [ref=e45]: Sugestões, resumos e atendimento autônomo treinados na sua operação.
        - listitem [ref=e46]:
          - generic [ref=e47]:
            - generic [ref=e48]: "03"
            - generic [ref=e53]:
              - heading "Segurança corporativa" [level=2] [ref=e54]
              - paragraph [ref=e55]: Criptografia, MFA, RLS estrita e auditoria completa de cada conversa.
        - listitem [ref=e56]
      - generic [ref=e57]:
        - generic [ref=e58]:
          - generic [ref=e59]: 10k+
          - generic [ref=e60]: Times ativos
        - generic [ref=e61]:
          - generic [ref=e62]: 1.4M
          - generic [ref=e63]: Msgs / dia
        - generic [ref=e64]:
          - generic [ref=e65]: 99.9%
          - generic [ref=e66]: Uptime
        - generic [ref=e67]:
          - generic [ref=e68]: < 30s
          - generic [ref=e69]: Resposta
    - generic [ref=e71]:
      - generic [ref=e72]:
        - generic [ref=e78]:
          - generic [ref=e79]: ZAPP Web
          - generic [ref=e80]: Suite v2
        - generic [ref=e81]: Seguro
      - generic [ref=e86]:
        - heading "Bem-vindo de volta" [level=2] [ref=e87]
        - paragraph [ref=e88]: Acesse seu painel e continue de onde parou.
      - generic [ref=e91]:
        - tablist [ref=e93]:
          - tab "Entrar" [selected] [ref=e94] [cursor=pointer]
          - tab "Criar Conta" [ref=e95] [cursor=pointer]
        - tabpanel "Entrar" [ref=e97]:
          - generic [ref=e98]:
            - generic [ref=e99]:
              - text: Email
              - textbox "Email" [ref=e104]:
                - /placeholder: seu@email.com
            - generic [ref=e105]:
              - text: Senha
              - generic [ref=e106]:
                - textbox "Senha" [ref=e110]:
                  - /placeholder: ••••••••
                - button "Mostrar senha" [ref=e111] [cursor=pointer]
              - link "Esqueci minha senha" [ref=e113] [cursor=pointer]:
                - /url: /forgot-password
            - button "Entrar" [ref=e115] [cursor=pointer]
          - generic [ref=e118]:
            - generic [ref=e119]: ou continue com
            - button "Google" [ref=e124] [cursor=pointer]
          - generic [ref=e126]:
            - generic [ref=e127]: Conexão criptografada
            - generic [ref=e132]:
              - generic [ref=e133]: SOC 2
              - generic [ref=e134]: ·
              - generic [ref=e135]: LGPD
              - generic [ref=e136]: ·
              - generic [ref=e137]: 99.9% SLA
      - paragraph [ref=e138]: © 2026 ZAPP Web · Todos os direitos reservados
  - region "Notificações"
```

# Test source

```ts
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
  145 |     });
  146 |     expect(contrastViolations, `${mode}: contrast`).toEqual([]);
  147 |     await clearTransientToasts(page);
  148 |     await page.screenshot({ path: join(output, mode === 'light' ? '05-tema-claro.png' : '06-tema-escuro.png'), fullPage: true, animations: 'disabled' });
  149 |   }
  150 | });
  151 | 
  152 | test('busca, ajuda e foco do diálogo funcionam por teclado', async ({ page }) => {
  153 |   await page.goto('/?view=email-chat');
  154 |   const search = page.getByRole('textbox', { name: 'Busca global do Email' });
> 155 |   await search.fill('Sentry');
      |                ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  156 |   await expect(page.getByText('SENTRY-GREEN-BASKET-VQ — 2 new alerts')).toBeVisible();
  157 |   await expect(page.getByText('Preview deployment failed for departamento-pessoal-v3')).toBeHidden();
  158 | 
  159 |   const help = page.getByRole('button', { name: 'Ajuda' });
  160 |   await help.focus();
  161 |   await page.keyboard.press('Enter');
  162 |   await expect(page.getByRole('dialog')).toBeVisible();
  163 |   await page.keyboard.press('Escape');
  164 |   await expect(page.getByRole('dialog')).toBeHidden();
  165 |   await expect(help).toBeFocused();
  166 | });
  167 | 
  168 | test('ações históricas permanecem visíveis e acionáveis no touch', async ({ page }) => {
  169 |   await page.setViewportSize({ width: 390, height: 844 });
  170 |   await page.goto('/?view=email-chat');
  171 |   await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  172 |   await expect(page.getByRole('button', { name: 'Responder' }).first()).toBeVisible();
  173 |   await expect(page.getByRole('button', { name: 'Encaminhar' }).first()).toBeVisible();
  174 |   await page.getByRole('button', { name: 'Responder' }).first().focus();
  175 |   await page.keyboard.press('Enter');
  176 |   await expect(page.getByText(/Respondendo à mensagem de Vercel/)).toBeVisible();
  177 | });
  178 | 
  179 | test('sidebar expandida e recolhida preservam a composição do sistema', async ({ page }) => {
  180 |   await page.addInitScript(() => localStorage.setItem('zapp-sidebar-collapsed', 'false'));
  181 |   await page.setViewportSize({ width: 1672, height: 941 });
  182 |   await page.goto('/?view=email-chat');
  183 |   await expect(page.getByRole('button', { name: 'Recolher menu' })).toBeVisible();
  184 |   await expect(page.getByText('Comunicação profissional, organizada como uma conversa.')).toBeVisible();
  185 |   await clearTransientToasts(page);
  186 |   await page.screenshot({ path: join(output, '04-sidebar-expandida.png'), fullPage: true, animations: 'disabled' });
  187 |   await page.getByRole('button', { name: 'Recolher menu' }).click();
  188 |   await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible();
  189 |   await expect(page.getByText('Preview deployment failed for departamento-pessoal-v3').first()).toBeVisible();
  190 | });
  191 | 
  192 | test('painel contextual vira drawer intermediário e expõe dados reais', async ({ page }) => {
  193 |   await page.setViewportSize({ width: 1024, height: 768 });
  194 |   await page.goto('/?view=email-chat');
  195 |   await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  196 |   await expect(page.getByRole('button', { name: 'Detalhes' })).toBeVisible();
  197 |   await page.getByRole('button', { name: 'Detalhes' }).click();
  198 |   const drawer = page.getByRole('dialog');
  199 |   await expect(drawer).toBeVisible();
  200 |   await expect(drawer.getByText('notifications@vercel.com').first()).toBeVisible();
  201 |   await expect(drawer.getByText('deployment-log.txt')).toBeVisible();
  202 |   await page.keyboard.press('Escape');
  203 |   await expect(drawer).toBeHidden();
  204 |   await expect(page.getByRole('button', { name: 'Detalhes' })).toBeFocused();
  205 | });
  206 | 
  207 | test('painel CRM completo preserva ações, acessibilidade e fechamento em 320 px', async ({ page }) => {
  208 |   await page.setViewportSize({ width: 320, height: 844 });
  209 |   await page.goto('/?view=email-chat');
  210 |   await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  211 |   await page.getByRole('button', { name: 'Detalhes' }).click();
  212 |   const drawer = page.getByRole('dialog');
  213 |   await expect(drawer.getByText('Empresa Exemplo', { exact: true })).toBeVisible();
  214 |   await expect(drawer.getByText('Cliente', { exact: true })).toBeVisible();
  215 |   await expect(drawer.getByText('Fornecedor', { exact: true })).toBeVisible();
  216 |   await expect(drawer.getByRole('link', { name: /abrir site da empresa/i })).toHaveAttribute('href', 'https://empresa.example.test/catalogo?origem=email#sobre');
  217 |   await expect(drawer.getByRole('link', { name: /abrir linkedin da empresa/i })).toBeVisible();
  218 |   await expect(drawer.getByRole('link', { name: /abrir instagram da empresa/i })).toBeVisible();
  219 |   // A gaveta desliza da direita ao abrir: medir o botão durante a animação o pega fora dos 320 px (falhava no runner do CI,
  220 |   // mais lento). Desliga as animações ANTES de medir e espera a posição assentar; a asserção em si é a mesma.
  221 |   await freezeVisualTransitions(page);
  222 |   const closeButton = drawer.getByRole('button', { name: 'Fechar detalhes' });
  223 |   await expect
  224 |     .poll(async () => {
  225 |       const close = await closeButton.boundingBox();
  226 |       return Boolean(close && close.x >= 0 && close.x + close.width <= 320);
  227 |     }, { message: 'o botão Fechar detalhes precisa caber nos 320 px', timeout: 5000 })
  228 |     .toBe(true);
  229 |   await page.addScriptTag({ path: join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  230 |   const violations = await page.evaluate(async () => (await (window as unknown as Window & { axe: { run: (target: string, options: Record<string, unknown>) => Promise<AxeViolationResult> } }).axe.run('[role="dialog"]', {})).violations.map(violation => violation.id));
  231 |   expect(violations).toEqual([]);
  232 | });
  233 | 
  234 | test('escolha explícita CRM não vincula automaticamente e resolve a empresa selecionada', async ({ page }) => {
  235 |   await page.setViewportSize({ width: 1280, height: 900 });
  236 |   await page.goto('/?view=email-chat');
  237 |   await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  238 |   await expect(page.getByRole('region', { name: 'Escolher empresa CRM' })).toBeVisible();
  239 |   await page.getByRole('button', { name: 'Empresa Exemplo' }).click();
  240 |   await expect(page.getByText('Empresa Exemplo', { exact: true })).toBeVisible();
  241 |   await expect(page.getByRole('button', { name: 'Vincular empresa ao contato' })).toBeVisible();
  242 | });
  243 | 
  244 | test('escolha explícita CRM envia o vínculo somente após confirmação e reflete a persistência', async ({ page }) => {
  245 |   await page.setViewportSize({ width: 1280, height: 900 });
  246 |   await page.goto('/?view=email-chat');
  247 |   await page.getByText('Preview deployment failed for departamento-pessoal-v3').first().click();
  248 |   await page.getByRole('button', { name: 'Outra Empresa' }).click();
  249 |   await expect(page.getByText('Outra Empresa', { exact: true })).toBeVisible();
  250 |   const linkResponse = page.waitForResponse(response => {
  251 |     if (!response.url().includes('/functions/v1/crm-integration')) return false;
  252 |     const body = response.request().postDataJSON() as { action?: string; externalContactId?: string };
  253 |     return body.action === 'linkEmailContactCompany' && body.externalContactId === 'crm-contact-other';
  254 |   });
  255 |   await page.getByRole('button', { name: 'Vincular empresa ao contato' }).click();
```