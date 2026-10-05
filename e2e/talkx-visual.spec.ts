import { test, expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FixtureVaziaError,
  mockTalkXVisual,
  fixtureDaTela,
  fixturesComDados,
  fixturesVazias,
  loadDemoData,
} from './fixtures/talkx-demo';

declare global {
  interface Window {
    /** Override do deadline do watchdog de boot (index.html). */
    __BOOT_DEADLINE_MS?: number;
  }
}

/**
 * Régua visual do Talk X (plano V4, etapa X004).
 *
 * Captura cada uma das 17 telas do mock (docs/talkx/references/*.png) com a
 * sessão falsa + fixture de X003 (mockTalkXVisual), no viewport 1672×941 e tema
 * escuro (projeto `chromium-talkx-visual`). Roda DESLOGADO — sem setup e sem
 * secrets — por isso entra no workflow de PR (e2e-talkx.yml).
 *
 * As 17 telas têm fixtures sintéticas próprias. A régua captura as 14 telas já
 * implementadas; 13, 14 e 15 preservam o marcador explícito de componente ausente.
 * Telas cujo componente ainda não existe (hoje 13, 14 e 15) gravam um marcador
 * `nao-existe-NN.txt` em vez de falhar. O `scripts/talkx/lado-a-lado.mjs` monta
 * as duplas (mock | captura) a partir daqui.
 */

const OUT = join(import.meta.dirname, 'talkx-visual');

type Tela = {
  n: string;
  nome: string;
  existe: boolean;
  conteudoVisivel?: string;
  abrir?: (page: Page) => Promise<void>;
};

async function abrirTalkX(page: Page) {
  await page.goto('/?view=talkx');
  // O teto de 15 s cobre apenas o primeiro carregamento do Vite frio. O timeout
  // padrão de 5 s oscilava antes de o React 19 montar o shell em workers paralelos.
  await expect(page.getByRole('tab', { name: 'Visão geral' })).toBeVisible({ timeout: 15000 });
}

// Após X007, "Segmentos", "Templates", "Analytics" e "Configurações" deixaram de ser
// abas simples (role=tab) e viraram itens de menu ("Analytics ▾"/"Templates ▾"). Como
// cada aba ganhou endereço próprio (?tab=/sub=), a régua navega pelo deep link, que é
// exatamente o comportamento aceite da etapa.
const TAB_URL: Record<string, string> = {
  'Visão geral': '/?view=talkx&tab=overview',
  Segmentos: '/?view=talkx&tab=segments',
  Templates: '/?view=talkx&tab=templates',
  'Lista de supressão': '/?view=talkx&tab=suppression',
  Analytics: '/?view=talkx&tab=analytics',
  Configurações: '/?view=talkx&tab=analytics&sub=configuracoes',
};

async function abrirTab(page: Page, tab: string) {
  await page.goto(TAB_URL[tab] ?? '/?view=talkx');
  await expect(page.getByRole('tab', { name: 'Visão geral' })).toBeVisible({ timeout: 15000 });
}

// Clicar no nome de uma campanha (coluna "Campanha" da tabela) dispara o
// `onView` do TalkXView, que roteia para agendada/andamento/monitor conforme o
// status da campanha. Nomes vêm da fixture 01.
async function abrirCampanha(page: Page, nome: string) {
  await abrirTalkX(page);
  await page.getByText(nome, { exact: false }).first().click();
  await expect(page.getByRole('tab', { name: 'Visão geral' })).toBeHidden();
}

async function abrirAjuda(page: Page) {
  await abrirTalkX(page);
  await page.getByRole('button', { name: 'Ajuda' }).click();
}

async function capturar(page: Page, caminho: string) {
  // Deixa o mock estabilizar e o layout assentar antes da foto.
  await page.waitForTimeout(600);
  await page.screenshot({ path: caminho });
}

const TELAS: Tela[] = [
  {
    n: '01',
    nome: 'Campanhas — Visão geral',
    existe: true,
    conteudoVisivel: 'Lançamento Linha Office',
    abrir: (p) => abrirTalkX(p),
  },
  {
    n: '02',
    nome: 'Segmentos — biblioteca e detalhes',
    existe: true,
    conteudoVisivel: 'Leads Quentes',
    abrir: (p) => abrirTab(p, 'Segmentos'),
  },
  {
    n: '03',
    nome: 'Segmentos — criar/editar',
    existe: true,
    conteudoVisivel: 'Regras do segmento',
    abrir: async (p) => {
      await abrirTab(p, 'Segmentos');
      await p.getByRole('button', { name: 'Novo segmento' }).click();
    },
  },
  {
    n: '04',
    nome: 'Templates — biblioteca',
    existe: true,
    conteudoVisivel: 'Boas-vindas VIP',
    abrir: (p) => abrirTab(p, 'Templates'),
  },
  {
    n: '05',
    nome: 'Templates — criar/editar',
    existe: true,
    conteudoVisivel: 'Novo template',
    abrir: async (p) => {
      await abrirTab(p, 'Templates');
      await p.getByRole('button', { name: 'Novo Template' }).click();
    },
  },
  {
    n: '06',
    nome: 'Lista de supressão',
    existe: true,
    conteudoVisivel: 'Ana Souza',
    abrir: (p) => abrirTab(p, 'Lista de supressão'),
  },
  {
    n: '07',
    nome: 'Analytics',
    existe: true,
    conteudoVisivel: 'Dia do Cliente',
    abrir: (p) => abrirTab(p, 'Analytics'),
  },
  {
    n: '08',
    nome: 'Nova campanha',
    existe: true,
    conteudoVisivel: 'Nova campanha',
    abrir: async (p) => {
      await p.goto('/?view=talkx&wizard=new&step=1');
      await expect(p.getByRole('heading', { name: /Nova campanha|Revisão Final/ })).toBeVisible({
        timeout: 15000,
      });
    },
  },
  {
    n: '09',
    nome: 'Revisão final e confirmação',
    existe: true,
    conteudoVisivel: 'Revisão Final',
    abrir: async (p) => {
      await p.goto('/?view=talkx&wizard=new&step=4');
      await expect(p.getByRole('heading', { name: /Nova campanha|Revisão Final/ })).toBeVisible({
        timeout: 15000,
      });
    },
  },
  {
    n: '10',
    nome: 'Campanha agendada',
    existe: true,
    conteudoVisivel: 'Black Friday - VIP',
    abrir: (p) => abrirCampanha(p, 'Black Friday - VIP'),
  },
  {
    n: '11',
    nome: 'Monitor ao vivo',
    existe: true,
    conteudoVisivel: 'Dia do Cliente',
    abrir: (p) => abrirCampanha(p, 'Dia do Cliente'),
  },
  {
    n: '12',
    nome: 'Campanha em andamento',
    existe: true,
    conteudoVisivel: 'Campanha em Andamento',
    abrir: (p) => abrirCampanha(p, 'Lançamento Linha Office'),
  },
  { n: '13', nome: 'Campanha pausada e retomada', existe: false },
  { n: '14', nome: 'Relatório da campanha concluída', existe: false },
  { n: '15', nome: 'Importação e vinculação CRM360', existe: false },
  {
    n: '16',
    nome: 'Ajuda Talk X',
    existe: true,
    conteudoVisivel: 'Ajuda — Campanhas (Talk X)',
    abrir: (p) => abrirAjuda(p),
  },
  {
    n: '17',
    nome: 'Estados do sistema e modais',
    existe: true,
    conteudoVisivel: 'Configurações Talk X',
    abrir: (p) => abrirTab(p, 'Configurações'),
  },
];

// Watchdog de boot (index.html): o default de produção continua 8s; aqui o spec
// eleva o deadline para 60s. Sem isso a régua é flaky: com o dev server vite
// frio e vários workers em paralelo, o React 19 pode levar >8s para montar, o
// watchdog apaga o #root e a tela vira "⚠️ Falha ao inicializar o app" em vez do
// componente — falha de captura sem relação com o produto.
test.beforeEach(async ({ page }) => {
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

    // Toda tela possui dados sintéticos. O guard anti-vazio (loadDemoData)
    // impede regressão para `{}` ou coleções sem registros.
    const fixture = fixtureDaTela(tela.n);
    expect(fixture, `fixture com dados da tela ${tela.n}`).toBeDefined();

    await mockTalkXVisual(page, fixture!);
    await tela.abrir!(page);
    await expect(
      page.getByText(tela.conteudoVisivel!, { exact: false }).first(),
      `conteúdo característico visível antes da captura da tela ${tela.n}`
    ).toBeVisible({ timeout: 15000 });
    const arquivo = join(OUT, `captura-${tela.n}.png`);
    await capturar(page, arquivo);

    // A régua não pode passar sem medir: se a captura não chegou ao disco (ou
    // saiu vazia), a tela não conta como medida e o lado-a-lado mostraria
    // buraco. Tamanho mínimo de 1 KB — um PNG 1672×941 real fica muito acima.
    expect(existsSync(arquivo)).toBe(true);
    expect(statSync(arquivo).size).toBeGreaterThan(1000);
  });
}

// Prova de largura de celular: usa uma tela cheia e garante que o shell não
// cria rolagem horizontal na página (a tabela conserva seu scroll interno).
test('celular — lista de supressão cheia', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = fixtureDaTela('06');
  expect(fixture).toBeDefined();
  await mockTalkXVisual(page, fixture!);
  await abrirTab(page, 'Lista de supressão');
  await expect(page.getByText('Ana Souza')).toBeVisible();
  await capturar(page, join(OUT, 'captura-06-mobile.png'));
  const semOverflowDaPagina = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  );
  expect(semOverflowDaPagina).toBe(true);
});

// Contrato de dados oficializado em X003: `{}` e arrays sem registros são
// erro, nunca uma tela renderizada vazia em silêncio.
test.describe('contrato de dados das fixtures (X003)', () => {
  test('loadDemoData e mockTalkXVisual rejeitam fixtures vazias', async ({ page }) => {
    const fixtureDir = mkdtempSync(join(process.env.TMPDIR ?? OUT, 'talkx-fixture-vazia-'));
    try {
      writeFileSync(join(fixtureDir, 'objeto-vazio.json'), '{}');
      writeFileSync(join(fixtureDir, 'colecoes-vazias.json'), '{"talkx_campaigns":[]}');

      expect(() => loadDemoData('objeto-vazio', fixtureDir)).toThrow(FixtureVaziaError);
      expect(() => loadDemoData('colecoes-vazias', fixtureDir)).toThrow(FixtureVaziaError);
      await expect(mockTalkXVisual(page, 'objeto-vazio', fixtureDir)).rejects.toThrow(
        FixtureVaziaError
      );
      await expect(mockTalkXVisual(page, 'colecoes-vazias', fixtureDir)).rejects.toThrow(
        FixtureVaziaError
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('a régua tem fixture real para as 17 telas', () => {
    expect(fixturesVazias()).toEqual([]);
    expect(fixturesComDados()).toHaveLength(17);
    for (const tela of TELAS) {
      expect(fixtureDaTela(tela.n), `fixture da tela ${tela.n}`).toMatch(new RegExp(`^${tela.n}-`));
    }
  });

  test('fixtures de campanha mantêm relações na campanha aberta', () => {
    const casos = [
      { slug: '11-monitor-ao-vivo', campaignId: 'camp-002' },
      { slug: '13-campanha-pausada-retomada', campaignId: 'camp-010' },
      { slug: '14-relatorio-campanha-concluida', campaignId: 'camp-002' },
    ];
    const tabelasRelacionadas = [
      'talkx_recipients',
      'talkx_campaign_events',
      'talkx_campaign_metrics',
      'talkx_link_clicks',
    ];

    for (const { slug, campaignId } of casos) {
      const data = loadDemoData(slug);
      expect(data.talkx_campaigns).toContainEqual(expect.objectContaining({ id: campaignId }));
      for (const tabela of tabelasRelacionadas) {
        for (const row of data[tabela] ?? []) {
          expect(row).toEqual(expect.objectContaining({ campaign_id: campaignId }));
        }
      }
    }

    const pausada = loadDemoData('13-campanha-pausada-retomada');
    expect(pausada.talkx_segments).toContainEqual(expect.objectContaining({ id: 'seg-office' }));
  });
});
