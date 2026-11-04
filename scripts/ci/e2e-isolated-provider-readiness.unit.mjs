import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createProviders } from '../e2e-isolated/providers.mjs';
import { verifyProviders } from '../e2e-isolated/verify-providers.mjs';
import { ORIGIN, PROVIDER_ORIGIN, CATALOG_SKU } from '../e2e-isolated/runtime-contract.mjs';
import { SUITE_FIXTURES } from '../e2e-isolated/seed-suite.mjs';
import { spawnSync } from 'node:child_process';
import { SIGNATURES, PHASES, PROVIDER_CATALOG_SQL, parseCatalog, parseProviderDiagnostic,
  observeSqlState, withObservation } from '../e2e-isolated/provider-diagnostics.mjs';

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
  const rows = new Map(), objects = new Map(), events = [], writes = [], diagnostics = [], credentials = [];
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
    writeFile: (file, content, options) => {
      assert.equal(options.mode, 0o600);
      if (file === '/output/provider-diagnostic.json') { diagnostics.push(JSON.parse(content)); return; }
      assert.equal(file, '/output/provider-ready.json'); writes.push(JSON.parse(content));
    },
  };
  return { options, events, writes, diagnostics, credentials, app, objects };
}

test('readiness executa texto, catálogo HTTPS e upload privado com recibos/bytes/RLS antes de publicar', async () => {
  const fixture = verificationFixture();
  const ready = await verifyProviders(fixture.options);
  assert.equal(fixture.writes.length, 1); assert.deepEqual(fixture.writes[0], ready);
  assert.equal(fixture.diagnostics.length, 0);
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
const observedPhases = {
  'gateway-identity': 'gateway-identity', 'provider-identity': 'provider-identity',
  'provider-evidence-initial': 'provider-baseline', login: 'auth-login',
  'enqueue-text': 'text-enqueue', 'delivery-text': 'text-delivery', 'evidence-text': 'text-evidence', 'rls-text': 'text-readback',
  'enqueue-http-negative': 'http-negative-enqueue', 'rls-http-negative': 'http-negative-readback',
  'catalog-bootstrap': 'catalog-bootstrap', 'catalog-list': 'catalog-list', 'catalog-detail': 'catalog-detail', 'catalog-media': 'catalog-image',
  'enqueue-catalog': 'catalog-enqueue', 'delivery-catalog': 'catalog-delivery', 'evidence-catalog': 'catalog-evidence', 'rls-catalog': 'catalog-readback',
  'storage-upload': 'storage-upload', 'enqueue-storage': 'storage-enqueue', 'delivery-storage': 'storage-delivery',
  'evidence-storage': 'storage-evidence', 'rls-storage': 'storage-readback',
};
for (const stage of failingStages) test('readiness não publica se serviço falha em ' + stage, async () => {
  const fixture = verificationFixture('http:' + stage);
  await assert.rejects(verifyProviders(fixture.options)); assert.equal(fixture.writes.length, 0);
  assert.ok(fixture.events.includes(stage));
  assert.deepEqual(fixture.diagnostics, [{ schema: 1, phase: observedPhases[stage], http_status: 503 }]);
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
  assert.equal(fixture.diagnostics.length, 1);
  assert.equal(parseProviderDiagnostic(JSON.stringify(fixture.diagnostics[0])).available, true);
  if (['seed-json', 'seed-run', 'seed-role', 'seed-onboarding', 'foreign-gateway', 'foreign-provider-namespace', 'evidence-count'].includes(fault)) assert.equal(fixture.credentials.length, 0);
});

// The approved observation cases now exercise the actual helper module.
const clone = value => JSON.parse(JSON.stringify(value));
const canary = 'CANARY_PRIVATE_VALUE_58391';
const privateUrl = 'https://private.invalid/object?token=' + canary;
const clean = value => {
  const text = JSON.stringify(value);
  for (const forbidden of [canary, privateUrl, 'internalQuery', 'password', 'message', 'definition']) {
    // Fixed routine signatures legitimately contain the word message.
    if (forbidden === 'message') continue;
    assert.equal(text.includes(forbidden), false, forbidden);
  }
};
const goodCatalog = () => ({ schema: 1, routines: SIGNATURES.map(signature => ({ signature, owner: 'postgres', security_definer: true })) });
const parseRows = value => parseCatalog({ status: 0, stdout: JSON.stringify(value), stderr: privateUrl });

const diagnosticCase = (name, run) => test('provider diagnostic: ' + name, run);
diagnosticCase('catalog reports the expected postgres owners without modifying them', () => {
  const result = parseRows(goodCatalog()); assert.equal(result.available, true); clean(result);
});
diagnosticCase('catalog exposes the replay divergence without approving or repairing it', () => {
  const catalog = goodCatalog(); catalog.routines.forEach(row => { row.owner = 'supabase_admin'; });
  const result = parseRows(catalog); assert.equal(result.available, true);
  assert.ok(result.routines.every(row => row.owner === 'supabase_admin')); clean(result);
});
diagnosticCase('catalog keeps the service_role distinction', () => {
  const catalog = goodCatalog(); catalog.routines[0].owner = 'service_role';
  assert.equal(parseRows(catalog).routines[0].owner, 'service_role');
});
diagnosticCase('catalog reports an unknown owner only as other', () => {
  const catalog = goodCatalog(); catalog.routines[0].owner = 'other';
  const result = parseRows(catalog); assert.equal(result.routines[0].owner, 'other'); clean(result);
});
for (const [index, signature] of SIGNATURES.entries()) {
  diagnosticCase('catalog missing routine ' + signature.split('(')[0], () => {
    const catalog = goodCatalog(); catalog.routines[index] = { signature, owner: 'missing', security_definer: null };
    const result = parseRows(catalog); assert.equal(result.available, true);
    assert.equal(result.routines[index].owner, 'missing'); assert.equal(result.routines[index].security_definer, null);
  });
  diagnosticCase('catalog invoker instead of definer ' + signature.split('(')[0], () => {
    const catalog = goodCatalog(); catalog.routines[index].security_definer = false;
    const result = parseRows(catalog); assert.equal(result.available, true);
    assert.equal(result.routines[index].security_definer, false);
  });
}
const invalidCatalogs = [
  ['duplicate identity', value => { value.routines[1] = clone(value.routines[0]); }],
  ['missing catalog row', value => { value.routines.pop(); }],
  ['extra catalog row', value => { value.routines.push(clone(value.routines[0])); }],
  ['unknown overload', value => { value.routines[0].signature = 'public.enqueue_outbound_message(uuid)'; }],
  ['different schema', value => { value.routines[0].signature = value.routines[0].signature.replace('public.', 'private.'); }],
  ['raw owner rejected', value => { value.routines[0].owner = canary; }],
  ['body field rejected', value => { value.routines[0].definition = privateUrl; }],
  ['string definer rejected', value => { value.routines[0].security_definer = 'true'; }],
  ['missing with definer rejected', value => { value.routines[0].owner = 'missing'; }],
  ['present with null definer rejected', value => { value.routines[0].security_definer = null; }],
  ['extra root field rejected', value => { value.message = canary; }],
];
for (const [name, mutate] of invalidCatalogs) diagnosticCase('catalog ' + name, () => {
  const value = goodCatalog(); mutate(value); const result = parseRows(value);
  assert.deepEqual(result, { available: false, reason: 'invalid-catalog' }); clean(result);
});
diagnosticCase('catalog normalizes row order without weakening cardinality', () => {
  const value = goodCatalog(); value.routines.reverse();
  assert.deepEqual(parseRows(value).routines.map(row => row.signature), SIGNATURES);
});
diagnosticCase('catalog SQL failure never exports stderr', () => {
  const result = parseCatalog({ status: 1, stdout: JSON.stringify(goodCatalog()), stderr: privateUrl });
  assert.deepEqual(result, { available: false, reason: 'query-failed' }); clean(result);
});
diagnosticCase('catalog invalid JSON is unavailable', () => {
  const result = parseCatalog({ status: 0, stdout: canary }); assert.equal(result.available, false); clean(result);
});
diagnosticCase('catalog oversized bytes are unavailable before parsing', () => {
  assert.equal(parseCatalog({ status: 0, stdout: ' '.repeat(4097) + JSON.stringify(goodCatalog()) }).available, false);
});
diagnosticCase('catalog permits bounded whitespace from psql', () => {
  assert.equal(parseCatalog({ status: 0, stdout: '\n' + JSON.stringify(goodCatalog()) + '\n' }).available, true);
});
diagnosticCase('catalog raw object is not coerced or serialized', () => {
  let calls = 0; const stdout = { toString() { calls++; throw new Error(canary); } };
  assert.equal(parseCatalog({ status: 0, stdout }).available, false); assert.equal(calls, 0);
});

for (const [name, error] of [['error', new Error(canary)], ['null', null], ['zero', 0], ['false', false], ['empty', ''], ['undefined', undefined]]) {
  diagnosticCase('failure propagation ' + name, async () => {
    let raw, failed = false;
    try {
      await withObservation(async observer => { observer.phase('text-enqueue'); observer.response(403); observer.sqlstate('42501'); throw error; },
        (text, options) => { assert.deepEqual(options, { mode: 0o600 }); raw = text; });
    } catch (actual) { failed = true; assert.equal(actual, error); }
    assert.equal(failed, true);
    const result = parseProviderDiagnostic(raw);
    assert.deepEqual(result, { available: true, schema: 1, phase: 'text-enqueue', http_status: 403, sqlstate: '42501' }); clean(result);
  });
}
diagnosticCase('observer write failure preserves the primary error', async () => {
  const original = new Error(canary); let caught;
  try { await withObservation(async () => { throw original; }, () => { throw new Error('disk-full'); }); } catch (error) { caught = error; }
  assert.equal(caught, original);
});
diagnosticCase('successful verifier emits no failure metadata', async () => {
  let writes = 0; const ready = { ready: true };
  const result = await withObservation(async () => ready, () => { writes++; });
  assert.equal(result, ready); assert.equal(writes, 0);
});
diagnosticCase('phase boundary clears the previous HTTP and SQLSTATE', async () => {
  let raw;
  try { await withObservation(async observer => { observer.phase('text-enqueue'); observer.response(403); observer.sqlstate('42501'); observer.phase('storage-upload'); throw null; }, text => { raw = text; }); } catch {}
  assert.deepEqual(parseProviderDiagnostic(raw), { available: true, schema: 1, phase: 'storage-upload' });
});
diagnosticCase('unknown phase cannot leak a URL or masquerade as a known operation', async () => {
  let raw; try { await withObservation(async observer => { observer.phase(privateUrl); throw false; }, text => { raw = text; }); } catch {}
  const result = parseProviderDiagnostic(raw); assert.equal(result.phase, 'unknown'); clean(result);
});
for (const [name, changes] of [
  ['unknown phase', { phase: canary }], ['status as string', { http_status: '403' }],
  ['status outside HTTP range', { http_status: 600 }], ['SQLSTATE lower case', { sqlstate: 'p0001' }],
  ['SQLSTATE success code', { sqlstate: '00000' }], ['SQLSTATE not code', { sqlstate: privateUrl }],
  ['raw error field', { message: canary }], ['extra URL field', { url: privateUrl }],
]) diagnosticCase('public provider parser rejects ' + name, () => {
  const result = parseProviderDiagnostic(JSON.stringify({ schema: 1, phase: 'text-enqueue', ...changes }));
  assert.equal(result.available, false); clean(result);
});

const failedResponse = text => new Response(text, { status: 403 });
for (const code of ['42501', '22023', 'P0001']) diagnosticCase('bounded error observation ' + code, async () => {
  assert.equal(await observeSqlState(failedResponse(JSON.stringify({ code, message: canary, details: privateUrl }))), code);
});
for (const [name, body] of [
  ['missing code', JSON.stringify({ message: canary })],
  ['invalid JSON', '<html>' + canary + '</html>'],
  ['array shape', JSON.stringify([{ code: '42501' }])],
  ['invalid code', JSON.stringify({ code: privateUrl })],
  ['success code', JSON.stringify({ code: '00000' })],
  ['oversized body', JSON.stringify({ code: '42501', message: canary.repeat(200) })],
]) diagnosticCase('bounded error observation omits ' + name, async () => {
  assert.equal(await observeSqlState(failedResponse(body)), undefined);
});
diagnosticCase('bounded reader error leaves SQLSTATE unavailable', async () => {
  const body = new ReadableStream({ pull(controller) { controller.error(new Error(canary)); } });
  assert.equal(await observeSqlState(new Response(body, { status: 500 })), undefined);
});
diagnosticCase('bounded reader timeout cancels without waiting for the stalled body', async () => {
  let callback, cancelled = 0, cleared = 0;
  const body = new ReadableStream({ cancel() { cancelled++; } });
  const pending = observeSqlState(new Response(body, { status: 500 }), {
    setTimer(fn, ms) { assert.equal(ms, 500); callback = fn; return 7; },
    clearTimer(id) { assert.equal(id, 7); cleared++; },
  });
  callback(); assert.equal(await pending, undefined); assert.equal(cancelled, 1); assert.equal(cleared, 1);
});
diagnosticCase('poisoned response getter cannot replace the original failure', async () => {
  assert.equal(await observeSqlState(Object.defineProperty({}, 'body', { get() { throw new Error(canary); } })), undefined);
});

diagnosticCase('catalog proposal contains only a read-only metadata query', () => {
  const sql = PROVIDER_CATALOG_SQL;
  assert.match(sql, /^BEGIN READ ONLY;/); assert.match(sql, /ROLLBACK;\s*$/);
  assert.doesNotMatch(sql, /\b(?:ALTER|GRANT|REVOKE|UPDATE|INSERT|DELETE|CREATE|DROP|CALL|DO|COPY)\b/i);
  assert.doesNotMatch(sql, /pg_get_functiondef|prosrc|pg_authid|pg_shadow|current_setting|auth\.users|messages\s+WHERE/i);
  for (const signature of SIGNATURES) assert.equal(sql.split("'" + signature + "'").length - 1, 1);
});
diagnosticCase('real infinite empty chunks terminate without starving the deadline', () => {
  const moduleUrl = new URL('../e2e-isolated/provider-diagnostics.mjs', import.meta.url).href;
  const script = `import { observeSqlState } from ${JSON.stringify(moduleUrl)};
    let pulls = 0, cancelled = 0;
    const body = new ReadableStream({ pull(c) { pulls++; c.enqueue(new Uint8Array(0)); }, cancel() { cancelled++; } });
    const sqlstate = await observeSqlState(new Response(body, { status: 403 }));
    console.log(JSON.stringify({ sqlstate: sqlstate ?? null, pulls, cancelled }));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8', timeout: 2000, killSignal: 'SIGKILL', maxBuffer: 4096,
  });
  assert.equal(result.status, 0); assert.equal(result.signal, null); assert.equal(result.error, undefined);
  const observation = JSON.parse(result.stdout);
  assert.equal(observation.sqlstate, null); assert.equal(observation.cancelled, 1); assert.ok(observation.pulls <= 2);
});
diagnosticCase('empty chunk after a valid prefix is rejected without parsing a partial body', async () => {
  const chunks = [new TextEncoder().encode('{"code":"42501"}'), new Uint8Array(0)];
  let cancelled = 0;
  const body = new ReadableStream({ pull(controller) { const chunk = chunks.shift(); if (chunk) controller.enqueue(chunk); else controller.close(); }, cancel() { cancelled++; } });
  assert.equal(await observeSqlState(new Response(body, { status: 403 })), undefined);
  // The stream may already have closed via prefetch; completion still remains bounded.
  assert.ok(cancelled === 0 || cancelled === 1);
});
diagnosticCase('initial empty chunk does not fall through to a later valid body', async () => {
  const chunks = [new Uint8Array(0), new TextEncoder().encode('{"code":"42501"}')];
  const body = new ReadableStream({ pull(controller) { const chunk = chunks.shift(); if (chunk) controller.enqueue(chunk); else controller.close(); } });
  assert.equal(await observeSqlState(new Response(body, { status: 403 })), undefined);
});
diagnosticCase('one-byte chunks make progress and preserve a valid SQLSTATE', async () => {
  const bytes = new TextEncoder().encode('{"code":"42501","message":"ignored"}'); let offset = 0;
  const body = new ReadableStream({ pull(controller) { if (offset < bytes.length) controller.enqueue(bytes.slice(offset, ++offset)); else controller.close(); } });
  assert.equal(await observeSqlState(new Response(body, { status: 403 })), '42501');
});
for (const [name, failure] of [
  ['executor error with status zero', { status: 0, error: new Error(canary) }],
  ['executor signal with status zero', { status: 0, signal: 'SIGTERM' }],
  ['executor error and signal with status zero', { status: 0, error: new Error(canary), signal: 'SIGKILL' }],
  ['executor timeout with null status', { status: null, error: Object.assign(new Error(canary), { code: 'ETIMEDOUT' }), signal: 'SIGTERM' }],
]) diagnosticCase('catalog rejects ' + name, () => {
  const result = parseCatalog({ ...failure, stdout: JSON.stringify(goodCatalog()), stderr: privateUrl });
  assert.deepEqual(result, { available: false, reason: 'query-failed' }); clean(result);
});
diagnosticCase('catalog accepts status zero with null executor failure fields', () => {
  assert.equal(parseCatalog({ status: 0, error: null, signal: null, stdout: JSON.stringify(goodCatalog()) }).available, true);
});

test('verifier real: SQLSTATE observado no enqueue não altera o erro HTTP nem publica o corpo', async () => {
  const fixture = verificationFixture(), originalFetch = fixture.options.fetcher;
  fixture.options.fetcher = (url, options) => new URL(url).pathname === '/rest/v1/rpc/enqueue_outbound_message'
    ? Promise.resolve(response({ code: '42501', message: privateUrl, details: canary }, 403))
    : originalFetch(url, options);
  await assert.rejects(verifyProviders(fixture.options), /provider-verification-http-403/);
  assert.equal(fixture.writes.length, 0);
  assert.deepEqual(fixture.diagnostics, [{ schema: 1, phase: 'text-enqueue', http_status: 403, sqlstate: '42501' }]);
  clean(fixture.diagnostics);
});

test('verifier real: corpo HTTP travado respeita os 500 ms e conserva a falha', { timeout: 5000 }, async () => {
  const fixture = verificationFixture(), originalFetch = fixture.options.fetcher;
  let cancelled = 0;
  fixture.options.fetcher = (url, options) => new URL(url).pathname === '/rest/v1/rpc/enqueue_outbound_message'
    ? Promise.resolve(new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 403 }))
    : originalFetch(url, options);
  const started = performance.now();
  await assert.rejects(verifyProviders(fixture.options), /provider-verification-http-403/);
  assert.ok(performance.now() - started < 3000);
  assert.equal(cancelled, 1); assert.equal(fixture.writes.length, 0);
  assert.deepEqual(fixture.diagnostics, [{ schema: 1, phase: 'text-enqueue', http_status: 403 }]);
});

test('verifier real: falha de catálogo não herda o 400/22023 da contraprova HTTP bem-sucedida', async () => {
  const fixture = verificationFixture('catalog-empty');
  await assert.rejects(verifyProviders(fixture.options), /local-catalog-product-not-found/);
  assert.deepEqual(fixture.diagnostics, [{ schema: 1, phase: 'catalog-list' }]);
  assert.ok(fixture.events.includes('enqueue-http-negative'));
  assert.ok(fixture.events.includes('rls-http-negative'));
});

for (const [name, thrown] of [['Error', new Error('original-verifier-error')], ['null', null],
  ['false', false], ['zero', 0], ['empty', ''], ['undefined', undefined]]) {
  test('verifier real: preserva o mesmo throw ' + name, async () => {
    const fixture = verificationFixture(); fixture.options.newId = () => { throw thrown; };
    let caught = false;
    try { await verifyProviders(fixture.options); }
    catch (actual) { caught = true; assert.equal(actual, thrown); }
    assert.equal(caught, true); assert.equal(fixture.writes.length, 0);
    assert.deepEqual(fixture.diagnostics, [{ schema: 1, phase: 'text-enqueue' }]);
  });
}

test('verifier real: erro de escrita ready e de diagnóstico não substitui o erro primário', async () => {
  const fixture = verificationFixture(), original = new Error('ready-write-failed'), attempts = [];
  fixture.options.writeFile = (file, content, options) => {
    attempts.push(file); assert.equal(options.mode, 0o600);
    if (file === '/output/provider-ready.json') throw original;
    assert.equal(file, '/output/provider-diagnostic.json');
    assert.deepEqual(JSON.parse(content), { schema: 1, phase: 'ready-write' });
    throw new Error('diagnostic-write-failed');
  };
  await assert.rejects(verifyProviders(fixture.options), value => value === original);
  assert.deepEqual(attempts, ['/output/provider-ready.json', '/output/provider-diagnostic.json']);
});

test('verifier real: preflight reprovado não consulta credenciais nem rede', async () => {
  const fixture = verificationFixture(); fixture.options.env.API_URL = 'https://example.invalid';
  await assert.rejects(verifyProviders(fixture.options));
  assert.deepEqual(fixture.diagnostics, [{ schema: 1, phase: 'preflight' }]);
  assert.deepEqual(fixture.credentials, []); assert.deepEqual(fixture.events, []);
});

