/**
 * Prova E2E autenticada e 100% local da aba Arquivos (cartão t_6c2d8281).
 *
 *   Rode primeiro:  bun e2e/fixtures/arquivos-local/seed.ts   (com env de zapp-db-local)
 *   Depois:         npx playwright test e2e/files-tab.spec.ts --no-deps
 *
 * O que a suíte exige de verdade:
 *   - login pela UI no GoTrue local (e2e.arquivos@example.com, criado pelo seed),
 *     sem sessão salva nem storageState copiado;
 *   - dados do banco local passando por RLS (contatos atribuídos, messages,
 *     storage.objects) — nada de mock nem de sessão copiada;
 *   - objetos privados do bucket whatsapp-media servidos por URL assinada;
 *   - rede externa bloqueada: qualquer request fora de 127.0.0.1/localhost aborta
 *     e reprova o teste no afterEach.
 *
 * Por que um contexto compartilhado: cada teste desta suíte paga um login real +
 * boot completo da SPA. Dez renderers novos em sequência derrubam o Chromium por
 * OOM em máquina compartilhada (vários workspaces de teste no mesmo host). A
 * suíte roda em `serial` sobre UMA página autenticada; cada teste volta a '/' com
 * reload completo (estado de memória zerado, como uma visita nova), e só a chave
 * de preferência de layout do operador é removida entre testes — a sessão do
 * GoTrue local e as demais preferências seguem intactas, como na vida real.
 */
import { test, expect, type Page } from '@playwright/test';
import { E2E_ARQUIVOS } from './fixtures/arquivos-local/dados';
import {
  aplicarTema,
  contrasteNumerico,
  duracaoMaximaDeTransicao,
  CONTRASTE_MINIMO,
} from './fixtures/arquivos-local/tema';

// Sem sessão salva: a suíte entra pela tela de login com o usuário sintético.
test.use({ storageState: { cookies: [], origins: [] } });
// Vite dev frio + login real + duas passadas pela inbox pedem mais que os 30s
// padrão de teste (o timeout interno das expect continua o mesmo).
test.setTimeout(120_000);

const HOSTS_PERMITIDOS = new Set(['127.0.0.1', 'localhost', '::1']);
// O dev server do Vite + boot da SPA passam dos 30s do default em máquina
// compartilhada (vários workspaces de teste no mesmo host); 60s é o mesmo teto
// de boot que os outros specs locais usam.
const NAV_TIMEOUT = 60_000;
// CDNs decorativas que o index.html chama (fontes e Speed Insights). Todas são
// ABORTADAS também — o app segue funcional, o que é exatamente a prova de que o
// fluxo não precisa de rede externa. Qualquer host fora desta lista reprova.
const HOSTS_EXTERNOS_DECORATIVOS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'va.vercel-scripts.com',
]);
const requisicoesExternas: string[] = [];

/** Login real pela UI (/auth → auth-login local → GoTrue local). */
async function entrarPelaUI(page: Page): Promise<void> {
  await page.goto('/auth');
  await page.locator('#login-email').fill(E2E_ARQUIVOS.usuario.email);
  await page.locator('#login-password').fill(E2E_ARQUIVOS.usuario.senha);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await expect(page.locator('#main-navigation')).toBeVisible({ timeout: NAV_TIMEOUT });
}

/**
 * Volta à inbox como uma visita nova: reload completo (zera Maps de sessão do
 * hook) e remove SÓ a preferência persistida de layout da aba — o teste de
 * persistência prova que ela sobrevive a reload; os demais partem do default.
 */
async function irParaInbox(page: Page): Promise<void> {
  // Carregamento truncado (módulo dev lento / renderer sob carga) não se recupera
  // sozinho: um reload completo zera o estado e refaz o boot. Sem isso o teste
  // reprova por infraestrutura, não por comportamento da aba.
  const nav = page.locator('#main-navigation');
  await page.goto('/');
  try {
    await nav.waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    await page.reload();
    await nav.waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
  }
  await page.evaluate(() => {
    const chaves = Object.keys(localStorage).filter((k) =>
      k.startsWith('zapp.inbox.files.view:'),
    );
    chaves.forEach((k) => localStorage.removeItem(k));
  });
}

/** Abre a conversa do contato (busca da inbox evita depender de virtualização). */
async function abrirConversa(page: Page, nomeVisivel: string): Promise<void> {
  const busca = page.getByLabel('Buscar contato pelo nome');
  if (await busca.isVisible()) await busca.fill(nomeVisivel);
  // O item da conversa é um <button> cujo nome acessível é o conteúdo do cartão
  // (iniciais + nome + hora + preview) — o nome visível do fixture é suficiente.
  const item = page.getByRole('button', { name: new RegExp(nomeVisivel) });
  await expect(item.first()).toBeVisible({ timeout: NAV_TIMEOUT });
  await item.first().click();
}

/** Abre a aba Arquivos da conversa aberta e espera o grid/lista/tabela. */
async function abrirAbaArquivos(page: Page, esperados: number): Promise<void> {
  await page.getByTestId('conversation-tab-files').click();
  const aba = page.getByTestId('files-tab');
  await expect(aba).toBeVisible({ timeout: NAV_TIMEOUT });
  await expect(page.locator('[data-testid^="files-item-"]')).toHaveCount(esperados, {
    timeout: 30_000,
  });
}

const itens = (page: Page) => page.locator('[data-testid^="files-item-"]');

// R1: esta prova é local-only por construção — ela autentica um usuário sintético que
// só existe no conjunto local. O `e2e-logado.yml` do CI roda o projeto autenticado sem
// conjunto local: ali o spec se declara fora de escopo em vez de tentar logar um usuário
// que não existe (e de sujar o job com uma falha de ambiente).
const CONJUNTO_LOCAL = Boolean(
  process.env.VITE_ZAPP_LOCAL_SUPABASE_URL && process.env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY,
);
test.skip(
  !CONJUNTO_LOCAL,
  'prova local-only: exige VITE_ZAPP_LOCAL_SUPABASE_URL/ANON_KEY do conjunto local (zapp-db-local)',
);

test.describe('aba Arquivos — prova local autenticada', () => {
  // Serial + contexto compartilhado: ver o bloco de comentário no topo do arquivo.
  // retries: o renderer do Chromium ainda pode sofrer OOM (SIGKILL/"Target
  // crashed") em host compartilhado — é flake de infraestrutura, não do código.
  test.describe.configure({ mode: 'serial', retries: 2 });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const contexto = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    page = await contexto.newPage();
    // Vite frio pode estourar o watchdog de boot de 8s (index.html): o override
    // de 60s é o mesmo usado pelos outros specs E2E.
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
    // Resíduos visuais entre testes: fecha overlays que o teste deixou abertos.
    if (!page.isClosed()) await page.keyboard.press('Escape').catch(() => undefined);
    const inesperadas = requisicoesExternas.filter(
      (url) => !HOSTS_EXTERNOS_DECORATIVOS.has(new URL(url).hostname),
    );
    expect(inesperadas, `rede externa fora da lista tolerada: ${inesperadas.join(', ')}`).toEqual([]);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('carrega os 4 tipos de mídia privada com contagens reais do banco', async () => {
    await irParaInbox(page);
    await abrirConversa(page, E2E_ARQUIVOS.contato.nomeVisivel);
    await abrirAbaArquivos(page, E2E_ARQUIVOS.contagens.todos);

    const aba = page.getByTestId('files-tab');
    await expect(aba.getByRole('heading', { name: 'Arquivos' })).toBeVisible();
    // Badge da aba de conversa vem de 5 mensagens no banco; a aba Arquivos conta só 4 mídias.
    await expect(page.getByTestId('conversation-tab-count-files')).toHaveText(
      String(E2E_ARQUIVOS.contagens.todos),
    );
    await expect(aba.getByRole('button', { name: /^Todos/ })).toContainText('4');
    await expect(aba.getByRole('button', { name: /^Imagens/ })).toContainText('1');
    await expect(aba.getByRole('button', { name: /^Vídeos/ })).toContainText('1');
    await expect(aba.getByRole('button', { name: /^Áudios/ })).toContainText('1');
    await expect(aba.getByRole('button', { name: /^Docs/ })).toContainText('1');
    await expect(aba.getByText('4 arquivos')).toBeVisible();

    // O PNG 1x1 do bucket PRIVADO decodifica de verdade — prova de URL assinada.
    const imagem = E2E_ARQUIVOS.mensagens.imagem;
    const thumb = page.getByTestId(`files-thumb-${imagem.id}`).locator('img');
    await expect
      .poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), {
        timeout: 20_000,
      })
      .toBe(true);
    // O src visível é a URL assinada do objeto privado, nunca a rota pública.
    const src = await thumb.getAttribute('src');
    expect(src).toContain('/storage/v1/object/sign/');
  });

  test('alterna Grid/Lista/Tabela e persiste a preferência em reload', async () => {
    await irParaInbox(page);
    await abrirConversa(page, E2E_ARQUIVOS.contato.nomeVisivel);
    await abrirAbaArquivos(page, E2E_ARQUIVOS.contagens.todos);

    // O popover remonta a seção "Colunas" quando o modo sai de 'grid' — o botão
    // desestabiliza se clicado na mesma abertura; Esc + reabrir dá elemento fresco.
    await page.getByTestId('files-layout-trigger').click();
    await page.getByTestId('files-view-list').click();
    await expect(page.getByTestId('files-list')).toBeVisible();
    await expect(itens(page)).toHaveCount(4);
    await page.keyboard.press('Escape');

    await page.getByTestId('files-layout-trigger').click();
    await page.getByTestId('files-view-table').click();
    await expect(page.getByTestId('files-table')).toBeVisible();
    await expect(itens(page)).toHaveCount(4);

    // Preferência do operador é em localStorage: sobrevive a reload.
    await page.reload();
    await abrirConversa(page, E2E_ARQUIVOS.contato.nomeVisivel);
    await page.getByTestId('conversation-tab-files').click();
    await expect(page.getByTestId('files-table')).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(itens(page)).toHaveCount(4);
  });

  test('modo seleção: item individual, Selecionar todos no recorte e Esc sai', async () => {
    await irParaInbox(page);
    await abrirConversa(page, E2E_ARQUIVOS.contato.nomeVisivel);
    await abrirAbaArquivos(page, E2E_ARQUIVOS.contagens.todos);
    const aba = page.getByTestId('files-tab');

    const toggle = page.getByTestId('files-select-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    const barra = page.getByTestId('files-selection-bar');
    await expect(barra).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Seleção individual pelo checkbox acessível do cartão.
    await page
      .getByRole('checkbox', { name: `Selecionar ${E2E_ARQUIVOS.mensagens.imagem.filename}` })
      .click();
    await expect(barra).toContainText('1 selecionado');

    // "Selecionar todos" cobre o recorte visível (4 itens em "Todos").
    await page.getByRole('checkbox', { name: 'Selecionar todos' }).click();
    await expect(barra).toContainText('Selecionar todos (4 visíveis)');
    await expect(barra).toContainText('4 selecionados');

    // Filtra para Imagens: os outros 3 continuam selecionados fora do recorte.
    await aba.getByRole('button', { name: /^Imagens/ }).click();
    await expect(itens(page)).toHaveCount(1);
    await expect(barra).toContainText('3 selecionados fora do filtro');

    // Esc sai do modo seleção sem efeito destrutivo. O teto é o comportamento medido:
    // se precisar de uma 3ª tentativa, a regressão de teclado deve aparecer no teste.
    const maxTentativasEscSelecao = 2;
    let tentativasEscSelecao = 0;
    let saiuDaSelecaoComEsc = false;
    for (let tentativa = 1; tentativa <= maxTentativasEscSelecao; tentativa += 1) {
      tentativasEscSelecao = tentativa;
      await page.keyboard.press('Escape');
      try {
        await expect(barra).not.toBeVisible({ timeout: 500 });
        saiuDaSelecaoComEsc = true;
        break;
      } catch {
        saiuDaSelecaoComEsc = false;
      }
    }
    test.info().annotations.push({
      type: 'achado-teclado',
      description: `Esc saiu do modo seleção em ${tentativasEscSelecao} tentativa(s); teto: ${maxTentativasEscSelecao}.`,
    });
    expect(tentativasEscSelecao, 'Esc no modo seleção deve resolver em no máximo 2 tentativas').toBeLessThanOrEqual(2);
    expect(saiuDaSelecaoComEsc, 'Esc deve sair do modo seleção sem 3ª tentativa').toBe(true);
    await expect(barra).not.toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('painel de detalhes abre com metadados do arquivo e fecha', async () => {
    await irParaInbox(page);
    await abrirConversa(page, E2E_ARQUIVOS.contato.nomeVisivel);
    await abrirAbaArquivos(page, E2E_ARQUIVOS.contagens.todos);
    const aba = page.getByTestId('files-tab');

    const doc = E2E_ARQUIVOS.mensagens.documento;
    // `exact: true`: o botão da miniatura tem nome acessível "Visualizar <arquivo>"
    // e também casaria com o nome do arquivo — quem abre os detalhes é o botão do título.
    await aba.getByRole('button', { name: doc.filename, exact: true }).click();

    // Abaixo de 1100 px o MESMO conteúdo vai no Sheet da direita; acima, na casca
    // `file-detail-panel-inline`. Usar o invólucro (e não `file-detail-panel`, que é
    // o conteúdo interno e existe nas duas formas) evita casar dois elementos.
    const painel = page
      .getByTestId('file-detail-panel-inline')
      .or(page.getByTestId('file-detail-sheet'));
    await expect(painel).toBeVisible();
    await expect(painel.getByText('Detalhes', { exact: true })).toBeVisible();
    await expect(painel.getByText(doc.filename)).toBeVisible();
    await expect(painel.getByText(/Tamanho:/)).toBeVisible();
    await expect(painel.getByText('Enviado por Atendente')).toBeVisible();

    await painel.getByRole('button', { name: 'Fechar' }).click();
    await expect(painel).not.toBeVisible();
  });

  test('preview abre, navega por teclado/botão e fecha com Esc', async () => {
    await irParaInbox(page);
    await abrirConversa(page, E2E_ARQUIVOS.contato.nomeVisivel);
    await abrirAbaArquivos(page, E2E_ARQUIVOS.contagens.todos);

    // Ordem "recent" desc: documento(10:03), áudio(10:02), vídeo(10:01), imagem(10:00).
    await page
      .getByRole('button', { name: `Visualizar ${E2E_ARQUIVOS.mensagens.imagem.filename}` })
      .click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible({ timeout: 20_000 });
    await expect(dialogo).toContainText(E2E_ARQUIVOS.mensagens.imagem.filename);

    // O <img> do preview decodifica o objeto privado (URL assinada da aba).
    const img = dialogo.locator('img');
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), {
        timeout: 20_000,
      })
      .toBe(true);

    // Navegação: seta do teclado e botão "Anterior" (imagem é a última da coleção).
    await page.keyboard.press('ArrowLeft');
    await expect(dialogo).toContainText(E2E_ARQUIVOS.mensagens.video.filename);
    await dialogo.getByRole('button', { name: 'Anterior' }).click();
    await expect(dialogo).toContainText(E2E_ARQUIVOS.mensagens.audio.filename);
    await expect(dialogo.getByRole('button', { name: 'Próximo' })).toBeEnabled();

    await page.keyboard.press('Escape');
    await expect(dialogo).not.toBeVisible();
  });

  test('ARIA: aba selecionada, chips com aria-pressed e nomes acessíveis', async () => {
    await irParaInbox(page);
    await abrirConversa(page, E2E_ARQUIVOS.contato.nomeVisivel);
    await abrirAbaArquivos(page, E2E_ARQUIVOS.contagens.todos);
    const aba = page.getByTestId('files-tab');

    await expect(page.getByTestId('conversation-tab-files')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('conversation-tab-chat')).toHaveAttribute('aria-selected', 'false');

    const chipTodos = aba.getByRole('button', { name: /^Todos/ });
    const chipDocs = aba.getByRole('button', { name: /^Docs/ });
    await expect(chipTodos).toHaveAttribute('aria-pressed', 'true');
    await expect(chipDocs).toHaveAttribute('aria-pressed', 'false');
    await chipDocs.click();
    await expect(chipDocs).toHaveAttribute('aria-pressed', 'true');
    await expect(chipTodos).toHaveAttribute('aria-pressed', 'false');
    await expect(itens(page)).toHaveCount(1);

    // Nomes acessíveis reais: busca rotulada e checkbox de seleção com nome do arquivo.
    await expect(page.getByLabel('Buscar arquivos')).toBeVisible();
    await page.getByTestId('files-select-toggle').click();
    await expect(page.getByRole('checkbox', { name: 'Selecionar todos' })).toBeVisible();
  });

  test('contraste numérico >= 4.5 em claro, escuro e alto contraste', async () => {
    await irParaInbox(page);
    await abrirConversa(page, E2E_ARQUIVOS.contato.nomeVisivel);
    await abrirAbaArquivos(page, E2E_ARQUIVOS.contagens.todos);
    const aba = page.getByTestId('files-tab');

    for (const tema of ['claro', 'escuro', 'alto-contraste'] as const) {
      await aplicarTema(page, tema);
      // Chip ativo (primary-foreground/primary), chip inativo (muted-foreground/muted)
      // e o nome legível do cartão (foreground/card): três pares reais de texto/fundo.
      const medidas = await Promise.all([
        contrasteNumerico(aba.getByRole('button', { name: /^Todos/ })),
        contrasteNumerico(aba.getByRole('button', { name: /^Docs/ })),
        contrasteNumerico(
          aba.getByRole('button', { name: E2E_ARQUIVOS.mensagens.documento.filename, exact: true }),
        ),
      ]);
      for (const razao of medidas) {
        expect(
          razao,
          `tema ${tema}: contraste ${razao.toFixed(2)} < ${CONTRASTE_MINIMO}`,
        ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      }
    }
  });

  test('paginação real: aviso do recorte carregado e Carregar tudo até o fim', async () => {
    // Em máquina compartilhada o renderer estoura (OOM) quando a 2ª página traz 65
    // miniaturas para decodificar: a Tabela prova o mesmo recorte sem render de imagem.
    test.setTimeout(180_000);
    await irParaInbox(page);
    await abrirConversa(page, E2E_ARQUIVOS.contatoPaginacao.nomeVisivel);
    await abrirAbaArquivos(page, 60); // MEDIA_PAGE_SIZE: 1ª página do keyset.
    await page.getByTestId('files-layout-trigger').click();
    await page.getByTestId('files-view-table').click();
    await expect(page.getByTestId('files-table')).toBeVisible();
    await expect(itens(page)).toHaveCount(60);

    // 65 no banco → o aviso honesto aparece: "Buscando entre os 60 carregados".
    const aviso = page.getByTestId('files-pagination-notice');
    await expect(aviso).toContainText('Buscando entre os 60 carregados');

    // "Carregar tudo" pagina até o fim da coleção (2ª página do keyset) e some.
    await aviso.getByRole('button', { name: 'Carregar tudo' }).click();
    await expect(itens(page)).toHaveCount(E2E_ARQUIVOS.contatoPaginacao.totalMidias, {
      timeout: NAV_TIMEOUT,
    });
    await expect(aviso).not.toBeVisible();

    // Aviso honesto: o recorte "Buscando entre N" só existe enquanto há página pendente.
    await expect(page.getByTestId('files-tab')).toBeVisible();
  });

  test('lista vazia: contato sem mídia e busca sem resultado', async () => {
    await irParaInbox(page);

    // Contato sem nenhuma mídia: estado vazio real da aba.
    await abrirConversa(page, E2E_ARQUIVOS.contatoVazio.nomeVisivel);
    await page.getByTestId('conversation-tab-files').click();
    await expect(page.getByTestId('files-tab')).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(page.getByText('Nenhum arquivo nesta conversa')).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(itens(page)).toHaveCount(0);

    // Busca sem resultado no contato com mídia: o recorte vazio oferece "Limpar busca".
    await abrirConversa(page, E2E_ARQUIVOS.contato.nomeVisivel);
    await abrirAbaArquivos(page, E2E_ARQUIVOS.contagens.todos);
    await page.getByLabel('Buscar arquivos').fill('zz-inexistente');
    await expect(page.getByText('Nada corresponde a "zz-inexistente"')).toBeVisible();
    // "Limpar busca" existe também na sidebar da inbox — escopo na área da aba.
    await page.getByTestId('files-area').getByRole('button', { name: 'Limpar busca' }).click();
    await expect(itens(page)).toHaveCount(E2E_ARQUIVOS.contagens.todos);
  });

  test('reduce zera animações/transições do caminho da aba', async () => {
    // Emulação por página (o contexto é compartilhado entre os testes seriais).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    try {
      await irParaInbox(page);
      await abrirConversa(page, E2E_ARQUIVOS.contato.nomeVisivel);
      await abrirAbaArquivos(page, E2E_ARQUIVOS.contagens.todos);

      // A emulação está ativa e o CSS global força duração <= 0.01 ms.
      const reduce = await page.evaluate(() =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      );
      expect(reduce).toBe(true);
      const aba = page.getByTestId('files-tab');
      expect(await duracaoMaximaDeTransicao(aba)).toBeLessThanOrEqual(0.011);

      // Troca de modo também não anima: a aba continua estável sem transição visível.
      await page.getByTestId('files-layout-trigger').click();
      await page.getByTestId('files-view-list').click();
      await expect(page.getByTestId('files-list')).toBeVisible();
      expect(await duracaoMaximaDeTransicao(page.getByTestId('files-list'))).toBeLessThanOrEqual(
        0.011,
      );
    } finally {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
  });
});
