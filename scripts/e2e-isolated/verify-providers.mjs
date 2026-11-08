import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';
import { assertLocalOrigin, assertLoopbackOnly, assertNoProxy, assertRunId, assertSourceSha,
  currentNetworkNamespace, ORIGIN, PROVIDER_ORIGIN, CATALOG_SKU, fail } from './runtime-contract.mjs';
import { SUITE_FIXTURES } from './seed-suite.mjs';
import { CATALOG_MEDIA_URL, PROVIDER_PNG } from './providers.mjs';
import { observeSqlState, withObservation } from './provider-diagnostics.mjs';

const validId = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const validText = value => typeof value === 'string' && value.length > 0;

/** Tests the real local app boundary. Only Evolution/PromoGifts are fixtures. */
export async function verifyProviders({ env = process.env, fetcher = fetch, readFile = readFileSync,
  writeFile = writeFileSync, interfaces = networkInterfaces, namespace = currentNetworkNamespace,
  newId = randomUUID } = {}) {
  return withObservation(async observer => {
  assertLoopbackOnly(interfaces()); assertNoProxy(env); assertLocalOrigin(env.API_URL);
  if (!ORIGIN.startsWith('https://') || env.NODE_EXTRA_CA_CERTS !== '/run/zapp-e2e-tls/ca.crt' ||
      env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined || env.NODE_OPTIONS) fail('provider-verification-tls-environment');
  const runId = assertRunId(env.ZAPP_E2E_RUN_ID), sourceSha = assertSourceSha(env.GITHUB_SHA);
  const networkNamespace = namespace();
  if (!/^net:\[\d+\]$/.test(networkNamespace)) fail('invalid-provider-verification-namespace');
  if (env.E2E_CATALOG_PRODUCT_SKU !== CATALOG_SKU) fail('unexpected-local-catalog-sku');
  const currentRuntime = () => {
    assertLoopbackOnly(interfaces()); assertNoProxy(env); assertLocalOrigin(env.API_URL);
    if (namespace() !== networkNamespace || env.ZAPP_E2E_RUN_ID !== runId || env.GITHUB_SHA !== sourceSha ||
        env.E2E_CATALOG_PRODUCT_SKU !== CATALOG_SKU || env.NODE_EXTRA_CA_CERTS !== '/run/zapp-e2e-tls/ca.crt' ||
        env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined || env.NODE_OPTIONS) fail('provider-verification-context-changed');
  };
  const owns = (value, origin) => value?.schema === 1 && value.run_id === runId &&
    value.source_sha === sourceSha && value.origin === origin;
  observer.phase('seed-proofs');
  let loginSeed, suiteSeed;
  try {
    loginSeed = JSON.parse(readFile('/output/seed-ready.json', 'utf8'));
    suiteSeed = JSON.parse(readFile('/output/suite-seed-ready.json', 'utf8'));
  } catch { fail('provider-seed-proofs-unreadable'); }
  if (loginSeed?.schema !== 1 || loginSeed.run_id !== runId || loginSeed.source_sha !== sourceSha ||
      loginSeed.auth_login_real !== true || loginSeed.supervisor_rls_read !== true ||
      !validId(loginSeed.user_id) || !validId(loginSeed.profile_id)) fail('provider-login-seed-mismatch');
  if (suiteSeed?.schema !== 1 || suiteSeed.run_id !== runId || suiteSeed.source_sha !== sourceSha ||
      !['main_contact_rls', 'files_owner_preserved', 'pagination_rls', 'talkx_connection_rls',
        'talkx_segment_rls', 'instance_tokens_stored', 'inbox_fixture_rls', 'onboarding_persisted'].every(key => suiteSeed[key] === true)) fail('provider-suite-seed-mismatch');

  async function fetchLocal(origin, path, options = {}) {
    currentRuntime();
    if (![ORIGIN, PROVIDER_ORIGIN].includes(origin) || !path.startsWith('/') || path.startsWith('//') || /[\r\n]/.test(path)) fail('invalid-provider-verification-target');
    let response;
    try { response = await fetcher(origin + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(15_000) }); }
    catch { fail('provider-verification-request-failed'); }
    currentRuntime();
    return response;
  }
  async function request(origin, path, options = {}, requireHealthy = false) {
    const response = await fetchLocal(origin, path, options);
    if (!response.ok) {
      observer.response(response.status);
      observer.sqlstate(await observeSqlState(response));
      fail('provider-verification-http-' + response.status);
    }
    if (requireHealthy && response.headers.get('x-degraded')) fail('catalog-readiness-degraded');
    try { return await response.json(); } catch { fail('provider-verification-invalid-json'); }
  }
  observer.phase('gateway-identity');
  const gateway = await request(ORIGIN, '/__e2e/identity');
  if (!owns(gateway, ORIGIN)) fail('provider-foreign-gateway');
  observer.phase('provider-identity');
  const provider = await request(PROVIDER_ORIGIN, '/__e2e/identity');
  if (!owns(provider, PROVIDER_ORIGIN) || provider.network_namespace !== networkNamespace) fail('foreign-provider');
  const validateEvidence = value => {
    if (!owns(value, PROVIDER_ORIGIN) || value.network_namespace !== networkNamespace ||
        !Number.isSafeInteger(value.count) || value.count < 0 || !Array.isArray(value.message_ids) ||
        value.message_ids.length !== value.count || new Set(value.message_ids).size !== value.count ||
        !value.message_ids.every(id => typeof id === 'string' && /^local-[a-zA-Z0-9-]{1,100}$/.test(id)) ||
        !Array.isArray(value.media_receipts) || new Set(value.media_receipts.map(row => row.message_id)).size !== value.media_receipts.length ||
        value.media_receipts.some(row => !value.message_ids.includes(row.message_id) || !/^[a-f0-9]{64}$/.test(row.sha256) ||
          !Number.isSafeInteger(row.bytes) || row.bytes < 1 || row.bytes > 50 * 1024 * 1024)) fail('provider-evidence-invalid');
    return value;
  };
  observer.phase('provider-baseline');
  let before = validateEvidence(await request(PROVIDER_ORIGIN, '/__e2e/evidence'));

  // Credentials are consulted only after the local stack, source and namespace.
  observer.phase('auth-login');
  currentRuntime();
  const anonKey = env.ANON_KEY, email = env.E2E_TEST_EMAIL, password = env.E2E_TEST_PASSWORD;
  if (!validText(anonKey) || !email?.endsWith('@example.invalid') || !validText(password)) fail('provider-local-login-credentials-missing');
  const session = await request(ORIGIN, '/functions/v1/auth-login', {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, userAgent: 'isolated-provider-readiness', mode: 'login' }),
  });
  if (!validText(session?.access_token) || !validText(session?.refresh_token)) fail('provider-real-login-not-confirmed');
  const user = { apikey: anonKey, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' };
  const post = (path, body, healthy = false) => request(ORIGIN, path,
    { method: 'POST', headers: user, body: JSON.stringify(body) }, healthy);
  const ids = new Set();
  const freshId = () => {
    const id = newId(); if (!validId(id) || ids.has(id)) fail('provider-client-message-id-invalid'); ids.add(id); return id;
  };
  const mediaHash = createHash('sha256').update(PROVIDER_PNG).digest('hex');
  async function deliver(label, mediaUrl = null) {
    const phases = {
      texto: ['text-enqueue', 'text-delivery', 'text-evidence', 'text-readback'],
      'imagem do catálogo': ['catalog-enqueue', 'catalog-delivery', 'catalog-evidence', 'catalog-readback'],
      'imagem do Storage': ['storage-enqueue', 'storage-delivery', 'storage-evidence', 'storage-readback'],
    }[label];
    observer.phase(phases[0]);
    const clientId = freshId(), type = mediaUrl ? 'image' : 'text';
    if (mediaUrl && (!mediaUrl.startsWith(ORIGIN + '/') || new URL(mediaUrl).origin !== ORIGIN)) fail('provider-media-origin');
    const queued = await post('/rest/v1/rpc/enqueue_outbound_message', {
      p_contact_id: SUITE_FIXTURES.contact, p_client_message_id: clientId,
      p_content: '[E2E isolado] prova ' + label + ' ' + runId, p_message_type: type,
      p_whatsapp_connection_id: SUITE_FIXTURES.connection, ...(mediaUrl ? { p_media_url: mediaUrl } : {}),
    });
    if (!validId(queued?.id)) fail('provider-real-enqueue-not-confirmed');
    observer.phase(phases[1]);
    const delivery = await post('/functions/v1/message-delivery', { messageId: queued.id });
    if (delivery?.messageId !== queued.id || delivery.status !== 'sent' || delivery.idempotent !== false ||
        !validText(delivery.externalId)) fail('provider-real-delivery-not-confirmed');
    observer.phase(phases[2]);
    const after = validateEvidence(await request(PROVIDER_ORIGIN, '/__e2e/evidence'));
    if (after.count !== before.count + 1 || before.message_ids.includes(delivery.externalId) ||
        !after.message_ids.includes(delivery.externalId) || before.message_ids.some(id => !after.message_ids.includes(id)) ||
        after.media_receipts.length !== before.media_receipts.length + Number(Boolean(mediaUrl))) fail('provider-receipt-not-observed');
    if (mediaUrl) {
      const observed = after.media_receipts.find(row => row.message_id === delivery.externalId);
      if (observed?.sha256 !== mediaHash || observed.bytes !== PROVIDER_PNG.length) fail('provider-media-bytes-not-observed');
    }
    observer.phase(phases[3]);
    const rows = await request(ORIGIN, '/rest/v1/messages?id=eq.' + queued.id + '&select=id,contact_id,agent_id,sender,status,external_id,client_message_id,message_type,media_url', { headers: user });
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== queued.id || rows[0].contact_id !== SUITE_FIXTURES.contact ||
        rows[0].agent_id !== loginSeed.profile_id || rows[0].sender !== 'agent' || rows[0].status !== 'sent' ||
        rows[0].external_id !== delivery.externalId || rows[0].client_message_id !== clientId ||
        rows[0].message_type !== type || rows[0].media_url !== mediaUrl) fail('provider-delivery-user-rls-not-confirmed');
    before = after;
  }
  await deliver('texto');

  // Exercise the current SQL guard through PostgREST, with the real user JWT.
  observer.phase('http-negative-enqueue');
  const rejectedId = freshId();
  const rejected = await fetchLocal(ORIGIN, '/rest/v1/rpc/enqueue_outbound_message', {
    method: 'POST', headers: user, body: JSON.stringify({ p_contact_id: SUITE_FIXTURES.contact,
      p_client_message_id: rejectedId, p_content: '[E2E isolado] HTTP deve falhar', p_message_type: 'image',
      p_whatsapp_connection_id: SUITE_FIXTURES.connection, p_media_url: CATALOG_MEDIA_URL.replace('https:', 'http:') }),
  });
  observer.response(rejected.status);
  let rejection; try { rejection = await rejected.json(); } catch { fail('provider-http-guard-invalid-response'); }
  observer.sqlstate(rejection?.code);
  if (rejected.status !== 400 || rejection?.code !== '22023') fail('provider-http-guard-not-enforced');
  observer.phase('http-negative-readback');
  const rejectedRows = await request(ORIGIN, '/rest/v1/messages?client_message_id=eq.' + rejectedId + '&select=id', { headers: user });
  if (!Array.isArray(rejectedRows) || rejectedRows.length) fail('provider-http-guard-inserted-message');

  observer.phase('catalog-bootstrap');
  const bootstrap = await post('/functions/v1/promogifts-catalog', { action: 'bootstrap' }, true);
  if (!Array.isArray(bootstrap?.data?.categories) || !bootstrap.data.categories.length ||
      !Array.isArray(bootstrap.data.suppliers) || !bootstrap.data.suppliers.length ||
      bootstrap.data.stats?.total !== 1) fail('local-catalog-bootstrap-not-ready');
  observer.phase('catalog-list');
  const products = await post('/functions/v1/promogifts-catalog', { action: 'list_products', params: { search: CATALOG_SKU, limit: 10 } }, true);
  if (!Array.isArray(products?.data) || products.data.length !== 1 || products.data[0].sku !== CATALOG_SKU ||
      !validId(products.data[0].id) || products.meta?.total !== 1) fail('local-catalog-product-not-found');
  observer.phase('catalog-detail');
  const detail = await post('/functions/v1/promogifts-catalog', { action: 'get_product', params: { product_id: products.data[0].id } }, true);
  const product = detail?.data;
  if (product?.id !== products.data[0].id || product.sku !== CATALOG_SKU || product.is_active !== true ||
      product.is_stockout !== false || !Array.isArray(product.variants) || !product.variants.some(variant =>
        validId(variant.id) && variant.product_id === product.id && variant.is_active === true &&
        variant.stock_quantity > 0 && validText(variant.color_name) && variant.selected_thumbnail === CATALOG_MEDIA_URL)) fail('local-catalog-variant-not-ready');
  observer.phase('catalog-image');
  const image = await fetchLocal(ORIGIN, '/__e2e/catalog/product.png');
  if (!image.ok) {
    observer.response(image.status);
    observer.sqlstate(await observeSqlState(image));
  }
  if (!image.ok || image.headers.get('content-type')?.split(';')[0] !== 'image/png' ||
      createHash('sha256').update(Buffer.from(await image.arrayBuffer())).digest('hex') !== mediaHash) fail('local-catalog-media-not-ready');
  await deliver('imagem do catálogo', CATALOG_MEDIA_URL);
  observer.phase('storage-upload');
  const objectPath = SUITE_FIXTURES.contact + '/readiness-' + freshId() + '.png';
  await request(ORIGIN, '/storage/v1/object/whatsapp-media/' + objectPath, {
    method: 'POST', headers: { ...user, 'Content-Type': 'image/png', 'x-upsert': 'false' }, body: PROVIDER_PNG,
  });
  // The real worker signs this private-object locator with the caller's JWT;
  // the provider must successfully fetch those signed bytes before its receipt.
  await deliver('imagem do Storage', ORIGIN + '/storage/v1/object/public/whatsapp-media/' + objectPath);
  observer.phase('ready-write');
  currentRuntime();
  const ready = { schema: 1, run_id: runId, source_sha: sourceSha, delivery_real: true,
    provider_observed: true, delivery_user_rls: true, catalog_real: true, catalog_sku: CATALOG_SKU,
    catalog_media_https: true, storage_upload_real: true, storage_media_https: true, http_media_rejected: true,
    delivery_proofs: { text: true, catalog_image: true, storage_image: true } };
  writeFile('/output/provider-ready.json', JSON.stringify(ready) + '\n', { mode: 0o600 });
  return ready;
  }, (content, options) => writeFile('/output/provider-diagnostic.json', content, options));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await verifyProviders();
  process.stdout.write('[e2e-isolated] real local delivery and catalog boundaries verified\n');
}
