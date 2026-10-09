/** N-078 · régua axe do Inbox e Teams nas regras button-name e list.
 *
 * O jsdom do teste de unidade nao renderiza layout e portanto nao mede
 * nem button-name (precisa de elemento visivel com nome acessivel) nem
 * list (precisa de estrutura de lista renderizada). Estas regras ficam
 * fora do alcance do jsdom — daqui o nome "camada que o jsdom nao alcanca".
 *
 * Metodologia: mesma estrutura de e2e/a11y-contraste.spec.ts — sessao fake
 * + backend mock (mapa-mocks.ts, talkx-demo.ts) + axe-core via addScriptTag.
 *
 * Para cada viewport (390x844 e 1280x900) e cada tela (Inbox e Teams,
 * view=team-chat), roda o AxeBuilder restrito a button-name e list e
 * espera zero violacoes.
 */
import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { mockAppShell, json, bloquearRedeReal, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession } from './fixtures/talkx-demo';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

interface ViolacaoAxe {
  id: string;
  impact: string;
  nodes: { target: string[]; html: string }[];
}

async function violacoes(
  page: Page,
  seletor: string,
  regras: string[],
) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(
    async ([sel, ids]) => {
      const win = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: ViolacaoAxe[] }> } };
      const axe = win.axe;
      const r = await axe.run(
        sel === 'body' ? document.body : document.querySelector(sel) ?? document.body,
        { runOnly: { type: 'rule', values: ids } },
      );
      return r.violations;
    },
    [seletor, regras] as const,
  );
}

async function semViolacao(
  page: Page,
  onde: string,
  regras: string[],
): Promise<void> {
  const v = await violacoes(page, 'body', regras);
  const resumo = v.map((viol) => `${viol.id} (${viol.impact}): ${viol.nodes.length} no(s)`).join(' | ');
  expect(v, `${onde}: nenhuma violacao SERIOUS ou CRITICAL de ${regras.join(', ')}\n${resumo}`).toHaveLength(0);
}

async function mockInboxVazio(page: Page): Promise<void> {
  await page.route(/\/rest\/v1\/contacts/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
  await page.route(
    /\/rest\/v1\/rpc\/(search_contacts|contacts_count_by_type|get_last_message_dates|can_delete_contacts)/,
    (route) => json(route, []),
  );
}

async function mockTeamVazio(page: Page): Promise<void> {
  await page.route(/\/rest\/v1\/contacts/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/rpc\/(search_contacts|contacts_count_by_type|get_last_message_dates|can_delete_contacts)/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/rpc\/(get_team_inbox|get_team_messages_)/, (route) => json(route, []));
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('N-078 · a11y: button-name e list no Inbox e Teams', () => {
  let registro: Registro;

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    await bloquearRedeReal(page, registro);
    await mockAppShell(page, registro);
    await mockInboxVazio(page);
    await installFakeSession(page);
  });

  test.afterEach(() => {
    expect(registro.redeBarrada).toEqual([]);
  });

  // Inbox — desktop 1280x900
  test.describe('viewport desktop 1280x900', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('Inbox: zero violacoes button-name e list', async ({ page }) => {
      await page.goto('/?view=inbox');
      await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
      await semViolacao(page, 'Inbox desktop', ['button-name', 'list']);
    });

    test('Teams (team-chat): zero violacoes button-name e list', async ({ page }) => {
      await page.goto('/?view=team-chat');
      await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
      await semViolacao(page, 'Teams desktop', ['button-name', 'list']);
    });
  });

  // Inbox e Teams — mobile 390x844
  test.describe('viewport movel 390x844', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('Inbox mobile: zero violacoes button-name e list', async ({ page }) => {
      await page.goto('/?view=inbox');
      await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
      await semViolacao(page, 'Inbox mobile', ['button-name', 'list']);
    });

    test('Teams mobile (team-chat): zero violacoes button-name e list', async ({ page }) => {
      await page.goto('/?view=team-chat');
      await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
      await semViolacao(page, 'Teams mobile', ['button-name', 'list']);
    });
  });
});