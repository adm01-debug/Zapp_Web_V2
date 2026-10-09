/** E98 - frente a11y. O vão de contraste que nenhuma camada mede (ver docstring do teste). */
import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { contactCards, gotoContacts } from './fixtures/contacts-page';
import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession } from './fixtures/talkx-demo';
import { filtrarViolacoesBloqueantes } from './support/a11y-impactos';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function violacoes(page: import('@playwright/test').Page, seletor: string, regras: string[]) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(
    async ([sel, ids]) => {
      const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[]; html: string; failureSummary?: string }[] }[] }> } }).axe;
      const r = await axe.run(sel === 'body' ? document.body : (document.querySelector(sel) ?? document.body), {
        runOnly: { type: 'rule', values: ids },
      });
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nos: v.nodes.length,
        alvos: v.nodes.map((node) => ({
          seletor: node.target.join(' '),
          html: node.html,
          motivo: node.failureSummary ?? '',
        })),
      }));
    },
    [seletor, regras] as const,
  );
}

async function mockContatosVazios(page: Page): Promise<void> {
  await page.route(/\/rest\/v1\/contacts/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/rpc\/(search_contacts|contacts_count_by_type|get_last_message_dates|can_delete_contacts)/,
    (route) => json(route, []));
}

/**
 * Duas linhas de contatos para a tela NAO cair no estado vazio: e a lista populada que
 * monta os botoes Radix de menu de acoes (⋮) das tres vistas — Card, Lista e Tabela.
 * A tela vazia nao monta nenhum deles, por isso o gate de contatos vazio nunca viu o
 * `button-name` critical encontrado em t_41ad819d.
 */
const CONTATOS_POPULADOS = [
  {
    id: '3f1c9a10-0000-4000-8000-000000000001',
    name: 'Ana Teste',
    surname: 'A11y',
    contact_type: 'cliente',
    created_at: '2026-09-01T12:00:00.000Z',
    updated_at: '2026-09-01T12:00:00.000Z',
    phone: '+5511999990001',
    email: 'ana.a11y@e2e.local',
    company: 'Promo Brindes',
    job_title: 'Compradora',
    tags: ['e2e'],
    avatar_url: null,
    total_count: 2,
  },
  {
    id: '3f1c9a10-0000-4000-8000-000000000002',
    name: 'Bruno Teste',
    surname: 'A11y',
    contact_type: 'cliente',
    created_at: '2026-09-02T12:00:00.000Z',
    updated_at: '2026-09-02T12:00:00.000Z',
    phone: '+5511999990002',
    email: 'bruno.a11y@e2e.local',
    company: 'Promo Brindes',
    job_title: 'Diretor',
    tags: ['e2e'],
    avatar_url: null,
    total_count: 2,
  },
];

/** Mesmos mocks do estado vazio, com a RPC de busca devolvendo as duas linhas acima. */
async function mockContatosPopulados(page: Page): Promise<void> {
  // Registradas DEPOIS das rotas do beforeEach: a ultima rota registrada vence no Playwright.
  await page.route(/\/rest\/v1\/rpc\/search_contacts/, (route) => json(route, CONTATOS_POPULADOS));
  await page.route(/\/rest\/v1\/rpc\/contacts_count_by_type/, (route) => json(route, [{ contact_type: 'cliente', count: 2 }]));
  await page.route(/\/rest\/v1\/rpc\/get_last_message_dates/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/rpc\/can_delete_contacts/, (route) =>
    json(route, CONTATOS_POPULADOS.map((c) => ({ contact_id: c.id, can_delete: true }))));
}

/** Roda o axe `button-name` e falha se sobrar violacao SERIOUS/CRITICAL. */
async function semViolacaoButtonName(page: Page, onde: string): Promise<void> {
  const v = await violacoes(page, 'body', ['button-name']);
  expect(
    filtrarViolacoesBloqueantes(v),
    `${onde}: nenhuma violacao SERIOUS ou CRITICAL de button-name\n${JSON.stringify(v, null, 2)}`,
  ).toHaveLength(0);
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('E98 - a11y: contraste e nome acessível na tela de contatos', () => {
  let registro: Registro;

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    await bloquearRedeReal(page, registro);
    await mockAppShell(page, registro);
    await mockContatosVazios(page);
    await installFakeSession(page);
  });

  test.afterEach(() => {
    expect(registro.redeBarrada).toEqual([]);
  });

  test('mede color-contrast e button-name no navegador real', async ({ page }) => {
    await gotoContacts(page);
    await expect(page.getByRole('main', { name: 'Conteúdo principal' })).toBeVisible({ timeout: 20_000 });

    const v = await violacoes(page, 'body', ['color-contrast', 'button-name']);

    // Medicao de 2026-10-02 (Chromium real, tela de contatos): color-contrast = 0 nos,
    // button-name = 0 nos. O spec nasce verde; vira vermelho se alguem quebrar contraste
    // ou nome acessivel nesta tela - que e o gate que o jsdom nao consegue dar.

    expect(
      filtrarViolacoesBloqueantes(v),
      `nenhuma violação SERIOUS ou CRITICAL\n${JSON.stringify(v, null, 2)}`,
    ).toHaveLength(0);
  });

  // Lista POPULADA: as tres vistas de lista montam um botao Radix de menu de acoes por
  // contato. Com a tela vazia o gate acima nao os via -- foi na lista populada que o
  // senior reproduziu `button-name` critical (t_41ad819d). Este cenario cobre os 3.
  test('lista populada: menu de acoes de cada contato tem nome acessivel nas 3 vistas', async ({ page }) => {
    await mockContatosPopulados(page);
    await gotoContacts(page);

    const menuDeAcoes = (nome: string) => page.getByRole('button', { name: `Ações do contato ${nome}` });

    // Vista Cards (padrao da tela) — ContactCard
    await page.getByTitle('Cards').click();
    await expect(contactCards(page)).toHaveCount(2);
    await semViolacaoButtonName(page, 'Cards');
    await expect(menuDeAcoes('Ana Teste')).toBeVisible();
    await expect(menuDeAcoes('Bruno Teste')).toBeVisible();

    // Vista Lista — ContactListItem (as acoes so aparecem no hover da linha)
    await page.getByTitle('Lista').click();
    const linhas = page.getByTestId('contact-list-item');
    await expect(linhas).toHaveCount(2);
    for (let i = 0; i < (await linhas.count()); i++) {
      await linhas.nth(i).hover();
      await semViolacaoButtonName(page, `Lista (linha ${i + 1})`);
    }
    await expect(menuDeAcoes('Ana Teste')).toBeVisible();
    await expect(menuDeAcoes('Bruno Teste')).toBeVisible();

    // Vista Tabela — ContactsTable
    await page.getByTitle('Tabela').click();
    await expect(page.getByRole('grid', { name: 'Lista de contatos' })).toBeVisible();
    const linhasTabela = page.locator('tbody tr');
    await expect(linhasTabela).toHaveCount(2);
    for (let i = 0; i < (await linhasTabela.count()); i++) {
      await linhasTabela.nth(i).hover();
      await semViolacaoButtonName(page, `Tabela (linha ${i + 1})`);
    }
    await expect(menuDeAcoes('Ana Teste')).toBeVisible();
    await expect(menuDeAcoes('Bruno Teste')).toBeVisible();
  });

  // O header movel (avatar com iniciais) e a barra inferior so existem abaixo de
  // 640px; no desktop o span "Colunas" tambem fica visivel e da nome ao gatilho
  // Radix. Sem este viewport o gate acima nao enxerga as 3 violacoes medidas em
  // 390x844 no achado do cartao t_d4e4ec53.
  test.describe('viewport movel 390x844', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('mede color-contrast e button-name no mobile', async ({ page }) => {
      await gotoContacts(page);
      await expect(page.getByRole('main', { name: 'Conteúdo principal' })).toBeVisible({ timeout: 20_000 });

      const v = await violacoes(page, 'body', ['color-contrast', 'button-name']);

      expect(
        filtrarViolacoesBloqueantes(v),
        `nenhuma violação SERIOUS ou CRITICAL\n${JSON.stringify(v, null, 2)}`,
      ).toHaveLength(0);
    });
  });
});
