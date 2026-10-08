/** E98 - frente a11y. O vão de contraste que nenhuma camada mede (ver docstring do teste). */
import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { gotoContacts } from './fixtures/contacts-page';
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

type ViolacaoAxe = {
  id: string;
  impact: string;
  nos: number;
  alvos: { seletor: string; html: string; motivo: string }[];
};

/**
 * Mede o conjunto COMPLETO de regras WCAG 2.1 AA (nao só duas regras): tags
 * `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa` do axe-core.
 */
async function violacoesWcagAa(page: Page, seletor: string): Promise<ViolacaoAxe[]> {
  await page.addScriptTag({ path: AXE });
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
  return page.evaluate(
    async ([sel, ids]) => {
      const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[]; html: string; failureSummary?: string }[] }[] }> } }).axe;
      const r = await axe.run(sel === 'body' ? document.body : (document.querySelector(sel) ?? document.body), {
        runOnly: { type: 'tag', values: ids },
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
    [seletor, tags] as const,
  );
}

/**
 * Telas que o gate E98 NAO alcancava (so contatos e o banner do inbox eram medidos).
 * Cada uma traz a marca que prova que a TELA CERTA renderizou — sem isso um verde
 * poderia vir de um app em branco.
 */
const TELAS_AA = [
  {
    view: 'tasks',
    titulo: 'Tarefas',
    descricao: 'modulo de tarefas (tasks-module)',
  },
  {
    view: 'talkx',
    titulo: 'Campanhas',
    descricao: 'view talkx (aba Visao geral)',
  },
  {
    view: 'settings',
    titulo: 'Configurações',
    descricao: 'tela de configuracoes (aba Horário)',
  },
] as const;

function marcasDaTela(page: Page, view: (typeof TELAS_AA)[number]['view'], titulo: string) {
  const h1 = page.getByRole('heading', { level: 1, name: titulo });
  if (view === 'tasks') return [h1, page.getByTestId('tasks-module')];
  if (view === 'talkx') return [h1, page.getByRole('tab', { name: 'Visão geral' })];
  return [h1, page.getByRole('tab', { name: 'Horário' })];
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
 * E98-3 · a11y nas telas que o gate E98 NAO alcancava.
 *
 * Ate 08/10/2026 a medicao no navegador real cobria DUAS regras (`color-contrast`,
 * `button-name`) em UMA tela (contatos) mais o banner do inbox
 * (`inbox-contraste.spec.ts`). Fora dai, acessibilidade so existia em teste de jsdom
 * (que nao calcula contraste) ou em contrato estatico de fonte (que nao executa o axe) —
 * o inventario de 07/10/2026 registra isso como "cobertura axe so em contatos e banner
 * do inbox". Aqui as outras telas entram no gate com o conjunto COMPLETO de regras
 * WCAG 2.1 AA (tags `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa`), nao so as duas regras.
 *
 * Medicao desta correcao (Chromium real, 08/10/2026, sessao falsa + backend mockado):
 *   Tarefas (tasks-module) ....... 0 violacao SERIOUS/CRITICAL
 *   Talk X (view talkx) .......... 0
 *   Configuracoes (settings) ..... 0
 * As tres telas nascem verdes e viram vermelhas se alguem tirar nome acessivel, papel
 * ou estrutura de um controle delas — que e o gate que o jsdom nao da.
 *
 * NAO entram neste gate (achados medidos, fora dos arquivos deste cartao, registrados
 * em comentario no cartao SL-022): catalogo (`?view=catalog`, `button-name` critical em
 * 2 comboboxes sem nome), painel (`?view=dashboard`, `button-name` critical em 2 botoes
 * + `aria-progressbar-name` serious) e contatos COM a lista populada (`button-name`
 * critical no gatilho de menu do cartao, que o scan da lista vazia nao ve).
 */
test.describe('E98-3 - a11y: WCAG 2.1 AA nas telas alem de contatos e inbox', () => {
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

  for (const tela of TELAS_AA) {
    test(`mede WCAG 2.1 AA no navegador real: ${tela.descricao}`, async ({ page }) => {
      await page.goto(`/?view=${tela.view}`);
      // Sem dispensa de onboarding: `installFakeSession` já grava
      // `onboarding_completed_<uid>`, então o WelcomeModal não monta aqui (ao
      // contrário de `gotoContacts`, que o dispensa por precaução).
      // A TELA CERTA tem de estar montada antes da medicao (senao um app em branco
      // daria verde): o h1 da tela mais um controle que so existe nela.
      for (const marca of marcasDaTela(page, tela.view, tela.titulo)) {
        await expect(marca).toBeVisible({ timeout: 20_000 });
      }

      const v = await violacoesWcagAa(page, 'body');

      expect(
        filtrarViolacoesBloqueantes(v),
        `nenhuma violação SERIOUS ou CRITICAL (WCAG 2.1 AA) em ${tela.descricao}\n${JSON.stringify(v, null, 2)}`,
      ).toHaveLength(0);
    });
  }
});
