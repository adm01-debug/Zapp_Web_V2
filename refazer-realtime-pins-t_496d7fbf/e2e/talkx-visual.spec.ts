import { test, expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  mockTalkXVisual,
  loadDemoData,
  FixtureVaziaError,
  fixtureDaTela,
  fixturesComDados,
  fixturesVazias,
} from './fixtures/talkx-demo';
import type { TalkXDemoData } from './fixtures/talkx-demo';

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
 * Contrato de crescimento (X003/X004): a régua só captura a tela cuja fixture
 * tem dados reais (hoje só a 01). Fixture vazia (`{}`) é PULADA, não falha — ela
 * cresce na etapa da própria tela (docs/talkx/v4/etapas/F00-regua-e-governanca.md).
 * Telas cujo componente ainda não existe (hoje 13, 14 e 15) gravam um marcador
 * `nao-existe-NN.txt` em vez de falhar. O `scripts/talkx/lado-a-lado.mjs` monta
 * as duplas (mock | captura) a partir daqui.
 */

const OUT = join(import.meta.dirname, 'talkx-visual');

type Tela = {
  n: string;
  nome: string;
  existe: boolean;
  abrir?: (page: Page) => Promise<void>;
};

async function abrirTalkX(page: Page) {
  await page.goto('/?view=talkx');
  await expect(page.getByRole('tab', { name: 'Visão geral' })).toBeVisible();
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
  await page.goto(TAB_URL[tab] ?? '/?view=talkx');
  await expect(page.getByRole('tab', { name: 'Visão geral' })).toBeVisible();
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
  { n: '01', nome: 'Campanhas — Visão geral', existe: true, abrir: (p) => abrirTalkX(p) },
  { n: '02', nome: 'Segmentos — biblioteca e detalhes', existe: true, abrir: (p) => abrirTab(p, 'Segmentos') },
  { n: '03', nome: 'Segmentos — criar/editar', existe: true, abrir: async (p) => { await abrirTab(p, 'Segmentos'); await p.getByRole('button', { name: 'Novo segmento' }).click(); } },
  { n: '04', nome: 'Templates — biblioteca', existe: true, abrir: (p) => abrirTab(p, 'Templates') },
  { n: '05', nome: 'Templates — criar/editar', existe: true, abrir: async (p) => { await abrirTab(p, 'Templates'); await p.getByRole('button', { name: 'Novo Template' }).click(); } },
  { n: '06', nome: 'Lista de supressão', existe: true, abrir: (p) => abrirTab(p, 'Lista de supressão') },
  { n: '07', nome: 'Analytics', existe: true, abrir: (p) => abrirTab(p, 'Analytics') },
  { n: '08', nome: 'Nova campanha', existe: true, abrir: async (p) => { await p.goto('/?view=talkx&wizard=new&step=1'); await expect(p.getByRole('heading', { name: /Nova campanha|Revisão Final/ })).toBeVisible(); } },
  { n: '09', nome: 'Revisão final e confirmação', existe: true, abrir: async (p) => { await p.goto('/?view=talkx&wizard=new&step=4'); await expect(p.getByRole('heading', { name: /Nova campanha|Revisão Final/ })).toBeVisible(); } },
  { n: '10', nome: 'Campanha agendada', existe: true, abrir: (p) => abrirCampanha(p, 'Black Friday - VIP') },
  { n: '11', nome: 'Monitor ao vivo', existe: true, abrir: (p) => abrirCampanha(p, 'Dia do Cliente') },
  { n: '12', nome: 'Campanha em andamento', existe: true, abrir: (p) => abrirCampanha(p, 'Lançamento Linha Office') },
  { n: '13', nome: 'Campanha pausada e retomada', existe: false },
  { n: '14', nome: 'Relatório da campanha concluída', existe: false },
  { n: '15', nome: 'Importação e vinculação CRM360', existe: false },
  { n: '16', nome: 'Ajuda Talk X', existe: true, abrir: (p) => abrirAjuda(p) },
  { n: '17', nome: 'Estados do sistema e modais', existe: true, abrir: (p) => abrirTab(p, 'Configurações') },
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
