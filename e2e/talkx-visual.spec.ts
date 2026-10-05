import { test, expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FixtureVaziaError,
  fixtureDaTela,
  fixturesComDados,
  fixturesVazias,
  hasDemoRows,
  loadDemoData,
  mockTalkXBackend,
  mockTalkXVisual,
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
  verificarDados?: (page: Page) => Promise<void>;
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
  await page.locator('tbody button').filter({ hasText: nome }).first().click();
  await expect(page.getByRole('tab', { name: 'Visão geral' })).toBeHidden();
}

async function abrirAjuda(page: Page) {
  await abrirTab(page, 'Configurações');
  await expect(page.getByText('default_speed_profile')).toBeVisible();
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
    verificarDados: async (p) => expect(p.getByText('Lançamento Linha Office').first()).toBeVisible(),
    abrir: (p) => abrirTalkX(p),
  },
  {
    n: '02',
    nome: 'Segmentos — biblioteca e detalhes',
    existe: true,
    verificarDados: async (p) => expect(p.getByText('Leads Quentes', { exact: true }).first()).toBeVisible(),
    abrir: (p) => abrirTab(p, 'Segmentos'),
  },
  {
    n: '03',
    nome: 'Segmentos — criar/editar',
    existe: true,
    verificarDados: async (p) => expect(p.getByPlaceholder('Nome do segmento…')).toHaveValue('Leads Quentes'),
    abrir: async (p) => {
      await abrirTab(p, 'Segmentos');
      await p.getByText('Leads Quentes', { exact: true }).first().click();
      await p.getByRole('button', { name: 'Editar segmento' }).click();
    },
  },
  {
    n: '04',
    nome: 'Templates — biblioteca',
    existe: true,
    verificarDados: async (p) => expect(p.getByText('Boas-vindas VIP', { exact: true }).first()).toBeVisible(),
    abrir: (p) => abrirTab(p, 'Templates'),
  },
  {
    n: '05',
    nome: 'Templates — criar/editar',
    existe: true,
    verificarDados: async (p) => expect(p.getByPlaceholder('Boas-vindas')).toHaveValue('Boas-vindas VIP'),
    abrir: async (p) => {
      await abrirTab(p, 'Templates');
      await p.getByText('Boas-vindas VIP', { exact: true }).first().click();
      await p.getByRole('button', { name: 'Editar', exact: true }).first().click();
    },
  },
  {
    n: '06',
    nome: 'Lista de supressão',
    existe: true,
    verificarDados: async (p) => expect(p.getByText('Ana Souza')).toBeVisible(),
    abrir: (p) => abrirTab(p, 'Lista de supressão'),
  },
  {
    n: '07',
    nome: 'Analytics',
    existe: true,
    verificarDados: async (p) => expect(p.getByText('Lançamento Linha Office').first()).toBeVisible(),
    abrir: (p) => abrirTab(p, 'Analytics'),
  },
  {
    n: '08',
    nome: 'Nova campanha',
    existe: true,
    verificarDados: async (p) => expect(p.getByText('Leads Quentes', { exact: true })).toBeVisible(),
    abrir: async (p) => {
      await p.goto('/?view=talkx&wizard=new&step=1');
      await expect(p.getByRole('heading', { name: 'Nova campanha' })).toBeVisible({ timeout: 15000 });
      await p.getByRole('button', { name: /Segmento salvo/ }).click();
    },
  },
  {
    n: '09',
    nome: 'Revisão final e confirmação',
    existe: true,
    verificarDados: async (p) => expect(p.getByText('Black Friday - VIP').first()).toBeVisible(),
    abrir: async (p) => {
      await p.goto('/?view=talkx&wizard=camp-005&step=4');
      await expect(p.getByRole('heading', { name: 'Revisão Final' })).toBeVisible({ timeout: 15000 });
    },
  },
  {
    n: '10',
    nome: 'Campanha agendada',
    existe: true,
    verificarDados: async (p) => expect(p.getByText('Black Friday - VIP').first()).toBeVisible(),
    abrir: (p) => abrirCampanha(p, 'Black Friday - VIP'),
  },
  {
    n: '11',
    nome: 'Monitor ao vivo',
    existe: true,
    verificarDados: async (p) => expect(p.getByText('100% concluído · 890 de 890', { exact: true })).toBeVisible(),
    abrir: (p) => abrirCampanha(p, 'Dia do Cliente'),
  },
  {
    n: '12',
    nome: 'Campanha em andamento',
    existe: true,
    verificarDados: async (p) => expect(p.getByRole('combobox', { name: 'Selecionar campanha' })).toHaveValue('camp-001'),
    abrir: (p) => abrirCampanha(p, 'Lançamento Linha Office'),
  },
  { n: '13', nome: 'Campanha pausada e retomada', existe: false },
  { n: '14', nome: 'Relatório da campanha concluída', existe: false },
  { n: '15', nome: 'Importação e vinculação CRM360', existe: false },
  {
    n: '16',
    nome: 'Ajuda Talk X',
    existe: true,
    verificarDados: async (p) => expect(p.getByText('default_speed_profile')).toBeVisible(),
    abrir: (p) => abrirAjuda(p),
  },
  {
    n: '17',
    nome: 'Estados do sistema e modais',
    existe: true,
    verificarDados: async (p) => expect(p.getByText('default_speed_profile')).toBeVisible(),
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
    expect(tela.verificarDados, `asserção de dados da fixture na tela ${tela.n}`).toBeDefined();
    await tela.verificarDados!(page);
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

  test('hasDemoRows ignora coleções que o mock não serve', () => {
    expect(hasDemoRows({ contacts: [{ id: 'contact-001' }] })).toBe(false);
    expect(hasDemoRows({ whatsapp_connections: [{ id: 'conn-001' }] })).toBe(false);
    expect(hasDemoRows({ talkx_segments: [{ id: 'seg-001' }] })).toBe(true);
  });

  test('mock aplica id=eq e devolve objeto no formato single do PostgREST', async ({ page }) => {
    await mockTalkXBackend(page, '11-monitor-ao-vivo');

    const resposta = await page.evaluate(async () => {
      const response = await fetch(
        'https://fixture.test/rest/v1/talkx_campaigns?id=eq.camp-002',
        { headers: { Accept: 'application/vnd.pgrst.object+json' } }
      );
      return response.json();
    });

    expect(resposta).toMatchObject({ id: 'camp-002', name: 'Dia do Cliente' });
    expect(Array.isArray(resposta)).toBe(false);
  });

  test('métricas e contadores das campanhas permanecem coerentes', () => {
    const casos = [
      { slug: '07-analytics', campaignId: 'camp-001' },
      { slug: '11-monitor-ao-vivo', campaignId: 'camp-002' },
      { slug: '12-campanha-em-andamento', campaignId: 'camp-001' },
      { slug: '13-campanha-pausada-retomada', campaignId: 'camp-010' },
      { slug: '14-relatorio-campanha-concluida', campaignId: 'camp-002' },
    ];

    for (const { slug, campaignId } of casos) {
      const data = loadDemoData(slug);
      const campaign = (data.talkx_campaigns as Array<Record<string, unknown>>).find(
        (row) => row.id === campaignId
      );
      const metrics = (data.talkx_campaign_metrics as Array<Record<string, unknown>> | undefined)?.find(
        (row) => row.campaign_id === campaignId
      );

      expect(campaign, `${slug}: campanha`).toBeDefined();
      expect(metrics, `${slug}: métricas`).toBeDefined();
      for (const field of ['sent_count', 'delivered_count', 'read_count', 'replied_count']) {
        expect(campaign?.[field], `${slug}: ${field}`).toBe(metrics?.[field]);
      }
      expect(Number(campaign?.delivered_count)).toBeLessThanOrEqual(Number(campaign?.sent_count));
      expect(Number(campaign?.read_count)).toBeLessThanOrEqual(Number(campaign?.delivered_count));
      expect(Number(campaign?.replied_count)).toBeLessThanOrEqual(Number(campaign?.read_count));
    }
  });

  test('o mesmo contato conserva o telefone na supressão das telas 06 e 17', () => {
    const tela06 = loadDemoData('06-lista-de-supressao');
    const telefones = new Map(
      (tela06.contacts as Array<Record<string, unknown>>).map((contact) => [contact.id, contact.phone])
    );

    for (const slug of ['06-lista-de-supressao', '17-estados-sistema-modais']) {
      const data = loadDemoData(slug);
      for (const blocked of data.talkx_blacklist as Array<Record<string, unknown>>) {
        const nested = blocked.contacts as Record<string, unknown>;
        expect(nested.phone, `${slug}: ${String(blocked.contact_id)}`).toBe(
          telefones.get(blocked.contact_id)
        );
      }
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
