/** Configurações — persistência das preferências de verdade (navegador real).
 *
 * Mede, ponta a ponta e com backend mockado em memória, o que o cartão dos pais
 * prometeu e não dá para provar no jsdom:
 *  1. **Tema e idioma**: escolher, salvar e RECARREGAR — depois do reload o valor
 *     tem que vir da CONTA (a linha de `user_settings` no banco), não do cache do
 *     navegador. A prova é dura: a sessão de `installFakeSession` reescreve
 *     `localStorage.theme='dark'` em toda navegação e o `language` é apagado antes
 *     do reload, então o único caminho para o `<html>` ficar `light` e o `<Select>`
 *     mostrar English (US) é a hidratação que lê a linha do banco.
 *  2. **Notificação do navegador**: desligar (grava na hora) e depois clicar no
 *     "Salvar preferências" da aba Aparência. O botão NÃO pode ressuscitar o valor
 *     lido no mount — o teste falha se o payload do upsert voltar a conter
 *     `browser_notifications_enabled`.
 *  3. **Reiniciar Tour**: o overlay do tour só volta porque a coluna
 *     `onboarding_completed` foi para `false` no banco — provado por um reload.
 *
 * Padrão deslogado do repositório: sessão FALSA (`installFakeSession`) + backend
 * do app shell mockado + rede real barrada (`bloquearRedeReal`). Nenhum login real,
 * nenhum segredo, nenhuma chamada à internet.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import {
  bloquearRedeReal,
  json,
  mockAppShell,
  querObjetoUnico,
  type Registro,
} from './fixtures/mapa-mocks';
import { FAKE_USER_ID, installFakeSession } from './fixtures/talkx-demo';

type LinhaSettings = Record<string, unknown>;

type Escrita = { metodo: string; corpo: LinhaSettings };

type BackendSettings = { linha: LinhaSettings; escritas: Escrita[] };

/**
 * Backend stateful de `user_settings`.
 *
 * O GET devolve a linha VIVA e as escritas (upsert do `POST` e `update` do `PATCH`)
 * fazem MERGE nela — a mesma semântica do PostgREST (`on conflict do update set`
 * altera só as colunas enviadas). Sem o merge o mock apagaria as colunas ausentes
 * do payload e o teste reprovaria o app por um defeito do mock.
 *
 * Registre DEPOIS do `mockAppShell`: no Playwright a última rota registrada vence.
 */
async function mockUserSettings(page: Page, inicial: LinhaSettings = {}): Promise<BackendSettings> {
  const backend: BackendSettings = {
    linha: { id: '00000000-0000-4000-8000-0000000000a1', user_id: FAKE_USER_ID, ...inicial },
    escritas: [],
  };

  await page.route(/\/rest\/v1\/user_settings/, (route: Route) => {
    const metodo = route.request().method();

    if (metodo === 'GET' || metodo === 'HEAD') {
      return json(route, querObjetoUnico(route) ? backend.linha : [backend.linha]);
    }

    if (metodo === 'POST' || metodo === 'PATCH' || metodo === 'PUT') {
      const corpo = JSON.parse(route.request().postData() ?? '{}') as LinhaSettings | LinhaSettings[];
      for (const linha of Array.isArray(corpo) ? corpo : [corpo]) {
        backend.linha = { ...backend.linha, ...linha };
        backend.escritas.push({ metodo, corpo: linha });
      }
      return json(route, querObjetoUnico(route) ? backend.linha : [backend.linha], 201);
    }

    return json(route, { message: `metodo ${metodo} fora do mock` }, 403);
  });

  return backend;
}

const HA_CARGA = { timeout: 20_000 } as const;

/** Abre a view e espera o heading PRÓPRIO dela dentro do `<main>` do casco
 * (esperar só o `main` passaria em qualquer tela, inclusive acesso negado).
 *
 * O boot do React tem um vigia de 8s ("Falha ao inicializar o app"): sob a carga
 * da máquina ele dispara de vez em quando, e recarregar resolve (é o mesmo caminho
 * do botão "Recarregar" da tela de falha). 3 tentativas cobrem a cauda observada —
 * mesmo laço de `e2e/tarefas-linha-de-base.spec.ts`. O teto também é esticado no
 * `beforeEach` (`window.__BOOT_DEADLINE_MS`). */
async function abrirView(page: Page, url: string, titulo: string): Promise<void> {
  const heading = page
    .getByRole('main', { name: 'Conteúdo principal' })
    .getByRole('heading', { name: titulo });

  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    try {
      await expect(heading).toBeVisible({ timeout: 30_000 });
      return;
    } catch (erro) {
      if (tentativa === 3) throw erro;
      await page.waitForTimeout(1_000);
    }
  }
}

/** Configurações carrega as abas só depois do fetch do `user_settings`. */
async function esperarAbasDeConfiguracoes(page: Page): Promise<void> {
  await expect(
    page.getByRole('navigation', { name: 'Categorias de configurações' }),
  ).toBeVisible(HA_CARGA);
}

/** Abre a aba pelo grupo (nível 1) e pela aba (nível 2). */
async function abrirAba(page: Page, grupo: string, aba: string): Promise<void> {
  await esperarAbasDeConfiguracoes(page);
  await page.getByRole('navigation', { name: 'Categorias de configurações' })
    .getByRole('button', { name: grupo })
    .click();
  await page.getByRole('tab', { name: aba }).click();
  await expect(page.getByRole('tab', { name: aba })).toHaveAttribute('data-state', 'active');
}

/** Troca o valor de um `<Select>` (Radix) pelo rótulo visível. */
async function escolherNoSelect(page: Page, rotulo: string, opcao: string): Promise<void> {
  await page.getByRole('combobox', { name: rotulo }).click();
  await page.getByRole('option', { name: opcao }).click();
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Configurações — as preferências salvas valem de verdade', () => {
  let registro: Registro;

  // Aquece o Vite antes dos testes medidos: sob a carga da máquina o primeiro
  // carregamento compila o bundle e pode estourar o guard de montagem do app
  // mesmo sem defeito nenhum (mesma razão do beforeAll de a11y-config-admin.spec).
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
    // O vigia do boot em index.html mata o React em 8s por padrão. Sob a carga da
    // máquina esse teto é apertado; esticá-lo tira a cauda flaky sem mudar nada do app.
    await page.addInitScript(() => {
      (window as unknown as { __BOOT_DEADLINE_MS?: number }).__BOOT_DEADLINE_MS = 60_000;
    });
    await bloquearRedeReal(page, registro);
    await mockAppShell(page, registro);
    await installFakeSession(page);
  });

  test.afterEach(() => {
    expect(registro.redeBarrada).toEqual([]);
  });

  test('tema e idioma: salvar, recarregar e receber o que está na conta', async ({ page }) => {
    const backend = await mockUserSettings(page, { onboarding_completed: true, theme: 'dark' });

    await abrirView(page, '/?view=settings', 'Configurações');
    await abrirAba(page, 'Aparência', 'Aparência');

    // Estado inicial: a conta tem tema 'dark' — a hidratação do banco aplica o
    // escuro logo no boot (o mesmo 'dark' que a sessão falsa escreve no cache).
    await expect(page.locator('html')).toHaveClass(/dark/);

    await escolherNoSelect(page, 'Tema', 'Claro');
    await expect(page.locator('html')).toHaveClass(/light/);

    await escolherNoSelect(page, 'Idioma', 'English (US)');

    await page.getByRole('button', { name: 'Salvar preferências' }).click();
    await expect(page.getByText('Configurações salvas', { exact: true })).toBeVisible(HA_CARGA);

    // O que o botão prometeu está no banco (é o que o outro computador vai ler).
    expect(backend.escritas.length).toBeGreaterThan(0);
    expect(backend.escritas[backend.escritas.length - 1].corpo).toMatchObject({
      theme: 'light',
      language: 'en-US',
    });

    // Reload sem a muleta do cache: o idioma não fica no localStorage e o tema é
    // reescrito para 'dark' pelo init script da sessão falsa em TODA navegação.
    await page.evaluate(() => localStorage.removeItem('language'));
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('main', { name: 'Conteúdo principal' }).getByRole('heading', { name: 'Configurações' }),
    ).toBeVisible(HA_CARGA);
    await abrirAba(page, 'Aparência', 'Aparência');

    await expect(page.locator('html')).toHaveClass(/light/);
    await expect(page.getByRole('combobox', { name: 'Tema' })).toContainText('Claro');
    await expect(page.getByRole('combobox', { name: 'Idioma' })).toContainText('English (US)');
  });

  test('notificação desligada não é ressuscitada pelo "Salvar preferências"', async ({ page }) => {
    const backend = await mockUserSettings(page, {
      onboarding_completed: true,
      browser_notifications_enabled: true,
    });

    await abrirView(page, '/?view=settings', 'Configurações');
    await abrirAba(page, 'Aparência', 'Notificações');

    const interruptor = page.getByRole('switch', { name: 'Notificações do Navegador' });
    await expect(interruptor).toBeChecked();
    await interruptor.click();
    await expect(interruptor).not.toBeChecked();

    // O interruptor grava por conta própria (hook canônico das notificações).
    await expect
      .poll(() => backend.linha.browser_notifications_enabled, HA_CARGA)
      .toBe(false);

    // Agora o botão da aba Aparência: ele só pode gravar as preferências DELE.
    await page.getByRole('tab', { name: 'Aparência' }).click();
    await page.getByRole('button', { name: 'Salvar preferências' }).click();
    await expect(page.getByText('Configurações salvas', { exact: true })).toBeVisible(HA_CARGA);

    const ultima = backend.escritas[backend.escritas.length - 1].corpo;
    expect(ultima).not.toHaveProperty('browser_notifications_enabled');
    expect(backend.linha.browser_notifications_enabled).toBe(false);

    // E o valor continua desligado depois de recarregar (leitura do banco).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('main', { name: 'Conteúdo principal' }).getByRole('heading', { name: 'Configurações' }),
    ).toBeVisible(HA_CARGA);
    await abrirAba(page, 'Aparência', 'Notificações');
    await expect(page.getByRole('switch', { name: 'Notificações do Navegador' })).not.toBeChecked();
  });

  test('Reiniciar Tour volta com o overlay porque a coluna foi para false', async ({ page }) => {
    const backend = await mockUserSettings(page, { onboarding_completed: true });

    // Baseline: com a coluna `true` o React monta e o overlay do tour NÃO aparece.
    await abrirView(page, '/?view=settings', 'Configurações');
    await expect(page.getByRole('button', { name: 'Pular tour' })).toBeHidden();

    await abrirAba(page, 'Aparência', 'Aparência');
    await page.getByRole('button', { name: 'Reiniciar Tour' }).click();
    await expect(page.getByText('Tour de onboarding reiniciado!')).toBeVisible(HA_CARGA);

    // Reiniciar usa `update` (não upsert) na coluna do tour.
    await expect.poll(() => backend.linha.onboarding_completed, HA_CARGA).toBe(false);

    // Recarrega a tela: o overlay só volta porque o banco diz que não concluiu.
    // (Sem `abrirView`: com o diálogo aberto o Radix marca o resto do app como
    // `aria-hidden`, e um `getByRole` no `<main>` não acharia mais nada.)
    await page.goto('/?view=settings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Pular tour' })).toBeVisible({ timeout: 30_000 });
  });
});
