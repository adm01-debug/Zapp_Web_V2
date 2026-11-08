import { test, expect, type Locator, type Page } from '@playwright/test';

import { bloquearRedeReal, json, mockAppShell, querObjetoUnico, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession } from './fixtures/talkx-demo';

/**
 * Busca global (⌘K/Ctrl+K), paleta de comandos e atalhos — E2E de ponta a ponta.
 *
 * Sessão FALSA (`installFakeSession`) + backend do app shell mockado (`mockAppShell`)
 * + `bloquearRedeReal`: a spec não usa sessão salva (`e2e/.auth`), não usa credencial
 * e não fala com o Supabase — o que ela exercita é o app REAL (bundle servido pelo
 * vite) com a rede dublada na fronteira. Mesmo desenho de
 * `e2e/onboarding-dispensar.spec.ts` e `e2e/talkx-visual.spec.ts`.
 *
 * Contrato do caminho atual exercitado abaixo:
 *   - Ctrl+K alterna o estado no `GlobalKeyboardProvider`, antes de carregar o
 *     `CommandPaletteHost` e `src/components/ui/command-palette.tsx`;
 *   - o diálogo "Paleta de comandos" mostra cinco acessos rápidos sem consulta,
 *     pesquisa os módulos permitidos, anda com as setas e navega no Enter;
 *   - a mesma paleta consulta contatos por `ContactService.searchContacts` e
 *     abre o UUID escolhido pelo consumidor real da Inbox; a RPC e a sessão
 *     continuam dubladas, sem alegação de RLS real.
 *
 * Locators por papel/rótulo; cada teste navega por conta própria (sem estado
 * compartilhado) e nenhum deles depende de dado semeado em banco: o backend é dublado.
 */

test.use({ storageState: { cookies: [], origins: [] } });

// O vite frio compila o app inteiro na primeira navegação: o padrão de 30s do
// Playwright reprova por tempo de build, não por comportamento (mesmo ajuste de
// `onboarding-dispensar.spec.ts`).
test.setTimeout(120_000);

const PALETA = 'Paleta de comandos';
const CAMPO_PALETA = 'Buscar comandos';

/**
 * Abre a paleta pelo CAMINHO PEDIDO (atalho ou clique) e devolve o diálogo.
 *
 * O provider eager guarda a intenção enquanto o host lazy carrega. Repetir Ctrl+K
 * alternaria esse estado e poderia fechar a paleta antes de ela aparecer. Só a
 * espera se repete, preservando os prazos existentes e a condição de visibilidade.
 */
async function abrirPaleta(page: Page, abrir: () => Promise<void>): Promise<Locator> {
  const paleta = page.getByRole('dialog', { name: PALETA });
  await abrir();
  for (let tentativa = 0; tentativa < 12; tentativa++) {
    try {
      await expect(paleta).toBeVisible({ timeout: 1_000 });
      return paleta;
    } catch {
      // Aguarda a mesma intenção de abertura, sem outro atalho ou clique.
    }
  }
  await expect(paleta).toBeVisible();
  return paleta;
}

const porAtalho = (page: Page) => abrirPaleta(page, () => page.keyboard.press('Control+k'));

/** Overlay de boot do index.html: com o dev server frio o React 19 pode passar de 8s. */
async function semWatchdogDeBoot(page: Page) {
  await page.addInitScript(() => {
    (window as Window & { __BOOT_DEADLINE_MS?: number }).__BOOT_DEADLINE_MS = 60_000;
  });
}

async function abrirInbox(page: Page) {
  await page.goto('/?view=inbox');
  // A coluna de conversas é o marco de "app shell pronto" (a paleta depende do
  // provider global de teclado, montado acima do shell).
  await expect(page.getByPlaceholder('Buscar conversas…')).toBeVisible({ timeout: 60_000 });
}

const CONTATOS_PALETA = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: '[E2E] Contato de teste', phone: '5511999900011', company: 'Empresa A',
    surname: null, nickname: null, email: null, avatar_url: null, tags: [],
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    assigned_to: null, queue_id: null, conversation_status: 'open', channel_type: 'whatsapp',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: '[E2E] Contato de teste', phone: '5511999900022', company: 'Empresa B',
    surname: null, nickname: null, email: null, avatar_url: null, tags: [],
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    assigned_to: null, queue_id: null, conversation_status: 'open', channel_type: 'whatsapp',
  },
];

/** Só a fronteira HTTP é dublada; a paleta, o serviço e o consumidor da Inbox são reais. */
async function mockarBuscaContatos(page: Page) {
  await page.route(/\/rest\/v1\/rpc\/search_contacts(?:\?|$)/, (route) => {
    expect(route.request().method()).toBe('POST');
    const args = route.request().postDataJSON();
    expect(args).toMatchObject({ page_size: 8, page_offset: 0, sort_field: 'name', sort_direction: 'asc' });
    expect(args.include_legacy).toBeUndefined();
    return json(route, args.search_term === '[E2E]' ? CONTATOS_PALETA : []);
  });
  await page.route(/\/rest\/v1\/contacts(?:\?|$)/, (route) => {
    const request = route.request();
    const id = new URL(request.url()).searchParams.get('id');
    // A lista fica vazia: só a leitura por ID da seleção correta abre o chat.
    if (request.method() === 'GET' && id === 'eq.' + CONTATOS_PALETA[1].id) {
      return json(route, querObjetoUnico(route) ? CONTATOS_PALETA[1] : [CONTATOS_PALETA[1]]);
    }
    return json(route, []);
  });
}

test.describe('Busca global (Ctrl+K) — paleta de comandos e atalhos', () => {
  let registro: Registro;

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    await semWatchdogDeBoot(page);
    // O guarda entra ANTES dos mocks: o Playwright casa na ordem inversa e ele
    // precisa ser o ÚLTIMO a ser considerado (só pega o que escapou).
    await bloquearRedeReal(page, registro);
    await mockAppShell(page, registro);
    await installFakeSession(page);
    // Leituras da tela: sem rota própria elas caem no guarda de rede (o catch-all do
    // app shell exclui `contacts`/`messages` de propósito).
    await page.route(/\/rest\/v1\/contacts/, (route) => json(route, []));
    await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
  });

  test.afterEach(() => {
    // Prova de que a spec é hermética: nada escapou para a rede real.
    expect(registro.redeBarrada).toEqual([]);
  });

  test('Ctrl+K abre a paleta, foca o campo e pesquisa as telas do sistema', async ({ page }) => {
    await abrirInbox(page);

    // Pré-condição: fechada antes do atalho (senão "abriu" não significa nada).
    await expect(page.getByRole('dialog', { name: PALETA })).toHaveCount(0);

    const paleta = await porAtalho(page);

    // O foco vai para o campo de busca: é o que permite digitar direto.
    const campo = paleta.getByRole('combobox', { name: CAMPO_PALETA, exact: true });
    await expect(campo).toBeFocused();
    // Sem consulta, o host atual exibe os cinco primeiros módulos permitidos.
    await expect(paleta.getByRole('option')).toHaveCount(5);
    for (const tela of ['Chat', 'Teams', 'Email', 'Contatos', 'Multiplix']) {
      await expect(paleta.getByRole('option', { name: new RegExp(`^${tela}\\b`) })).toBeVisible();
    }
    // As quatro telas continuam exigidas; cada busca pode alcançar todo o registry.
    for (const tela of ['Chat', 'Contatos', 'Dashboard', 'Configurações']) {
      await campo.fill(tela);
      await expect(paleta.getByRole('option', { name: new RegExp(`^${tela}\\b`) })).toBeVisible();
    }
  });

  test('a busca filtra as telas e o Enter navega para a tela escolhida', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);
    const campo = paleta.getByRole('combobox', { name: CAMPO_PALETA, exact: true });
    await expect(campo).toBeFocused();

    await campo.fill('dashboard');

    // A busca encontra a tela escolhida e retira o acesso rápido que não casa.
    await expect(paleta.getByRole('option', { name: /Dashboard/ })).toBeVisible();
    await expect(paleta.getByRole('option', { name: /^Chat\b/ })).toHaveCount(0);

    await campo.press('Enter');

    await expect(paleta).toHaveCount(0);
    // A navegação é a do app (`useNavigationHistory`): a URL canônica muda.
    await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('dashboard');
  });

  test('as setas movem a seleção e o Enter dispara o item destacado', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);
    await expect(paleta.getByRole('combobox', { name: CAMPO_PALETA, exact: true })).toBeFocused();

    // Sem consulta, a lista é a de telas na ordem do registry: o 1º é "Chat".
    const selecionado = paleta.getByRole('option', { selected: true });
    await expect(selecionado).toHaveAccessibleName(/^Chat\b/);

    await page.keyboard.press('ArrowDown');
    await expect(selecionado).toHaveAccessibleName(/^Teams\b/);
    await page.keyboard.press('ArrowDown');
    await expect(selecionado).toHaveAccessibleName(/^Email\b/);
    await page.keyboard.press('ArrowUp');
    await expect(selecionado).toHaveAccessibleName(/^Teams\b/);

    await page.keyboard.press('Enter');
    await expect(paleta).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('team-chat');
  });

  test('termo sem correspondência mostra o estado vazio', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);

    await paleta.getByRole('combobox', { name: CAMPO_PALETA, exact: true }).fill('zzzznadaaqui');

    await expect(paleta.getByText('Nenhum resultado para "zzzznadaaqui"', { exact: true })).toBeVisible();
    await expect(paleta.getByRole('option')).toHaveCount(0);
  });

  test('Esc fecha a paleta', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);
    await expect(paleta.getByRole('combobox', { name: CAMPO_PALETA, exact: true })).toBeFocused();

    await page.keyboard.press('Escape');

    // O fechamento e a devolução de foco têm regressões separadas; o caso
    // "Esc devolve o foco ao elemento de origem" conserva a prova do retorno.
    await expect(paleta).toHaveCount(0);
  });

  test('Ctrl+/ abre a ajuda de atalhos com os atalhos principais do registry', async ({ page }) => {
    await abrirInbox(page);

    await page.keyboard.press('Control+/');

    const ajuda = page.getByRole('dialog', { name: 'Atalhos de Teclado' });
    await expect(ajuda).toBeVisible();
    // Cada linha do painel é "nome do atalho" + as teclas, lidas de
    // `src/hooks/shortcuts/defaultShortcuts.ts`. O texto sai colado no DOM
    // ("Busca globalCtrl+k"): o `+` é um span entre as teclas.
    for (const [nome, teclas] of [
      ['Busca global', ['Ctrl', 'k']],
      ['Alternar barra lateral', ['Ctrl', 'b']],
      ['Ajuda de atalhos', ['Ctrl', '/']],
    ] as const) {
      const esperado = new RegExp(`${nome}\\s*${teclas.join('\\s*\\+?\\s*')}`);
      await expect(ajuda).toContainText(esperado);
    }

    await page.keyboard.press('Escape');
    await expect(ajuda).toHaveCount(0);
  });

  test.describe('celular 390x844', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('o botão Buscar do cabeçalho abre a mesma paleta e ela navega', async ({ page }) => {
      await abrirInbox(page);

      // O botão do MobileHeader despacha `open-global-search` — o mesmo comando do
      // atalho de teclado (R2-PLAT-010).
      const buscar = page.getByRole('button', { name: 'Buscar' });
      const paleta = await abrirPaleta(page, () => buscar.click());

      const campo = paleta.getByRole('combobox', { name: CAMPO_PALETA, exact: true });
      await expect(campo).toBeFocused();

      // A paleta não pode estourar a largura da viewport de 390px.
      const caixa = await paleta.boundingBox();
      expect(caixa).not.toBeNull();
      expect(caixa!.x).toBeGreaterThanOrEqual(0);
      expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(390 + 1);

      await campo.fill('contatos');
      await campo.press('Enter');
      await expect(paleta).toHaveCount(0);
      await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('contacts');
    });
  });

  /**
   * Contrato com sessão/API mockadas: a RPC termina, dois homônimos aparecem e
   * o consumidor real da Inbox busca o UUID escolhido antes de montar o chat.
   * Isto não constitui evidência de Auth/RLS real.
   */
  for (const origin of ['inbox', 'dashboard'] as const) {
    test('a busca global abre o segundo contato homônimo a partir de ' + origin, async ({ page }) => {
      await mockarBuscaContatos(page);
      await abrirInbox(page);
      await expect(page.getByTestId('chat-header-more-actions')).toHaveCount(0);
      if (origin === 'dashboard') {
        const navigation = await porAtalho(page);
        await navigation.getByRole('combobox', { name: CAMPO_PALETA, exact: true }).fill('dashboard');
        await navigation.getByRole('option', { name: /Dashboard/ }).click();
        await expect(navigation).toHaveCount(0);
        await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('dashboard');
      }

      const paleta = await porAtalho(page);
      const campo = paleta.getByRole('combobox', { name: CAMPO_PALETA, exact: true });
      const searched = page.waitForResponse((response) =>
        new URL(response.url()).pathname === '/rest/v1/rpc/search_contacts' &&
        response.request().method() === 'POST' &&
        response.request().postDataJSON()?.search_term === '[E2E]');
      await campo.fill('[E2E]');
      const searchResponse = await searched;
      expect(searchResponse.status()).toBe(200);
      expect(await searchResponse.finished()).toBeNull();
      expect(await searchResponse.json()).toEqual(CONTATOS_PALETA);

      await expect(paleta.getByRole('option')).toHaveCount(2);
      const first = paleta.locator('#cmd-opt-contact-' + CONTATOS_PALETA[0].id);
      const second = paleta.locator('#cmd-opt-contact-' + CONTATOS_PALETA[1].id);
      await expect(first).toContainText(CONTATOS_PALETA[0].name);
      await expect(second).toContainText(CONTATOS_PALETA[1].name);
      await expect(second).toContainText(CONTATOS_PALETA[1].phone);
      const selectedContact = page.waitForResponse((response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname === '/rest/v1/contacts' &&
        new URL(response.url()).searchParams.get('id') === 'eq.' + CONTATOS_PALETA[1].id);
      if (origin === 'dashboard') {
        await expect(first).toHaveAttribute('aria-selected', 'true');
        await campo.press('ArrowDown');
        await expect(second).toHaveAttribute('aria-selected', 'true');
        await campo.press('Enter');
      } else {
        await second.click();
      }

      const contactResponse = await selectedContact;
      expect(contactResponse.status()).toBe(200);
      expect(await contactResponse.finished()).toBeNull();
      const contactBody = await contactResponse.json();
      expect(Array.isArray(contactBody) ? contactBody : [contactBody]).toEqual([CONTATOS_PALETA[1]]);
      await expect(paleta).toHaveCount(0);
      await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('inbox');
      await expect(page.getByTestId('chat-header-more-actions')).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: CONTATOS_PALETA[1].name, exact: true })).toBeVisible();
    });
  }

  /**
   * Regressão do primeiro atalho: o provider eager mantém a intenção de abertura
   * enquanto CommandPaletteHost carrega. Um único Ctrl+K deve tornar o diálogo
   * visível, sem repetir o atalho.
   */
  test('o primeiro Ctrl+K logo após carregar a tela já abre a paleta', async ({ page }) => {
    await abrirInbox(page);
    await page.keyboard.press('Control+k');

    await expect(page.getByRole('dialog', { name: PALETA })).toBeVisible();
  });

  /**
   * Regressão da alternância: o provider sobrescreve global-search e alterna o
   * estado com atualização funcional. A captura consome a tecla; o Ctrl+K
   * seguinte deve fechar a paleta sem outra alternância no bubble.
   */
  test('o Ctrl+K seguinte fecha a paleta aberta (alterna)', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);
    await expect(paleta).toBeVisible();

    await page.keyboard.press('Control+k');

    await expect(paleta).toHaveCount(0);
  });

  /**
   * A paleta abre sem DialogTrigger. Seu handler local conserva o foco externo
   * anterior e o restaura no fechamento sem comando, se a origem continua válida
   * e nenhum outro destino recebeu foco. O corpo mantém a prova pelo campo real
   * de conversas, pelo foco no combobox aberto e pelo retorno depois de Escape.
   */
  test('Esc devolve o foco ao elemento de origem', async ({ page }) => {
    await abrirInbox(page);
    const origem = page.getByPlaceholder('Buscar conversas…');
    await origem.click();
    await expect(origem).toBeFocused();

    const paleta = await porAtalho(page);
    await expect(paleta.getByRole('combobox', { name: CAMPO_PALETA, exact: true })).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(paleta).toHaveCount(0);
    await expect(origem).toBeFocused();
  });
});
