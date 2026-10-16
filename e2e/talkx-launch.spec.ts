/**
 * X034 — E2E de LANÇAMENTO do Talk X (ensaio real, sem enviar nada).
 *
 * Prova o ciclo completo de uma campanha no navegador com o backend inteiro
 * mockado por `page.route`:
 *
 *   lançar (menu "Iniciar agora" da visão geral) → corpo `{ action: 'start' }`
 *   → ida ao monitor ("Campanha em Andamento")
 *   → pausar com motivo        → corpo `{ action: 'pause', reason }`
 *   → retomar                  → corpo `{ action: 'start' }`
 *   → cancelar                 → corpo `{ action: 'cancel' }`
 *
 * Toda chamada a `**\/functions/v1/talkx-send` passa pelo stub local
 * (`stubTalkXSend`) e volta com o cabeçalho marcador `x-talkx-launch-stub`.
 * Qualquer resposta de `talkx-send` SEM esse cabeçalho é uma chamada que
 * escapou do stub — o teste falha (`escapes` no fim). O provedor de PRODUÇÃO
 * não é endereçado por nenhum caminho: não existe rede real neste spec.
 *
 * Fixtures: `e2e/fixtures/talkx-launch/<tabela>.json` (as leituras da campanha).
 * A sessão é FALSA (`installFakeSession`) — sem `storageState`, sem secrets —
 * por isso o spec roda no workflow de PR (`e2e-talkx.yml`, projeto
 * `chromium-talkx-launch`).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { installFakeSession } from './fixtures/talkx-demo';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures', 'talkx-launch');
const STUB_HEADER = 'x-talkx-launch-stub';
const ESCRITA_NAO_PREVISTA = 'escrita não prevista';

const CAMPAIGN_ID = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const CAMPAIGN_NAME = '[E2E] Lançamento X034';
const FAKE_USER_ID = '00000000-0000-4000-8000-000000000001';
const FAKE_EMAIL = 'visual@test.local';

type CorpoEnvio = Record<string, unknown>;

interface TalkXLaunchHarness {
  /** corpos JSON de cada POST que chegou ao stub de `talkx-send`, em ordem. */
  envios: CorpoEnvio[];
  /** URLs de `talkx-send` que responderam SEM o cabeçalho do stub (deveria ser vazio). */
  escapes: string[];
  /** respostas de `talkx-send` QUE trouxeram o cabeçalho do stub. */
  marcados: number;
}

function carregarFixtures(): Record<string, unknown[]> {
  const fixtures: Record<string, unknown[]> = {};
  for (const arquivo of readdirSync(FIXTURES_DIR)) {
    if (!arquivo.endsWith('.json')) continue;
    fixtures[arquivo.slice(0, -'.json'.length)] = JSON.parse(
      readFileSync(join(FIXTURES_DIR, arquivo), 'utf8'),
    ) as unknown[];
  }
  return fixtures;
}

const isRead = (metodo: string) => metodo === 'GET' || metodo === 'HEAD';

function json(route: Route, corpo: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(corpo),
  });
}

function escritaBloqueada(route: Route): Promise<void> {
  return json(route, { message: ESCRITA_NAO_PREVISTA }, 403);
}

/**
 * Monta o backend fake do lançamento e devolve o registrador de envios.
 * O estado da campanha é MUTÁVEL: cada ação de `talkx-send` atualiza o status
 * que as leituras (`talkx_campaigns`) passam a devolver — é assim que a UI
 * migra de rascunho → em andamento → pausada → cancelada sem banco.
 */
async function prepararTalkXLaunch(page: Page): Promise<TalkXLaunchHarness> {
  const fixtures = carregarFixtures();
  const campanhas = (fixtures.talkx_campaigns ?? []) as Array<Record<string, unknown>>;
  const envios: CorpoEnvio[] = [];
  const escapes: string[] = [];
  let marcados = 0;

  await installFakeSession(page);

  // Guarda de escape: qualquer resposta de talkx-send sem o cabeçalho do stub
  // só pode ter vindo de fora do stub (produção) — é falha.
  page.on('response', (resposta) => {
    if (!resposta.url().includes('/functions/v1/talkx-send')) return;
    if (resposta.headers()[STUB_HEADER] === '1') marcados += 1;
    else escapes.push(resposta.url());
  });

  // ── REST (Supabase/PostgREST) ─────────────────────────────────────────────
  await page.route(/\/rest\/v1\//, async (route) => {
    const url = new URL(route.request().url());
    const metodo = route.request().method();
    const caminho = url.pathname.replace(/^.*\/rest\/v1\/?/, '');

    if (caminho.startsWith('rpc/')) {
      const rpc = caminho.slice('rpc/'.length);
      if (metodo !== 'POST') return escritaBloqueada(route);
      // Identidade do usuário fake (mesmo contrato de mockTalkXAuth).
      if (rpc === 'user_has_permission') return json(route, true);
      if (rpc === 'get_team_profiles') return json(route, []);
      // Qualquer outra RPC talkx_* é escrita/envio não previsto: bloqueia.
      return escritaBloqueada(route);
    }

    if (!isRead(metodo)) return escritaBloqueada(route);

    const tabela = caminho.split('?')[0];
    if (tabela === 'profiles') {
      return json(route, [{ id: FAKE_USER_ID, user_id: FAKE_USER_ID, name: 'Visual Talk X', email: FAKE_EMAIL, role: 'admin', is_active: true }]);
    }
    if (tabela === 'user_roles') return json(route, [{ role: 'admin' }]);
    if (tabela === 'talkx_campaigns') return json(route, campanhas);
    return json(route, fixtures[tabela] ?? []);
  });

  // ── Edge functions ────────────────────────────────────────────────────────
  await page.route(/\/functions\/v1\//, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith('/functions/v1/talkx-send')) {
      return json(route, { message: ESCRITA_NAO_PREVISTA }, 403);
    }

    // Stub do motor: registra o corpo e devolve o aceite do contrato
    // ({ accepted: true }) — nenhuma mensagem sai do navegador.
    const corpo = (JSON.parse(route.request().postData() ?? '{}') ?? {}) as CorpoEnvio;
    envios.push(corpo);

    const campanha = campanhas[0];
    if (campanha) {
      if (corpo.action === 'pause') campanha.status = 'paused';
      else if (corpo.action === 'cancel') campanha.status = 'cancelled';
      else if (corpo.action === 'start') campanha.status = 'sending';
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { [STUB_HEADER]: '1' },
      body: JSON.stringify({ accepted: true, status: campanha?.status ?? 'sending' }),
    });
  });

  return { envios, escapes, get marcados() { return marcados; } };
}

test.describe('Talk X · lançamento com provedor falso', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('lança, pausa com motivo, retoma e cancela — tudo pelo stub', async ({ page }) => {
    const harness = await prepararTalkXLaunch(page);

    await page.goto('/?view=talkx');
    await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();
    await expect(page.getByText(CAMPAIGN_NAME).first()).toBeVisible();

    // O rótulo do botão do menu é exatamente "Ações" (sem `exact` o seletor casa
    // "Notificações", que também contém "ações").
    const menuAcoes = () => page.getByRole('button', { name: 'Ações', exact: true }).first();

    // 1) LANÇAR — menu "Ações" da linha → "Iniciar agora" → confirmar.
    await menuAcoes().click();
    await page.getByRole('menuitem', { name: 'Iniciar agora', exact: true }).click();
    // O TalkXConfirmDialog é um `alertdialog`.
    const confirmarInicio = page.getByRole('alertdialog');
    await expect(confirmarInicio).toBeVisible();
    await confirmarInicio.getByRole('button', { name: 'Iniciar envio', exact: true }).click();

    await expect.poll(() => harness.envios.length, { timeout: 10_000 }).toBe(1);
    expect(harness.envios[0]).toEqual({ campaignId: CAMPAIGN_ID, action: 'start' });

    // 2) IDA AO MONITOR — o stub já devolveu a campanha como "sending", então a
    //    linha passa a oferecer "Em andamento" e abre o monitor da campanha.
    await expect(menuAcoes()).toBeVisible();
    await expect(page.getByText('Em andamento', { exact: true }).first()).toBeVisible();
    await menuAcoes().click();
    await page.getByRole('menuitem', { name: 'Em andamento', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Campanha em Andamento' })).toBeVisible();

    // 3) PAUSAR COM MOTIVO.
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
    const dialogoPausa = page.getByRole('alertdialog');
    await expect(dialogoPausa).toBeVisible();
    await dialogoPausa.getByPlaceholder('Motivo da pausa (opcional)').fill('pausa de ensaio X034');
    await dialogoPausa.getByRole('button', { name: 'Pausar', exact: true }).click();

    await expect.poll(() => harness.envios.length, { timeout: 10_000 }).toBe(2);
    expect(harness.envios[1]).toEqual({
      campaignId: CAMPAIGN_ID,
      action: 'pause',
      reason: 'pausa de ensaio X034',
    });

    // 4) RETOMAR — a campanha pausada volta a enviar.
    await page.getByRole('button', { name: 'Retomar', exact: true }).click();
    await expect.poll(() => harness.envios.length, { timeout: 10_000 }).toBe(3);
    expect(harness.envios[2]).toEqual({ campaignId: CAMPAIGN_ID, action: 'start' });

    // 5) CANCELAR.
    await page.getByRole('button', { name: 'Cancelar campanha', exact: true }).click();
    const dialogoCancelar = page.getByRole('alertdialog');
    await expect(dialogoCancelar).toBeVisible();
    await dialogoCancelar.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();

    await expect.poll(() => harness.envios.length, { timeout: 10_000 }).toBe(4);
    expect(harness.envios[3]).toMatchObject({ campaignId: CAMPAIGN_ID, action: 'cancel' });

    // NENHUMA chamada a talkx-send saiu do navegador sem passar pelo stub:
    // toda resposta de talkx-send trouxe o cabeçalho marcador e nenhuma escapou.
    expect(harness.escapes).toEqual([]);
    expect(harness.marcados).toBe(harness.envios.length);
    expect(harness.envios.length).toBe(4);
  });
});
