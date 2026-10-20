// Read-only semantic probes. Imports pinned, unmodified source. All database,
// Storage, fetch and Deno.env interactions are synthetic and stay in memory.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyProviderSource } from './verify-source.mjs';
const source = path.resolve(process.argv[2] || '/workspace/scratch/f8f9b9cbce53/reaudit/source');
const sourceVerification = verifyProviderSource(source, process.argv[3]);
const head = 'da307ba5626dce892f0b37cb6762463f55d14a96';
const fixtureEnv = {
  EVOLUTION_API_URL: 'https://provider.invalid',
  EVOLUTION_API_KEY: 'synthetic-administrative-marker',
  EVOLUTION_API_FLAVOR: 'go',
};
globalThis.Deno = { env: { get: name => fixtureEnv[name] } };
let networkCaptures = [];
let mockHttpStatus = 200;
globalThis.fetch = async (url, init = {}) => {
  networkCaptures.push({ url: String(url), method: init.method || 'GET', signal: Boolean(init.signal) });
  return new Response(JSON.stringify({ fixture: true }), { status: mockHttpStatus, headers: { 'Content-Type': 'application/json' } });
};
const load = relative => import(pathToFileURL(path.join(source, relative)).href);
const handlers = await load('supabase/functions/_shared/evolution-webhook-msg-handlers.ts');
const messages = await load('supabase/functions/_shared/evolution-webhook-messages.ts');
const helpers = await load('supabase/functions/_shared/evolution-helpers.ts');
const adapter = await load('supabase/functions/_shared/evolution-go-adapter.ts');
const windows = await load('supabase/functions/_shared/talkx-window.ts');
const resume = await load('supabase/functions/_shared/talkx-resume-policy.ts');
const media = await load('supabase/functions/_shared/evolution-media.ts');
const results = [];
const realConsole = { log: console.log, warn: console.warn, error: console.error };
let logs = [];
for (const name of Object.keys(realConsole)) console[name] = (...args) => logs.push({ level: name, text: args.map(String).join(' ') });

function makeDb(cfg = {}) {
  const calls = [];
  let ingestCount = 0;
  let suppressionCount = 0;
  function query(table) {
    const operations = [];
    const q = {};
    function finish(single = false) {
      const call = { table, operations: [...operations], single };
      calls.push(call);
      if (cfg.resolveFrom) {
        const custom = cfg.resolveFrom(call);
        if (custom !== undefined) return Promise.resolve(custom);
      }
      const write = operations.find(op => ['update', 'insert', 'upsert', 'delete'].includes(op[0]));
      if (write) return Promise.resolve({ data: table === 'messages' ? [{ id: 'changed-fixture' }] : null, error: null });
      if (table === 'whatsapp_connections') return Promise.resolve({ data: { id: 'conn-fixture' }, error: null });
      if (table === 'contacts') return Promise.resolve({ data: { id: 'contact-fixture', avatar_url: 'https://images.invalid/pic.jpg', name: 'Fixture', assigned_to: null }, error: null });
      if (table === 'talkx_optout_keywords') return Promise.resolve({ data: [{ keyword: 'pare', match_mode: 'exact' }], error: null });
      if (table === 'talkx_recipients') return Promise.resolve({ data: [{ id: 'recent-fixture' }], error: null });
      if (table === 'talkx_settings') return Promise.resolve({ data: { value: 'Fixture confirmation' }, error: null });
      return Promise.resolve({ data: single ? null : [], error: null });
    }
    for (const method of ['select', 'eq', 'in', 'is', 'not', 'gte', 'order', 'limit', 'update', 'insert', 'upsert', 'delete']) {
      q[method] = (...args) => { operations.push([method, ...args]); return q; };
    }
    q.maybeSingle = () => finish(true);
    q.single = () => finish(true);
    q.then = (resolve, reject) => finish().then(resolve, reject);
    return q;
  }
  const db = {
    from: query,
    rpc: async (name, args = {}) => {
      calls.push({ rpc: name, args });
      if (cfg.resolveRpc) {
        const custom = cfg.resolveRpc(name, args);
        if (custom !== undefined) return custom;
      }
      if (name === 'ingest_inbound_message') {
        const outcome = cfg.ingestOutcomes?.[ingestCount++] || 'inserted';
        return { data: [{ contact_id: 'contact-fixture', contact_name: 'Fixture', avatar_url: 'https://images.invalid/pic.jpg', assigned_to: null, contact_created: false, message_id: 'message-fixture', outcome }], error: null };
      }
      if (name === 'talkx_suppress_contact') return { data: suppressionCount++ ? null : 'suppression-fixture', error: null };
      if (name === 'get_instance_token') return { data: 'synthetic-instance-marker', error: null };
      if (name === 'record_talkx_recipient_receipt') return { data: false, error: null };
      return { data: { attributed: false }, error: null };
    },
    storage: {
      from: bucket => ({
        upload: async (objectPath, data, options) => { calls.push({ storage: 'upload', bucket, objectPath, bytes: data.length, options }); return { error: null }; },
        getPublicUrl: objectPath => ({ data: { publicUrl: `https://storage.invalid/${bucket}/${objectPath}` } }),
      }),
    },
  };
  return { db, calls };
}

function reset() {
  helpers.invalidateConnectionCache();
  messages.resetOptOutKeywordCache();
  networkCaptures = [];
  logs = [];
  mockHttpStatus = 200;
}
function incoming(text = 'PARE', raw = {}) {
  return {
    data: { message: { conversation: text }, pushName: 'Fixture', ...raw },
    key: { id: 'external-fixture', remoteJid: '5511000000000@s.whatsapp.net', fromMe: false },
  };
}
async function runIncoming(db, payload = incoming()) {
  return messages.handleIncomingMessage(db, 'instance-fixture', payload.data, payload.key, 'https://project.invalid', 'synthetic-service-marker');
}

// P01: The exact same GO receipt shape used by X028's own fixture.
reset();
{
  const { db, calls } = makeDb();
  const translated = adapter.translateGoPayload({ event: 'receipt', instanceName: 'instance-fixture', state: 'delivered', data: { Chat: '5511000000000@s.whatsapp.net', Sender: '5511000000000:7@s.whatsapp.net', MessageIDs: ['external-fixture'] } });
  await handlers.handleMessagesUpdate(db, 'instance-fixture', translated.data, {});
  const rpcNames = calls.filter(c => c.rpc).map(c => c.rpc);
  const stub = calls.find(c => c.table === 'messages' && c.operations.some(op => op[0] === 'upsert'));
  assert.equal(translated.data.updates[0].key.fromMe, false);
  assert.equal(rpcNames.includes('record_talkx_recipient_receipt'), true);
  assert.equal(rpcNames.includes('record_multiplix_item_delivered'), false);
  assert.equal(Boolean(stub), true);
  results.push({ id: 'P01', receipt_fromMe: false, rpcNames, stub_sender: stub.operations.find(op => op[0] === 'upsert')[1].sender, outcome: 'GO outbound receipt omits Multiplix and creates inbound stub attempt' });
}

// P02: edit lookup is global: the only lookup predicate is external_id.
reset();
{
  const { db, calls } = makeDb({ resolveFrom: c => c.table === 'messages' && c.single ? { data: { id: 'newest-message-on-other-connection' }, error: null } : undefined });
  await handlers.handleMessagesEdited(db, { key: { id: 'colliding-external-id', fromMe: false }, message: { conversation: 'Edited fixture' } }, {});
  const lookup = calls.find(c => c.table === 'messages' && c.single);
  const update = calls.find(c => c.table === 'messages' && c.operations.some(op => op[0] === 'update'));
  assert.deepEqual(lookup.operations.filter(op => op[0] === 'eq'), [['eq', 'external_id', 'colliding-external-id']]);
  results.push({ id: 'P02', lookup_filters: lookup.operations.filter(op => op[0] === 'eq'), update_filters: update.operations.filter(op => op[0] === 'eq'), outcome: 'edit has no connection or direction correlation' });
}

// P03: failed connection lookup is cached; delete proceeds without scoping.
reset();
{
  let connectionReads = 0;
  const { db, calls } = makeDb({ resolveFrom: c => {
    if (c.table === 'whatsapp_connections') { connectionReads++; return { data: null, error: { message: 'synthetic temporary database error' } }; }
  } });
  await handlers.handleMessagesDelete(db, 'instance-fixture', { key: { id: 'colliding-external-id', fromMe: false } }, {});
  await helpers.getConnectionByInstance(db, 'instance-fixture');
  const update = calls.find(c => c.table === 'messages' && c.operations.some(op => op[0] === 'update'));
  assert.equal(connectionReads, 1);
  assert.equal(update.operations.some(op => op[0] === 'eq' && op[1] === 'whatsapp_connection_id'), false);
  results.push({ id: 'P03', connectionReads, update_filters: update.operations.filter(op => op[0] === 'eq'), outcome: 'database lookup error becomes cached null and unscoped message mutation' });
}

// P04: group JID is replaced with sender JID before the group guard.
reset();
{
  const { db, calls } = makeDb();
  const translated = adapter.translateGoPayload({ event: 'message', instanceName: 'instance-fixture', data: { Info: { ID: 'group-message-fixture', Chat: '120363000000000000@g.us', Sender: '5511000000000@s.whatsapp.net', IsFromMe: false }, Message: { conversation: 'Fixture group text' } } });
  await runIncoming(db, { data: translated.data, key: translated.data.key });
  const ingest = calls.find(c => c.rpc === 'ingest_inbound_message');
  assert.ok(ingest);
  assert.equal(ingest.args.p_phone, '5511000000000');
  results.push({ id: 'P04', group_jid: translated.data.key.remoteJid, ingested_phone: ingest.args.p_phone, outcome: 'group message enters direct contact inbox' });
}

// P05: a failed opt-out after durable ingest cannot be retried by redelivery.
reset();
{
  const { db, calls } = makeDb({ ingestOutcomes: ['inserted', 'duplicate'], resolveRpc: name => name === 'talkx_suppress_contact' ? { data: null, error: { message: 'synthetic suppression failure' } } : undefined });
  await runIncoming(db);
  await runIncoming(db);
  const suppressionCalls = calls.filter(c => c.rpc === 'talkx_suppress_contact').length;
  assert.equal(suppressionCalls, 1);
  results.push({ id: 'P05', ingests: 2, suppressionCalls, handler_threw: false, outcome: 'failed suppression is swallowed; duplicate stops retry' });
}

// P06: downstream HTTP failure is logged as successful opt-out confirmation.
reset();
{
  mockHttpStatus = 500;
  const { db } = makeDb();
  await runIncoming(db);
  assert.equal(networkCaptures.length, 1);
  assert.equal(logs.some(l => l.text.includes('Confirmacao enviada')), true);
  results.push({ id: 'P06', fixture_http_status: mockHttpStatus, confirmation_logged_sent: true, transport: networkCaptures, outcome: 'unchecked Response.ok yields false confirmation' });
}

// P07: unknown opt-out state is treated as normal campaign engagement.
reset();
{
  const { db, calls } = makeDb({
    resolveFrom: c => c.table === 'talkx_optout_keywords' ? { data: null, error: { message: 'fixture lookup error' } } : undefined,
    resolveRpc: name => name === 'talkx_match_optout' ? { data: null, error: { message: 'fixture RPC error' } } : undefined,
  });
  await runIncoming(db);
  const rpcNames = calls.filter(c => c.rpc).map(c => c.rpc);
  assert.equal(rpcNames.includes('talkx_suppress_contact'), false);
  assert.equal(rpcNames.includes('attribute_talkx_reply'), true);
  results.push({ id: 'P07', rpcNames, outcome: 'PARE is attributed as engagement when both keyword lookups fail' });
}

// P08: numeric v2 status crosses the permissive envelope but crashes handler.
reset();
{
  const { db } = makeDb();
  let error = null;
  try { await handlers.handleMessagesUpdate(db, 'instance-fixture', { key: { id: 'numeric-status-fixture', fromMe: true }, status: 3 }, {}); }
  catch (e) { error = String(e); }
  assert.ok(error?.includes('toLowerCase'));
  results.push({ id: 'P08', input_status: 3, error, classification: 'conditional on provider sending numeric status' });
}

// P09: JSONB object settings ignored; malformed hours allow sending.
reset();
{
  const configured = { start: '20:00', end: '22:00', days: [1,2,3,4,5] };
  const campaign = { id: 'campaign-fixture', pause_reason: 'business_hours', business_hours_only: true, schedule_timezone: 'America/Sao_Paulo' };
  const businessDate = new Date('2026-10-05T23:30:00.000Z');
  const parsed = windows.parseBusinessHours(configured);
  const configuredAllowed = windows.deliveryWindowStatus(campaign, businessDate, configured).allowed;
  const scheduler = resume.selectResumableCampaigns([campaign], () => 'connected', businessDate)[0];
  const malformedAllowed = windows.deliveryWindowStatus(campaign, new Date('2026-10-05T04:00:00.000Z'), { start: 'garbage', end: 'garbage', days: [1] }).allowed;
  assert.equal(parsed, null);
  assert.equal(configuredAllowed, true);
  assert.equal(scheduler.resume, false);
  assert.equal(malformedAllowed, true);
  results.push({ id: 'P09', jsonb_object_parsed: parsed, configuredAllowed, scheduler_resume: scheduler.resume, malformedAllowed, outcome: 'settings contract and scheduler window disagree' });
}

// P10: direct media download accepts a loopback URL (fetch remains mocked).
reset();
{
  const { db } = makeDb();
  await media.persistMediaToStorage(db, 'http://127.0.0.1:9999/offline-fixture', 'document', 'media-fixture');
  assert.equal(networkCaptures.length, 1);
  assert.ok(networkCaptures[0].url.startsWith('http://127.0.0.1:'));
  results.push({ id: 'P10', actual_network_requests: 0, mocked_fetch_called_with_loopback: true, outcome: 'media URL is not passed through secure egress guard' });
}

for (const [name, fn] of Object.entries(realConsole)) console[name] = fn;
const sourceFiles = [
  'supabase/functions/_shared/evolution-webhook-msg-handlers.ts',
  'supabase/functions/_shared/evolution-webhook-messages.ts',
  'supabase/functions/_shared/evolution-helpers.ts',
  'supabase/functions/_shared/evolution-go-adapter.ts',
  'supabase/functions/_shared/talkx-window.ts',
  'supabase/functions/_shared/talkx-resume-policy.ts',
  'supabase/functions/_shared/evolution-media.ts',
];
const artifact = {
  schema_version: 1, head, actual_network_requests: 0, actual_database_requests: 0,
  source_verification: sourceVerification,
  actual_environment_reads: 0, source_changes: 0,
  method: 'Node 24 direct import of unchanged TypeScript; deterministic in-memory clients; all fetch calls intercepted before source import',
  source_hashes: Object.fromEntries(sourceFiles.map(f => [f, createHash('sha256').update(fs.readFileSync(path.join(source, f))).digest('hex')])),
  results,
};
fs.writeFileSync(new URL('./probe-results.json', import.meta.url), JSON.stringify(artifact, null, 2) + '\n');
console.log(JSON.stringify({ head, probes_passed: results.length, ids: results.map(r => r.id), actual_network_requests: 0, actual_database_requests: 0 }, null, 2));
