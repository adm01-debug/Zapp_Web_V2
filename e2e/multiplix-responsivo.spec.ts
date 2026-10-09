/**
 * F87 (plano MULTIPLIX, Bloco I — Front) — "Responsivo em 1920x1080, 1440x900,
 * 1024x1000, 390x844 sem rolagem horizontal (Playwright)".
 *
 * O que se mede: em cada uma das 4 viewports do aceite, a tela do Multiplix
 * (lista do público, diálogo "Novo disparo Multiplix" aberto e o monitor do
 * disparo) NÃO pode fazer `document.documentElement.scrollWidth` passar de
 * `window.innerWidth`. Quando passa, a falha lista os elementos que atravessam a
 * borda direita — é o diagnóstico, não só o "vermelho".
 *
 * HERMÉTICO POR CONSTRUÇÃO (mesma receita de `a11y-contraste.spec.ts` e
 * `multiplix.spec.ts`): sessão FALSA (`installFakeSession`), `storageState`
 * zerado (nunca lê `e2e/.auth/user.json`), app shell mockado (`mockAppShell`),
 * rede real barrada e conferida no `afterEach` (`bloquearRedeReal`), WebSocket do
 * Realtime fechado, e as duas Edges do módulo (`multiplix-audience` e
 * `multiplix-dispatch`) respondendo por `page.route`. Nenhum banco, nenhuma
 * credencial, nenhum pedido a produção.
 *
 * Os dois componentes do aceite entram na medição: `MultiplixComposerDialog`
 * (diálogo aberto, com o rodapé de duas ações) e `MultiplixMonitor` (cabeçalho
 * com as ações, grade de 5 métricas, tabela de destinatários com pill + data).
 */
import { test, expect, type Page, type Route } from '@playwright/test';

import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession } from './fixtures/talkx-demo';

// Deslogado de propósito: a sessão vem de `installFakeSession`, nunca do
// `storageState` do projeto `setup` (que exigiria login real).
test.use({ storageState: { cookies: [], origins: [] } });

// O dev server frio compila o app inteiro na primeira navegação.
test.setTimeout(120_000);

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1024, height: 1000 },
  { width: 390, height: 844 },
];

const PAGE_SIZE = 50; // igual ao PAGE_SIZE de MultiplixView.tsx
const DISPATCH_ID = '00000000-0000-4000-8000-00000000f870';
const EMPRESA_P1 = 'E2E Empresa 01';

interface Empresa {
  company_id: string;
  company_name: string;
  ramo_atividade: string;
  uf: string | null;
  is_customer: boolean;
  is_supplier: boolean;
  is_carrier: boolean;
  destino_e164: string | null;
  destino_origem: string;
  motivo_inclusao: string;
}

function empresa(n: number): Empresa {
  return {
    company_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    company_name: `E2E Empresa ${String(n).padStart(2, '0')}`,
    ramo_atividade: 'Brindes',
    uf: 'SP',
    is_customer: false,
    is_supplier: true,
    is_carrier: false,
    destino_e164: `+551****0000${String(n).padStart(3, '0')}`,
    destino_origem: 'contato_pessoa',
    motivo_inclusao: 'fornecedor',
  };
}

const CRIADO_EM = '2026-03-02T12:00:00.000Z';

// Conteúdo "de pior caso" de largura: nome longo (empresa que não cabe na
// coluna), mensagem longa e motivo longo. O texto curto esconde overflow.
function caixaLonga(over: Record<string, unknown>) {
  return {
    id: DISPATCH_ID,
    name: 'E2E Disparo recente com nome bem longo para medir o cabecalho do monitor',
    message_template: 'Olá {{empresa}}, {{saudacao}}! Confira os brindes personalizados do mês com frete grátis para todo o Brasil.',
    status: 'sending',
    total_recipients: 1500,
    sent_count: 480,
    failed_count: 12,
    delivered_count: 468,
    outcome_unknown_count: 8,
    started_at: CRIADO_EM,
    paused_at: null,
    pause_reason: null,
    completed_at: null,
    created_at: CRIADO_EM,
    ...over,
  };
}

function destinatario(n: number, status: string) {
  return {
    id: `00000000-0000-4000-8000-${String(n + 5000).padStart(12, '0')}`,
    company_name_snapshot: `E2E Empresa ${String(n).padStart(2, '0')} Comércio de Brindes Personalizados LTDA`,
    destino_e164: `+55 11 9${String(n).padStart(4, '0')}-0000`,
    status,
    sent_at: status === 'sent' || status === 'delivered' ? CRIADO_EM : null,
    error_message: status === 'failed' ? 'Edge Function returned a non-2xx status code' : null,
    personalized_message: 'Olá E2E Empresa, bom dia!',
  };
}

/**
 * As duas Edges do módulo. Registre DEPOIS de `mockAppShell` — o Playwright casa
 * as rotas na ordem INVERSA de registro, então estas têm prioridade sobre o
 * catch-all `functions/v1/*` do shell (que devolveria `{}`).
 *
 * Contratos lidos dos hooks (`useMultiplixAudience`, `useMultiplixDispatches`):
 * body `{ action, params }` / `{ action, payload }`, resposta `{ data }`.
 */
async function mockMultiplix(page: Page): Promise<void> {
  const corpo = (route: Route) => (route.request().postDataJSON() ?? {}) as {
    action?: string;
    params?: Record<string, unknown>;
    payload?: Record<string, unknown>;
  };

  await page.route(/\/functions\/v1\/multiplix-audience/, (route: Route) => {
    const { action = '', params = {} } = corpo(route);
    switch (action) {
      case 'list_ramos':
        return json(route, { data: [{ ramo_atividade: 'Brindes', total: PAGE_SIZE }] });
      case 'list_ufs':
        return json(route, { data: [{ uf: 'SP', total: PAGE_SIZE }] });
      case 'count':
        return json(route, { data: PAGE_SIZE });
      case 'search':
        return json(route, { data: Array.from({ length: PAGE_SIZE }, (_, i) => empresa(i + 1)) });
      default:
        return json(route, { error: `acao nao prevista no spec: ${action}` }, 400);
    }
  });

  await page.route(/\/functions\/v1\/multiplix-dispatch/, (route: Route) => {
    const { action = '', payload = {} } = corpo(route);
    switch (action) {
      case 'dispatch.list': {
        const alvo = payload.dispatch_id;
        const linhas = typeof alvo === 'string' ? [caixaLonga({ id: alvo })] : [caixaLonga({})];
        return json(route, { data: { dispatches: linhas, total: linhas.length } });
      }
      case 'recipients.list': {
        const filtro = typeof payload.status === 'string' ? payload.status : 'all';
        if (filtro === 'skipped') return json(route, { data: { recipients: [], total: 0 } });
        const st = ['delivered', 'sent', 'failed', 'outcome_unknown', 'pending'];
        const linhas = Array.from({ length: PAGE_SIZE }, (_, i) => destinatario(i + 1, st[i % st.length]));
        return json(route, { data: { recipients: linhas, total: 1500 } });
      }
      default:
        return json(route, { error: `acao nao prevista no spec: ${action}` }, 400);
    }
  });
}

async function preparar(page: Page): Promise<Registro> {
  const registro: Registro = { writesApp: [], mapbox: [], redeBarrada: [] };
  // O guarda vai PRIMEIRO: é o último a valer (ordem inversa) e pega só o que
  // nenhum mock específico cobriu.
  await bloquearRedeReal(page, registro);
  // O WebSocket do Realtime NÃO passa por `page.route`.
  await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
  await mockAppShell(page, registro);
  await installFakeSession(page);
  await page.route(/\/rest\/v1\/contacts/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
  await mockMultiplix(page);
  return registro;
}

/**
 * Overflow horizontal do DOCUMENTO (a regra que a casa já usa: é a mesma de
 * `contacts-view.spec.ts`). `culpados` só é preenchido quando há overflow: é o
 * diagnóstico — quantos elementos atravessam a borda direita da viewport.
 */
async function medir(page: Page) {
  return page.evaluate(() => {
    const innerWidth = window.innerWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const culpados: Array<{ tag: string; classes: string; right: number }> = [];
    if (scrollWidth > innerWidth) {
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const r = el.getBoundingClientRect();
        if (r.right > innerWidth + 1) {
          culpados.push({ tag: el.tagName, classes: String(el.className).slice(0, 90), right: Math.round(r.right) });
          if (culpados.length >= 5) break;
        }
      }
    }
    return { innerWidth, scrollWidth, culpados };
  });
}

async function semRolagemHorizontal(page: Page, onde: string): Promise<number> {
  const { innerWidth, scrollWidth, culpados } = await medir(page);
  expect(
    scrollWidth,
    `${onde} @${innerWidth}px: rolagem horizontal de ${scrollWidth - innerWidth}px. Culpados: ${JSON.stringify(culpados)}`,
  ).toBeLessThanOrEqual(innerWidth);
  return innerWidth;
}

/**
 * Barra de rolagem horizontal DENTRO de um recorte (o app shell tem
 * `overflow-x: hidden` no `main` e no `body`: sozinha, a medida do documento é
 * cega para conteúdo largo demais, que fica CORTADO sem gerar barra). Aqui a
 * medida é por elemento: nenhum descendente do recorte pode ter
 * `scrollWidth - clientWidth > 1` com `overflow-x: auto|scroll`.
 *
 * O recorte é o componente do aceite (`MultiplixMonitor` ou o diálogo do
 * composer), não a tela toda: a tabela de 6 colunas do público usa a primitiva
 * `Table` (`src/components/ui/table.tsx`, wrapper `overflow-auto`) e rola na
 * horizontal por desenho do sistema — fora dos dois componentes deste cartão
 * (registrado em comentário no cartão para virar cartão próprio).
 */
async function semBarraHorizontalInterna(page: Page, seletor: string, onde: string): Promise<void> {
  const rolaveis = await page.evaluate((sel: string) => {
    const raiz = document.querySelector(sel);
    if (!raiz) throw new Error(`recorte nao encontrado na tela: ${sel}`);
    const achados: Array<{ tag: string; classes: string; excesso: number }> = [];
    for (const el of Array.from(raiz.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      const excesso = el.scrollWidth - el.clientWidth;
      if (excesso > 1 && (cs.overflowX === 'auto' || cs.overflowX === 'scroll')) {
        achados.push({ tag: el.tagName, classes: String(el.className).slice(0, 90), excesso });
      }
    }
    return achados;
  }, seletor);
  expect(
    rolaveis,
    `${onde}: elemento com barra de rolagem horizontal dentro de ${seletor}: ${JSON.stringify(rolaveis)}`,
  ).toEqual([]);
}

async function entrarEmMultiplix(page: Page): Promise<void> {
  await page.goto('/?view=multiplix');
  // Em viewport estreita o cabecalho do app tambem mostra "Multiplix" (h1 do
  // banner): o alvo e o titulo do MODULO, dentro do main.
  await expect(page.getByRole('main').getByRole('heading', { name: 'Multiplix' }))
    .toBeVisible({ timeout: 60_000 });
}

for (const vp of VIEWPORTS) {
  test.describe(`Multiplix — sem rolagem horizontal em ${vp.width}x${vp.height} (F87)`, () => {
    let registro: Registro;

    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(vp);
      registro = await preparar(page);
    });

    test.afterEach(() => {
      expect(registro.redeBarrada).toEqual([]);
    });

    test('lista do público, diálogo do disparo e monitor cabem na viewport', async ({ page }) => {
      // Tudo o que e da TELA e buscado dentro do `main`: em viewport estreita o
      // cabecalho do app expoe um botao de busca com o mesmo nome acessivel.
      const tela = page.getByRole('main');
      await entrarEmMultiplix(page);
      await semRolagemHorizontal(page, 'lista do público (antes da busca)');

      await tela.getByRole('button', { name: 'Buscar' }).click();
      await expect(tela.getByRole('cell', { name: EMPRESA_P1, exact: true })).toBeVisible();
      await semRolagemHorizontal(page, 'tabela do público (50 linhas)');

      // MultiplixComposerDialog: seleciona uma empresa e abre o diálogo.
      await tela.getByRole('checkbox', { name: `Selecionar ${EMPRESA_P1}` }).click();
      await expect(tela.getByText('1 empresa(s) selecionada(s)')).toBeVisible();
      await tela.getByRole('button', { name: 'Criar disparo' }).click();
      const dialogo = page.getByRole('dialog', { name: 'Novo disparo Multiplix' });
      await expect(dialogo).toBeVisible();
      const largura = await semRolagemHorizontal(page, 'diálogo Novo disparo Multiplix');
      await semBarraHorizontalInterna(page, '[role="dialog"]', 'diálogo Novo disparo Multiplix');
      const caixa = await dialogo.boundingBox();
      expect(caixa, 'o diálogo precisa estar renderizado para medir a caixa').not.toBeNull();
      expect(caixa!.x, 'diálogo começa fora da viewport à esquerda').toBeGreaterThanOrEqual(0);
      expect(caixa!.x + caixa!.width, 'diálogo termina fora da viewport à direita').toBeLessThanOrEqual(largura + 1);
      await page.keyboard.press('Escape');
      await expect(dialogo).toBeHidden();

      // MultiplixMonitor: abre o disparo pela lista "Disparos recentes".
      await tela.getByRole('button', { name: /E2E Disparo recente/ }).click();
      await expect(tela.getByRole('button', { name: 'Voltar aos disparos' })).toBeVisible();
      await expect(tela.getByText('Destinatários')).toBeVisible();
      await semRolagemHorizontal(page, 'monitor do disparo');
      await semBarraHorizontalInterna(page, '[data-testid="multiplix-monitor"]', 'monitor do disparo');
    });
  });
}
