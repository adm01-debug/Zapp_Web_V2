/** E98 - frente a11y. O vão de contraste que nenhuma camada mede (ver docstring do teste). */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { contactCards, gotoContacts } from './fixtures/contacts-page';
import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession, mockTalkXVisual } from './fixtures/talkx-demo';
import { filtrarViolacoesBloqueantes } from './support/a11y-impactos';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

type Violacoes = {
  id: string;
  impact: string;
  nos: number;
  alvos: { seletor: string; html: string; motivo: string }[];
}[];

/** Injeta o axe-core no documento. Reinjeta a CADA varredura de propósito: reaproveitar a
 *  instância já custou `Axe is already running` — a flag interna de "run em andamento" vinha
 *  de uma medição anterior no mesmo documento. */
async function garantirAxe(page: Page): Promise<void> {
  await page.addScriptTag({ path: AXE });
}

async function violacoes(page: Page, alvo: string, regras: string[]): Promise<Violacoes> {
  await garantirAxe(page);
  return page.evaluate(
    async ([sel, ids]) => {
      const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[]; html: string; failureSummary?: string }[] }[] }> } }).axe;
      // `alvo` e um contexto do axe: `'body'` para o documento inteiro, ou um seletor
      // que limita a varredura aos nos sob medicao (barato sob carga).
      const contexto = sel === 'body' ? document.body : sel;
      const r = await axe.run(contexto, {
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
    [alvo, regras] as const,
  );
}

/**
 * Roda uma regra do axe so na subarvore de `alvo`. A lista e a tabela deixam as acoes de
 * cada linha em `opacity-0` ate o hover, e o axe trata `opacity: 0` como invisivel — por
 * isso a varredura e por linha (depois do hover) e, para caber no teto do Playwright sob
 * carga, fica limitada a linha sob medicao em vez do `body` inteiro.
 */
async function violacoesNaLinha(alvo: Locator, regras: string[]): Promise<Violacoes> {
  return alvo.evaluate(async (el, ids) => {
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[]; html: string; failureSummary?: string }[] }[] }> } }).axe;
    const r = await axe.run(el as unknown as Element, { runOnly: { type: 'rule', values: ids } });
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
  }, regras);
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

/** Mesma regra, mas varrendo so a linha recem-hoverada (ver `violacoesNaLinha`). */
async function semViolacaoButtonNameNaLinha(page: Page, alvo: Locator, onde: string): Promise<void> {
  await garantirAxe(page);
  const v = await violacoesNaLinha(alvo, ['button-name']);
  expect(
    filtrarViolacoesBloqueantes(v),
    `${onde}: nenhuma violacao SERIOUS ou CRITICAL de button-name\n${JSON.stringify(v, null, 2)}`,
  ).toHaveLength(0);
}
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
    // O cenario e o mais pesado do arquivo: 3 vistas, 2 contatos e uma varredura por linha.
    // Medido neste host sob carga (load ~60-75, 24 CPUs): 27,2 s ocioso-bom, 32,5 s no pior
    // caso -- o teto default de 30 s do projeto fica no fio. O orcamento abaixo e o que o
    // cartao autoriza para este teste (nao mexe em assercao nem na regra medida).
    test.setTimeout(60_000);
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
      // Varredura por linha (e so a linha): a acao fica `opacity-0` fora do hover e a
      // varredura do `body` inteiro, repetida por contato, era o custo que estourava o teto.
      const linha = linhas.nth(i);
      await linha.hover();
      await semViolacaoButtonNameNaLinha(page, linha, `Lista (linha ${i + 1})`);
    }
    await expect(menuDeAcoes('Ana Teste')).toBeVisible();
    await expect(menuDeAcoes('Bruno Teste')).toBeVisible();

    // Vista Tabela — ContactsTable
    await page.getByTitle('Tabela').click();
    await expect(page.getByRole('grid', { name: 'Lista de contatos' })).toBeVisible();
    const linhasTabela = page.locator('tbody tr');
    await expect(linhasTabela).toHaveCount(2);
    for (let i = 0; i < (await linhasTabela.count()); i++) {
      const linha = linhasTabela.nth(i);
      await linha.hover();
      await semViolacaoButtonNameNaLinha(page, linha, `Tabela (linha ${i + 1})`);
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

/**
 * TL-175B — contraste de `text-foreground-secondary` no Talk X, tema CLARO, no navegador real.
 *
 * O defeito era de TOKEN (`src/styles/tokens.css`): o valor medido do painel navy
 * (`215 30% 78%` — um azul claro, para fundo escuro) ficava no bloco `:root`, que é o do tema
 * claro, e media ~1,65:1 sobre o fundo. O axe reprova isso como `color-contrast` [serious].
 *
 * Aqui a medição é do que a TELA realmente pinta: o gate roda o axe no Talk X renderizado (sessão
 * falsa + fixture 01, o padrão da régua `chromium-talkx-visual`) e olha só os nós que aplicam a
 * classe `text-foreground-secondary`. É a ponte que o jsdom não dá — sem ela, "o token fecha AA no
 * papel" não prova que a tela ficou legível. Fica vermelho se o token do tema claro voltar ao valor
 * navy (medido: 3 nós de `text-foreground-secondary` reprovados, a 1,65:1).
 */
test.describe('TL-175B — Talk X: texto secundário legível no tema claro', () => {
  test('nenhum uso de text-foreground-secondary reprova o color-contrast', async ({ page }) => {
    await mockTalkXVisual(page, '01-campanhas-visao-geral');
    // `mockTalkXVisual` grava `theme: dark` no localStorage (é a régua visual, que é escura).
    // O alvo deste cartão é o tema CLARO, então este script — registrado DEPOIS — grava 'light'.
    await page.addInitScript(() => window.localStorage.setItem('theme', 'light'));
    await page.clock.install({ time: new Date('2026-10-01T12:00:00Z') });

    await page.goto('/?view=talkx&tab=overview');
    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible({ timeout: 30_000 });

    expect(
      await page.evaluate(() => document.documentElement.classList.contains('dark')),
      'esta medição é a do tema claro',
    ).toBe(false);

    // Anti-vacuidade: sem nós com a classe, o gate abaixo passaria sem medir nada.
    const pintados = await page.locator('.text-foreground-secondary').count();
    expect(pintados, 'a tela mediu 0 elementos com text-foreground-secondary').toBeGreaterThan(0);

    // Varredura limitada aos nós que aplicam o token sob medição: o `body` inteiro com
    // color-contrast não cabia no teto do Playwright sob carga, e o gate só olha estes nós.
    const v = await violacoes(page, '.text-foreground-secondary', ['color-contrast']);
    const doToken = v.flatMap((x) => x.alvos).filter((a) => a.html.includes('text-foreground-secondary'));

    expect(
      doToken,
      `${pintados} nó(s) com text-foreground-secondary medido(s); reprovados:\n${JSON.stringify(doToken, null, 2)}`,
    ).toEqual([]);
  });

  // Espelho do caso acima no tema ESCURO: o cartão exige "sem regressão no mesmo token". Aqui a
  // sessão falsa fica no padrão dela (`theme: dark`), que é o tema da régua visual. Ele já era
  // verde antes da correção — este caso é guarda de regressão, não a prova do defeito.
  test('o mesmo token continua sem violação no tema escuro', async ({ page }) => {
    await mockTalkXVisual(page, '01-campanhas-visao-geral');
    await page.clock.install({ time: new Date('2026-10-01T12:00:00Z') });

    await page.goto('/?view=talkx&tab=overview');
    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible({ timeout: 30_000 });

    expect(
      await page.evaluate(() => document.documentElement.classList.contains('dark')),
      'esta medição é a do tema escuro',
    ).toBe(true);

    const pintados = await page.locator('.text-foreground-secondary').count();
    expect(pintados, 'a tela mediu 0 elementos com text-foreground-secondary').toBeGreaterThan(0);

    // Varredura limitada aos nós que aplicam o token sob medição: o `body` inteiro com
    // color-contrast não cabia no teto do Playwright sob carga, e o gate só olha estes nós.
    const v = await violacoes(page, '.text-foreground-secondary', ['color-contrast']);
    const doToken = v.flatMap((x) => x.alvos).filter((a) => a.html.includes('text-foreground-secondary'));

    expect(
      doToken,
      `${pintados} nó(s) com text-foreground-secondary no escuro; reprovados:\n${JSON.stringify(doToken, null, 2)}`,
    ).toEqual([]);
  });
});
