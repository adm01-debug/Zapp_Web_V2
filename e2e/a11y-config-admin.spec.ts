/** N-080 · régua axe de Configurações, Administração e Segurança na regra button-name.
 *
 * O jsdom do teste de unidade nao renderiza layout e portanto nao mede
 * button-name (precisa de elemento visivel com nome acessivel).
 * Esta regra fica fora do alcance do jsdom.
 *
 * Metodologia: mesma estrutura de e2e/a11y-contraste.spec.ts — sessao fake
 * + backend mock (mapa-mocks.ts, talkx-demo.ts) + axe-core via addScriptTag.
 *
 * Para cada viewport (390x844 e 1280x900) e cada tela (Configuracoes,
 * Administracao e Seguranca), abre a view esperando o heading PROPRIO dela,
 * roda o axe restrito a button-name e espera zero violacoes.
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

/** Abre a view e espera o heading PROPRIO dela dentro do <main> do casco.
 *
 * Esperar so o `main` nao prova nada: qualquer tela do casco (inclusive acesso
 * negado) o renderiza. O heading e buscado DENTRO do <main> porque no celular o
 * cabecalho do casco repete o mesmo texto ("Configurações" no banner e no main),
 * o que tornaria um `getByRole('heading')` global ambiguo (strict mode).
 */
async function abrirView(page: Page, url: string, titulo: string): Promise<void> {
  await page.goto(url);
  await expect(
    page.getByRole('main', { name: 'Conteúdo principal' }).getByRole('heading', { name: titulo }),
  ).toBeVisible({ timeout: 20_000 });
}

async function semViolacao(
  page: Page,
  onde: string,
  regras: string[],
): Promise<void> {
  // Anti-vacuidade + espera de hidratacao: o <main> aparece antes do shell do app
  // (banner, menu inferior, acoes rapidas). Esperamos a tela ter ao menos um
  // controle, senao a regra button-name mediria um DOM incompleto e passaria sem
  // medir nada. O seletor casa com o que a regra do axe avalia: `button` e
  // `[role="button"]` (o shell do celular monta o menu/abas como elementos com role).
  await expect
    .poll(() => page.locator('button, [role="button"]').count(), {
      timeout: 20_000,
      message: `${onde}: nenhum botao/role=button renderizado — a medicao de button-name passaria vazia`,
    })
    .toBeGreaterThan(0);

  const v = await violacoes(page, 'body', regras);
  const resumo = v.map((viol) => `${viol.id} (${viol.impact}): ${viol.nodes.length} no(s)`).join(' | ');
  expect(v, `${onde}: nenhuma violacao de button-name em ${regras.join(', ')}\n${resumo}`).toHaveLength(0);
}

async function mockConfigVazio(page: Page): Promise<void> {
  await page.route(/\/rest\/v1\/user_settings/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/rpc\/(save_user_settings|get_user_settings)/, (route) => json(route, []));
}

async function mockAdminVazio(page: Page): Promise<void> {
  await page.route(/\/rest\/v1\/rpc\/(admin_get_users|admin_get_audit|admin_set_role)/, (route) => json(route, []));
}

async function mockSecurityVazio(page: Page): Promise<void> {
  await page.route(/\/rest\/v1\/rpc\/(get_security_settings|save_security_settings)/, (route) => json(route, []));
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('N-080 · a11y: button-name em Configuracoes, Administracao e Seguranca', () => {
  let registro: Registro;

  // Aquece o servidor Vite antes dos testes medidos. Sob carga da maquina o
  // primeiro carregamento compila o bundle e pode estourar o guard de 8s do app
  // ("React nao montou em 8s"), mesmo sem defeito de a11y (o irmao a11y-contraste
  // so nao sofre porque roda primeiro e aquece o mesmo servidor). Uma navegacao
  // descartavel com os mesmos mocks compila o grafo de modulos; depois disso os
  // testes medidos navegam quente.
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    const descartado: Registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    try {
      await bloquearRedeReal(page, descartado);
      await mockAppShell(page, descartado);
      await installFakeSession(page);
      await page
        .goto('/?view=settings', { waitUntil: 'domcontentloaded', timeout: 60_000 })
        .catch(() => undefined);
      await page.waitForTimeout(1_500);
    } finally {
      await page.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    await bloquearRedeReal(page, registro);
    await mockAppShell(page, registro);
    await installFakeSession(page);
  });

  test.afterEach(() => {
    expect(registro.redeBarrada).toEqual([]);
  });

  // Configuracoes — desktop 1280x900
  test.describe('viewport desktop 1280x900', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('Configuracoes: zero violacoes button-name', async ({ page }) => {
      await mockConfigVazio(page);
      await abrirView(page, '/?view=settings', 'Configurações');
      await semViolacao(page, 'Configuracoes desktop', ['button-name']);
    });

    test('Administracao: zero violacoes button-name', async ({ page }) => {
      await mockAdminVazio(page);
      await abrirView(page, '/?view=admin', 'Administração');
      await semViolacao(page, 'Administracao desktop', ['button-name']);
    });

    test('Seguranca: zero violacoes button-name', async ({ page }) => {
      await mockSecurityVazio(page);
      await abrirView(page, '/?view=security', 'Central de Segurança');
      await semViolacao(page, 'Seguranca desktop', ['button-name']);
    });
  });

  // Configuracoes, Administracao e Seguranca — mobile 390x844
  test.describe('viewport movel 390x844', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('Configuracoes mobile: zero violacoes button-name', async ({ page }) => {
      await mockConfigVazio(page);
      await abrirView(page, '/?view=settings', 'Configurações');
      await semViolacao(page, 'Configuracoes mobile', ['button-name']);
    });

    test('Administracao mobile: zero violacoes button-name', async ({ page }) => {
      await mockAdminVazio(page);
      await abrirView(page, '/?view=admin', 'Administração');
      await semViolacao(page, 'Administracao mobile', ['button-name']);
    });

    test('Seguranca mobile: zero violacoes button-name', async ({ page }) => {
      await mockSecurityVazio(page);
      await abrirView(page, '/?view=security', 'Central de Segurança');
      await semViolacao(page, 'Seguranca mobile', ['button-name']);
    });
  });
});
