/**
 * Auth flows — tela de login DESLOGADA (projeto Playwright "chromium").
 *
 * t_62a7ee39: removidos os dois testes de "aba de cadastro", que sobraram do tempo
 * em que o cadastro público existia. R3/SG1 tirou o cadastro da tela, então o gate
 * passou a ser a AUSÊNCIA da aba. Somado a isso, um scan real do axe na tela.
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { installFakeSession } from './fixtures/talkx-demo';
import { mockAppShell, bloquearRedeReal, type Registro } from './fixtures/mapa-mocks';
import { filtrarViolacoesBloqueantes } from './support/a11y-impactos';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

test.describe('Auth flows', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main', { name: /acesso à plataforma/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /bem-vindo de volta/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^entrar$/i })).toHaveAttribute('data-state', 'active');
    await expect(page.getByRole('button', { name: /^entrar$/i })).toBeVisible();
  });

  test('login form validates email format', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: /e-?mail/i }).fill('notanemail');
    await page.getByRole('button', { name: /entrar|login/i }).click();
    await expect(page.getByText(/e-?mail inv|e-?mail obr/i)).toBeVisible();
  });

  test('login email input respects maxLength', async ({ page }) => {
    await page.goto('/');
    const emailInput = page.getByRole('textbox', { name: /e-?mail/i }).first();
    await expect(emailInput).toHaveAttribute('maxlength', '255');
  });

  test('login password input respects maxLength', async ({ page }) => {
    await page.goto('/');
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toHaveAttribute('maxlength', '200');
  });

  // SG1/R3: o cadastro público saiu da tela. O gate agora é a AUSÊNCIA da aba —
  // não basta o fluxo "entrar" funcionar, alguém pode reintroduzir a aba sem querer.
  test('não oferece aba de cadastro público', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: /criar conta|cadastro|sign.?up/i })).toHaveCount(0);
  });

  // Gate que o jsdom não dá: contraste e nomes acessíveis medidos no Chromium real
  // na tela de login. Nasce verde (medido em 13/10, 0 violações SERIOUS/CRITICAL) e
  // fica vermelho se a tela perder contraste ou nome de botão/campo.
  test('tela de login sem violação séria de acessibilidade (axe)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main', { name: /acesso à plataforma/i })).toBeVisible();

    await page.addScriptTag({ path: AXE });
    const violacoes = await page.evaluate(async () => {
      const axe = (window as unknown as {
        axe: {
          run: (ctx: unknown, opt: unknown) => Promise<{
            violations: { id: string; impact: string; nodes: unknown[] }[];
          }>;
        };
      }).axe;
      const r = await axe.run(document.body, {
        runOnly: { type: 'rule', values: ['color-contrast', 'button-name', 'label', 'aria-input-field-name'] },
      });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, nos: v.nodes.length }));
    });

    expect(
      filtrarViolacoesBloqueantes(violacoes),
      `nenhuma violação SERIOUS ou CRITICAL na tela de login\n${JSON.stringify(violacoes, null, 2)}`,
    ).toHaveLength(0);
  });
});

const NAVEGACAO = '#main-navigation';
const LOGIN_MAIN = /acesso à plataforma/i;

/**
 * Chaves de sessão do supabase-js no localStorage, descobertas pelo formato
 * (`sb-…-auth-token`) em vez do ref do projeto — a spec nunca cita o banco.
 */
async function chavesSessao(pagina: Page): Promise<string[]> {
  return pagina.evaluate(() => {
    const achadas: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const chave = window.localStorage.key(i);
      if (chave && chave.startsWith('sb-') && chave.endsWith('-auth-token')) achadas.push(chave);
    }
    return achadas;
  });
}

async function valorChave(pagina: Page, chave: string): Promise<string | null> {
  return pagina.evaluate((k) => window.localStorage.getItem(k), chave);
}

/**
 * Abre `/` e espera o shell logado (`#main-navigation`). O app desiste do boot
 * com a tela "Falha ao inicializar o app" (botão Recarregar) quando o React não
 * monta em 8s — sob carga, o primeiro carregamento frio estoura esse limite sem
 * qualquer relação com a sessão; nesse caso recarrega (até 3x) em vez de falhar.
 */
async function abrirShell(pagina: Page): Promise<void> {
  const bota = pagina.getByRole('heading', { name: /Falha ao inicializar/i });
  await pagina.goto('/');
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    for (let i = 0; i < 60; i++) {
      if (await pagina.locator(NAVEGACAO).isVisible()) return;
      if (await bota.isVisible()) break;
      await pagina.waitForTimeout(1000);
    }
    if (await pagina.locator(NAVEGACAO).isVisible()) return;
    await pagina.getByRole('button', { name: /Recarregar/i }).click();
  }
  await expect(pagina.locator(NAVEGACAO)).toBeVisible({ timeout: 30_000 });
}

/**
 * Sessão sintética (installFakeSession) + app shell mockado + rede real
 * barrada. Com `semear: false` a página lê o storage REAL gravado por outra
 * página do mesmo contexto — sem `addInitScript`, como um boot de verdade.
 */
async function montarAmbienteSessao(pagina: Page, semear: boolean): Promise<Registro> {
  const registro: Registro = { writesApp: [], mapbox: [], redeBarrada: [] };
  if (semear) await installFakeSession(pagina);
  // Ordem exigida por mapa-mocks: o guarda ANTES dos mocks específicos (o
  // Playwright dá precedência à rota registrada por último).
  await bloquearRedeReal(pagina, registro);
  await mockAppShell(pagina, registro);
  // Leituras de fundo do shell (sincronização de contatos/mensagens do Inbox),
  // que não têm a ver com o comportamento de sessão provado aqui: GET responde
  // vazio (convenção de mapa-mocks: cada spec registra contacts/messages por
  // conta própria); escrita é 403.
  await pagina.route(/\/rest\/v1\/(contacts|messages)/, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      : route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'escrita não prevista no E2E de sessão' }),
        }),
  );
  await pagina.routeWebSocket(/\.supabase\.co/, (ws) => ws.close());
  return registro;
}

test.describe('Auth — sessão (sessão sintética + backend mockado, sem rede real)', () => {
  test.setTimeout(180_000);

  test('sessão persiste após refresh (sem voltar para /auth)', async ({ page, context }) => {
    const registro = await montarAmbienteSessao(page, true);
    await abrirShell(page);
    await expect(page).not.toHaveURL(/\/auth/);

    const chaves = await chavesSessao(page);
    expect(chaves.length).toBeGreaterThan(0);
    const valorSemeado = await valorChave(page, chaves[0]);

    // Segunda página SEM semeadura: lê o storage real. Se a sessão não tivesse
    // persistido, esta página cairia em /auth.
    const pagina2 = await context.newPage();
    const registro2 = await montarAmbienteSessao(pagina2, false);
    await abrirShell(pagina2);
    await expect(pagina2).not.toHaveURL(/\/auth/);
    const chaves2 = await chavesSessao(pagina2);
    expect(chaves2).toEqual(chaves);
    expect(await valorChave(pagina2, chaves2[0])).toBe(valorSemeado);

    // Refresh de verdade na página sem semeadura: só passa se o cliente
    // restaurar a sessão do storage no boot.
    await pagina2.reload();
    await expect(pagina2.locator(NAVEGACAO)).toBeVisible({ timeout: 90_000 });
    await expect(pagina2).not.toHaveURL(/\/auth/);
    expect(await valorChave(pagina2, chaves2[0])).toBe(valorSemeado);

    expect(registro.redeBarrada).toEqual([]);
    expect(registro2.redeBarrada).toEqual([]);
    await pagina2.close();
  });

  test('logout limpa as chaves sb-* e volta para /auth', async ({ page }) => {
    const registro = await montarAmbienteSessao(page, true);
    // O signOut do supabase-js chama POST /auth/v1/logout: responde 200 aqui
    // para a chamada esperada não cair na rede de segurança.
    await page.route(/\/auth\/v1\/logout/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );
    await abrirShell(page);
    expect((await chavesSessao(page)).length).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Perfil e status' }).click();
    await page.getByRole('button', { name: 'Sair da conta' }).click();

    await expect(page.getByRole('main', { name: LOGIN_MAIN })).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/auth/);
    expect(await chavesSessao(page)).toEqual([]);
    expect(registro.redeBarrada).toEqual([]);
  });

  test('token corrompido cai no login sem loop de redirecionamento', async ({ page, context }) => {
    const registro = await montarAmbienteSessao(page, true);
    await abrirShell(page);
    const chaves = await chavesSessao(page);
    expect(chaves.length).toBeGreaterThan(0);
    const chave = chaves[0];
    await page.close();

    // Página limpa (sem semeadura) lê o storage real; corrompe o token e
    // recarrega: o boot precisa ler o valor inválido.
    const pagina2 = await context.newPage();
    const registro2 = await montarAmbienteSessao(pagina2, false);
    await abrirShell(pagina2);

    await pagina2.evaluate((k) => window.localStorage.setItem(k, 'token-corrompido-sem-json'), chave);
    await pagina2.reload();
    await expect(pagina2.getByRole('main', { name: LOGIN_MAIN })).toBeVisible({ timeout: 60_000 });
    await expect(pagina2).toHaveURL(/\/auth/);

    // Estabilidade: a URL precisa estacionar em /auth, sem quicar entre rotas.
    const urls: string[] = [];
    for (let i = 0; i < 6; i++) {
      urls.push(pagina2.url());
      await pagina2.waitForTimeout(1000);
    }
    for (const url of urls) expect(url).toMatch(/\/auth/);
    expect(new Set(urls).size).toBeLessThanOrEqual(2);

    expect(registro.redeBarrada).toEqual([]);
    expect(registro2.redeBarrada).toEqual([]);
    await pagina2.close();
  });
});

