import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Route } from '@playwright/test';

/**
 * Setup comum das specs E2E do módulo Mapa (E71/E72 picker do inbox, E73 cadastro de
 * contato). Extraído da spec do E71 para não duplicar o mesmo mock em duas specs.
 *
 * Contém:
 *  - `mockAppShell`: identidade (profiles/user_roles/user_settings), RPCs do shell
 *    (`user_has_permission`, `count_searchbox_sessions_this_month`), edge
 *    `get-mapbox-token` e o catch-all das demais leituras de `rest/v1`.
 *  - `mockMapboxSearchbox`: `**\/searchbox/v1/**` respondido com as fixtures de
 *    `src/lib/__fixtures__/mapbox/` (E68) — nenhuma chamada real à Mapbox.
 *  - `bloquearRedeReal`: rede de segurança registrada ANTES dos mocks específicos
 *    (o Playwright casa as rotas na ordem INVERSA de registro, então esta é a
 *    última a ser considerada). Tudo que `rest/v1`/`functions/v1` do Supabase e
 *    `api.mapbox.com` não tenham rota explícita cai aqui em vez de sair para a
 *    internet; o registro do que caiu fica em `Registro.redeBarrada` e as specs
 *    assertam que ele está vazio.
 */

const FIXTURES_MAPBOX = join(import.meta.dirname, '..', '..', 'src', 'lib', '__fixtures__', 'mapbox');

/** Host do projeto Supabase usado pelas fixtures do repo (mesmo de `e2e/fixtures/contacts-page.ts`). */
export const SUPABASE_HOST = 'https://tnnnlkbymytvtqngbbqh.supabase.co';

export type Registro = {
  /** Escritas que o app tentou fazer no backend (método + path). */
  writesApp: string[];
  /** URLs chamadas na API da Mapbox (todas interceptadas pelas fixtures). */
  mapbox: string[];
  /** Requisições que NÃO tinham mock e foram barradas pelo guarda — deve ficar vazio. */
  redeBarrada?: string[];
};

/** Perfil do usuário fake (sessão de `installFakeSession`). */
const PERFIL_FAKE = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: '00000000-0000-4000-8000-000000000001',
  name: 'Visual E2E',
  email: 'visual@test.local',
  role: 'admin',
};

/** Fixture JSON de resposta da Mapbox (E68), sem `access_token`. */
export function fixtureMapbox(nome: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_MAPBOX, nome), 'utf8')) as unknown;
}

export function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** `.single()` do supabase-js manda Accept object; `.maybeSingle()`/`.select()` esperam array. */
export function querObjetoUnico(route: Route): boolean {
  return String(route.request().headers()['accept'] ?? '').includes('pgrst.object');
}

/**
 * Identidade + RPCs + edge do app shell. Registre este ANTES das rotas específicas da
 * sua spec (a última registrada vence, então as suas têm prioridade).
 */
export async function mockAppShell(page: Page, registro: Registro): Promise<void> {
  await page.route(/\/rest\/v1\/profiles/, (route) =>
    json(route, querObjetoUnico(route) ? PERFIL_FAKE : [PERFIL_FAKE]));
  await page.route(/\/rest\/v1\/user_roles/, (route) =>
    json(route, querObjetoUnico(route) ? { role: 'admin' } : [{ role: 'admin' }]));
  await page.route(/\/rest\/v1\/user_settings/, (route) =>
    json(route, querObjetoUnico(route) ? null : []));

  // RPCs: permissão nomeada liberada; contagem do guarda de custo = 0 (autocomplete liberado).
  await page.route(/\/rest\/v1\/rpc\/user_has_permission/, (route) => json(route, true));
  await page.route(/\/rest\/v1\/rpc\/count_searchbox_sessions_this_month/, (route) => json(route, 0));
  await page.route(/\/rest\/v1\/rpc\/(?!user_has_permission|count_searchbox_sessions_this_month)/, (route) => json(route, null));

  // Edge functions: só o token do Mapbox importa; o resto é bloqueado.
  await page.route(/\/functions\/v1\/get-mapbox-token/, (route) => json(route, { token: 'pk.e2e-mapa' }));
  await page.route(/\/functions\/v1\/(?!get-mapbox-token)/, (route) => json(route, {}));

  // GoTrue: o supabase-js valida a sessão em `/auth/v1/user`, mas o JWT de
  // `installFakeSession` não é assinado — o serviço real responde 401 e é isso que o app
  // tolera. Interceptado aqui com o MESMO status para a spec não tocar a internet (sem
  // mudar o que o app vê: continuava 401 quando a requisição escapava).
  await page.route(/\/auth\/v1\/user/, (route) => json(route, { code: 401, msg: 'invalid JWT' }, 401));

  // Catch-all das leituras do app shell não cobertas acima (usa negative lookahead para
  // nunca roubar `contacts`/`messages`, que cada spec registra por conta própria).
  await page.route(/\/rest\/v1\/(?!profiles|user_roles|user_settings|contacts|messages|rpc)[a-z_]+/, (route) =>
    route.request().method() === 'GET' ? json(route, querObjetoUnico(route) ? null : []) : json(route, { message: 'blocked' }, 403));
}

/**
 * Toda a rede da Mapbox é interceptada por UM padrão glob (qualquer host + `searchbox/v1`
 * + qualquer subpath) e respondida com as fixtures de E68.
 *
 * Observação honesta (herdada do E71): E68 NÃO tem fixture de `/retrieve` para "avenida
 * paulista 1000" (só `retrieve-xbz-brindes.json`, que é do XBZ). O corpo de
 * `forward-avenida-paulista-1000.json` tem exatamente o shape que o parser de `/retrieve`
 * lê (`features[0].geometry.coordinates` + `properties.name`/`full_address`), então é ele
 * que responde o `/retrieve` — nenhum shape inventado.
 *
 * `failSuggest: true` devolve 500 no `/suggest` (E72), montado inline porque E68 não tem
 * fixture de 500.
 */
export async function mockMapboxSearchbox(
  page: Page,
  registro: Registro,
  opts: { failSuggest?: boolean } = {},
): Promise<void> {
  await page.route('**/searchbox/v1/**', (route) => {
    const url = route.request().url();
    registro.mapbox.push(url);
    if (url.includes('/searchbox/v1/suggest')) {
      if (opts.failSuggest) return json(route, { message: 'Internal Server Error' }, 500);
      return json(route, fixtureMapbox('suggest-avenida-paulista-1000.json'));
    }
    if (url.includes('/searchbox/v1/retrieve/')) return json(route, fixtureMapbox('forward-avenida-paulista-1000.json'));
    if (url.includes('/searchbox/v1/forward')) return json(route, fixtureMapbox('forward-avenida-paulista-1000.json'));
    return json(route, {});
  });
}

/**
 * Guarda de rede: registre ANTES de todos os mocks específicos. Por ser a primeira, é a
 * ÚLTIMA considerada pelo Playwright — só atende o que nenhuma rota posterior pegou. Serve
 * para provar que a spec não toca a internet: qualquer chamada ao Supabase ou à Mapbox que
 * escape dos mocks cai aqui (403) e aparece em `Registro.redeBarrada`.
 */
export async function bloquearRedeReal(page: Page, registro: Registro): Promise<void> {
  const barrado = () => (registro.redeBarrada ??= []);
  await page.route(`**/tnnnlkbymytvtqngbbqh.supabase.co/**`, (route) => {
    barrado().push(route.request().url());
    return json(route, { message: 'rede real bloqueada no E2E' }, 403);
  });
  await page.route('**/api.mapbox.com/**', (route) => {
    barrado().push(route.request().url());
    return json(route, { message: 'rede real bloqueada no E2E' }, 403);
  });
}
