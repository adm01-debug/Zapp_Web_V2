import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createProviders } from '../e2e-isolated/providers.mjs';
import { verifyProviders } from '../e2e-isolated/verify-providers.mjs';
import { ORIGIN, PROVIDER_ORIGIN, CATALOG_SKU } from '../e2e-isolated/runtime-contract.mjs';
import { SUITE_FIXTURES } from '../e2e-isolated/seed-suite.mjs';

const runId = 'zapp-e2e-provider-readiness', sourceSha = 'a'.repeat(40), networkNamespace = 'net:[1234]';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const mediaUrl = ORIGIN + '/__e2e/catalog/product.png';
const providerEnv = () => ({ ZAPP_E2E_RUN_ID: runId, GITHUB_SHA: sourceSha,
  EVOLUTION_API_KEY: 'e2e-local-admin-fixture', EVOLUTION_DEFAULT_INSTANCE_TOKEN: 'e2e-instance-fixture',
  PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY: 'e2e-catalog-fixture', NODE_EXTRA_CA_CERTS: '/run/zapp-e2e-tls/ca.crt' });
const interfaces = () => ({ lo: [{ address: '127.0.0.1', internal: true }] });
const response = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });

const mediaFaults = ['valid', 'http500', 'empty', 'length-limit', 'stream-limit', 'stream-error',
  'untrusted-ca', 'wrong-san', 'timeout', 'redirect', 'external-url', 'http-url'];
for (const route of ['image', 'document', 'sticker']) for (const fault of mediaFaults) {
  test('download de mídia ' + route + '/' + fault, async () => {
    let fetches = 0;
    const fetcher = async (url, options) => {
      fetches++;
      assert.equal(url, mediaUrl); assert.equal(options.redirect, 'error'); assert.ok(options.signal);
      assert.equal(options.headers, undefined);
      if (['untrusted-ca', 'wrong-san', 'timeout', 'redirect'].includes(fault)) throw new Error(fault);
      if (fault === 'http500') return new Response('unavailable', { status: 500 });
      if (fault === 'empty') return new Response(null);
      if (fault === 'length-limit') return new Response(png, { headers: { 'content-length': String(50 * 1024 * 1024 + 1) } });
      if (fault === 'stream-error') return new Response(new ReadableStream({ start(controller) { controller.error(new Error('body failed')); } }));
      if (fault === 'stream-limit') {
        let sent = 0; const chunk = new Uint8Array(1024 * 1024);
        return new Response(new ReadableStream({ pull(controller) { if (sent++ < 51) controller.enqueue(chunk); else controller.close(); } }));
      }
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    };
    const app = createProviders({ env: providerEnv(), interfaces, namespace: () => networkNamespace, nextId: () => 'fixture-1', fetcher });
    const url = fault === 'external-url' ? 'https://example.invalid/image.png' : fault === 'http-url' ? mediaUrl.replace('https:', 'http:') : mediaUrl;
    const path = route === 'sticker' ? '/send/sticker' : '/send/media';
    const body = route === 'sticker' ? { number: '11988776655', sticker: url } : { number: '11988776655', type: route, url };
    const result = await app.handler(new Request(PROVIDER_ORIGIN + path, {
      method: 'POST', headers: { apikey: providerEnv().EVOLUTION_DEFAULT_INSTANCE_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    const good = fault === 'valid', early = ['external-url', 'http-url'].includes(fault);
    assert.equal(result.status, good ? 200 : early ? 400 : 502);
    assert.equal(fetches, early ? 0 : 1);
    assert.equal(app.evidence().count, good ? 1 : 0);
    assert.deepEqual(app.evidence().media_receipts, good ? [{ message_id: 'local-fixture-1', sha256: sha(png), bytes: png.length }] : []);
    assert.equal(JSON.stringify(app.evidence()).includes(url), false);
  });
}

const profileId = '11111111-1111-4111-a111-111111111111';
const userId = '11111111-1111-4111-a111-222222222222';
const loginSeed = { schema: 1, run_id: runId, source_sha: sourceSha, auth_login_real: true,
  supervisor_rls_read: true, user_id: userId, profile_id: profileId };
const suiteSeed = { schema: 1, run_id: runId, source_sha: sourceSha,
  main_contact_rls: true, files_owner_preserved: true, pagination_rls: true, talkx_connection_rls: true,
  talkx_segment_rls: true, instance_tokens_stored: true, inbox_fixture_rls: true, onboarding_persisted: true };

/** Auth/SQL/Storage are controlled boundaries here; the provider and its media
 * reads are real functions. Native readiness uses the actual local services. */
function verificationFixture(fault = '') {
  let currentNamespace = networkNamespace, serial = 0, receipt = 0, lastDelivery;
  const rows = new Map(), objects = new Map(), events = [], writes = [], credentials = [];
  const env = { ZAPP_E2E_RUN_ID: runId, GITHUB_SHA: sourceSha, API_URL: ORIGIN,
    E2E_CATALOG_PRODUCT_SKU: CATALOG_SKU, NODE_EXTRA_CA_CERTS: '/run/zapp-e2e-tls/ca.crt' };
  for (const [key, value] of Object.entries({ ANON_KEY: 'anon-canary', E2E_TEST_EMAIL: 'supervisor.e2e@example.invalid', E2E_TEST_PASSWORD: 'password-canary' })) {
    Object.defineProperty(env, key, { enumerable: true, get() { credentials.push(key); return value; } });
  }
  Object.defineProperty(env, 'SERVICE_ROLE_KEY', { get() { throw new Error('must-not-read-service-role'); } });
  let app;
  const mediaFetch = async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(options.headers, undefined);
    const parsed = new URL(url); assert.equal(parsed.origin, ORIGIN);
    if (parsed.pathname === '/__e2e/catalog/product.png') return app.handler(new Request(PROVIDER_ORIGIN + '/catalog/product.png'));
    const prefix = '/storage/v1/object/sign/whatsapp-media/';
    if (!parsed.pathname.startsWith(prefix) || parsed.searchParams.get('token') !== 'local-signed-token') return new Response(null, { status: 403 });
    const body = objects.get(parsed.pathname.slice(prefix.length));
    if (!body) return new Response(null, { status: 404 });
    return new Response(fault === 'storage-downloaded-wrong-bytes' ? Buffer.from('wrong') : body, { headers: { 'content-type': 'image/png' } });
  };
  app = createProviders({ env: providerEnv(), interfaces, namespace: () => networkNamespace,
    nextId: () => 'readiness-' + ++receipt, fetcher: mediaFetch });
  const own = origin => ({ schema: 1, run_id: runId, source_sha: sourceSha, origin });
  const catalog = async path => app.handler(new Request(PROVIDER_ORIGIN + '/rest/v1/' + path, { headers: {
    apikey: providerEnv().PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + providerEnv().PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY,
  } }));
  const catalogRows = async path => (await catalog(path)).json();
  const finish = (stage, value, status = 200, headers = {}) => {
    events.push(stage);
    if (fault === 'http:' + stage) return response({ error: 'synthetic transport failure' }, 503);
    if (fault === 'namespace-after-login' && stage === 'login') currentNamespace = 'net:[9999]';
    if (fault === 'proxy-after-catalog' && stage === 'catalog-detail') env.HTTPS_PROXY = 'http://127.0.0.1:8080';
    if (fault === 'ca-before-final' && stage === 'rls-storage') env.NODE_EXTRA_CA_CERTS = '/foreign';
    return response(value, status, headers);
  };
  const fetcher = async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    const parsed = new URL(url), endpoint = parsed.pathname;
    if (parsed.origin === PROVIDER_ORIGIN) {
      if (endpoint.endsWith('/identity')) return finish('provider-identity', { ...own(PROVIDER_ORIGIN), network_namespace: fault === 'foreign-provider-namespace' ? 'net:[9999]' : networkNamespace });
      const evidence = app.evidence();
      if (fault === 'evidence-count') evidence.count++;
      if (fault === 'media-hash' && evidence.media_receipts.length) evidence.media_receipts.at(-1).sha256 = '0'.repeat(64);
      if (fault === 'media-size' && evidence.media_receipts.length) evidence.media_receipts.at(-1).bytes++;
      return finish(lastDelivery ? 'evidence-' + lastDelivery : 'provider-evidence-initial', evidence);
    }
    assert.equal(parsed.origin, ORIGIN);
    if (endpoint === '/__e2e/identity') return finish('gateway-identity', { ...own(ORIGIN), source_sha: fault === 'foreign-gateway' ? 'b'.repeat(40) : sourceSha });
    if (endpoint === '/functions/v1/auth-login') {
      assert.equal(options.headers.apikey, 'anon-canary');
      assert.deepEqual(JSON.parse(options.body), { email: 'supervisor.e2e@example.invalid', password: 'password-canary', userAgent: 'isolated-provider-readiness', mode: 'login' });
      return finish('login', fault === 'login-empty' ? {} : { access_token: 'user-token-canary', refresh_token: 'refresh-canary' });
    }
    if (endpoint === '/__e2e/catalog/product.png') {
      events.push('catalog-media');
      if (fault === 'http:catalog-media') return new Response(null, { status: 503 });
      return fault === 'catalog-image-corrupt' ? new Response('bad', { headers: { 'content-type': 'image/png' } }) : app.handler(new Request(PROVIDER_ORIGIN + '/catalog/product.png'));
    }
    assert.equal(options.headers.Authorization, 'Bearer user-token-canary'); assert.equal(options.headers.apikey, 'anon-canary');
    if (endpoint === '/rest/v1/rpc/enqueue_outbound_message') {
      const body = JSON.parse(options.body);
      assert.equal(body.p_contact_id, SUITE_FIXTURES.contact); assert.equal(body.p_whatsapp_connection_id, SUITE_FIXTURES.connection);
      if (body.p_media_url?.startsWith('http:')) {
        if (fault === 'http-guard-inserts') rows.set('rejected', { id: 'bad-insert', client_message_id: body.p_client_message_id });
        return finish('enqueue-http-negative', { code: fault === 'http-guard-wrong-code' ? '42501' : '22023' }, fault === 'http-guard-accepts' ? 200 : 400);
      }
      const kind = body.p_media_url?.includes('/storage/v1/') ? 'storage' : body.p_media_url ? 'catalog' : 'text';
      const id = '22222222-2222-4222-a222-' + String(rows.size + 1).padStart(12, '0');
      rows.set(id, { id, contact_id: body.p_contact_id, agent_id: profileId, sender: 'agent', status: 'pending',
        external_id: null, client_message_id: body.p_client_message_id, message_type: body.p_message_type,
        media_url: body.p_media_url || null, kind, content: body.p_content });
      return finish('enqueue-' + kind, fault === 'enqueue-no-id' ? {} : { id });
    }
    if (endpoint === '/functions/v1/message-delivery') {
      const row = rows.get(JSON.parse(options.body).messageId); assert.ok(row);
      let media = row.media_url;
      if (row.kind === 'storage') media = media.replace('/object/public/', '/object/sign/') + '?token=' + (fault === 'storage-signer-invalid' ? 'invalid' : 'local-signed-token');
      const result = await app.handler(new Request(PROVIDER_ORIGIN + (media ? '/send/media' : '/send/text'), {
        method: 'POST', headers: { apikey: providerEnv().EVOLUTION_DEFAULT_INSTANCE_TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({ number: '11988776655', ...(media ? { url: media, type: 'image' } : { text: row.content }) }),
      }));
      if (!result.ok) return finish('delivery-' + row.kind, { error: 'provider rejected' }, 502);
      row.external_id = (await result.json()).data.Info.ID; row.status = 'sent'; lastDelivery = row.kind;
      return finish('delivery-' + row.kind, { messageId: row.id, status: 'sent', externalId: row.external_id, idempotent: fault === 'delivery-idempotent' });
    }
    if (endpoint === '/rest/v1/messages') {
      const byClient = parsed.searchParams.get('client_message_id');
      const matching = [...rows.values()].filter(row => byClient ? row.client_message_id === byClient.slice(3) : row.id === parsed.searchParams.get('id')?.slice(3));
      const kind = byClient ? 'http-negative' : matching[0]?.kind;
      const data = matching.map(({ kind, content, ...row }) => ({ ...row,
        ...(fault === 'rls-wrong-agent' ? { agent_id: userId } : {}), ...(fault === 'rls-wrong-media' && kind !== 'text' ? { media_url: 'https://example.invalid/not-local' } : {}),
      }));
      return finish('rls-' + kind, fault === 'rls-hidden' && !byClient ? [] : data);
    }
    if (endpoint === '/functions/v1/promogifts-catalog') {
      const { action, params } = JSON.parse(options.body);
      const headers = fault === 'catalog-degraded' ? { 'x-degraded': 'true' } : {};
      if (action === 'bootstrap') return finish('catalog-bootstrap', { data: {
        categories: await catalogRows('categories'), suppliers: await catalogRows('suppliers'), stats: { total: 1 },
      } }, 200, headers);
      if (action === 'list_products') {
        assert.equal(params.search, CATALOG_SKU);
        const data = await catalogRows('products?search_vector=wfts(portuguese).' + CATALOG_SKU);
        return finish('catalog-list', { data: fault === 'catalog-empty' ? [] : data, meta: { total: 1 } }, 200, headers);
      }
      const products = await catalogRows('products?id=eq.' + params.product_id), variants = await catalogRows('product_variants?product_id=eq.' + params.product_id);
      if (fault === 'catalog-no-stock') variants[0].stock_quantity = 0;
      if (fault === 'catalog-external-media') variants[0].selected_thumbnail = 'https://example.invalid/product.png';
      return finish('catalog-detail', { data: { ...products[0], variants } }, 200, headers);
    }
    const upload = '/storage/v1/object/whatsapp-media/';
    if (endpoint.startsWith(upload)) {
      assert.equal(options.method, 'POST'); assert.equal(options.headers['Content-Type'], 'image/png');
      assert.equal(options.headers['x-upsert'], 'false'); assert.deepEqual(Buffer.from(options.body), png);
      const object = endpoint.slice(upload.length); assert.ok(object.startsWith(SUITE_FIXTURES.contact + '/'));
      if (fault !== 'storage-upload-ignored') objects.set(object, Buffer.from(options.body));
      return finish('storage-upload', { Key: 'whatsapp-media/' + object });
    }
    throw new Error('Unexpected controlled boundary: ' + endpoint);
  };
  const options = { env, fetcher, interfaces, namespace: () => currentNamespace,
    newId: () => fault === 'duplicate-client-id' ? '33333333-3333-4333-a333-333333333333' : '33333333-3333-4333-a333-' + String(++serial).padStart(12, '0'),
    readFile: file => {
      if (fault === 'seed-json') return '{bad';
      const value = file === '/output/seed-ready.json' ? loginSeed : suiteSeed;
      return JSON.stringify({ ...value, ...(fault === 'seed-run' ? { run_id: 'foreign' } : {}),
        ...(fault === 'seed-role' && file === '/output/seed-ready.json' ? { supervisor_rls_read: false } : {}),
        ...(fault === 'seed-onboarding' && file === '/output/suite-seed-ready.json' ? { onboarding_persisted: false } : {}) });
    },
    writeFile: (file, content, options) => { assert.equal(file, '/output/provider-ready.json'); assert.equal(options.mode, 0o600); writes.push(JSON.parse(content)); },
  };
  return { options, events, writes, credentials, app, objects };
}

test('readiness executa texto, catálogo HTTPS e upload privado com recibos/bytes/RLS antes de publicar', async () => {
  const fixture = verificationFixture();
  const ready = await verifyProviders(fixture.options);
  assert.equal(fixture.writes.length, 1); assert.deepEqual(fixture.writes[0], ready);
  assert.deepEqual(ready.delivery_proofs, { text: true, catalog_image: true, storage_image: true });
  for (const field of ['delivery_real', 'provider_observed', 'delivery_user_rls', 'catalog_real', 'catalog_media_https', 'storage_upload_real', 'storage_media_https', 'http_media_rejected']) assert.equal(ready[field], true);
  assert.equal(fixture.app.evidence().count, 3); assert.equal(fixture.app.evidence().media_receipts.length, 2);
  assert.equal(fixture.objects.size, 1);
  assert.ok(fixture.events.indexOf('storage-upload') < fixture.events.indexOf('delivery-storage'));
  assert.equal(/token|password|11988776655|\/storage\//i.test(JSON.stringify(ready)), false);
});

const failingStages = ['gateway-identity', 'provider-identity', 'provider-evidence-initial', 'login',
  'enqueue-text', 'delivery-text', 'evidence-text', 'rls-text', 'enqueue-http-negative', 'rls-http-negative',
  'catalog-bootstrap', 'catalog-list', 'catalog-detail', 'catalog-media', 'enqueue-catalog', 'delivery-catalog',
  'evidence-catalog', 'rls-catalog', 'storage-upload', 'enqueue-storage', 'delivery-storage', 'evidence-storage', 'rls-storage'];
for (const stage of failingStages) test('readiness não publica se serviço falha em ' + stage, async () => {
  const fixture = verificationFixture('http:' + stage);
  await assert.rejects(verifyProviders(fixture.options)); assert.equal(fixture.writes.length, 0);
  assert.ok(fixture.events.includes(stage));
});

const verificationFaults = ['seed-json', 'seed-run', 'seed-role', 'seed-onboarding', 'foreign-gateway', 'foreign-provider-namespace',
  'evidence-count', 'login-empty', 'enqueue-no-id', 'duplicate-client-id', 'delivery-idempotent',
  'rls-wrong-agent', 'rls-wrong-media', 'rls-hidden', 'http-guard-accepts', 'http-guard-wrong-code', 'http-guard-inserts',
  'catalog-degraded', 'catalog-empty', 'catalog-no-stock', 'catalog-external-media', 'catalog-image-corrupt',
  'media-hash', 'media-size', 'storage-upload-ignored', 'storage-signer-invalid', 'storage-downloaded-wrong-bytes',
  'namespace-after-login', 'proxy-after-catalog', 'ca-before-final'];
for (const fault of verificationFaults) test('readiness recusa contraprova ' + fault, async () => {
  const fixture = verificationFixture(fault);
  await assert.rejects(verifyProviders(fixture.options)); assert.equal(fixture.writes.length, 0);
  if (['seed-json', 'seed-run', 'seed-role', 'seed-onboarding', 'foreign-gateway', 'foreign-provider-namespace', 'evidence-count'].includes(fault)) assert.equal(fixture.credentials.length, 0);
});
