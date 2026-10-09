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
 * MEDIDO no código ATUAL (07/10/2026), e é isso que os testes abaixo fixam:
 *   - Ctrl+K abre UMA superfície: o diálogo "Paleta de comandos" (cmdk,
 *     `src/components/CommandPalette.tsx`), aberto pelo evento `open-global-search`
 *     despachado pela ação `global-search` de
 *     `src/hooks/ui/useGlobalKeyboardShortcuts.ts` (`Ctrl+K` em `defaultShortcuts`);
 *   - a paleta lista TELAS (módulos de `sidebarNavGroups`), filtra por termo, anda com
 *     as setas e navega no Enter;
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
const CAMPO_PALETA = 'Buscar módulo… (ex: pipeline, chatbot)';

/**
 * Abre a paleta pelo CAMINHO PEDIDO (atalho ou clique) e devolve o diálogo.
 *
 * A repetição é necessária e está medida: o listener de `open-global-search` mora no
 * chunk LAZY do `CommandPalette` (`src/pages/Index.tsx` → `React.lazy`), enquanto o
 * evento é despachado pelo registry eager. Enquanto o chunk não chega, a tecla é
 * engolida e o evento NÃO é reenvido (ver o `test.fixme` "primeiro Ctrl+K corre
 * solto"). A condição de parada é o diálogo visível — nunca uma espera fixa.
 */
async function abrirPaleta(page: Page, abrir: () => Promise<void>): Promise<Locator> {
  const paleta = page.getByRole('dialog', { name: PALETA });
  for (let tentativa = 0; tentativa < 12; tentativa++) {
    await abrir();
    try {
      await expect(paleta).toBeVisible({ timeout: 1_000 });
      return paleta;
    } catch {
      // O chunk do palette ainda não estava montado: repete o mesmo comando.
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

  test('Ctrl+K abre a paleta, foca o campo e lista as telas do sistema', async ({ page }) => {
    await abrirInbox(page);

    // Pré-condição: fechada antes do atalho (senão "abriu" não significa nada).
    await expect(page.getByRole('dialog', { name: PALETA })).toHaveCount(0);

    const paleta = await porAtalho(page);

    // O foco vai para o campo de busca: é o que permite digitar direto.
    await expect(paleta.getByPlaceholder(CAMPO_PALETA)).toBeFocused();
    // Telas (módulos) do sistema na lista — não é uma lista de contatos.
    for (const tela of ['Chat', 'Contatos', 'Dashboard', 'Configurações']) {
      await expect(paleta.getByRole('option', { name: new RegExp(`^${tela}\\b`) })).toBeVisible();
    }
  });

  test('a busca filtra as telas e o Enter navega para a tela escolhida', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);
    const campo = paleta.getByPlaceholder(CAMPO_PALETA);
    await expect(campo).toBeFocused();

    await campo.fill('dashboard');

    // A lista inteira (mais de 30 telas) some; sobra a tela que casa com o termo.
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
    await expect(paleta.getByPlaceholder(CAMPO_PALETA)).toBeFocused();

    // Sem consulta, a lista é a de telas na ordem do registry: o 1º é "Chat".
    const selecionado = paleta.locator('[cmdk-item][aria-selected="true"]');
    await expect(selecionado).toHaveText(/^Chat\b/);

    await page.keyboard.press('ArrowDown');
    await expect(selecionado).toHaveText(/^Teams\b/);
    await page.keyboard.press('ArrowDown');
    await expect(selecionado).toHaveText(/^Email\b/);
    await page.keyboard.press('ArrowUp');
    await expect(selecionado).toHaveText(/^Teams\b/);

    await page.keyboard.press('Enter');
    await expect(paleta).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('team-chat');
  });

  test('termo sem correspondência mostra o estado vazio', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);

    await paleta.getByPlaceholder(CAMPO_PALETA).fill('zzzznadaaqui');

    await expect(paleta.getByText('Nenhum módulo encontrado.')).toBeVisible();
    await expect(paleta.getByRole('option')).toHaveCount(0);
  });

  test('Esc fecha a paleta', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);
    await expect(paleta.getByPlaceholder(CAMPO_PALETA)).toBeFocused();

    await page.keyboard.press('Escape');

    // Só o FECHAMENTO aqui: a devolução de foco ao elemento de origem é outro caso,
    // e hoje está quebrada — ver o `test.fixme` "Esc devolve o foco ao elemento de
    // origem", no fim do arquivo.
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

    await paleta.getByPlaceholder(CAMPO_PALETA).fill('[E2E]');

    await expect(paleta.getByRole('option', { name: /Contato de teste/ })).toBeVisible();
  });

  /**
   * BUG (não corrigido neste cartão — só documentado): o PRIMEIRO Ctrl+K depois de a
   * tela carregar é engolido. MEDIDO (`zapp-e2e-local`, banco local, sessão falsa):
   * com a inbox já visível, o 1º `Ctrl+K` não abre nada e continua sem abrir 5s
   * depois; o 2º abre normalmente.
   *
   * Causa: o evento `open-global-search` é despachado pelo registry EAGER
   * (`src/hooks/ui/useGlobalKeyboardShortcuts.ts:30`), mas o listener mora no chunk
   * LAZY do palette (`src/pages/Index.tsx:22` → `React.lazy` →
   * `src/components/CommandPalette.tsx:77`). Enquanto o chunk não resolve, o
   * `CustomEvent` não tem quem o escute e é descartado — não há reenvio.
   *
   * Vira `test(...)` quando o atalho não puder mais ser perdido (ex.: o listener subir
   * junto do registry, ou o estado do palette viver no provider).
   */
  test.fixme('o primeiro Ctrl+K logo após carregar a tela já abre a paleta', async ({ page }) => {
    await abrirInbox(page);
    await page.keyboard.press('Control+k');

    await expect(page.getByRole('dialog', { name: PALETA })).toBeVisible();
  });

  /**
   * BUG (não corrigido neste cartão — só documentado): o Ctrl+K SEGUINTE, com a paleta
   * já aberta, não a fecha. MEDIDO (`zapp-e2e-local`, banco local, sessão falsa): a
   * paleta continua visível depois do segundo `Ctrl+K`; o atalho só ABRE.
   *
   * Causa: a ação `global-search` do registry SEMPRE despacha `open-global-search`
   * (`src/hooks/ui/useGlobalKeyboardShortcuts.ts:29-31`), e o handler de CAPTURA em
   * `window` (`:140-143`, com `event.stopPropagation()` em `:132`) impede que a tecla
   * chegue ao listener de alternância do próprio palette
   * (`src/components/CommandPalette.tsx:66-76`, `setOpen(o => !o)`). Na fase de captura
   * o evento não chega nem ao `document` nem ao `window` no bubble, e o
   * `open-global-search` do registry abre de novo.
   *
   * Vira `test(...)` quando o segundo Ctrl+K alternar (fechar a paleta aberta).
   */
  test.fixme('o Ctrl+K seguinte fecha a paleta aberta (alterna)', async ({ page }) => {
    await abrirInbox(page);
    const paleta = await porAtalho(page);
    await expect(paleta).toBeVisible();

    await page.keyboard.press('Control+k');

    await expect(paleta).toHaveCount(0);
  });

  /**
   * BUG (não corrigido neste cartão — só documentado): o Esc fecha a paleta, mas não
   * DEVOLVE o foco ao elemento de origem, que é o que o pedido original cobra. MEDIDO
   * (`zapp-e2e-local`, banco local, sessão falsa): com o campo "Buscar conversas…"
   * focado antes de abrir, depois do Esc o foco vai para o `document.body` — nenhum
   * elemento da página o recebe (o diálogo fechado sai da árvore e o foco cai no body).
   *
   * Causa: o `CommandDialog` (`src/components/ui/command.tsx:29-45`) é um Radix Dialog
   * SEM `DialogTrigger` — a paleta abre por atalho/evento (`open-global-search`), não
   * por um gatilho — então a restauração de foco do Radix (`onCloseAutoFocus` →
   * `context.triggerRef.current?.focus()`) não tem gatilho para onde voltar, e o
   * componente não guarda o elemento que estava em foco antes de abrir.
   *
   * Vira `test(...)` quando o Esc devolver o foco ao elemento de origem.
   */
  test.fixme('Esc devolve o foco ao elemento de origem', async ({ page }) => {
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
});
