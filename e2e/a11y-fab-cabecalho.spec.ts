/**
 * Toque no FAB de Contatos + geometria da pilha flutuante (390x844).
 * Sessão FALSA, backend mockado, rede real barrada. Sem login, sem secrets.
 *
 * Fecha duas lacunas dos fixtures antigos:
 *  1. RPC `app_bootstrap` (src/hooks/system/useAppBootstrap.ts) — sem ela o
 *     ProtectedRoute fica em "Verificando permissões..." e nada renderiza;
 *  2. sonda `auth/v1/health` (fetch no-cors) — sem mock ela cai em
 *     bloquearRedeReal e envenena registro.redeBarrada.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { gotoContacts } from './fixtures/contacts-page';
import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession } from './fixtures/talkx-demo';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const PERM_MULTIPLIX = 'multiplix.dispatch.create';

/** Lista longa de propósito: sem overflow o ScrollToTopButton nunca monta. */
const CONTATOS = Array.from({ length: 40 }, (_, i) => ({
  id: `3f1c9a10-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  name: `Contato ${String(i + 1).padStart(2, '0')}`,
  surname: 'FAB',
  contact_type: 'cliente',
  created_at: '2026-09-01T12:00:00.000Z',
  updated_at: '2026-09-01T12:00:00.000Z',
  phone: `+55119${String(i).padStart(8, '0')}`,
  email: `contato${i + 1}@e2e.local`,
  company: 'Promo Brindes',
  job_title: 'Compradora',
  tags: ['e2e'],
  avatar_url: null,
  total_count: 40,
}));

async function mockBootstrap(page: Page): Promise<void> {
  const permissao = { id: 'perm-multiplix', name: PERM_MULTIPLIX, description: null, category: 'multiplix' };
  await page.route(/\/rest\/v1\/rpc\/app_bootstrap/, (route) =>
    json(route, {
      profile: { id: USER_ID, name: 'Visual E2E' },
      roles: ['admin'],
      permissions: [permissao],
      // Matriz NÃO vazia: dispensa as N checagens de user_has_permission.
      role_permissions: [{ role: 'admin', permission_id: permissao.id, permission: permissao }],
      global_settings: [], user_settings: null, departments: [],
      unread_notifications: 0, fetched_at: new Date(0).toISOString(),
    }),
  );
  // Sonda de conectividade (no-cors): 200 aqui evita que caia no guarda.
  await page.route(/\/auth\/v1\/health/, (route) => json(route, { ok: true }));
}

async function mockContatos(page: Page): Promise<void> {
  await page.route(/\/rest\/v1\/rpc\/search_contacts/, (route) => json(route, CONTATOS));
  await page.route(/\/rest\/v1\/rpc\/contacts_count_by_type/, (route) =>
    json(route, [{ contact_type: 'cliente', count: CONTATOS.length }]),
  );
  await page.route(/\/rest\/v1\/rpc\/get_last_message_dates/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/rpc\/can_delete_contacts/, (route) =>
    json(route, CONTATOS.map((c) => ({ contact_id: c.id, can_delete: true }))),
  );
  await page.route(/\/rest\/v1\/contacts/, (route) => json(route, CONTATOS));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
}

/** Ordem importa: a ÚLTIMA rota registrada vence (guarda primeiro). */
async function preparar(page: Page, registro: Registro): Promise<void> {
  await bloquearRedeReal(page, registro);
  await mockAppShell(page, registro);
  await mockBootstrap(page);
  await mockContatos(page);
  await installFakeSession(page);
  await gotoContacts(page);
}

type Medida = { x: number; y: number; w: number; h: number; top: number; right: number; bottom: number; left: number };

async function medir(alvo: Locator): Promise<Medida> {
  return alvo.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left };
  });
}

/** Hit-test no centro: elementFromPoint tem de devolver o alvo ou um filho dele. */
async function centroRecebeToque(alvo: Locator): Promise<{ ok: boolean; quem: string }> {
  return alvo.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const quem = hit
      ? `${hit.tagName.toLowerCase()}[data-testid=${hit.getAttribute('data-testid')}][class=${String(hit.className).slice(0, 40)}]`
      : 'null';
    return { ok: !!hit && (hit === el || el.contains(hit)), quem };
  });
}

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

test.describe('Contatos — FAB e pilha de botões flutuantes (390x844)', () => {
  let registro: Registro;

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    await preparar(page, registro);
  });

  test.afterEach(() => {
    expect(registro.redeBarrada, 'nenhuma requisição pode escapar para a rede real').toEqual([]);
  });

  test('FAB abre o diálogo e recebe o toque no próprio centro', async ({ page }) => {
    const fab = page.getByTestId('contact-create-fab');
    await expect(fab).toBeVisible({ timeout: 15_000 });

    const g = await medir(fab);
    expect(g.w).toBeGreaterThanOrEqual(56);          // w-14 h-14
    expect(g.h).toBeGreaterThanOrEqual(56);
    expect(g.right).toBeLessThanOrEqual(390);
    expect(g.bottom).toBeLessThanOrEqual(844);
    expect(g.x, 'FAB precisa estar na metade direita').toBeGreaterThan(195);

    const hit = await centroRecebeToque(fab);
    expect(hit.ok, `centro do FAB entregou o toque a ${hit.quem}`).toBe(true);

    await fab.click();
    await expect(page.getByRole('dialog', { name: 'Adicionar Contato' })).toBeVisible({ timeout: 15_000 });
  });

  test('pilha flutuante não se sobrepõe e o scroll-top só aparece depois de rolar', async ({ page }) => {
    const fab = page.getByTestId('contact-create-fab');
    const mic = page.getByRole('button', { name: 'Assistente de voz' });
    const topo = page.getByRole('button', { name: 'Voltar ao topo' });

    // AppShell: `!isMobile && <VoiceActionBridge/>` — microfone é desktop-only.
    expect(await mic.count(), 'microfone é desktop-only por desenho').toBe(0);
    expect(await topo.count()).toBe(0);

    // O scroller único é o do ViewContainer (role=region/Conteúdo da página).
    await page.getByRole('region', { name: 'Conteúdo da página' }).evaluate((el) => el.scrollTo({ top: 2000 }));
    await expect(topo).toBeVisible({ timeout: 5_000 });
    // A entrada do framer-motion escala o botão antes de assentar.
    await page.waitForTimeout(400);

    const [gFab, gTopo] = await Promise.all([medir(fab), medir(topo)]);
    const sobrepoe =
      gFab.left < gTopo.right && gTopo.left < gFab.right && gFab.top < gTopo.bottom && gTopo.top < gFab.bottom;
    expect(sobrepoe, `FAB ${JSON.stringify(gFab)} vs scroll-top ${JSON.stringify(gTopo)}`).toBe(false);

    const hitTopo = await centroRecebeToque(topo);
    expect(hitTopo.ok, `centro do scroll-top entregou o toque a ${hitTopo.quem}`).toBe(true);

    const hitFab = await centroRecebeToque(fab);
    expect(hitFab.ok, `com a lista rolada, o centro do FAB entregou o toque a ${hitFab.quem}`).toBe(true);
  });
});
