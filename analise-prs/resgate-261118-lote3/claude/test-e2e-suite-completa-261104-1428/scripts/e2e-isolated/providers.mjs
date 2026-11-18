import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';
import { assertLoopbackOnly, assertNoProxy, assertRunId, assertSourceSha,
  currentNetworkNamespace, ORIGIN, PROVIDER_ORIGIN, CATALOG_SKU, fail } from './runtime-contract.mjs';

const MAX_BODY = 1024 * 1024;
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const PRODUCT_ID = 'e2e70000-0000-4000-a000-000000000001';
const CATEGORY_ID = 'e2e70000-0000-4000-a000-000000000002';
const SUPPLIER_ID = 'e2e70000-0000-4000-a000-000000000003';
const VARIANT_ID = 'e2e70000-0000-4000-a000-000000000004';
export const CATALOG_MEDIA_URL = ORIGIN + '/__e2e/catalog/product.png';
export const PROVIDER_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64');
const IMAGE = CATALOG_MEDIA_URL;
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
});
const text = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const localMedia = value => {
  try { const url = new URL(value); return !url.username && !url.password && url.protocol === 'https:' && url.origin === ORIGIN; }
  catch { return false; }
};

// The synthetic provider acknowledges media only after the real HTTPS fetch.
// No redirect, credential forwarding, URL/body logging or unbounded buffering.
async function downloadMedia(url, fetcher) {
  if (!localMedia(url)) throw new Error('invalid-local-media');
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (!response.ok || !response.body || !Number.isFinite(declared) || declared < 0 || declared > MAX_MEDIA_BYTES) {
    await response.body?.cancel(); throw new Error('local-media-unavailable');
  }
  const reader = response.body.getReader(), hash = createHash('sha256');
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_MEDIA_BYTES) throw new Error('local-media-too-large');
      hash.update(chunk.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (!bytes) throw new Error('local-media-empty');
  return { sha256: hash.digest('hex'), bytes };
}
const sendChecks = {
  '/send/text': body => text(body.text),
  '/send/media': body => localMedia(body.url) && ['image', 'video', 'document', 'audio', 'ptt', 'ptv'].includes(body.type),
  '/send/sticker': body => localMedia(body.sticker),
  '/send/location': body => Number.isFinite(body.latitude) && Math.abs(body.latitude) <= 90 &&
    Number.isFinite(body.longitude) && Math.abs(body.longitude) <= 180,
  '/send/contact': body => object(body.vcard) && text(body.vcard.fullName) && text(body.vcard.phone),
  '/send/poll': body => text(body.question) && Array.isArray(body.options) && body.options.length >= 2 &&
    body.options.every(text) && Number.isInteger(body.maxAnswer) && body.maxAnswer >= 1 && body.maxAnswer <= body.options.length,
  '/send/list': body => text(body.title) && text(body.description) && text(body.buttonText) &&
    Array.isArray(body.sections) && body.sections.length > 0 && body.sections.every(section =>
      object(section) && Array.isArray(section.rows) && section.rows.length > 0 && section.rows.every(row => text(row.title) && text(row.rowId))),
  '/send/button': body => text(body.title) && Array.isArray(body.buttons) && body.buttons.length > 0,
};

function catalogData(now) {
  const date = new Date(now).toISOString();
  const category = { id: CATEGORY_ID, name: 'Sintéticos E2E', slug: 'sinteticos-e2e', parent_id: null,
    level: 0, path: '/' + CATEGORY_ID + '/', full_path_readable: 'Sintéticos E2E', icon: null,
    color_hex: '#2563eb', image_url: IMAGE, products_count: 1, display_order: 0, is_active: true, deleted_at: null };
  const supplier = { id: SUPPLIER_ID, name: 'Fornecedor sintético E2E', trading_name: 'E2E', logo_url: null,
    is_product_supplier: true, low_stock_threshold: 10, active: true };
  const variant = { id: VARIANT_ID, product_id: PRODUCT_ID, sku: CATALOG_SKU + '-AZUL', name: 'Azul',
    attributes: { color: 'Azul' }, stock_quantity: 100, color_name: 'Azul', color_hex: '#2563eb',
    size_code: null, capacity_ml: 300, selected_thumbnail: IMAGE, is_active: true, images: [IMAGE],
    supplier_sku: 'LOCAL-001', next_entry_date: null, next_entry_quantity: null };
  const product = { id: PRODUCT_ID, name: 'Produto sintético E2E', description: 'Produto local para testar o envio real.',
    short_description: 'Fixture do ambiente descartável', sku: CATALOG_SKU, sale_price: 12.5, suggested_price: 15,
    stock_quantity: 100, primary_image_url: IMAGE, primary_image_fallback_url: IMAGE, images: [IMAGE],
    colors: ['Azul'], color_swatches: [{ color_name: 'Azul', color_hex: '#2563eb', image_url: IMAGE,
      variant_id: VARIANT_ID, is_in_stock: true, stock_quantity: 100 }], materials: ['Bambu'], tags: ['E2E'],
    brand: 'Sintético', origin_country: 'BR', min_quantity: 1, dimensions_display: '10 x 10 cm', weight_g: 100,
    combined_sizes: null, product_type: 'brinde', is_kit: false, is_active: true, is_stockout: false,
    allows_personalization: true, lead_time_days: 1, supply_mode: 'stock', is_featured: false, is_new: true,
    is_bestseller: false, is_on_sale: false, is_closeout: false, has_gift_box: false,
    is_featured_expires_at: null, is_new_expires_at: null, is_bestseller_expires_at: null,
    engraving_type: 'LASER', engraving_description: 'Gravação sintética', main_category_id: CATEGORY_ID,
    order_count: 0, view_count: 0, created_at: date, updated_at: date, last_sync_at: date,
    category_id: CATEGORY_ID, supplier_id: SUPPLIER_ID, slug: 'produto-sintetico-e2e', capacity_ml: 300,
    ncm_code: null, categories: category, suppliers: supplier };
  return { products: [product], product_variants: [variant], categories: [category], suppliers: [supplier],
    stats: { total: 1, in_stock: 1, featured: 0, new_30d: 1, bestseller: 0, kits: 0, low_stock: 0,
      categories_root: 1, suppliers_active: 1, last_sync_at: date, last_update_at: date,
      by_month: [{ month: date.slice(0, 7), count: 1 }], price_min: 12.5, price_max: 12.5,
      top_colors: [{ label: 'Azul', count: 1 }], top_materials: [{ label: 'Bambu', count: 1 }] } };
}

// A bounded fixture boundary for the requests made by promogifts-catalog.
// Unsupported columns/operators fail; this is not a PostgREST/FTS emulator.
function project(row, select) {
  if (!select || select === '*') return row;
  const result = {};
  for (const part of select.split(/,(?![^()]*\))/).map(value => value.trim())) {
    const relation = part.match(/^(categories|suppliers):(?:category_id|supplier_id)\(([^()]*)\)$/);
    if (relation) result[relation[1]] = project(row[relation[1]], relation[2]);
    else {
      if (!Object.hasOwn(row, part)) throw new Error('unsupported-select');
      result[part] = row[part];
    }
  }
  return result;
}
function catalogResponse(request, url, rows) {
  let filtered = rows;
  for (const [key, value] of url.searchParams) {
    if (['select', 'order', 'offset', 'limit'].includes(key)) continue;
    if (key === 'search_vector') {
      if (!value.startsWith('wfts(portuguese).')) throw new Error('unsupported-search');
      const term = value.slice('wfts(portuguese).'.length).toLocaleLowerCase('pt-BR');
      filtered = filtered.filter(row => [row.sku, row.name].some(field => field?.toLocaleLowerCase('pt-BR').includes(term)));
      continue;
    }
    if (!rows.every(row => Object.hasOwn(row, key))) throw new Error('unsupported-filter-column');
    if (value.startsWith('eq.')) filtered = filtered.filter(row => String(row[key]) === value.slice(3));
    else if (value === 'is.null') filtered = filtered.filter(row => row[key] === null);
    else if (key === 'path' && /^like\.[^%]*%$/.test(value)) filtered = filtered.filter(row => row.path.startsWith(value.slice(5, -1)));
    else throw new Error('unsupported-filter');
  }
  for (const order of (url.searchParams.get('order') || '').split(',').filter(Boolean)) {
    const match = order.match(/^(\w+)\.(asc|desc)(?:\.nulls(?:first|last))?$/);
    if (!match || !rows.every(row => Object.hasOwn(row, match[1]))) throw new Error('unsupported-order');
  }
  const total = filtered.length;
  const offsetText = url.searchParams.get('offset') ?? '0', limitText = url.searchParams.get('limit') ?? '100';
  if (!/^\d+$/.test(offsetText) || !/^\d+$/.test(limitText)) throw new Error('unsupported-range');
  const offset = Number(offsetText), limit = Number(limitText);
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(limit) || limit > 100) throw new Error('unsupported-range');
  filtered = filtered.slice(offset, offset + limit).map(row => project(row, url.searchParams.get('select')));
  const headers = { 'content-range': filtered.length ? offset + '-' + (offset + filtered.length - 1) + '/' + total : '*/' + total };
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
  if (request.headers.get('accept')?.includes('application/vnd.pgrst.object+json')) {
    if (filtered.length !== 1) return json({ code: 'PGRST116', details: 'The result contains ' + filtered.length + ' rows', message: 'Object requires one row' }, 406);
    return json(filtered[0], 200, headers);
  }
  return json(filtered, 200, headers);
}

export function createProviders({ env = process.env, interfaces = networkInterfaces,
  namespace = currentNetworkNamespace, now = Date.now, nextId = randomUUID, fetcher = fetch } = {}) {
  assertLoopbackOnly(interfaces()); assertNoProxy(env);
  if (!ORIGIN.startsWith('https://') || env.NODE_EXTRA_CA_CERTS !== '/run/zapp-e2e-tls/ca.crt' ||
      env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined || env.NODE_OPTIONS) fail('provider-tls-environment');
  const runId = assertRunId(env.ZAPP_E2E_RUN_ID), sourceSha = assertSourceSha(env.GITHUB_SHA);
  const networkNamespace = namespace();
  if (!/^net:\[\d+\]$/.test(networkNamespace)) fail('invalid-provider-namespace');
  const adminKey = env.EVOLUTION_API_KEY, instanceKey = env.EVOLUTION_DEFAULT_INSTANCE_TOKEN;
  const catalogKey = env.PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY;
  if (!adminKey?.startsWith('e2e-local-') || !instanceKey?.startsWith('e2e-instance-') ||
      !catalogKey?.startsWith('e2e-catalog-')) fail('provider-synthetic-keys-missing');
  const identity = { schema: 1, run_id: runId, source_sha: sourceSha, origin: PROVIDER_ORIGIN, network_namespace: networkNamespace };
  const messages = [], mediaReceipts = [], data = catalogData(now());
  const evidence = () => ({ ...identity, count: messages.length, message_ids: [...messages],
    media_receipts: mediaReceipts.map(receipt => ({ ...receipt })) });
  const handler = async request => {
    const url = new URL(request.url);
    if (url.origin !== PROVIDER_ORIGIN) return json({ error: 'local-origin-required' }, 400);
    if (url.pathname === '/__e2e/identity' || url.pathname === '/__e2e/evidence') {
      if (request.method !== 'GET') return json({ error: 'method-not-allowed' }, 405);
      return json(url.pathname.endsWith('/identity') ? identity : evidence());
    }
    if (url.pathname === '/catalog/product.png') {
      if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'method-not-allowed' }, 405);
      return new Response(request.method === 'HEAD' ? null : PROVIDER_PNG, {
        headers: { 'content-type': 'image/png', 'content-length': String(PROVIDER_PNG.length), 'cache-control': 'no-store' },
      });
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      if (request.headers.get('apikey') !== catalogKey || request.headers.get('authorization') !== 'Bearer ' + catalogKey) return json({ code: '42501', message: 'Unauthorized synthetic catalog client' }, 401);
      if (url.pathname === '/rest/v1/rpc/zapp_catalog_stats') {
        if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
        return json(data.stats);
      }
      const table = url.pathname.slice('/rest/v1/'.length);
      if (!['products', 'product_variants', 'categories', 'suppliers'].includes(table)) return json({ error: 'unsupported-catalog-resource' }, 404);
      if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'read-only-catalog' }, 405);
      try { return catalogResponse(request, url, data[table]); }
      catch { return json({ code: 'PGRST100', message: 'Unsupported synthetic catalog query' }, 400); }
    }
    const isAdmin = url.pathname === '/instance/all';
    if (request.headers.get('apikey') !== (isAdmin ? adminKey : instanceKey)) return json({ error: 'invalid-provider-credential' }, 401);
    if (url.pathname === '/instance/all' || url.pathname === '/instance/status') {
      if (request.method !== 'GET') return json({ error: 'method-not-allowed' }, 405);
      const state = name => ({ Name: name, Connected: true, LoggedIn: true });
      return json({ message: 'success', data: isAdmin ? ['E2E_LOCAL', 'e2e-arquivos-local'].map(state) : state('E2E_LOCAL') });
    }
    const known = Object.hasOwn(sendChecks, url.pathname) || ['/message/presence', '/message/markread', '/message/react', '/message/edit', '/message/delete', '/user/check', '/user/avatar'].includes(url.pathname);
    if (!known) return json({ error: 'unsupported-provider-route' }, 404);
    if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
    let body;
    try {
      const raw = await request.text(); if (Buffer.byteLength(raw) > MAX_BODY) return json({ error: 'body-too-large' }, 413);
      body = JSON.parse(raw); if (!object(body)) throw new Error();
    } catch { return json({ error: 'invalid-provider-body' }, 400); }
    if (Object.hasOwn(sendChecks, url.pathname)) {
      if (!text(body.number) || !sendChecks[url.pathname](body)) return json({ error: 'invalid-send-payload' }, 400);
      const id = 'local-' + nextId();
      if (!/^local-[a-zA-Z0-9-]{1,100}$/.test(id) || messages.includes(id)) return json({ error: 'invalid-local-receipt' }, 500);
      const mediaUrl = url.pathname === '/send/media' ? body.url : url.pathname === '/send/sticker' ? body.sticker : null;
      let observed;
      if (mediaUrl) {
        try { observed = await downloadMedia(mediaUrl, fetcher); }
        catch { return json({ error: 'local-media-unavailable' }, 502); }
      }
      if (messages.includes(id)) return json({ error: 'invalid-local-receipt' }, 500);
      if (observed) mediaReceipts.push({ message_id: id, ...observed });
      messages.push(id);
      return json({ message: 'success', data: { Info: { ID: id } } });
    }
    if (url.pathname === '/user/check') {
      if (!Array.isArray(body.number) || !body.number.length || !body.number.every(text)) return json({ error: 'invalid-number-query' }, 400);
      return json({ message: 'success', data: { Users: body.number.map(number => ({ Query: number, IsInWhatsapp: true, JID: number.includes('@') ? number : number + '@s.whatsapp.net' })) } });
    }
    if (url.pathname === '/user/avatar') return json({ message: 'success', data: { URL: IMAGE } });
    const valid = url.pathname === '/message/presence' ? text(body.number) && text(body.state)
      : url.pathname === '/message/markread' ? text(body.number) && Array.isArray(body.id) && body.id.every(text)
      : url.pathname === '/message/react' ? text(body.number) && text(body.id) && typeof body.reaction === 'string'
      : text(body.chat) && text(body.messageId) && (url.pathname !== '/message/edit' || text(body.message));
    return valid ? json({ message: 'success', data: {} }) : json({ error: 'invalid-provider-payload' }, 400);
  };
  return { handler, evidence };
}

export function createProviderServer(provider) {
  return http.createServer(async (request, response) => {
    try {
      if (request.headers.host !== '127.0.0.1:8081' || !request.url.startsWith('/') || request.url.startsWith('//')) {
        response.writeHead(400); response.end('Invalid local host or path'); return;
      }
      let size = 0; const chunks = [];
      for await (const chunk of request) {
        size += chunk.length; if (size > MAX_BODY) { response.writeHead(413); response.end(); return; }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const result = await provider.handler(new Request(PROVIDER_ORIGIN + request.url, {
        method: request.method, headers: request.headers,
        ...(!['GET', 'HEAD'].includes(request.method) ? { body } : {}),
      }));
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch { if (!response.headersSent) response.writeHead(500); response.end('Local provider failed'); }
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  createProviderServer(createProviders()).listen(8081, '127.0.0.1', () => {
    process.stdout.write('[e2e-isolated] synthetic external providers ready on loopback\n');
  });
}
