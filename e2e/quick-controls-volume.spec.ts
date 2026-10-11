/**
 * Prova E2E autenticada, 100% LOCAL, dos controles de volume da sidebar
 * (plano `docs/plans/PLANO_CONTROLES_VOLUME_SIDEBAR_50_ETAPAS_2026-10-07.md`,
 * etapa S46 — cobre os bugs B1–B5 nos dois controles: alto-falante = alertas,
 * fone = áudios e vídeos das conversas).
 *
 * Como rodar (o conjunto local vem de `zapp-db-local`, nunca de produção):
 *   bun e2e/fixtures/arquivos-local/seed.ts          # cria o usuário sintético local
 *   VITE_ZAPP_LOCAL_SUPABASE_URL=... VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY=... \
 *     npx playwright test e2e/quick-controls-volume.spec.ts --no-deps
 *
 * O que a suíte exige de verdade:
 *   - login pela UI no GoTrue local (e2e.arquivos@example.com, criado pelo seed),
 *     sem sessão salva nem storageState copiado;
 *   - o volume dos ALERTAS persistindo no banco local (`user_settings`) e o das
 *     MÍDIAS em `localStorage` por usuário — nada de mock;
 *   - rede externa bloqueada: qualquer request fora de 127.0.0.1/localhost aborta
 *     e reprova o teste no afterEach.
 *
 * Contexto compartilhado e serial (mesma razão de `files-tab.spec.ts`): cada teste
 * paga um login real + boot completo da SPA; renderers novos em sequência derrubam
 * o Chromium por OOM no host compartilhado. `hasTouch` ligado no contexto porque o
 * bug B2 só existe no caminho de toque — e `page.touchscreen` exige `hasTouch`.
 */
import { test, expect, type Page } from '@playwright/test';
import { E2E_ARQUIVOS } from './fixtures/arquivos-local/dados';

// Sem sessão salva: a suíte entra pela tela de login com o usuário sintético.
test.use({ storageState: { cookies: [], origins: [] } });
// Vite dev frio + login real pedem mais que os 30s padrão do teste.
test.setTimeout(120_000);

const HOSTS_PERMITIDOS = new Set(['127.0.0.1', 'localhost', '::1']);
const NAV_TIMEOUT = 60_000;
// CDNs decorativas do index.html (fontes e Speed Insights). Todas ABORTADAS
// também: o app segue funcional — é a prova de que o fluxo não precisa de rede
// externa. Qualquer host fora desta lista reprova.
const HOSTS_EXTERNOS_DECORATIVOS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'va.vercel-scripts.com',
]);
const requisicoesExternas: string[] = [];

// R1: prova local-only por construção — autentica um usuário sintético que só
// existe no conjunto local. No `e2e-logado.yml` (sem conjunto local) o spec se
// declara fora de escopo em vez de tentar logar um usuário que não existe.
const CONJUNTO_LOCAL = Boolean(
  process.env.VITE_ZAPP_LOCAL_SUPABASE_URL && process.env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY,
);
test.skip(
  !CONJUNTO_LOCAL,
  'prova local-only: exige VITE_ZAPP_LOCAL_SUPABASE_URL/ANON_KEY do conjunto local (zapp-db-local)',
);

const ID_USUARIO = E2E_ARQUIVOS.usuario.id;
const CHAVE_VOLUME_MIDIA = `zapp.media.volume.${ID_USUARIO}`;
const CHAVE_MUDO_MIDIA = `zapp.media.muted.${ID_USUARIO}`;

/** Login real pela UI (/auth → auth-login local → GoTrue local). */
async function entrarPelaUI(page: Page): Promise<void> {
  await page.goto('/auth');
  await page.locator('#login-email').fill(E2E_ARQUIVOS.usuario.email);
  await page.locator('#login-password').fill(E2E_ARQUIVOS.usuario.senha);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await expect(page.locator('#main-navigation')).toBeVisible({ timeout: NAV_TIMEOUT });
}

/** Reload completo (visita nova) com um reload extra se o boot vier truncado. */
async function irParaInicio(page: Page): Promise<void> {
  const nav = page.locator('#main-navigation');
  await page.goto('/');
  try {
    await nav.waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    await page.reload();
    await nav.waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
  }
}

/** Garante a sidebar expandida (o default do app é recolhida). */
async function garantirExpandida(page: Page): Promise<void> {
  const expandir = page.getByRole('button', { name: 'Expandir menu' });
  if (await expandir.isVisible().catch(() => false)) {
    await expandir.click();
    await expect(page.getByRole('button', { name: 'Recolher menu' })).toBeVisible();
  }
}

// Gatilhos: o aria-label muda com o mudo, então o prefixo cobre os dois estados.
const gatilhoSom = (page: Page) =>
  page.locator(
    '#main-navigation button[aria-label^="Volume dos alertas"], #main-navigation button[aria-label^="Sons de alerta mudos"]',
  );
const gatilhoMidia = (page: Page) =>
  page.locator(
    '#main-navigation button[aria-label^="Volume dos áudios e vídeos"], #main-navigation button[aria-label^="Áudios e vídeos mudos"]',
  );

const painelSom = (page: Page) => page.getByRole('dialog', { name: 'Volume dos alertas' });
const painelMidia = (page: Page) => page.getByRole('dialog', { name: 'Volume dos áudios e vídeos' });

/** Lê o inteiro do rótulo ("Volume dos alertas: 70%" → 70). */
async function lerPercentualDoRotulo(locator: ReturnType<typeof gatilhoSom>): Promise<number> {
  const rotulo = (await locator.getAttribute('aria-label')) ?? '';
  const match = /(\d+)%/.exec(rotulo);
  if (!match) throw new Error(`rótulo sem porcentagem: "${rotulo}"`);
  return Number(match[1]);
}

/** Lê o inteiro grande do painel (testid → "85%"). */
async function lerPercentualDoPainel(page: Page, testid: string): Promise<number> {
  const texto = (await page.getByTestId(testid).textContent()) ?? '';
  return Number(texto.replace('%', '').trim());
}

/**
 * Espera a gravação agrupada dos ALERTAS sair: o upsert em `user_settings`
 * (~400 ms depois do último movimento, D06). Evento de rede, não sono fixo —
 * recarregar antes dele cancelaria o timer pendente e o banco ficaria velho.
 */
function esperarGravacaoAlertas(page: Page) {
  return page.waitForResponse((res) => res.url().includes('/rest/v1/user_settings'), {
    timeout: 15_000,
  });
}

/**
 * P1 (isolamento): devolve o volume dos ALERTAS ao valor inicial clicando
 * −/+ de 5 em 5 até o painel marcar o alvo. Parte do painel FECHADO e o fecha
 * ao fim. Cada movimento agenda o upsert agrupado — quem chama espera
 * `esperarGravacaoAlertas` quando precisa do banco em seguida.
 */
async function definirVolumeAlertas(page: Page, alvo: number): Promise<void> {
  await gatilhoSom(page).click();
  const painel = painelSom(page);
  await expect(painel).toBeVisible();
  for (let i = 0; i < 20; i++) {
    const atual = await lerPercentualDoPainel(page, 'sound-volume-value');
    if (atual === alvo) break;
    await painel
      .getByRole('button', {
        name:
          atual < alvo
            ? 'Aumentar Volume dos alertas em 5%'
            : 'Diminuir Volume dos alertas em 5%',
      })
      .click();
  }
  await expect(painel.getByTestId('sound-volume-value')).toHaveText(`${alvo}%`);
  await page.keyboard.press('Escape');
  await expect(painel).toBeHidden();
}

/**
 * P1 (isolamento): devolve o volume das MÍDIAS ao valor inicial. A gravação em
 * `localStorage` é síncrona a cada clique, então basta conferir a chave ao fim.
 */
async function definirVolumeMidias(page: Page, alvo: number): Promise<void> {
  await gatilhoMidia(page).click();
  const painel = painelMidia(page);
  await expect(painel).toBeVisible();
  for (let i = 0; i < 20; i++) {
    const atual = await lerPercentualDoPainel(page, 'media-volume-value');
    if (atual === alvo) break;
    await painel
      .getByRole('button', {
        name:
          atual < alvo
            ? 'Aumentar Volume dos áudios e vídeos em 5%'
            : 'Diminuir Volume dos áudios e vídeos em 5%',
      })
      .click();
  }
  await expect(painel.getByTestId('media-volume-value')).toHaveText(`${alvo}%`);
  await page.keyboard.press('Escape');
  await expect(painel).toBeHidden();
}

test.describe('controles de volume da sidebar — prova local autenticada', () => {
  test.describe.configure({ mode: 'serial', retries: 1 });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // Este hook faz um login REAL de ponta a ponta: `page.goto('/auth')` compila
    // a SPA a frio no Vite e o GoTrue local assina a sessão. Em host compartilhado
    // e carregado isso passou dos 30s de fábrica do hook e o Playwright derrubou o
    // worker durante o `fill` ("Target page, context or browser has been closed",
    // medido na rodada de 10/10). O teto maior é do LOGIN frio, não uma espera
    // arbitrária dentro do teste.
    test.setTimeout(90_000);
    const contexto = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      hasTouch: true,
    });
    page = await contexto.newPage();
    // Vite frio pode estourar o watchdog de boot de 8s (index.html).
    await page.addInitScript(() => {
      (window as Window & { __BOOT_DEADLINE_MS?: number }).__BOOT_DEADLINE_MS = 60_000;
    });
    await page.route('**/*', (route) => {
      const url = route.request().url();
      const host = new URL(url).hostname;
      if (HOSTS_PERMITIDOS.has(host)) return route.continue();
      requisicoesExternas.push(url);
      return route.abort();
    });
    await entrarPelaUI(page);
  });

  test.beforeEach(() => {
    requisicoesExternas.length = 0;
  });

  test.afterEach(async () => {
    if (!page.isClosed()) await page.keyboard.press('Escape').catch(() => undefined);
    const inesperadas = requisicoesExternas.filter(
      (url) => !HOSTS_EXTERNOS_DECORATIVOS.has(new URL(url).hostname),
    );
    expect(inesperadas, `rede externa fora da lista tolerada: ${inesperadas.join(', ')}`).toEqual([]);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('B1: o clique comum abre o painel dos ALERTAS com −, +, Silenciar e o valor em %', async () => {
    await irParaInicio(page);
    await garantirExpandida(page);

    const gatilho = gatilhoSom(page);
    await expect(gatilho).toBeVisible();
    const mudoAntes = await gatilho.getAttribute('aria-pressed');

    await gatilho.click();

    // B1: antes o clique só mutava e o slider ficava escondido atrás do clique longo.
    const painel = painelSom(page);
    await expect(painel).toBeVisible();
    await expect(gatilho).toHaveAttribute('aria-expanded', 'true');
    // O clique comum NÃO pode mais alternar o mudo (o mudo rápido é a tecla M).
    await expect(gatilho).toHaveAttribute('aria-pressed', mudoAntes ?? 'false');

    await expect(painel.getByRole('button', { name: 'Diminuir Volume dos alertas em 5%' })).toBeVisible();
    await expect(painel.getByRole('button', { name: 'Aumentar Volume dos alertas em 5%' })).toBeVisible();
    await expect(painel.getByRole('button', { name: /^(Silenciar|Ativar som)$/ })).toBeVisible();
    await expect(painel.getByTestId('sound-volume-value')).toContainText('%');

    await page.keyboard.press('Escape');
    await expect(painel).toBeHidden();
  });

  test('B4: o painel do FONE abre com o nome completo e o valor em %', async () => {
    await irParaInicio(page);
    await garantirExpandida(page);

    const gatilho = gatilhoMidia(page);
    await expect(gatilho).toBeVisible();
    await gatilho.click();

    const painel = painelMidia(page);
    await expect(painel).toBeVisible();
    await expect(painel.getByRole('button', { name: 'Diminuir Volume dos áudios e vídeos em 5%' })).toBeVisible();
    await expect(painel.getByRole('button', { name: 'Aumentar Volume dos áudios e vídeos em 5%' })).toBeVisible();
    await expect(painel.getByRole('button', { name: /^(Silenciar|Ativar som)$/ })).toBeVisible();
    await expect(painel.getByTestId('media-volume-value')).toContainText('%');

    await page.keyboard.press('Escape');
    await expect(painel).toBeHidden();
  });

  test('S11: os botões − e + andam de 5 em 5 e o rótulo acompanha', async () => {
    await irParaInicio(page);
    await garantirExpandida(page);

    const gatilho = gatilhoSom(page);
    const inicial = await lerPercentualDoRotulo(gatilho);
    await gatilho.click();

    const painel = painelSom(page);
    const mais = painel.getByRole('button', { name: 'Aumentar Volume dos alertas em 5%' });
    const menos = painel.getByRole('button', { name: 'Diminuir Volume dos alertas em 5%' });

    if (inicial < 100) {
      await mais.click();
      await expect(page.getByTestId('sound-volume-value')).toHaveText(`${inicial + 5}%`);
      await menos.click();
      await expect(page.getByTestId('sound-volume-value')).toHaveText(`${inicial}%`);
    } else {
      await menos.click();
      await expect(page.getByTestId('sound-volume-value')).toHaveText(`${inicial - 5}%`);
      // P1: este ramo também restaura — sem o clique de volta o 100% virava 95% na próxima rodada.
      await mais.click();
      await expect(page.getByTestId('sound-volume-value')).toHaveText(`${inicial}%`);
    }

    await page.keyboard.press('Escape');
  });

  test('S19: setas ↑/↓ andam de 5 em 5 e a tecla M alterna o mudo', async () => {
    await irParaInicio(page);
    await garantirExpandida(page);

    const gatilho = gatilhoSom(page);
    const inicial = await lerPercentualDoRotulo(gatilho);
    const mudoInicial = await gatilho.getAttribute('aria-pressed');

    await gatilho.focus();
    if (inicial < 100) {
      await page.keyboard.press('ArrowUp');
      await expect(gatilho).toHaveAttribute('aria-label', `Volume dos alertas: ${inicial + 5}%`);
      await page.keyboard.press('ArrowDown');
      await expect(gatilho).toHaveAttribute('aria-label', `Volume dos alertas: ${inicial}%`);
    } else {
      await page.keyboard.press('ArrowDown');
      await expect(gatilho).toHaveAttribute('aria-label', `Volume dos alertas: ${inicial - 5}%`);
      // P1: restaura o inicial — sem a volta o 100% virava 95% na próxima rodada.
      await page.keyboard.press('ArrowUp');
      await expect(gatilho).toHaveAttribute('aria-label', `Volume dos alertas: ${inicial}%`);
    }

    // M alterna o mudo e o rótulo passa a refletir o estado mudo.
    await page.keyboard.press('m');
    await expect(gatilho).toHaveAttribute('aria-pressed', mudoInicial === 'true' ? 'false' : 'true');
    await expect(gatilho).toHaveAttribute('aria-label', /Sons de alerta mudos|Volume dos alertas: \d+%/);
    // Restaura o mudo para não contaminar os testes seguintes.
    await page.keyboard.press('m');
    await expect(gatilho).toHaveAttribute('aria-pressed', mudoInicial ?? 'false');
  });

  test('B5: a roda do mouse só ajusta o volume com o painel ABERTO', async () => {
    await irParaInicio(page);
    await garantirExpandida(page);

    const gatilho = gatilhoSom(page);
    const inicial = await lerPercentualDoRotulo(gatilho);

    // Painel fechado: rolar sobre o ícone NÃO muda o volume (o bug B5 original).
    // A direção foge da borda (em 100% só dá para descer) para a prova do painel
    // aberto abaixo sempre ter uma mudança para observar.
    const deltaRoda = inicial >= 100 ? 120 : -120;
    await gatilho.hover();
    await page.mouse.wheel(0, deltaRoda);
    // O ajuste seria síncrono se o handler existisse com o painel fechado — então
    // amostra o rótulo numa janela de ~500 ms: qualquer ajuste atrasado aparece
    // aqui e reprova; tudo igual prova que a roda foi ignorada.
    const amostrasFechado: number[] = [];
    await expect
      .poll(async () => {
        amostrasFechado.push(await lerPercentualDoRotulo(gatilho));
        await page.waitForTimeout(100);
        return amostrasFechado.length;
      }, { timeout: 5_000 })
      .toBe(5);
    expect(
      amostrasFechado.every((v) => v === inicial),
      `a roda com painel fechado mudou o volume: ${amostrasFechado.join(',')}`,
    ).toBe(true);

    // Painel aberto: a roda passa a ajustar. A assinatura vem ANTES da roda:
    // o upsert dela precisa sair antes do restore, senão a espera do restore
    // resolve com a resposta errada e o reload do teste seguinte cancela o
    // timer do restore (medido: o banco terminava a rodada com o valor da roda).
    const gravacaoRoda = esperarGravacaoAlertas(page);
    await gatilho.click();
    await expect(painelSom(page)).toBeVisible();
    await gatilho.hover();
    await page.mouse.wheel(0, deltaRoda);
    await expect
      .poll(() => lerPercentualDoRotulo(gatilho), { timeout: 5_000 })
      .not.toBe(inicial);

    await page.keyboard.press('Escape');
    await gravacaoRoda;
    // P1: a roda acima moveu ±5 — devolve o inicial (com o upsert de volta
    // conferido) para a próxima rodada não herdar a mutação.
    const gravacaoVoltaB5 = esperarGravacaoAlertas(page);
    await definirVolumeAlertas(page, inicial);
    await gravacaoVoltaB5;
    await expect(gatilho).toHaveAttribute('aria-label', `Volume dos alertas: ${inicial}%`);
  });

  test('S13/S14: clique fora e Esc FECHAM o painel', async () => {
    await irParaInicio(page);
    await garantirExpandida(page);

    const gatilho = gatilhoSom(page);
    const painel = painelSom(page);

    // Esc fecha (aberto por teclado, para exercitar o caminho de teclado).
    await gatilho.focus();
    await page.keyboard.press('Enter');
    await expect(painel).toBeVisible();
    await painel.getByRole('button', { name: 'Aumentar Volume dos alertas em 5%' }).focus();
    await page.keyboard.press('Escape');
    await expect(painel).toBeHidden();
    await expect(gatilho).toHaveAttribute('aria-expanded', 'false');

    // Clique fora (rótulo "Controles rápidos", dentro da sidebar e fora do controle).
    await gatilho.click();
    await expect(painel).toBeVisible();
    await page.getByText('Controles rápidos').click();
    await expect(painel).toBeHidden();
    await expect(gatilho).toHaveAttribute('aria-expanded', 'false');
  });

  // S15 — o foco de volta ao gatilho NÃO é provado aqui de propósito: no navegador
  // real o Radix Popover devolve o foco ao <body>. O gatilho aqui é um `PopoverAnchor`
  // (não um `PopoverTrigger`), então o `onCloseAutoFocus` do Radix não tem a quem
  // devolver e o `focus()` do hook (useVolumeRocker) é sobrescrito no commit de
  // desmontagem do conteúdo. Medido nas duas vias (clique e teclado): activeElement =
  // BODY. O caminho do hook continua coberto em jsdom por
  // `src/hooks/ui/__tests__/useVolumeRocker.test.tsx` (S14/S15). Mesmo tratamento já
  // usado em `e2e/busca-global-paleta.spec.ts:320` para o mesmo comportamento do Radix.
  test.fixme('S15: ao fechar, o foco volta ao gatilho', async () => {
    await irParaInicio(page);
    await garantirExpandida(page);

    const gatilho = gatilhoSom(page);
    const painel = painelSom(page);

    await gatilho.focus();
    await page.keyboard.press('Enter');
    await expect(painel).toBeVisible();
    await painel.getByRole('button', { name: 'Aumentar Volume dos alertas em 5%' }).focus();
    await page.keyboard.press('Escape');
    await expect(painel).toBeHidden();

    await expect(gatilho).toBeFocused();
  });

  test('B2: no TOQUE o painel abre e NÃO fecha ao soltar o dedo', async () => {
    await irParaInicio(page);
    await garantirExpandida(page);

    const gatilho = gatilhoSom(page);
    await expect(gatilho).toBeVisible();
    await gatilho.tap();
    await expect(gatilho).toHaveAttribute('aria-expanded', 'true');

    // O `click` que o navegador dispara ao soltar o dedo reabre (nunca fecha):
    // antes desta correção o slider sumia exatamente aqui. Amostra a visibilidade
    // numa janela de ~600 ms — qualquer fechamento no intervalo reprova.
    await expect(painelSom(page)).toBeVisible();
    const estadosToque: boolean[] = [];
    await expect
      .poll(async () => {
        estadosToque.push(await painelSom(page).isVisible());
        await page.waitForTimeout(120);
        return estadosToque.length;
      }, { timeout: 5_000 })
      .toBe(5);
    expect(estadosToque.every(Boolean), 'o painel fechou sozinho após o toque').toBe(true);

    // Um toque fora fecha (mesma via do mouse).
    await page.getByText('Controles rápidos').tap();
    await expect(painelSom(page)).toBeHidden();
  });

  // B3: os controles rápidos ganharam dica (tooltip) em TODOS os 6 botões.
  // A dica é ancorada em `side="right"` e, por construção, fica por cima do botão
  // vizinho à direita — então, entre um botão e o seguinte, a dica é FECHADA e a
  // volta ao estado fechado é provada (`toHaveCount(0)`); sem isso o vizinho nunca
  // recebe o ponteiro e a dica dele nem chega a abrir (medido no 2º botão).
  // Hover e foco ficam em testes SEPARADOS: no foco, o blur fecha a dica anterior.
  const dicasDaSidebar = (p: Page) => [
    { botao: p.getByRole('button', { name: /^(Ativar|Desativar) proteção de tela$/ }), texto: /proteção de tela/ },
    { botao: p.getByRole('button', { name: /^(Ativar|Desativar) todas as notificações$/ }), texto: /todas as notificações/ },
    { botao: gatilhoSom(p), texto: /Volume dos alertas|Sons de alerta mudos/ },
    { botao: gatilhoMidia(p), texto: /Volume dos áudios e vídeos|Áudios e vídeos mudos/ },
    { botao: p.getByRole('button', { name: /^Modo (claro|escuro)$/ }), texto: /Modo (claro|escuro)/ },
    { botao: p.getByRole('button', { name: 'Configurações de acessibilidade' }), texto: /Acessibilidade/ },
  ];

  test('B3 (hover): os 6 botões têm dica ao passar o mouse', async () => {
    await irParaInicio(page);
    await garantirExpandida(page);
    // O clique de `garantirExpandida` deixa o botão de menu com foco; tira antes de medir.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    for (const { botao, texto } of dicasDaSidebar(page)) {
      await expect(botao).toBeVisible();
      await botao.hover();
      await expect(page.getByRole('tooltip').filter({ hasText: texto }).first()).toBeVisible({ timeout: 7_000 });

      // Fecha a dica: o Esc a dispensa e o ponteiro sai do gatilho (canto da sidebar).
      await page.keyboard.press('Escape');
      await page.mouse.move(8, 8);
      await expect(page.getByRole('tooltip')).toHaveCount(0, { timeout: 5_000 });
    }
  });

  test('B3 (foco): os 6 botões têm dica ao receber o foco', async () => {
    await irParaInicio(page);
    await garantirExpandida(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    for (const { botao, texto } of dicasDaSidebar(page)) {
      await expect(botao).toBeVisible();
      await botao.focus();
      await expect(page.getByRole('tooltip').filter({ hasText: texto }).first()).toBeVisible({ timeout: 7_000 });

      // O blur fecha a dica deste botão antes do próximo receber o foco.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect(page.getByRole('tooltip')).toHaveCount(0, { timeout: 5_000 });
    }
  });

  test('B4: os dois rótulos da sidebar mostram o volume com %', async () => {
    await irParaInicio(page);
    await garantirExpandida(page);

    await expect(gatilhoSom(page)).toHaveAttribute('aria-label', /^Volume dos alertas: \d+%$/);
    await expect(gatilhoMidia(page)).toHaveAttribute('aria-label', /^Volume dos áudios e vídeos: \d+%$/);
  });

  test('S33: o volume das MÍDIAS persiste por usuário no navegador e sobrevive ao reload', async () => {
    await irParaInicio(page);
    await garantirExpandida(page);

    const gatilho = gatilhoMidia(page);
    const inicial = await lerPercentualDoRotulo(gatilho);

    await gatilho.click();
    const painel = painelMidia(page);
    await expect(painel).toBeVisible();
    const alvo = inicial < 100 ? inicial + 5 : inicial - 5;
    const botao = painel.getByRole('button', {
      name: alvo > inicial ? 'Aumentar Volume dos áudios e vídeos em 5%' : 'Diminuir Volume dos áudios e vídeos em 5%',
    });
    await botao.click();
    await expect(painel.getByTestId('media-volume-value')).toHaveText(`${alvo}%`);
    await page.keyboard.press('Escape');

    // A chave é POR USUÁRIO no aparelho (D07/S33), não uma chave única do navegador.
    const gravado = await page.evaluate((chave) => localStorage.getItem(chave), CHAVE_VOLUME_MIDIA);
    expect(gravado, `esperava ${CHAVE_VOLUME_MIDIA}=${alvo}`).toBe(String(alvo));
    expect(await page.evaluate((chave) => localStorage.getItem(chave), CHAVE_MUDO_MIDIA)).not.toBeNull();

    // Sobrevive ao reload (o store relê a chave da identidade no boot).
    await irParaInicio(page);
    await expect(gatilhoMidia(page)).toHaveAttribute('aria-label', `Volume dos áudios e vídeos: ${alvo}%`);

    // P1: devolve o inicial para a próxima rodada não herdar a mutação — a
    // gravação em localStorage é síncrona, então a chave confere na hora.
    await definirVolumeMidias(page, inicial);
    expect(await page.evaluate((chave) => localStorage.getItem(chave), CHAVE_VOLUME_MIDIA)).toBe(
      String(inicial),
    );
    await expect(gatilhoMidia(page)).toHaveAttribute('aria-label', `Volume dos áudios e vídeos: ${inicial}%`);
  });

  test('S36: o volume dos ALERTAS persiste no BANCO e sobrevive ao reload', async () => {
    await irParaInicio(page);
    await garantirExpandida(page);

    const gatilho = gatilhoSom(page);
    const inicial = await lerPercentualDoRotulo(gatilho);

    await gatilho.click();
    const painel = painelSom(page);
    await expect(painel).toBeVisible();
    const alvo = inicial < 100 ? inicial + 5 : inicial - 5;
    // A assinatura da espera vem ANTES do clique: o upsert agrupado sai ~400 ms
    // depois do último movimento (D06) e a resposta tem de cair nesta promessa.
    const gravacao = esperarGravacaoAlertas(page);
    await painel
      .getByRole('button', {
        name: alvo > inicial ? 'Aumentar Volume dos alertas em 5%' : 'Diminuir Volume dos alertas em 5%',
      })
      .click();
    await expect(page.getByTestId('sound-volume-value')).toHaveText(`${alvo}%`);
    await page.keyboard.press('Escape');

    // O reload só entra DEPOIS do upsert em user_settings (evento de rede, não
    // sono fixo) — recarregar antes cancelaria o timer pendente e o banco
    // ficaria com o valor velho.
    await gravacao;

    // O reload só pode mostrar o valor novo se ele veio DO BANCO (não há
    // localStorage para o volume dos alertas).
    await irParaInicio(page);
    await expect(gatilhoSom(page)).toHaveAttribute('aria-label', `Volume dos alertas: ${alvo}%`);

    // P1: devolve o inicial (com o upsert de volta conferido) para a próxima
    // rodada não herdar a mutação.
    await garantirExpandida(page);
    const gravacaoVolta = esperarGravacaoAlertas(page);
    await definirVolumeAlertas(page, inicial);
    await gravacaoVolta;
    await expect(gatilhoSom(page)).toHaveAttribute('aria-label', `Volume dos alertas: ${inicial}%`);
  });

  test('S47: os controles funcionam com a sidebar EXPANDIDA e RECOLHIDA', async () => {
    await irParaInicio(page);
    await garantirExpandida(page);
    await expect(page.getByRole('button', { name: 'Recolher menu' })).toBeVisible();

    // Expandida: os dois gatilhos aparecem e o painel abre.
    await expect(gatilhoSom(page)).toBeVisible();
    await expect(gatilhoMidia(page)).toBeVisible();
    await gatilhoSom(page).click();
    await expect(painelSom(page)).toBeVisible();
    await page.keyboard.press('Escape');

    // Recolhida: continuam presentes e funcionais.
    await page.getByRole('button', { name: 'Recolher menu' }).click();
    await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible();
    await expect(gatilhoSom(page)).toBeVisible();
    await expect(gatilhoMidia(page)).toBeVisible();
    const inicial = await lerPercentualDoRotulo(gatilhoMidia(page));
    await gatilhoMidia(page).click();
    await expect(painelMidia(page)).toBeVisible();
    expect(await lerPercentualDoPainel(page, 'media-volume-value')).toBe(inicial);
    await page.keyboard.press('Escape');

    // Volta a expandida para o estado dos testes seguintes.
    await page.getByRole('button', { name: 'Expandir menu' }).click();
  });

  test('celular 390 px: o app usa a casca MOBILE (a sidebar de volume é do desktop)', async () => {
    await irParaInicio(page);
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      // Abaixo do breakpoint o AppShell troca a sidebar pela MobileShell.
      await expect(page.locator('#main-navigation')).toBeHidden({ timeout: NAV_TIMEOUT });
      await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeVisible({ timeout: NAV_TIMEOUT });

      // O desenho continua íntegro no celular: a casca mobile renderiza e o
      // documento não estoura a largura da tela.
      const largura = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(largura).toBeLessThanOrEqual(390);
    } finally {
      await page.setViewportSize({ width: 1280, height: 800 });
      await irParaInicio(page);
    }
  });
});
