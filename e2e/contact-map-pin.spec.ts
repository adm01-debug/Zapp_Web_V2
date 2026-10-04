import { test, expect, type Page } from '@playwright/test';
import { installFakeSession } from './fixtures/talkx-demo';
import { gotoContacts } from './fixtures/contacts-page';
import {
  bloquearRedeReal, json, mockAppShell, mockMapboxSearchbox, querObjetoUnico, type Registro,
} from './fixtures/mapa-mocks';

/**
 * E74 — E2E do MAPA DE CONTATOS com PINO VERDE (marcador do endereço confirmado).
 *
 * Bloco literal da etapa (docs/mapa/PLANO_FINALIZACAO_100_ETAPAS_2026-09-29.md):
 *   ### E74 · E2E: mapa de contatos com pino verde
 *   1. Com o contato de E73 ainda existente, abrir "Mapa de Contatos", esperar a legenda
 *      "endereço confirmado", contar ≥ 1 pino verde (`data-testid`).
 *   **Checklist:** [ ] `data-testid` adicionados · [ ] caso
 *
 * AUTENTICAÇÃO (sem credencial E2E): reusa `installFakeSession` de `e2e/fixtures/talkx-demo`
 * — mesma sessão Supabase falsa das specs do E71/E73. Todo o app shell e a Mapbox vêm do
 * módulo compartilhado `e2e/fixtures/mapa-mocks.ts`; `bloquearRedeReal` (registrado
 * primeiro) prova que NADA escapa para a internet — a spec falha se `redeBarrada` não
 * estiver vazio.
 *
 * DIVERGÊNCIAS medidas contra o texto da etapa:
 *  - "Com o contato de E73 ainda existente": o contato criado pela spec do E73 é apagado no
 *    `afterEach` dela e specs não compartilham estado. Aqui o contato COM coordenada é
 *    semeado no backend falso da mesma forma que a spec do E73 faz com o store — mesmo dado
 *    (endereço + `latitude`/`longitude`), sem depender da ordem de execução.
 *  - A etapa diz "abrir Mapa de Contatos"; na UI a vista fica em `Mais visualizações → Mapa`
 *    (`ContactViewSwitcher`, `data-testid="view-switcher"`), como o resto dos testes de vista.
 *
 * MAPA (por que há mock de estilo): o `pino-verde` só é desenhado depois que o mapbox-gl
 * emite `load` (`ContactRegionMap`), e sem o estilo o mapa nunca carrega. `mockMapboxEstilo`
 * devolve um estilo MÍNIMO (sem sources/layers) e as rotas `map-sessions`/telemetria que o
 * mapbox-gl v3 chama — assim o mapa "carrega" sem tocar a API real (tiles/sprites reais não
 * existem no teste). Os dados do pin vêm da linha de `contacts`, não do mapa.
 */

const CONTATO_MAPA = {
  id: 'e2e-pino-verde-0001',
  name: '[E2E] Mapa Pino Verde',
  nickname: null, surname: null, job_title: null, company: null,
  phone: '5511999999999', email: null, contact_type: 'individual',
  created_at: '2026-10-02T12:00:00.000Z', updated_at: '2026-10-02T12:00:00.000Z',
  deleted_at: null, is_lid_legacy: false, tags: [], avatar_url: null,
  address: 'Avenida Paulista, 1000', address_number: '1000', neighborhood: 'Bela Vista',
  city: 'São Paulo', state: 'SP', postal_code: '01310-100',
  latitude: -23.5613, longitude: -46.6565, assigned_to: null, queue_id: null,
};

/** Backend falso da tela de Contatos (KPI, busca e contadores derivados da mesma linha). */
async function mockBackendContatos(page: Page): Promise<void> {
  // KPI da tela lê a tabela `contacts` direto (useContactsKpi), não a RPC.
  await page.route(/\/rest\/v1\/contacts/, (route) => {
    if (route.request().method() !== 'GET') return json(route, { message: 'blocked' }, 403);
    return json(route, querObjetoUnico(route) ? CONTATO_MAPA : [CONTATO_MAPA]);
  });
  await page.route(/\/rest\/v1\/rpc\/search_contacts/, (route) =>
    json(route, [{ ...CONTATO_MAPA, total_count: 1 }]));
  await page.route(/\/rest\/v1\/rpc\/contacts_count_by_type/, (route) =>
    json(route, [{ contact_type: 'cliente', count: 1 }]));
  await page.route(/\/rest\/v1\/rpc\/get_last_message_dates/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/rpc\/can_delete_contacts/, (route) =>
    json(route, [{ contact_id: CONTATO_MAPA.id, can_delete: true }]));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
}

/** Estilo mínimo do Mapbox: sem sources/layers o mapa carrega sem tocar tiles reais. */
const ESTILO_MINIMO = { version: 8, name: 'e2e', sources: {}, layers: [] };

/** Rotas do mapbox-gl v3 que não são o estilo e que, sem mock, escapariam ao guarda (403). */
async function mockMapboxEstilo(page: Page): Promise<void> {
  await page.route('**/api.mapbox.com/styles/**', (route) => json(route, ESTILO_MINIMO));
  await page.route('**/api.mapbox.com/map-sessions/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/events.mapbox.com/**', (route) => route.fulfill({ status: 204, body: '' }));
}

test.describe('E74 · mapa de contatos com pino verde', () => {
  test('abre "Mapa", a legenda confirma o endereço e há ≥1 pino verde', async ({ page }) => {
    const registro: Registro = { writesApp: [], mapbox: [], redeBarrada: [] };

    // Ordem de registro importa: o Playwright casa as rotas na ordem INVERSA (a última vence),
    // então o guarda entra primeiro e os mocks específicos depois.
    await bloquearRedeReal(page, registro);
    await mockAppShell(page, registro);
    await mockBackendContatos(page);
    await mockMapboxSearchbox(page, registro);
    await mockMapboxEstilo(page);
    await installFakeSession(page);

    await gotoContacts(page);
    await page.getByTitle('Mais visualizações').click();
    await page.getByRole('menuitem', { name: 'Mapa' }).click();
    await expect(page.getByText('contatos mapeados')).toBeVisible();

    // 1. A legenda distingue a fonte "endereço confirmado" com a contagem (passo da etapa).
    await expect(page.getByText('Endereço confirmado (1)')).toBeVisible();

    // 2. ≥ 1 pino verde por `data-testid` — o PINO do endereço confirmado, com id e título.
    const pinos = page.getByTestId('pino-verde');
    await expect(pinos).toHaveCount(1);
    await expect(pinos.first()).toBeVisible();
    await expect(pinos.first()).toHaveAttribute('data-precise-contact-id', CONTATO_MAPA.id);
    await expect(pinos.first()).toHaveAttribute('title', /endereço confirmado/);

    // Prova de escopo: nenhuma requisição escapou dos mocks (Supabase/Mapbox reais).
    expect(registro.redeBarrada ?? []).toEqual([]);
    // E o mapa realmente montou (canvas do mapbox-gl no DOM).
    await expect(page.locator('.mapboxgl-canvas')).toHaveCount(1);
  });
});
