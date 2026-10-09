import { test, expect, type Locator, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  mockTalkXVisual,
  loadDemoData,
  FixtureVaziaError,
  fixtureDaTela,
  fixturesComDados,
  fixturesVazias,
  ESCRITA_NAO_PREVISTA,
} from './fixtures/talkx-demo';
import type { TalkXDemoData } from './fixtures/talkx-demo';

declare global {
  interface Window {
    /** Override do deadline do watchdog de boot (index.html). */
    __BOOT_DEADLINE_MS?: number;
  }
}

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

/** Tags do axe para o alvo do cartão TL-175D: WCAG 2.0 A/AA + WCAG 2.1 A/AA. */
const TAGS_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;
const TEMAS = ['dark', 'light'] as const;
type Tema = (typeof TEMAS)[number];

/**
 * Régua visual do Talk X (plano V4, etapa X004) + régua de ACESSIBILIDADE
 * (TL-175D).
 *
 * (1) Captura cada uma das 17 telas do mock (docs/talkx/references/*.png) com a
 *     sessão falsa + fixture de X003 (mockTalkXVisual), no viewport 1672×941 e
 *     tema escuro (projeto `chromium-talkx-visual`). Roda DESLOGADO — sem setup
 *     e sem secrets — por isso entra no workflow de PR (e2e-talkx.yml).
 *
 * (2) TL-175D: roda o axe-core (tags WCAG 2.1 AA) em cada tela nos temas claro
 *     E escuro e exercita a navegação por teclado (Tab na ordem visual, Esc
 *     fechando modal com devolução de foco, Enter/Espaço acionando controles,
 *     setas nas abas e ações de linha sem mouse).
 *
 * Contrato de crescimento (X003/X004): a régua só cobre a tela cuja fixture tem
 * dados. Fixture `{}` é erro (loadDemoData lança FixtureVaziaError), não uma tela
 * vazia renderizada em silêncio. Tela que o Talk X ainda não tem é declarada no
 * PRÓPRIO fixture (`{"tela":{"aplicavel":false,"motivo":"..."}}`) — a régua pula
 * com o motivo escrito, nunca por omissão. As fixtures sintéticas vivem em
 * e2e/fixtures/talkx-demo/ (nenhum dado real, nenhuma sessão salva).
 */

const OUT = join(import.meta.dirname, 'talkx-visual');

type Tela = {
  n: string;
  nome: string;
  existe: boolean;
  abrir?: (page: Page) => Promise<void>;
};

/**
 * Abre a URL e espera a tela do módulo. O servidor de desenvolvimento às vezes
 * entrega a primeira renderização devagar; a régua tenta de novo em vez de
 * reprovar a tela por um boot lento (nenhuma asserção é afrouxada: o alvo tem
 * de aparecer).
 */
async function abrirComEspera(page: Page, url: string, alvo: () => Locator, tentativas = 4) {
  for (let i = 1; i <= tentativas; i += 1) {
    // `domcontentloaded` em vez de `load`: com o Vite compilando sob demanda, o
    // `load` espera o grafo inteiro de módulos e estoura o próprio timeout da
    // navegação, o que reprovava a tela por boot lento em vez de por defeito.
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    if (await alvo().isVisible({ timeout: 20_000 }).catch(() => false)) return;
    if (i < tentativas) await page.waitForTimeout(1_500);
  }
  await expect(alvo(), `a tela não abriu em ${tentativas} tentativas (${url})`).toBeVisible({
    timeout: 20_000,
  });
}

async function abrirTalkX(page: Page) {
  await abrirComEspera(page, '/?view=talkx', () => page.getByRole('tab', { name: 'Visão geral' }));
}

// Após X007, "Segmentos", "Templates", "Analytics" e "Configurações" deixaram de ser
// abas simples (role=tab) e viraram itens de menu ("Analytics ▾"/"Templates ▾"). Como
// cada aba ganhou endereço próprio (?tab=/sub=), a régua navega pelo deep link, que é
// exatamente o comportamento aceite da etapa.
const TAB_URL: Record<string, string> = {
  'Visão geral': '/?view=talkx&tab=overview',
  'Segmentos': '/?view=talkx&tab=segments',
  'Templates': '/?view=talkx&tab=templates',
  'Lista de supressão': '/?view=talkx&tab=suppression',
  'Analytics': '/?view=talkx&tab=analytics',
  'Configurações': '/?view=talkx&tab=analytics&sub=configuracoes',
};

async function abrirTab(page: Page, tab: string) {
  await abrirComEspera(page, TAB_URL[tab] ?? '/?view=talkx', () =>
    page.getByRole('tab', { name: 'Visão geral' }),
  );
}

// Clicar no nome de uma campanha (coluna "Campanha" da tabela) dispara o
// `onView` do TalkXView, que roteia para agendada/andamento/monitor conforme o
// status da campanha. Nomes vêm da fixture da tela.
async function abrirCampanha(page: Page, nome: string) {
  await abrirTalkX(page);
  await page.getByText(nome, { exact: false }).first().click();
  await expect(page.getByRole('tab', { name: 'Visão geral' })).toBeHidden({ timeout: 20_000 });
}

async function abrirAjuda(page: Page) {
  await abrirTalkX(page);
  await page.getByRole('button', { name: 'Ajuda', exact: true }).click();
}

async function capturar(page: Page, caminho: string) {
  // Deixa o mock estabilizar e o layout assentar antes da foto.
  await page.waitForTimeout(600);
  await page.screenshot({ path: caminho });
}

const TELAS: Tela[] = [
  { n: '01', nome: 'Campanhas — Visão geral', existe: true, abrir: (p) => abrirTalkX(p) },
  { n: '02', nome: 'Segmentos — biblioteca e detalhes', existe: true, abrir: (p) => abrirTab(p, 'Segmentos') },
  { n: '03', nome: 'Segmentos — criar/editar', existe: true, abrir: async (p) => { await abrirTab(p, 'Segmentos'); await p.getByRole('button', { name: 'Novo segmento' }).click(); } },
  { n: '04', nome: 'Templates — biblioteca', existe: true, abrir: (p) => abrirTab(p, 'Templates') },
  { n: '05', nome: 'Templates — criar/editar', existe: true, abrir: async (p) => { await abrirTab(p, 'Templates'); await p.getByRole('button', { name: 'Novo Template' }).click(); } },
  { n: '06', nome: 'Lista de supressão', existe: true, abrir: (p) => abrirTab(p, 'Lista de supressão') },
  { n: '07', nome: 'Analytics', existe: true, abrir: (p) => abrirTab(p, 'Analytics') },
  { n: '08', nome: 'Nova campanha', existe: true, abrir: (p) => abrirComEspera(p, '/?view=talkx&wizard=new&step=1', () => p.getByRole('heading', { name: /Nova campanha|Revisão Final/ })) },
  { n: '09', nome: 'Revisão final e confirmação', existe: true, abrir: (p) => abrirComEspera(p, '/?view=talkx&wizard=new&step=4', () => p.getByRole('heading', { name: /Nova campanha|Revisão Final/ })) },
  { n: '10', nome: 'Campanha agendada', existe: true, abrir: (p) => abrirCampanha(p, 'Promoção de Outubro') },
  { n: '11', nome: 'Monitor ao vivo', existe: true, abrir: (p) => abrirCampanha(p, 'Dia do Cliente') },
  { n: '12', nome: 'Campanha em andamento', existe: true, abrir: (p) => abrirCampanha(p, 'Lançamento Linha Office') },
  { n: '13', nome: 'Campanha pausada e retomada', existe: true, abrir: (p) => abrirCampanha(p, 'Campanha Pausada Renova') },
  { n: '14', nome: 'Relatório da campanha concluída', existe: false },
  { n: '15', nome: 'Importação e vinculação CRM360', existe: false },
  { n: '16', nome: 'Ajuda Talk X', existe: true, abrir: (p) => abrirAjuda(p) },
  { n: '17', nome: 'Estados do sistema e modais', existe: true, abrir: (p) => abrirTab(p, 'Configurações') },
];

// Tela que o Talk X ainda não tem é dita no PRÓPRIO fixture — a régua pula com o
// motivo escrito em vez de sumir em silêncio.
type EstadoDaTela = { aplicavel?: boolean; motivo?: string };

function estadoDaTela(slug: string): EstadoDaTela | undefined {
  const data = loadDemoData(slug) as Record<string, unknown>;
  const tela = data.tela;
  return tela && typeof tela === 'object' ? (tela as EstadoDaTela) : undefined;
}

// Watchdog de boot (index.html): o default de produção continua 8s; aqui o spec
// eleva o deadline para 60s. Sem isso a régua é flaky: com o dev server vite
// frio e vários workers em paralelo, o React 19 pode levar >8s para montar, o
// watchdog apaga o #root e a tela vira "⚠️ Falha ao inicializar o app" em vez do
// componente — falha de captura sem relação com o produto.
test.beforeEach(async ({ page }) => {
  // A régua inteira abre o app num dev server frio e, na parte de teclado, tabula
  // dezenas de controles: triplica o teto de tempo para o teste não morrer por
  // relógio (o que importa aqui é o que o navegador mede, não a pressa).
  test.slow();
  await page.addInitScript(() => {
    window.__BOOT_DEADLINE_MS = 60000;
  });
});

for (const tela of TELAS) {
  test(`tela ${tela.n} — ${tela.nome}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });

    // Tela cujo componente ainda não existe: registra o motivo e não captura.
    if (!tela.existe) {
      writeFileSync(join(OUT, `nao-existe-${tela.n}.txt`), `tela ainda não existe: ${tela.nome}\n`);
      return;
    }

    // Contrato de crescimento (X003/X004): a régua só captura tela cuja fixture
    // tem dados reais. Fixture vazia ({}) é PULADA — não é falha, é "ainda não é
    // a etapa desta tela". O guard anti-vazio (loadDemoData) aborta se alguém
    // referenciar uma fixture {} por engano.
    const fixture = fixtureDaTela(tela.n);
    if (!fixture) {
      // Sem fixture, a tela sai da régua: apaga captura de execução anterior
      // para o lado-a-lado não mostrar foto velha como se ainda fosse capturada.
      rmSync(join(OUT, `captura-${tela.n}.png`), { force: true });
    }
    test.skip(!fixture, `sem fixture real — a tela ${tela.n} entra na régua quando a fixture dela crescer (etapa da tela)`);

    await mockTalkXVisual(page, fixture!);
    await tela.abrir!(page);
    const arquivo = join(OUT, `captura-${tela.n}.png`);
    await capturar(page, arquivo);

    // A régua não pode passar sem medir: se a captura não chegou ao disco (ou
    // saiu vazia), a tela não conta como medida e o lado-a-lado mostraria
    // buraco. Tamanho mínimo de 1 KB — um PNG 1672×941 real fica muito acima.
    expect(existsSync(arquivo)).toBe(true);
    expect(statSync(arquivo).size).toBeGreaterThan(1000);
  });
}

// ---------------------------------------------------------------------------
// TL-175D — régua de acessibilidade: axe WCAG 2.1 AA por tela, nos dois temas,
// e navegação por teclado. Mede o produto de verdade (Chromium real, sessão
// falsa + fixture sintética), nunca uma fixture de mentira.
// ---------------------------------------------------------------------------

/**
 * Abre a tela com o fixture dela e o tema pedido. `mockTalkXVisual` registra o
 * script que fixa `theme=dark` (installFakeSession); o script registrado DEPOIS
 * roda por último e vence, então o tema claro só precisa ser pedido aqui.
 */
async function preparar(page: Page, fixture: string, tema: Tema, abrir: (page: Page) => Promise<void>) {
  await mockTalkXVisual(page, fixture);
  // O harness do demo (e2e/fixtures/talkx-demo.ts) só serve as tabelas `talkx_*` a
  // partir da fixture; o resto do app shell responde vazio (catch-all). A
  // `whatsapp_connections` TAMBÉM é dado da régua — o passo 1 do assistente só
  // avança (canProceed[1]) com uma conexão ativa —, então a servimos da PRÓPRIA
  // fixture. Continuam dados sintéticos, nunca produção. Rota registrada DEPOIS
  // do harness: em Playwright a última rota registrada vence o catch-all.
  const conexoes = (loadDemoData(fixture) as Record<string, unknown>).whatsapp_connections ?? [];
  await page.route(/\/rest\/v1\/whatsapp_connections/, (route) =>
    route.request().method() === 'GET' || route.request().method() === 'HEAD'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conexoes) })
      : route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ message: ESCRITA_NAO_PREVISTA }),
        }),
  );
  await page.addInitScript((t: Tema) => {
    window.localStorage.setItem('theme', t);
  }, tema);
  await abrir(page);
  // Avisos do sonner são transientes e NÃO são a tela: presentes no instante da
  // varredura, o alvo do axe vira `div[data-title=""]` (o aviso com título vazio)
  // e o MESMO teste passa ou falha de uma rodada para outra — foi o que fez as
  // telas 04 e 06 oscilarem. A régua mede a tela em repouso: espera a região de
  // avisos ficar vazia por duas leituras seguidas (um aviso aberto sai sozinho).
  const avisos = page.locator('[data-sonner-toast]');
  await expect
    .poll(
      async () => {
        if ((await avisos.count()) > 0) return false;
        await page.waitForTimeout(300);
        return (await avisos.count()) === 0;
      },
      { timeout: 10_000, intervals: [500] },
    )
    .toBe(true);
  await page.waitForTimeout(200);
}

type Violacao = { id: string; impact: string | null; nos: number; alvos: string[] };

async function violacoesAxe(page: Page): Promise<Violacao[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async (tags) => {
    const axe = (window as unknown as {
      axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> };
    }).axe;
    const resultado = await axe.run(document.body, {
      runOnly: { type: 'tag', values: tags },
    });
    return resultado.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nos: v.nodes.length,
      alvos: v.nodes.map((node) => node.target.join(' ')),
    }));
  }, [...TAGS_WCAG]);
}

type Ativo = {
  tag: string;
  role: string | null;
  nome: string;
  placeholder: string;
  visivel: boolean;
  top: number;
  left: number;
  dentroDaTela: boolean;
};

async function ativo(page: Page): Promise<Ativo | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const r = el.getBoundingClientRect();
    const nome = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      nome: nome.slice(0, 60),
      placeholder: (el as HTMLInputElement).placeholder ?? '',
      visivel: r.width > 0 && r.height > 0,
      top: Math.round(r.top),
      left: Math.round(r.left),
      dentroDaTela: r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth,
    };
  });
}

/** Tabula até o elemento ativo casar com o predicado (ou estourar `max`). */
async function focarPorTeclado(
  page: Page,
  casa: (a: Ativo) => boolean,
  max = 40,
): Promise<Ativo | null> {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    const a = await ativo(page);
    if (a && casa(a)) return a;
  }
  return null;
}

// --- axe WCAG 2.1 AA, tela × tema -----------------------------------------

for (const tela of TELAS) {
  for (const tema of TEMAS) {
    test(`axe WCAG 2.1 AA — tela ${tela.n} (${tema === 'dark' ? 'escuro' : 'claro'})`, async ({ page }) => {
      const fixture = fixtureDaTela(tela.n);
      test.skip(!fixture, 'tela sem fixture — fora da régua');

      const estado = estadoDaTela(fixture!);
      test.skip(
        estado?.aplicavel === false,
        `${tela.nome}: ${estado?.motivo ?? 'estado não aplicável declarado no fixture'}`,
      );

      expect(tela.abrir, `tela ${tela.n} aplicável mas sem rota de abertura`).toBeTruthy();
      await preparar(page, fixture!, tema, tela.abrir!);

      const violacoes = await violacoesAxe(page);
      expect(
        violacoes,
        `axe WCAG 2.1 AA reprovou a tela ${tela.n} (${tema}): ${JSON.stringify(violacoes.map((v) => ({ id: v.id, nos: v.nos, alvos: v.alvos })))}`,
      ).toEqual([]);
    });
  }
}

test.describe('cobertura da régua de acessibilidade', () => {
  test('as 17 telas têm fixture com dados ou declaram estado não aplicável', () => {
    expect(TELAS).toHaveLength(17);
    const semFixture = TELAS.filter((tela) => !fixtureDaTela(tela.n)).map((tela) => tela.n);
    expect(semFixture, 'toda tela precisa de fixture (com dados ou declaração)').toEqual([]);
  });

  test('só a tela sem componente/rota no Talk X declara estado não aplicável', () => {
    const naoAplicaveis = TELAS.filter((tela) => {
      const slug = fixtureDaTela(tela.n);
      return slug ? estadoDaTela(slug)?.aplicavel === false : false;
    }).map((tela) => tela.n);
    expect(naoAplicaveis).toEqual(['14', '15']);
  });
});

// --- teclado: Tab, Esc, Enter/Espaço, setas e ações de linha --------------

test.describe('acessibilidade por teclado', () => {
  for (const tela of TELAS) {
    const fixture = fixtureDaTela(tela.n);
    const estado = fixture ? estadoDaTela(fixture) : undefined;

    test(`Tab percorre os controles da tela ${tela.n} sem perder o foco`, async ({ page }) => {
      test.skip(!fixture, 'tela sem fixture — fora da régua');
      test.skip(estado?.aplicavel === false, `${tela.nome}: ${estado?.motivo ?? 'estado não aplicável'}`);
      expect(tela.abrir, `tela ${tela.n} aplicável mas sem rota de abertura`).toBeTruthy();

      await preparar(page, fixture!, 'dark', tela.abrir!);

      const alcancados: Ativo[] = [];
      for (let i = 0; i < 10; i += 1) {
        await page.keyboard.press('Tab');
        const a = await ativo(page);
        if (!a) break;
        alcancados.push(a);
      }

      expect(
        alcancados.length,
        `tela ${tela.n}: o Tab precisa alcançar pelo menos 5 controles sem perder o foco`,
      ).toBeGreaterThanOrEqual(5);
      for (const a of alcancados) {
        expect(a.visivel, `tela ${tela.n}: o foco parou num elemento sem tamanho (${a.tag} "${a.nome}")`).toBe(true);
        expect(a.dentroDaTela, `tela ${tela.n}: o foco parou fora da área visível (${a.tag} "${a.nome}")`).toBe(true);
      }
    });
  }

  test('Tab segue a ordem visual dentro do módulo Talk X (tela 01)', async ({ page }) => {
    await preparar(page, fixtureDaTela('01')!, 'dark', TELAS[0].abrir!);

    // Ordem visual = ordem do documento. Um `tabindex` positivo embaralha o foco
    // em relação ao que a tela mostra; nenhum controle do app pode ter um.
    const embaralhadores = await page
      .locator('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')
      .count();
    expect(embaralhadores, 'nenhum elemento pode ter tabindex positivo').toBe(0);

    // Só os controles DENTRO do módulo Talk X entram na régua de ordem: a casca do
    // app (barra lateral, cabeçalho global) tem controles próprios que não são
    // desta tela e não pertencem ao que o mockup mostra.
    const visitados: { indice: number; nome: string }[] = [];
    // A casca do app (links de pulo, barra lateral, cabeçalho global) vem ANTES
    // do módulo na ordem do Tab e sozinha tem dezenas de paradas: o laço é bem
    // mais longo que a régua interna de propósito, e só passa a contar quando o
    // foco entra no módulo.
    for (let i = 0; i < 150 && visitados.length < 12; i += 1) {
      await page.keyboard.press('Tab');
      const passo = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const tablist = document.querySelector('[role="tablist"]');
        if (!tablist) return null;
        // Só os controles DENTRO do módulo entram na régua: a casca do app
        // (links de pulo, sidebar, cabeçalho) fica FORA do `<main>` e tem
        // controles próprios, que não são desta tela. Antes o laço subia até o
        // `body`, então a barra de navegação e o `Close toast` do portal entravam
        // na lista e a volta ao topo do documento virava uma falsa falha de ordem.
        const raiz = tablist.closest('main');
        if (!raiz || !raiz.contains(el)) return null;
        const todos = Array.from(document.querySelectorAll<HTMLElement>('*'));
        const nome = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
        return { indice: todos.indexOf(el), nome: nome.slice(0, 40) };
      });
      if (passo) visitados.push(passo);
    }

    expect(visitados.length, 'o módulo Talk X precisa ter controles na ordem do Tab').toBeGreaterThanOrEqual(
      5,
    );
    for (let i = 1; i < visitados.length; i += 1) {
      expect(
        visitados[i].indice,
        `o Tab voltou na ordem do documento: "${visitados[i - 1].nome}" → "${visitados[i].nome}"`,
      ).toBeGreaterThan(visitados[i - 1].indice);
    }
  });

  test('Esc fecha o modal de Ajuda e devolve o foco ao gatilho (tela 16)', async ({ page }) => {
    // Abre a Visão geral (fixture da tela 16) e chega ao gatilho SÓ pelo teclado.
    await preparar(page, fixtureDaTela('16')!, 'dark', abrirTalkX);

    const gatilho = await focarPorTeclado(page, (a) => a.nome === 'Ajuda', 240);
    expect(gatilho, 'o botão Ajuda precisa ser alcançável pelo Tab').not.toBeNull();

    await page.keyboard.press('Enter');
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText('Ajuda — Campanhas (Talk X)')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();

    const depois = await ativo(page);
    expect(depois, 'ao fechar o modal o foco volta para um controle, não para o body').not.toBeNull();
    expect(depois!.nome, 'o foco volta para o gatilho que abriu o modal').toBe('Ajuda');
  });

  test('Enter e Espaço acionam controles sem mouse (tela 01)', async ({ page }) => {
    await preparar(page, fixtureDaTela('01')!, 'dark', TELAS[0].abrir!);

    const ajuda = await focarPorTeclado(page, (a) => a.nome === 'Ajuda', 240);
    expect(ajuda, 'o botão Ajuda precisa ser alcançável pelo Tab').not.toBeNull();

    // Espaço aciona o botão…
    await page.keyboard.press('Space');
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();

    // …e Enter também (o foco voltou ao gatilho depois do Esc).
    await page.keyboard.press('Enter');
    await expect(dialogo).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
  });

  test('as setas navegam entre as abas do Talk X (tela 01)', async ({ page }) => {
    await preparar(page, fixtureDaTela('01')!, 'dark', TELAS[0].abrir!);

    const aba = await focarPorTeclado(page, (a) => a.role === 'tab', 200);
    expect(aba, 'o Tab precisa alcançar a lista de abas').not.toBeNull();

    // O Radix move o foco na seta e a seleção dispara `goTab` (URL + troca de
    // `TabsContent`): o foco assenta de forma ASSÍNCRONA — medido no Chromium, no
    // mesmo tick o foco ainda está na aba antiga e só ~150 ms depois chega à nova.
    // Por isso a régua ESPERA o foco chegar (poll) em vez de lê-lo no mesmo tick.
    // A exigência continua a mesma (o foco tem de MUDAR de aba); o que deixa de
    // ser exigido é que a troca seja síncrona — ler no tick errado reprovava a
    // tela por corrida de render, não por defeito de teclado.
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await ativo(page))?.nome, { message: 'a seta leva o foco para outra aba' })
      .not.toBe(aba!.nome);
    expect((await ativo(page))?.role, 'o foco da seta precisa parar numa aba').toBe('tab');

    await page.keyboard.press('ArrowLeft');
    await expect
      .poll(async () => (await ativo(page))?.nome, { message: 'a seta de volta devolve o foco à aba anterior' })
      .toBe(aba!.nome);
    expect((await ativo(page))?.role).toBe('tab');
  });

  test('as ações de linha são alcançáveis e acionáveis sem mouse (tela 01)', async ({ page }) => {
    await preparar(page, fixtureDaTela('01')!, 'dark', TELAS[0].abrir!);

    const acoes = await focarPorTeclado(page, (a) => a.nome === 'Ações', 220);
    expect(acoes, 'o menu de ações da linha precisa ser alcançável pelo Tab').not.toBeNull();

    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('o assistente de campanha avança do público à revisão sem mouse (telas 08 e 09)', async ({ page }) => {
    // Passo 1 — Informações da campanha tem de ter nome (>= 3 caracteres) e
    // conexão ativa (a fixture 08 traz `whatsapp_connections`), e a origem do
    // público é um botão (SourceCard): o teclado digita o nome, escolhe o
    // segmento e avança um passo sem nenhum clique de mouse.
    await preparar(page, fixtureDaTela('08')!, 'dark', TELAS[7].abrir!);

    const campoNome = await focarPorTeclado(page, (a) => a.placeholder.startsWith('Ex: Lançamento'), 240);
    expect(campoNome, 'o campo Nome da campanha precisa ser alcançável pelo Tab').not.toBeNull();
    await page.keyboard.type('Campanha por teclado');

    const fonte = await focarPorTeclado(page, (a) => a.nome.includes('Segmento salvo'), 240);
    expect(fonte, 'a origem "Segmento salvo" precisa ser alcançável pelo Tab').not.toBeNull();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /Segmento salvo/ })).toHaveClass(/border-primary/);

    const segmento = await focarPorTeclado(page, (a) => a.nome.startsWith('VIP'), 240);
    expect(segmento, 'o segmento da fixture precisa ser alcançável pelo Tab').not.toBeNull();
    await page.keyboard.press('Enter');

    const continuar = await focarPorTeclado(page, (a) => a.nome.startsWith('Continuar'), 240);
    expect(continuar, 'o botão Continuar precisa ser alcançável pelo Tab com o público escolhido').not.toBeNull();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => new URL(page.url()).searchParams.get('step'), { message: 'o assistente avança de passo pelo teclado' })
      .toBe('2');

    // Passo 4 — revisão final: os controles da tela respondem ao Tab.
    await preparar(page, fixtureDaTela('09')!, 'dark', TELAS[8].abrir!);
    await expect(page.getByText('Revisão Final').first()).toBeVisible();
    const controles = await focarPorTeclado(page, (a) => a.tag === 'button' || a.role === 'button', 240);
    expect(controles, 'a revisão final precisa expor controles alcançáveis pelo Tab').not.toBeNull();
  });
});

// Contrato de crescimento oficializado em X003: referenciar uma fixture {} é
// erro, nunca uma tela renderizada vazia em silêncio.
test.describe('contrato de crescimento das fixtures (X003)', () => {
  test('referenciar uma fixture vazia ({}) lança FixtureVaziaError', async ({ page }) => {
    const vazia = fixturesVazias()[0];
    test.skip(!vazia, 'todas as fixtures já têm dados — nada a guardar');

    expect(() => loadDemoData(vazia!)).toThrow(FixtureVaziaError);
    await expect(mockTalkXVisual(page, vazia!)).rejects.toThrow(FixtureVaziaError);
  });

  test('a régua só considera telas com fixture real', () => {
    expect(fixtureDaTela('01')).toBe('01-campanhas-visao-geral');
    for (const slug of fixturesVazias()) {
      expect(fixtureDaTela(slug.slice(0, 2))).toBeUndefined();
    }
    for (const slug of fixturesComDados()) {
      expect(fixtureDaTela(slug.slice(0, 2))).toBe(slug);
    }
  });
});

// ---------------------------------------------------------------------------
// Coerência das fixtures da régua, por REGRA — não por olho.
//
// Fixture da régua é dado: se `campaign_id`/`segment_id` apontam para id que a
// própria fixture não tem, se a métrica de uma campanha copia o número de
// outra, ou se o mesmo contato aparece com dois telefones, a tela "cheia" do
// mock passa a mentir e a régua fotografa uma mentira. Estas três checagens
// percorrem CADA fixture e reprovam a incoerência pelo nome (arquivo, linha,
// campo) em vez de deixar passar em silêncio.
// ---------------------------------------------------------------------------

type LinhaDemo = Record<string, unknown>;

/** Campo de referência → coleção da MESMA fixture que precisa conter o id. */
const REFERENCIA_INTERNA: Record<string, string> = {
  campaign_id: 'talkx_campaigns',
  segment_id: 'talkx_segments',
  recipient_id: 'talkx_recipients',
};

/** Contadores da campanha: fecham entre si e com `talkx_campaign_metrics`. */
const CONTADORES = [
  'total_recipients',
  'sent_count',
  'failed_count',
  'delivered_count',
  'read_count',
  'replied_count',
  'outcome_unknown_count',
] as const;

function linhas(data: TalkXDemoData, tabela: string): LinhaDemo[] {
  const valor = data[tabela];
  return Array.isArray(valor) ? (valor as LinhaDemo[]) : [];
}

function idsDaTabela(data: TalkXDemoData, tabela: string): Set<string> {
  const conjunto = new Set<string>();
  for (const linha of linhas(data, tabela)) {
    if (typeof linha.id === 'string' && linha.id) conjunto.add(linha.id);
  }
  return conjunto;
}

/** (a) referência (`campaign_id`/`segment_id`/`recipient_id`) para id inexistente. */
function referenciasOrfas(data: TalkXDemoData): string[] {
  const alvos = Object.entries(REFERENCIA_INTERNA).map(
    ([campo, tabela]) => [campo, idsDaTabela(data, tabela)] as const,
  );
  const orfas: string[] = [];
  for (const [tabela, valor] of Object.entries(data)) {
    if (!Array.isArray(valor)) continue;
    for (const bruto of valor) {
      if (bruto === null || typeof bruto !== 'object') continue;
      const linha = bruto as LinhaDemo;
      for (const [campo, existentes] of alvos) {
        const referencia = linha[campo];
        if (typeof referencia === 'string' && referencia && !existentes.has(referencia)) {
          orfas.push(
            `${tabela}.${String(linha.id ?? '?')}: ${campo}="${referencia}" não existe em ${REFERENCIA_INTERNA[campo]}`,
          );
        }
      }
    }
  }
  return orfas;
}

/** (b) métrica que não bate com o contador da campanha, ou contador impossível. */
function metricasIncoerentes(data: TalkXDemoData): string[] {
  const campanhaPorId = new Map<string, LinhaDemo>();
  for (const campanha of linhas(data, 'talkx_campaigns')) {
    if (typeof campanha.id === 'string' && campanha.id) campanhaPorId.set(campanha.id, campanha);
  }

  const incoerencias: string[] = [];
  for (const metrica of linhas(data, 'talkx_campaign_metrics')) {
    const campanha =
      typeof metrica.campaign_id === 'string' ? campanhaPorId.get(metrica.campaign_id) : undefined;
    if (!campanha) continue; // campanha inexistente já é reprovada por referenciasOrfas
    for (const campo of CONTADORES) {
      if (campo in metrica && campo in campanha && Number(metrica[campo]) !== Number(campanha[campo])) {
        incoerencias.push(
          `campanha ${String(campanha.id)}: métrica ${campo}=${String(metrica[campo])} difere do contador ${String(campanha[campo])}`,
        );
      }
    }
  }

  for (const campanha of linhas(data, 'talkx_campaigns')) {
    const id = String(campanha.id);
    const enviados = Number(campanha.sent_count);
    const falhas = Number(campanha.failed_count);
    const entregues = Number(campanha.delivered_count);
    const lidas = Number(campanha.read_count);
    const respondidas = Number(campanha.replied_count);
    const destinatarios = Number(campanha.total_recipients);
    if (entregues > enviados) incoerencias.push(`campanha ${id}: entregues ${entregues} > enviados ${enviados}`);
    if (lidas > entregues) incoerencias.push(`campanha ${id}: lidas ${lidas} > entregues ${entregues}`);
    if (respondidas > lidas) incoerencias.push(`campanha ${id}: respondidas ${respondidas} > lidas ${lidas}`);
    if (enviados + falhas > destinatarios) {
      incoerencias.push(`campanha ${id}: enviados+falhas ${enviados + falhas} > destinatários ${destinatarios}`);
    }
  }
  return incoerencias;
}

/** (c) o mesmo contato com telefone diferente entre coleções da mesma fixture. */
function telefonesDivergentes(data: TalkXDemoData): string[] {
  const telefonePorContato = new Map<string, string>();
  const divergencias: string[] = [];
  for (const [tabela, valor] of Object.entries(data)) {
    if (!Array.isArray(valor)) continue;
    for (const bruto of valor) {
      if (bruto === null || typeof bruto !== 'object') continue;
      const linha = bruto as LinhaDemo;
      const aninhado =
        linha.contacts && typeof linha.contacts === 'object' ? (linha.contacts as LinhaDemo) : undefined;
      const telefone = linha.phone ?? linha.phone_number ?? aninhado?.phone;
      // Contato: a linha que aponta um contato (`contact_id`) ou a própria
      // coleção `contacts`. `whatsapp_connections` não é contato e fica de fora.
      const contato =
        typeof linha.contact_id === 'string' && linha.contact_id
          ? linha.contact_id
          : tabela === 'contacts' && typeof linha.id === 'string' && linha.id
            ? linha.id
            : undefined;
      if (typeof telefone !== 'string' || !telefone || !contato) continue;
      const anterior = telefonePorContato.get(contato);
      if (anterior === undefined) telefonePorContato.set(contato, telefone);
      else if (anterior !== telefone) {
        divergencias.push(
          `contato ${contato}: telefone "${telefone}" em ${tabela} difere de "${anterior}"`,
        );
      }
    }
  }
  return divergencias;
}

test.describe('coerência das fixtures da régua visual', () => {
  // Percorre CADA fixture da régua. As ainda `{}` não têm coleção para
  // referenciar; quem guarda a ausência é o contrato de crescimento (acima).
  const slugs = fixturesComDados();
  const problemas = (regra: (data: TalkXDemoData) => string[]) =>
    slugs.flatMap((slug) => regra(loadDemoData(slug)).map((problema) => `${slug}: ${problema}`));

  test('toda referência de campaign_id/segment_id/recipient_id existe na própria fixture', () => {
    expect(problemas(referenciasOrfas)).toEqual([]);
  });

  test('as métricas batem com os contadores da campanha', () => {
    expect(problemas(metricasIncoerentes)).toEqual([]);
  });

  test('o mesmo contato tem o mesmo telefone em todas as coleções', () => {
    expect(problemas(telefonesDivergentes)).toEqual([]);
  });

  // As três regras acima ficam vazias numa fixture que não tem as coleções que
  // elas conferem. Esta prova que elas MORDEM: dada uma fixture incoerente,
  // cada regra reprova pelo campo e pela linha — assim, no dia em que a
  // fixture da tela crescer, a checagem não passa por engano.
  test('as três regras reprovam uma fixture incoerente', () => {
    const incoerente = {
      talkx_campaigns: [
        {
          id: 'camp-1',
          total_recipients: 10,
          sent_count: 8,
          failed_count: 2,
          delivered_count: 8,
          read_count: 0,
          replied_count: 0,
          segment_id: 'seg-inexistente',
        },
      ],
      talkx_segments: [{ id: 'seg-1' }],
      talkx_campaign_metrics: [
        { id: 'met-1', campaign_id: 'camp-1', sent_count: 3 },
        { id: 'met-2', campaign_id: 'camp-inexistente', sent_count: 1 },
      ],
      talkx_recipients: [
        { id: 'rec-1', campaign_id: 'camp-1', contact_id: 'contato-1', phone: '5511900000001' },
      ],
      contacts: [{ id: 'contato-1', phone: '5511900000001' }],
      talkx_blacklist: [{ id: 'blk-1', contact_id: 'contato-1', contacts: { phone: '5511900000002' } }],
    } satisfies TalkXDemoData;

    expect(referenciasOrfas(incoerente)).toEqual([
      expect.stringContaining('segment_id="seg-inexistente"'),
      expect.stringContaining('campaign_id="camp-inexistente"'),
    ]);
    expect(metricasIncoerentes(incoerente)).toEqual([
      expect.stringContaining('sent_count=3 difere do contador 8'),
    ]);
    expect(telefonesDivergentes(incoerente)).toEqual([expect.stringContaining('contato-1')]);
  });
});
