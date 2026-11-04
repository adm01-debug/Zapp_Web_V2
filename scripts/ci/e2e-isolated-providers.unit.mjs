import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviders, PROVIDER_PNG } from '../e2e-isolated/providers.mjs';
import { crc32 } from 'node:zlib';
import { ORIGIN, PROVIDER_ORIGIN, CATALOG_SKU } from '../e2e-isolated/runtime-contract.mjs';
import { evoFetch, extractMessageId } from '../../supabase/functions/_shared/evolution-send.ts';

const env = () => ({ ZAPP_E2E_RUN_ID: 'zapp-e2e-provider-test', GITHUB_SHA: 'a'.repeat(40),
  EVOLUTION_API_KEY: 'e2e-local-admin-canary', EVOLUTION_DEFAULT_INSTANCE_TOKEN: 'e2e-instance-canary',
  PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY: 'e2e-catalog-canary', NODE_EXTRA_CA_CERTS: '/run/zapp-e2e-tls/ca.crt' });
const interfaces = () => ({ lo: [{ address: '127.0.0.1', internal: true }] });
function provider(options = {}) {
  let counter = 0;
  return createProviders({ env: env(), interfaces, namespace: () => 'net:[1234]', now: () => Date.parse('2026-11-04T12:00:00Z'), nextId: () => 'receipt-' + ++counter,
    fetcher: async () => new Response(PROVIDER_PNG, { headers: { 'content-type': 'image/png' } }), ...options });
}
const call = (app, path, body, key = env().EVOLUTION_DEFAULT_INSTANCE_TOKEN, method = 'POST', extra = {}) => app.handler(new Request(PROVIDER_ORIGIN + path, {
  method, headers: { 'content-type': 'application/json', ...(key ? { apikey: key } : {}), ...extra },
  ...(!['GET', 'HEAD'].includes(method) ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
}));
const media = ORIGIN + '/__e2e/catalog/product.png';
const normalNumber = '11988776655';
const valid = [
  ['text', 'sendText', { text: 'body-canary' }],
  ['media', 'sendMedia', { mediatype: 'image', media }],
  ['sticker', 'sendSticker', { sticker: media }],
  ['location', 'sendLocation', { latitude: -23.5, longitude: -46.6, name: 'Synthetic', address: 'Fixture' }],
  ['contact', 'sendContact', { contact: [{ fullName: 'Synthetic', phoneNumber: normalNumber }] }],
  ['poll', 'sendPoll', { name: 'Synthetic?', values: ['A', 'B'], selectableCount: 1 }],
  ['list', 'sendList', { title: 'Synthetic', description: 'Fixture', buttonText: 'Open', sections: [{ title: 'Choices', rows: [{ title: 'A', rowId: 'a' }] }] }],
  ['button', 'sendButtons', { title: 'Synthetic', description: 'Fixture', buttons: [{ type: 'reply', reply: { displayText: 'A', id: 'a' } }] }],
];
for (const [name, route, body] of valid) {
  test('provedor isolado recebe o tradutor GO real: ' + name, async t => {
    const previous = globalThis.Deno;
    globalThis.Deno = { env: { get: () => undefined } };
    t.after(() => { if (previous === undefined) delete globalThis.Deno; else globalThis.Deno = previous; });
    const app = provider();
    const response = await evoFetch(PROVIDER_ORIGIN, env().EVOLUTION_API_KEY, '/message/' + route + '/E2E_LOCAL',
      { number: normalNumber, ...body }, (url, options) => app.handler(new Request(url, options)), 'POST', undefined,
      env().EVOLUTION_DEFAULT_INSTANCE_TOKEN);
    assert.equal(response.status, 200);
    const id = extractMessageId(await response.json());
    assert.equal(id, 'local-receipt-1'); assert.deepEqual(app.evidence().message_ids, [id]);
    assert.equal(/body-canary|11988776655|e2e-instance|e2e-catalog|e2e-local-admin/.test(JSON.stringify(app.evidence())), false);
  });
}

const nativeBodies = [
  ['/send/text', { text: 'fixture' }], ['/send/media', { url: media, type: 'image' }],
  ['/send/sticker', { sticker: media }], ['/send/location', { latitude: 0, longitude: 0 }],
  ['/send/contact', { vcard: { fullName: 'Fixture', phone: normalNumber } }],
  ['/send/poll', { question: 'Fixture?', options: ['A', 'B'], maxAnswer: 1 }],
  ['/send/list', { title: 'Fixture', description: 'Fixture', buttonText: 'Open', sections: [{ rows: [{ title: 'A', rowId: 'a' }] }] }],
  ['/send/button', { title: 'Fixture', buttons: [{ type: 'reply' }] }],
];
for (const [path, body] of nativeBodies) {
  test('provedor não acusa entrega sem destinatário: ' + path, async () => {
    const app = provider(); assert.equal((await call(app, path, body)).status, 400); assert.equal(app.evidence().count, 0);
  });
  test('provedor não acusa entrega sem payload: ' + path, async () => {
    const app = provider(); assert.equal((await call(app, path, { number: normalNumber })).status, 400); assert.equal(app.evidence().count, 0);
  });
}
for (const [label, key] of [['missing', undefined], ['wrong', 'wrong'], ['admin', env().EVOLUTION_API_KEY], ['catalog', env().PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY]]) {
  test('provedor recusa credencial de instância ' + label, async () => {
    const app = provider(); const response = await call(app, '/send/text', { number: normalNumber, text: 'fixture' }, key ?? null);
    assert.equal(response.status, 401); assert.equal(app.evidence().count, 0);
  });
}
for (const body of ['', '{bad', '[]', 'null']) {
  test('provedor recusa corpo inválido ' + JSON.stringify(body), async () => {
    const app = provider(); assert.equal((await call(app, '/send/text', body)).status, 400); assert.equal(app.evidence().count, 0);
  });
}
for (const [label, path, body, status] of [
  ['external media', '/send/media', { number: normalNumber, type: 'image', url: 'https://example.invalid/image.png' }, 400],
  ['embedded media credential', '/send/media', { number: normalNumber, type: 'image', url: 'http://canary@127.0.0.1:8081/catalog/product.png' }, 400],
  ['out of range location', '/send/location', { number: normalNumber, latitude: 91, longitude: 0 }, 400],
  ['unsupported route', '/send/unknown', {}, 404],
  ['body limit', '/send/text', JSON.stringify({ number: normalNumber, text: 'a'.repeat(1024 * 1024) }), 413],
]) {
  test('provedor falha explicitamente: ' + label, async () => {
    const app = provider(); assert.equal((await call(app, path, body)).status, status); assert.equal(app.evidence().count, 0);
  });
}
test('provedor não publica recibo duplicado', async () => {
  const app = provider({ nextId: () => 'same' });
  const body = { number: normalNumber, text: 'fixture' };
  assert.equal((await call(app, '/send/text', body)).status, 200);
  assert.equal((await call(app, '/send/text', body)).status, 500);
  assert.equal(app.evidence().count, 1);
});

const catalog = (app, path, method = 'GET', changes = {}) => app.handler(new Request(PROVIDER_ORIGIN + '/rest/v1/' + path, {
  method, headers: { apikey: env().PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + env().PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY, ...changes },
  ...(method === 'POST' ? { body: '{}' } : {}),
}));
test('catálogo local implementa listagem, seleção, detalhe, variação e estatística', async () => {
  const app = provider();
  const response = await catalog(app, 'products?select=id,sku,categories:category_id(id,name)&is_active=eq.true&search_vector=wfts(portuguese).' + CATALOG_SKU + '&order=name.asc,id.asc&offset=0&limit=10');
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-range'), '0-0/1');
  const rows = await response.json(); assert.equal(rows.length, 1); assert.equal(rows[0].sku, CATALOG_SKU);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['categories', 'id', 'sku']);
  const detail = await catalog(app, 'products?id=eq.' + rows[0].id, 'GET', { accept: 'application/vnd.pgrst.object+json' });
  assert.equal((await detail.json()).sku, CATALOG_SKU);
  const variants = await catalog(app, 'product_variants?product_id=eq.' + rows[0].id + '&is_active=eq.true&order=color_name.asc');
  const variant = (await variants.json())[0]; assert.equal(variant.color_name, 'Azul'); assert.equal(variant.selected_thumbnail, media);
  for (const table of ['categories?is_active=eq.true&deleted_at=is.null', 'suppliers?active=eq.true']) assert.equal((await (await catalog(app, table)).json()).length, 1);
  assert.equal((await (await catalog(app, 'rpc/zapp_catalog_stats', 'POST')).json()).total, 1);
});
for (const [label, path, method, headers, status] of [
  ['missing auth', 'products', 'GET', { Authorization: '' }, 401],
  ['wrong apikey', 'products', 'GET', { apikey: 'wrong' }, 401],
  ['write forbidden', 'products', 'POST', {}, 405],
  ['unknown table', 'customers', 'GET', {}, 404],
  ['unknown projection', 'products?select=secret_column', 'GET', {}, 400],
  ['unknown filter', 'products?missing=eq.true', 'GET', {}, 400],
  ['unsupported operator', 'products?sku=not.eq.fixture', 'GET', {}, 400],
  ['unsupported search', 'products?search_vector=fts.fixture', 'GET', {}, 400],
  ['unknown order', 'products?order=secret.asc', 'GET', {}, 400],
  ['invalid range', 'products?offset=-1', 'GET', {}, 400],
]) {
  test('catálogo não finge sucesso: ' + label, async () => assert.equal((await catalog(provider(), path, method, headers)).status, status));
}
for (const [label, path] of [['unknown SKU', 'products?search_vector=wfts(portuguese).UNKNOWN'], ['unknown ID', 'products?id=eq.e2e70000-0000-4000-a000-999999999999'], ['past page', 'products?offset=10&limit=10']]) {
  test('catálogo não inventa resultado para ' + label, async () => {
    const result = await catalog(provider(), path); assert.equal(result.status, 200); assert.deepEqual(await result.json(), []);
  });
}
test('HEAD conserva total sem corpo e imagem é PNG local', async () => {
  const app = provider(); const head = await catalog(app, 'products?select=id', 'HEAD');
  assert.equal(head.headers.get('content-range'), '0-0/1'); assert.equal(await head.text(), '');
  const image = await call(app, '/catalog/product.png', null, null, 'GET');
  assert.equal(image.headers.get('content-type'), 'image/png');
  const bytes = Buffer.from(await image.arrayBuffer());
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    assert.equal(crc32(bytes.subarray(offset + 4, offset + 8 + size)), bytes.readUInt32BE(offset + 8 + size));
    offset += 12 + size;
  }
  const imageHead = await call(app, '/catalog/product.png', null, null, 'HEAD');
  assert.equal(imageHead.status, 200); assert.equal(await imageHead.text(), '');
  assert.equal(imageHead.headers.get('content-length'), String(bytes.length));
});
test('identidade/evidência são vinculadas à execução e namespace', async () => {
  const app = provider(); const identity = await (await call(app, '/__e2e/identity', null, null, 'GET')).json();
  assert.equal(identity.run_id, env().ZAPP_E2E_RUN_ID); assert.equal(identity.source_sha, env().GITHUB_SHA);
  assert.equal(identity.origin, PROVIDER_ORIGIN); assert.equal(identity.network_namespace, 'net:[1234]');
  assert.equal((await call(app, '/__e2e/evidence', null, null)).status, 405);
  assert.equal((await app.handler(new Request(ORIGIN + '/__e2e/identity'))).status, 400);
});
for (const [name, change, error] of [
  ['external interface', value => { value.interfaces = () => ({ ...interfaces(), eth0: [] }); }, /external-network-interface/],
  ['proxy', value => { value.env.HTTP_PROXY = 'http://example.invalid'; }, /proxy-not-allowed/],
  ['foreign run', value => { value.env.ZAPP_E2E_RUN_ID = 'foreign'; }, /invalid-run-id/],
  ['invalid SHA', value => { value.env.GITHUB_SHA = 'short'; }, /invalid-source-sha/],
  ['invalid namespace', value => { value.namespace = () => 'host'; }, /invalid-provider-namespace/],
  ['non synthetic key', value => { value.env.EVOLUTION_API_KEY = 'foreign'; }, /provider-synthetic-keys-missing/],
  ['wrong CA', value => { value.env.NODE_EXTRA_CA_CERTS = '/foreign'; }, /provider-tls-environment/],
  ['TLS bypass', value => { value.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; }, /provider-tls-environment/],
  ['Node injection', value => { value.env.NODE_OPTIONS = '--require=/tmp/foreign.mjs'; }, /provider-tls-environment/],
]) {
  test('provedor exige ambiente isolado: ' + name, () => {
    const options = { env: env(), interfaces, namespace: () => 'net:[1234]' }; change(options);
    assert.throws(() => provider(options), error);
  });
}
