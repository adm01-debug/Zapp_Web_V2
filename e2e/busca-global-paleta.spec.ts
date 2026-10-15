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
 * CONTRATO (R2-INF-035, 15/10/2026): o ⌘K/Ctrl+K abre UMA superfície — a paleta de
 * comandos rica (`src/components/ui/command-palette.tsx`, montada em lazy por
 * `src/components/keyboard/CommandPaletteHost.tsx`), com o estado no
 * `GlobalKeyboardProvider` (dono único):
 *   - a ação `global-search` do registry ALTERNA (abre/fecha) a paleta, então o
 *     primeiro Ctrl+K depois de carregar já abre e o segundo fecha;
 *   - `open-global-search` (botão Buscar do cabeçalho) abre a MESMA paleta;
 *   - a paleta devolve telas, ações, Talk X E Resultados de contatos/conversas
 *     (mesmas tabelas `contacts`/`messages` da busca global da inbox);
 *   - Esc fecha e devolve o foco ao elemento de origem.
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
const CAMPO_PALETA = 'Buscar ou digitar comando... (⌘K)';

/**
 * Abre a paleta pelo CAMINHO PEDIDO (atalho ou clique) e devolve o diálogo.
 *
 * Uma pressão só: o estado da paleta vive no `GlobalKeyboardProvider` (eager), então
 * a tecla nunca é engolida pelo chunk lazy — repetir o atalho agora ALTERNARIA (abre
 * e fecha) em vez de abrir de novo.
 */
async function abrirPaleta(page: Page, abrir: () => Promise<void>): Promise<Locator> {
  const paleta = page.getByRole('dialog', { name: PALETA });
  await abrir();
  await expect(paleta).toBeVisible({ timeout: 30_000 });
  return paleta;
}

const porAtalho = (page: Page) => abrirPaleta(page, () => page.keyboard.press('Control+k'));

/** O título do item é quebrado em spans pelo realce do termo; o texto casado é o do botão. */
const opcao = (paleta: Locator, texto: string | RegExp) =>
  paleta.locator('[role="option"]').filter({ hasText: texto });

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
    // app shell exclui `contacts`/`messages` de propósito). A busca da paleta responde
    // com um contato de teste; as leituras da inbox seguem vazias.
    await page.route(/\/rest\/v1\/contacts/, (route) =>
      /ilike/.test(route.request().url())
        ? json(route, [
            { id: 'c-e2e-1', name: 'Contato', surname: 'de teste', phone: '+55 11 90000-0000', email: null },
          ])
        : json(route, []),
    );
    await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
  });

  test.afterEach(() => {
    // Prova de que a spec é hermética: nada escapou para a rede real.
    expect(registro.redeBarrada).toEqual([]);
  });

  test('Ctrl+K abre a paleta, foca o campo e lista os destinos do acesso rápido', async ({ page }) => {
    await abrirInbox(page);

    // Pré-condição: fechada antes do atalho (senão "abriu" não significa nada).
    await expect(page.getByRole('dialog', { name: PALETA })).toHaveCount(0);

    const paleta = await porAtalho(page);

    // O foco vai para o campo de busca: é o que permite digitar direto.
    await expect(paleta.getByPlaceholder(CAMPO_PALETA)).toBeFocused();
    // Sem consulta, a paleta exibe o acesso rápido (5 destinos, ordem do registry).
    for (const destino of ['Inbox', 'Dashboard', 'Contatos', 'Atendentes', 'Filas']) {
      await expect(opcao(paleta, destino)).toBeVisible();
    }
  });

  test('a busca filtra os destinos e o Enter navega para o escolhido', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);

    const campo = paleta.getByPlaceholder(CAMPO_PALETA);
    await expect(campo).toBeFocused();

    await campo.fill('dashboard');

    await expect(opcao(paleta, 'Dashboard')).toBeVisible();
    await expect(opcao(paleta, 'Filas')).toHaveCount(0);

    await campo.press('Enter');

    await expect(paleta).toHaveCount(0);
    // A navegação é a do app (`useNavigationHistory`): a URL canônica muda.
    await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('dashboard');
  });

  test('as setas movem a seleção e o Enter dispara o item destacado', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);
    await expect(paleta.getByPlaceholder(CAMPO_PALETA)).toBeFocused();

    // Sem consulta, a lista é o acesso rápido na ordem do registry: o 1º é "Inbox".
    const selecionado = paleta.locator('[role="option"][aria-selected="true"]');
    await expect(selecionado).toContainText('Inbox');

    await page.keyboard.press('ArrowDown');
    await expect(selecionado).toContainText('Dashboard');
    await page.keyboard.press('ArrowDown');
    await expect(selecionado).toContainText('Contatos');
    await page.keyboard.press('ArrowUp');
    await expect(selecionado).toContainText('Dashboard');

    await page.keyboard.press('Enter');
    await expect(paleta).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('dashboard');
  });

  test('termo sem correspondência mostra o estado vazio', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);

    await paleta.getByPlaceholder(CAMPO_PALETA).fill('zzzznadaaqui');

    await expect(paleta.getByText('Nenhum resultado para "zzzznadaaqui"')).toBeVisible();
    await expect(paleta.getByRole('option')).toHaveCount(0);
  });

  test('Esc fecha a paleta', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);
    await expect(paleta.getByPlaceholder(CAMPO_PALETA)).toBeFocused();

    await page.keyboard.press('Escape');

    // Só o FECHAMENTO aqui: a devolução de foco é o caso logo abaixo.
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

  test('a paleta também devolve contatos, não só telas', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);

    await paleta.getByPlaceholder(CAMPO_PALETA).fill('[E2E]');

    await expect(opcao(paleta, 'Contato de teste')).toBeVisible();
  });

  test('o primeiro Ctrl+K logo após carregar a tela já abre a paleta', async ({ page }) => {
    await abrirInbox(page);
    await page.keyboard.press('Control+k');

    await expect(page.getByRole('dialog', { name: PALETA })).toBeVisible({ timeout: 30_000 });
  });

  test('o Ctrl+K seguinte fecha a paleta aberta (alterna)', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);
    await expect(paleta).toBeVisible();

    await page.keyboard.press('Control+k');

    await expect(paleta).toHaveCount(0);
  });

  test('Esc devolve o foco ao elemento de origem', async ({ page }) => {
    await abrirInbox(page);
    const origem = page.getByPlaceholder('Buscar conversas…');
    await origem.click();
    await expect(origem).toBeFocused();

    const paleta = await porAtalho(page);
    await expect(paleta.getByPlaceholder(CAMPO_PALETA)).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(paleta).toHaveCount(0);
    await expect(origem).toBeFocused();
  });

  test.describe('celular 390x844', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('o botão Buscar do cabeçalho abre a mesma paleta e ela navega', async ({ page }) => {
      await abrirInbox(page);

      // O botão do MobileHeader despacha `open-global-search` — o mesmo comando do
      // atalho de teclado (R2-PLAT-010).
      const buscar = page.getByRole('button', { name: 'Buscar' });
      const paleta = await abrirPaleta(page, () => buscar.click());

      const campo = paleta.getByPlaceholder(CAMPO_PALETA);
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
});
