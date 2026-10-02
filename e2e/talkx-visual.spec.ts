import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mockTalkXVisual } from './fixtures/talkx-demo';

/**
 * Régua visual do Talk X (plano V4, etapa X004).
 *
 * Captura cada uma das 17 telas do mock (docs/talkx/references/*.png) com a
 * sessão falsa + fixture de X003 (mockTalkXVisual), no viewport 1672×941 e tema
 * escuro (projeto `chromium-talkx-visual`). Roda DESLOGADO — sem setup e sem
 * secrets — por isso entra no workflow de PR (e2e-talkx-pr.yml).
 *
 * Telas cujo componente ainda não existe (hoje 13, 14 e 15) gravam um marcador
 * `nao-existe-NN.txt` em vez de falhar. O `scripts/talkx/lado-a-lado.mjs` monta
 * as 17 duplas (mock | captura) a partir daqui.
 */

const OUT = join(import.meta.dirname, 'talkx-visual');
const FIXTURE = '01-campanhas-visao-geral';

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

for (const tela of TELAS) {
  test(`tela ${tela.n} — ${tela.nome}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });

    if (!tela.existe) {
      writeFileSync(join(OUT, `nao-existe-${tela.n}.txt`), `tela ainda não existe: ${tela.nome}\n`);
      return;
    }

    await mockTalkXVisual(page, FIXTURE);
    await tela.abrir!(page);
    await capturar(page, join(OUT, `captura-${tela.n}.png`));
  });
}
