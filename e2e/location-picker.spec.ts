import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installFakeSession } from './fixtures/talkx-demo';

/**
 * E71 — E2E do picker de localização do inbox ("Escolher no Mapa").
 *
 * Mapeamento: `e2e/location-picker.spec.ts` não existia (docs/mapa/mapeamento-fase7.md,
 * linha do E71). A spec abre a conversa do contato fixo `04dff4dc-…` ("[E2E] Contato de
 * teste"), abre "Compartilhar localização" (`Enviar localização` no menu "⋯ Mais" desta
 * versão da UI — ver DIVERGÊNCIAS abaixo), digita "avenida paulista 1000", espera o
 * `role=listbox`, seleciona com `ArrowDown` + `Enter` e confere o cartão de confirmação
 * com "Paulista" — SEM enviar a mensagem (nenhum WhatsApp real é gerado).
 *
 * AUTENTICAÇÃO (sem secret): reusa `installFakeSession` de `e2e/fixtures/talkx-demo.ts`
 * (a mesma sessão Supabase falsa do projeto visual do Talk X). Com ela o app shell monta
 * sem login real; o REST do Supabase é interceptado por `mockSupabaseBackend`. É por isso
 * que a spec roda determinística em `chromium-authenticated` — os dados não vêm da
 * produção (nenhum token, nenhuma conta, nenhuma gravação). O token do Mapbox também é
 * mockado (edge `get-mapbox-token`), então a spec nunca toca a API real.
 *
 * REDE DA MAPBOX: interceptada com `page.route` sobre o padrão glob do path
 * `searchbox/v1` (qualquer host, qualquer subpath) e as fixtures de E68
 * (`src/lib/__fixtures__/mapbox/`), exatamente como pede o texto da etapa.
 */

const CONTACT_ID = '04dff4dc-c6b1-4283-ac22-bd8639804759';
const FAKE_USER_ID = '00000000-0000-4000-8000-000000000001';
const NOW = '2026-10-02T12:00:00.000Z';
const FIXTURES = join(import.meta.dirname, '..', 'src', 'lib', '__fixtures__', 'mapbox');

function fixture(nome: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, nome), 'utf8')) as unknown;
}

// Contato fixo E2E (mesmo id de `e2e/fixtures/e2e-contact.ts`) — row completa do tipo
// `contacts.Row`, para o InboxFilters/list do inbox renderizar o item.
const CONTATO_E2E = {
  id: CONTACT_ID, name: '[E2E] Contato de teste - nao apagar', nickname: null,
  phone: '5511999999999', email: null, avatar_url: null, company: null, job_title: null,
  contact_type: 'individual', conversation_status: 'open', conversation_status_changed_at: NOW,
  assigned_to: FAKE_USER_ID, queue_id: null, tags: [], notes: null, created_at: NOW,
  updated_at: NOW, deleted_at: null, is_lid_legacy: false, channel_type: 'whatsapp',
  channel_connection_id: null, whatsapp_connection_id: null, lead_origin: null, lead_score: null,
  risk_score: null, ai_priority: null, ai_sentiment: null, ai_projection_analysis_id: null,
  ai_projection_updated_at: null, avatar_fetch_attempted_at: null, consent_status: null,
  group_category: null, address: null, address_number: null, city: null, state: null,
  neighborhood: null, postal_code: null, latitude: null, longitude: null, surname: null,
  conversation_sla: null,
};

const MENSAGEM_E2E = {
  id: '11111111-1111-4111-8111-111111111111', contact_id: CONTACT_ID, sender: 'contact',
  content: '[E2E] mensagem de fixture', message_type: 'text', created_at: NOW,
  is_read: false, external_id: null,
};

const PERFIL_FAKE = { id: FAKE_USER_ID, user_id: FAKE_USER_ID, name: 'Visual E2E', email: 'visual@test.local', role: 'admin' };

type Registro = { writesApp: string[]; mapbox: string[] };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** `.maybeSingle()` do supabase-js manda Accept object; `.select()` normal espera array. */
function querObjetoUnico(route: Route): boolean {
  return String(route.request().headers()['accept'] ?? '').includes('pgrst.object');
}

/**
 * Backend fake do app shell + inbox, equivalente em espírito ao `mockTalkXBackend`:
 * leitura devolve a fixture, escrita é bloqueada (403) e nada sai para a rede real.
 */
async function mockSupabaseBackend(page: Page, registro: Registro): Promise<void> {
  // Playwright casa as rotas na ordem INVERSA de registro (a última registrada vence):
  // por isso toda rota genérica usa negative lookahead para nunca roubar o endpoint
  // específico que ela cobriria (ex.: `functions/v1/` vs `functions/v1/get-mapbox-token`).
  await page.route(/\/rest\/v1\/profiles/, (route) =>
    json(route, querObjetoUnico(route) ? PERFIL_FAKE : [PERFIL_FAKE]));
  await page.route(/\/rest\/v1\/user_roles/, (route) =>
    json(route, querObjetoUnico(route) ? { role: 'admin' } : [{ role: 'admin' }]));
  await page.route(/\/rest\/v1\/user_settings/, (route) =>
    json(route, querObjetoUnico(route) ? null : []));

  await page.route(/\/rest\/v1\/contacts/, (route) => {
    if (route.request().method() !== 'GET') {
      registro.writesApp.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      return json(route, { message: 'blocked' }, 403);
    }
    return json(route, querObjetoUnico(route) ? CONTATO_E2E : [CONTATO_E2E]);
  });

  await page.route(/\/rest\/v1\/messages/, (route) => {
    // Enviar localização gravaria uma mensagem: registrar escrita e falhar o teste adiante.
    if (route.request().method() !== 'GET') {
      registro.writesApp.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      return json(route, { message: 'blocked' }, 403);
    }
    return json(route, [MENSAGEM_E2E]);
  });

  // RPCs: permissão nomeada liberada; contagem do guarda de custo = 0 (autocomplete liberado).
  await page.route(/\/rest\/v1\/rpc\/user_has_permission/, (route) => json(route, true));
  await page.route(/\/rest\/v1\/rpc\/count_searchbox_sessions_this_month/, (route) => json(route, 0));
  await page.route(/\/rest\/v1\/rpc\/(?!user_has_permission|count_searchbox_sessions_this_month)/, (route) => json(route, null));

  // Edge functions: só o token do Mapbox importa; o resto é bloqueado.
  await page.route(/\/functions\/v1\/get-mapbox-token/, (route) => json(route, { token: 'pk.e2e-location-picker' }));
  await page.route(/\/functions\/v1\/(?!get-mapbox-token)/, (route) => json(route, {}));

  // Catch-all das leituras do app shell não cobertas acima (nunca overlap com as rotas
  // específicas por causa do negative lookahead).
  await page.route(/\/rest\/v1\/(?!profiles|user_roles|user_settings|contacts|messages|rpc)[a-z_]+/, (route) =>
    route.request().method() === 'GET' ? json(route, querObjetoUnico(route) ? null : []) : json(route, { message: 'blocked' }, 403));
}

/**
 * E71 · passo 3: toda a rede da Mapbox é interceptada por UM padrão glob
 * (qualquer host + `searchbox/v1` + qualquer subpath) e respondida com as fixtures de E68.
 *
 * Observação honesta: E68 NÃO tem fixture de `/retrieve` para "avenida paulista 1000"
 * (só `retrieve-xbz-brindes.json`, que é do XBZ). O corpo de
 * `forward-avenida-paulista-1000.json` tem exatamente o shape que o parser de `/retrieve`
 * lê (`features[0].geometry.coordinates` + `properties.name`/`full_address`) — mesmo dado
 * do E47, portanto, e nenhum shape inventado. É ele que responde o `/retrieve` aqui, para
 * o cartão de confirmação sair com o nome "Avenida Paulista, 1000".
 *
 * E72: com `failSuggest: true`, o `/suggest` responde 500 — o E68 NÃO tem fixture de 500
 * (só `rate-limit-429.json`), então esta falha é montada INLINE aqui (status 500 + corpo de
 * erro genérico), e o `/forward` continua respondendo com a fixture do E68. É o cenário do
 * E72: `/suggest` cai por rota → a cascata de fallback do `useAddressAutocomplete` chama
 * `searchPlaces()` → `/forward` → a lista se preenche.
 */
async function mockMapboxSearchbox(
  page: Page,
  registro: Registro,
  opts: { failSuggest?: boolean } = {},
): Promise<void> {
  await page.route('**/searchbox/v1/**', (route) => {
    const url = route.request().url();
    registro.mapbox.push(url);
    if (url.includes('/searchbox/v1/suggest')) {
      // E72: 500 inline (o E68 não tem fixture de 500) — causa `kind: 'http'`, que É rota
      // quebrada e por isso cai no `/forward` (FORWARD_FALLBACK_KINDS em useAddressAutocomplete).
      if (opts.failSuggest) return json(route, { message: 'Internal Server Error' }, 500);
      return json(route, fixture('suggest-avenida-paulista-1000.json'));
    }
    if (url.includes('/searchbox/v1/retrieve/')) return json(route, fixture('forward-avenida-paulista-1000.json'));
    if (url.includes('/searchbox/v1/forward')) return json(route, fixture('forward-avenida-paulista-1000.json'));
    return json(route, {});
  });
}

test.describe('E71 · picker de localização (combobox de endereço, sem enviar)', () => {
  test('digita, escolhe por teclado e confirma o cartão — sem gerar WhatsApp', async ({ page }) => {
    const registro: Registro = { writesApp: [], mapbox: [] };

    // Mocks ANTES da navegação (precisam estar registrados quando o app faz as chamadas).

    await mockSupabaseBackend(page, registro);
    await mockMapboxSearchbox(page, registro);
    await installFakeSession(page);

    // Abre a conversa do contato fixo (o único que o usuário E2E enxerga).
    await page.goto('/');
    const conversa = page.locator('[data-testid="conversation-item"]').filter({ hasText: '[E2E]' });
    await expect(conversa).toBeVisible();
    await conversa.click();

    // Abre o picker. DIVERGÊNCIA: a etapa fala em "Compartilhar localização", mas o
    // ChatPanel renderiza ChatInputArea → QuickActionChips → popover "⋯ Mais"
    // (data-testid="chip-more") → TertiaryToolsMenu, cujo botão tem aria-label
    // "Enviar localização". O botão "Compartilhar localização" (InputExtraTools) só é
    // montado por ChatMessageInput, que o ChatPanel não usa.
    await page.getByTestId('chip-more').click();
    await page.getByRole('button', { name: 'Enviar localização' }).click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText('Compartilhar Localização')).toBeVisible();

    // O combobox de endereço só existe na aba "Escolher no Mapa".
    await dialogo.getByRole('tab', { name: /Escolher no Mapa/ }).click();
    const combo = dialogo.getByRole('combobox');
    await combo.click();
    await combo.fill('avenida paulista 1000');

    // Lista de sugestões veio da Mapbox interceptada (role=listbox, passo 1 da etapa).
    const listbox = dialogo.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const opcao = dialogo.getByRole('option', { name: /Avenida Paulista, 1000/ });
    await expect(opcao).toBeVisible();

    // ArrowDown destaca a primeira opção; Enter a seleciona (passo 1 da etapa).
    await combo.press('ArrowDown');
    await expect(opcao).toHaveAttribute('aria-selected', 'true');
    await combo.press('Enter');

    // Cartão de confirmação com "Paulista" (o nome vem do /retrieve interceptado).
    await expect(dialogo.getByText('Avenida Paulista, 1000', { exact: true })).toBeVisible();

    // Passo 2 da etapa: NÃO enviar. Fecha o diálogo pelo "Cancelar".
    await expect(dialogo.getByRole('button', { name: 'Enviar Localização' })).toBeEnabled();
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();

    // Prova de que nada foi enviado: nenhum POST (insert) em /rest/v1/messages —
    // o único PATCH que aparece é o `is_read` do markAsRead ao abrir a conversa.
    expect(registro.writesApp.filter((w) => w.startsWith('POST /rest/v1/messages'))).toEqual([]);

    // Passo 3 da etapa: a rota da Mapbox foi de fato exercitada e interceptada.
    expect(registro.mapbox.filter((u) => u.includes('/searchbox/v1/suggest')).length).toBeGreaterThan(0);
    expect(registro.mapbox.filter((u) => u.includes('/searchbox/v1/retrieve/')).length).toBeGreaterThan(0);
    expect(registro.mapbox.every((u) => u.startsWith('https://api.mapbox.com/'))).toBe(true);
  });

  // E72 — mesmo setup do E71, com o `/suggest` devolvendo 500. O caso prova o FALLBACK:
  // `/suggest` cai por rota (http → FORWARD_FALLBACK_KINDS) e o `/forward` resolve (200),
  // então a lista NÃO fica vazia nem em erro — mostra o resultado do forward e o Enter
  // seleciona. É a diferença de um caso "só /suggest 200": aqui o caminho exercitado é a
  // cascata de fallback, não a busca normal.
  test('E72 · /suggest 500 → lista mostra o resultado do /forward e Enter seleciona', async ({ page }) => {
    const registro: Registro = { writesApp: [], mapbox: [] };

    await mockSupabaseBackend(page, registro);
    // Única diferença do E71: `failSuggest` responde 500 no /suggest (inline, sem fixture).
    await mockMapboxSearchbox(page, registro, { failSuggest: true });
    await installFakeSession(page);

    await page.goto('/');
    const conversa = page.locator('[data-testid="conversation-item"]').filter({ hasText: '[E2E]' });
    await expect(conversa).toBeVisible();
    await conversa.click();

    await page.getByTestId('chip-more').click();
    await page.getByRole('button', { name: 'Enviar localização' }).click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText('Compartilhar Localização')).toBeVisible();

    await dialogo.getByRole('tab', { name: /Escolher no Mapa/ }).click();
    const combo = dialogo.getByRole('combobox');
    await combo.click();
    await combo.fill('avenida paulista 1000');

    // O /suggest responde 500, mas a lista aparece com o resultado do /forward (fallback):
    // se o fallback não existisse, aqui seria o estado de erro "Falha ao buscar sugestões.".
    const listbox = dialogo.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const opcao = dialogo.getByRole('option', { name: /Avenida Paulista, 1000/ });
    await expect(opcao).toBeVisible();

    // Enter seleciona o item do forward (passo 1 da etapa). A sugestão do /forward já traz
    // coordenada, então a seleção NÃO dispara um /retrieve.
    await combo.press('ArrowDown');
    await expect(opcao).toHaveAttribute('aria-selected', 'true');
    await combo.press('Enter');

    // Cartão de confirmação com o nome vindo do próprio /forward.
    await expect(dialogo.getByText('Avenida Paulista, 1000', { exact: true })).toBeVisible();

    // Não envia: fecha sem gerar WhatsApp (mesma prova do E71).
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();
    expect(registro.writesApp.filter((w) => w.startsWith('POST /rest/v1/messages'))).toEqual([]);

    // Prova do fallback: o /suggest foi chamado (e respondeu 500), o /forward foi chamado e
    // alimentou a lista, e NENHUM /retrieve ocorreu — a coordenada veio junto do /forward (E15).
    expect(registro.mapbox.filter((u) => u.includes('/searchbox/v1/suggest')).length).toBeGreaterThan(0);
    expect(registro.mapbox.filter((u) => u.includes('/searchbox/v1/forward')).length).toBeGreaterThan(0);
    expect(registro.mapbox.filter((u) => u.includes('/searchbox/v1/retrieve/')).length).toBe(0);
  });
});
