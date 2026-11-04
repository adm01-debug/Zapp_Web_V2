import { test, expect, type Locator, type Page } from '@playwright/test';

import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
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
 *   - a busca que consulta CONTATOS/mensagens (`src/components/inbox/GlobalSearch.tsx`,
 *     ligada a `Ctrl+K` por `useGlobalSearchShortcut`) NÃO abre por nenhum caminho —
 *     ver o primeiro `test.fixme` no fim do arquivo, com a causa raiz.
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
   * BUG (não corrigido neste cartão — só documentado): ⌘K/Ctrl+K abre apenas a busca
   * de TELAS. A busca que devolve CONTATOS existe, se anuncia com "Pressione Ctrl+K
   * para abrir a busca" (`src/components/inbox/GlobalSearch.tsx`, título acessível
   * "Busca de mensagens", consulta `contacts`/`messages` em
   * `src/components/inbox/useGlobalSearchData.ts`) e pede o atalho em
   * `src/hooks/ui/useGlobalSearchShortcut.ts` — mas nunca abre:
   *
   *  1. `useGlobalKeyboardShortcuts` (captura em `window`) casa `Ctrl+K` com a ação
   *     `global-search` e chama `event.stopPropagation()`; o listener de `document`
   *     de `useGlobalSearchShortcut` nunca recebe o evento;
   *  2. o botão "Buscar" do `MobileShell` despacha `open-global-search`, escutado só
   *     pelo `CommandPalette` de telas;
   *  3. `toggleSearch` de `useInboxUIState` (que abriria a busca de mensagens) não é
   *     chamado por nenhuma tela.
   *
   * Quando a busca passar a devolver contatos, este teste vira `test(...)`.
   */
  test.fixme('a busca global também devolve contatos, não só telas', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);

    await paleta.getByRole('combobox', { name: CAMPO_PALETA, exact: true }).fill('[E2E]');

    await expect(paleta.getByRole('option', { name: /Contato de teste/ })).toBeVisible();
  });

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
