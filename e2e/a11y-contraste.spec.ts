/** E98 - frente a11y. O vão de contraste que nenhuma camada mede (ver docstring do teste). */
import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { gotoContacts } from './fixtures/contacts-page';
import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession, mockTalkXVisual } from './fixtures/talkx-demo';
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

    const v = await violacoes(page, 'body', ['color-contrast']);
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

    const v = await violacoes(page, 'body', ['color-contrast']);
    const doToken = v.flatMap((x) => x.alvos).filter((a) => a.html.includes('text-foreground-secondary'));

    expect(
      doToken,
      `${pintados} nó(s) com text-foreground-secondary no escuro; reprovados:\n${JSON.stringify(doToken, null, 2)}`,
    ).toEqual([]);
  });
});
