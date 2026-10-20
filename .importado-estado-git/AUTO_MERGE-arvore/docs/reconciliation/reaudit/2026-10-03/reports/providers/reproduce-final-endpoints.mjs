// Offline source-pinned audit: no network, database, environment or secrets.
// Complete endpoint handlers run after import wiring/type erasure. SQL itself
// is NOT executed; the conversion rejection fixture follows the pinned SQL
// source contract and is explicitly distinguished from a live database test.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { verifyProviderSource } from './verify-source.mjs';

const source = path.resolve(process.argv[2] || '/workspace/scratch/f8f9b9cbce53/reaudit/source');
const manifestPath = process.argv[3] || path.join(path.dirname(source), 'source-integrity.json');
const sourceVerification = verifyProviderSource(source, manifestPath);
const sqlPath = 'supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sqlPin = manifest.files.find(x => x.path === sqlPath);
assert(sqlPin, 'Missing SQL pin');
const sqlBytes = fs.readFileSync(path.join(source, sqlPath));
const sqlBlob = createHash('sha1').update(Buffer.from(`blob ${sqlBytes.length}\0`)).update(sqlBytes).digest('hex');
assert.equal(sqlBlob, sqlPin.git_blob_sha, 'SQL differs from root verified source');
const sql = sqlBytes.toString('utf8');
assert(sql.includes("IF p_source NOT IN ('whatsapp','manual','import','api','checkout') THEN"));
assert(sql.includes('WHERE external_ref IS NOT NULL AND source IS NOT NULL'));
assert(sql.includes('occurred_at   timestamptz NOT NULL DEFAULT now()'));
assert(sql.includes("currency      text NOT NULL DEFAULT 'BRL'"));

// No application module has been imported before both source gates above.
globalThis.fetch = () => { throw new Error('Network forbidden in audit probe'); };
globalThis.Deno = { env: { get: () => undefined } };
const importSource = rel => import(pathToFileURL(path.join(source, rel)).href);
const hmac = await importSource('supabase/functions/_shared/hmac-validation.ts');
const validation = await importSource('supabase/functions/_shared/validation.ts');
const emailFont = await importSource('supabase/functions/_shared/email-font-stack.ts');
const results = [];
const reviewedPaths = new Set([sqlPath]);
const noopLogger = class { info() {} warn() {} error() {} done() {} };
const quietConsole = { log() {}, warn() {}, error() {} };
const forbiddenFetch = () => { throw new Error('Unexpected network boundary in audit probe'); };
const baseScope = () => ({ ...validation, Request, Response, Headers, URL, AbortSignal,
  Date, TextEncoder, TextDecoder, Uint8Array, crypto: webcrypto,
  console: quietConsole, Logger: noopLogger, fetch: forbiddenFetch });
function evaluate(rel, scope, expectedImports) {
  reviewedPaths.add(rel);
  const input = fs.readFileSync(path.join(source, rel), 'utf8');
  const importPattern = /^import\s[\s\S]*?;\r?\n/gm;
  assert.equal(input.match(importPattern)?.length, expectedImports, 'Review import boundary after source change');
  const executable = stripTypeScriptTypes(input.replace(importPattern, '').replaceAll('import.meta.main', 'true'))
    .replace(/^export (?=(?:async )?(?:function|class|const))/gm, '');
  runInNewContext(executable, scope, { filename: rel });
  return scope;
}
const request = (url, body, headers = {}) => new Request(url, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});

// P25: a valid captured HMAC authenticates the body, but not its timestamp.
let clockMs = Date.UTC(2026, 9, 3, 12);
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clockMs])); }
  static now() { return clockMs; }
}
const conversionCalls = [];
const fixtureRecipient = '11111111-1111-4111-8111-111111111111';
const fixtureCampaign = '22222222-2222-4222-8222-222222222222';
const conversionDb = {
  from(table) {
    assert.equal(table, 'talkx_recipients');
    const q = { select: () => q, eq: (key, value) => { assert.equal(key, 'id'); assert.equal(value, fixtureRecipient); return q; },
      maybeSingle: async () => ({ data: { campaign_id: fixtureCampaign }, error: null }) };
    return q;
  },
  async rpc(name, args) {
    assert.equal(name, 'record_talkx_conversion');
    conversionCalls.push(JSON.parse(JSON.stringify(args)));
    // This fixture models only the observed source whitelist, not PostgreSQL.
    if (!['whatsapp', 'manual', 'import', 'api', 'checkout'].includes(args.p_source)) {
      return { data: null, error: { message: 'talkx_conversion_invalid_source' } };
    }
    return { data: { status: 'recorded', id: `fixture-${conversionCalls.length}` }, error: null };
  },
};
const linkScope = evaluate('supabase/functions/talkx-link/index.ts', {
  ...baseScope(), Date: FixtureDate, verifyHmacSignature: hmac.verifyHmacSignature,
  enforceRateLimit: async () => ({ allowed: true }),
  createClient: () => { throw new Error('Use explicit DI boundary'); },
  Deno: { serve() {}, env: { get: () => undefined } },
}, 3);
const secret = 'fixture-hmac-key-not-a-real-secret';
const signer = new hmac.WebhookSecurityService(secret, true);
const validBody = { action: 'convert', recipient_id: fixtureRecipient, value: 10,
  source: 'checkout', currency: 'BRL', occurred_at: new Date(clockMs).toISOString() };
const capturedSignature = await signer.signPayload(JSON.stringify(validBody));
const originalTimestamp = String(clockMs);
const deps = { supabase: conversionDb, env: { get: name => name === 'TALKX_CONVERT_SECRET' ? secret : 'fixture-salt' } };
const signedRequest = (body, stamp, signature) => request('https://edge.invalid/talkx-link', body,
  { 'x-talkx-timestamp': stamp, 'x-talkx-signature': signature });
const originalResponse = await linkScope.handleTalkxLink(signedRequest(validBody, originalTimestamp, capturedSignature), deps);
assert.equal(originalResponse.status, 200);
clockMs += 24 * 60 * 60 * 1000;
const staleResponse = await linkScope.handleTalkxLink(signedRequest(validBody, originalTimestamp, capturedSignature), deps);
assert.equal(staleResponse.status, 401);
assert.equal(conversionCalls.length, 1);
const replayResponse = await linkScope.handleTalkxLink(signedRequest(validBody, String(clockMs), capturedSignature), deps);
assert.equal(replayResponse.status, 200);
assert.equal(conversionCalls.length, 2);
assert.equal(conversionCalls[1].p_external_ref, null);
const tamperedResponse = await linkScope.handleTalkxLink(signedRequest({ ...validBody, value: 20 }, String(clockMs), capturedSignature), deps);
assert.equal(tamperedResponse.status, 401);
assert.equal(conversionCalls.length, 2);
results.push({ id: 'P25', original: originalResponse.status, stale: staleResponse.status,
  retimestampedReplay: replayResponse.status, changedBody: tamperedResponse.status,
  rpcCalls: conversionCalls.length, externalRef: conversionCalls[1].p_external_ref,
  outcome: 'Same captured body/signature is accepted after 24h when only unsigned timestamp changes. SQL duplicate handling itself was not executed.' });

// P26: optional Edge fields become invalid/default-defeating SQL arguments.
const minimalBody = { action: 'convert', recipient_id: fixtureRecipient, value: 10 };
const minimalSignature = await signer.signPayload(JSON.stringify(minimalBody));
const minimalResponse = await linkScope.handleTalkxLink(signedRequest(minimalBody, String(clockMs), minimalSignature), deps);
assert.equal(minimalResponse.status, 422);
const minimalArgs = conversionCalls.at(-1);
assert.equal(minimalArgs.p_source, 'webhook');
assert.equal(minimalArgs.p_currency, null);
assert.equal(minimalArgs.p_occurred_at, null);
results.push({ id: 'P26', httpStatus: minimalResponse.status, mappedFields: {
  source: minimalArgs.p_source, currency: minimalArgs.p_currency, occurredAt: minimalArgs.p_occurred_at },
  outcome: 'Complete Edge handler maps omitted source to a value rejected by pinned SQL whitelist and passes explicit NULL for both NOT NULL columns. Only source rejection was simulated, without executing SQL.' });

// P27: every instance is assigned the same global message traffic.
const connections = [{ id: 'conn-a', instance_id: 'instance-a', status: 'connected', phone_number: 'fixture-a' },
  { id: 'conn-b', instance_id: 'instance-b', status: 'connected', phone_number: 'fixture-b' }];
const messageRows = [{ sender: 'contact', created_at: new Date(clockMs).toISOString(), whatsapp_connection_id: 'conn-a' }];
const messageQueries = [];
const diagnosticDb = {
  from(table) {
    assert(['whatsapp_connections', 'messages'].includes(table));
    const query = { table, filters: [], columns: null };
    let rows = table === 'messages' ? messageRows : connections;
    const q = {
      select(columns) { query.columns = columns; return q; },
      gte(key, value) { query.filters.push({ op: 'gte', key, value }); rows = rows.filter(r => r[key] >= value); return q; },
      eq(key, value) { query.filters.push({ op: 'eq', key, value }); rows = rows.filter(r => r[key] === value); return q; },
      then(resolve, reject) {
        if (table === 'messages') messageQueries.push(query);
        const columns = query.columns.split(',').map(x => x.trim());
        return Promise.resolve({ data: rows.map(r => Object.fromEntries(columns.map(k => [k, r[k]]))), error: null }).then(resolve, reject);
      },
    };
    return q;
  },
};
let diagnosticHandler;
const expectedWebhook = 'https://db.invalid/functions/v1/evolution-webhook';
const diagnosticScope = evaluate('supabase/functions/webhook-diagnostic/index.ts', {
  ...baseScope(), Date: FixtureDate, createClient: () => diagnosticDb,
  Deno: { env: { get: name => ({ EVOLUTION_API_FLAVOR: 'v2', SUPABASE_URL: 'https://db.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', EVOLUTION_API_URL: 'https://provider.invalid', EVOLUTION_API_KEY: 'fixture-provider' })[name] },
    serve: fn => { diagnosticHandler = fn; } },
  evoFetch: async () => new Response(JSON.stringify({ instance: { state: 'open' } })),
  extractConnectionState: data => data.instance.state,
  fetch: async url => {
    assert(['https://provider.invalid/webhook/find/instance-a', 'https://provider.invalid/webhook/find/instance-b'].includes(url));
    return new Response(JSON.stringify({ url: expectedWebhook,
      events: ['MESSAGES_UPSERT','CONNECTION_UPDATE','QRCODE_UPDATED','CONTACTS_UPSERT','SEND_MESSAGE'] }));
  },
}, 3);
assert.equal(typeof diagnosticHandler, 'function');
const diagnosticResponse = await diagnosticHandler(request('https://edge.invalid/webhook-diagnostic', { action: 'full-diagnostic' }));
const diagnosticResult = await diagnosticResponse.json();
assert.equal(diagnosticResponse.status, 200);
assert.equal(diagnosticResult.diagnostics.length, 2);
assert.equal(diagnosticResult.diagnostics[1].messageFlow.lastHour.incoming, 1);
assert.equal(diagnosticResult.diagnostics[1].messageFlow.flowHealth, 'healthy');
assert.equal(messageRows.filter(r => r.whatsapp_connection_id === 'conn-b').length, 0);
assert(messageQueries.every(q => q.filters.every(f => f.key !== 'whatsapp_connection_id')));
results.push({ id: 'P27', actualFixtureInboundByConnection: { a: 1, b: 0 },
  returnedFlows: diagnosticResult.diagnostics.map(d => ({ instance: d.instance, ...d.messageFlow })),
  outcome: 'Two connections receive identical global inbound count; the one with no messages is reported healthy. Provider status/configuration are explicit valid fixtures.' });

// P28: a complete report uses capped skipped rows as a global count.
const allRecipients = Array.from({ length: 2500 }, () => ({ status: 'skipped' }));
let returnedRecipients = 0;
const reportDb = {
  auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } }, error: null }),
    admin: { getUserById: () => { throw new Error('Fallback not expected'); } } },
  from(table) {
    let rows;
    if (table === 'talkx_campaigns') rows = [{ id: fixtureCampaign, name: 'fixture campaign', status: 'completed', total_recipients: 2500,
      sent_count: 0, delivered_count: 0, failed_count: 0, started_at: null, completed_at: null, created_by: 'fixture-profile' }];
    else if (table === 'profiles') rows = [{ id: 'fixture-profile', user_id: 'fixture-user', email: 'operator@example.invalid', name: 'fixture operator' }];
    else if (table === 'talkx_recipients') rows = allRecipients;
    else throw new Error(`Unexpected table ${table}`);
    let max = rows.length;
    const q = { select: () => q, eq: () => q, order: () => q, limit: n => { max = n; return q; },
      single: async () => ({ data: rows[0], error: null }),
      then: (resolve, reject) => {
        const data = rows.slice(0, max); if (table === 'talkx_recipients') returnedRecipients = data.length;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return q;
  },
};
let reportHandler;
let reportEmail;
evaluate('supabase/functions/talkx-report/index.ts', {
  ...baseScope(), ...emailFont, createClient: () => reportDb,
  Deno: { serve: fn => { reportHandler = fn; }, env: { get: () => 'fixture-not-secret' } },
  fetch: async (url, init) => { assert.equal(url, 'https://api.resend.com/emails'); reportEmail = JSON.parse(init.body); return new Response('{}'); },
}, 3);
const reportResponse = await reportHandler(request('https://edge.invalid/talkx-report', { campaignId: fixtureCampaign }, { Authorization: 'Bearer fixture-not-jwt' }));
assert.equal(reportResponse.status, 200);
assert.equal(returnedRecipients, 2000);
assert.match(reportEmail.html, /Pendentes<\/td><td[^>]*>500<\/td>/);
assert.equal(allRecipients.filter(r => r.status === 'pending').length, 0);
results.push({ id: 'P28', httpStatus: reportResponse.status, recipientTotal: allRecipients.length,
  returnedRecipients, actualPending: 0, reportedPending: 500,
  outcome: 'A completed campaign with 2500 skipped recipients is emailed with 500 pending because the handler loads only 2000 rows. No email was sent.' });

const output = { head: sourceVerification.actual_head, source_verification: sourceVerification,
  additional_sql_pin: { path: sqlPath, git_blob_sha: sqlBlob },
  actual_network_requests: 0, actual_database_requests: 0, actual_environment_reads: 0, source_changes: 0,
  method: 'Complete handlers after type/import wiring. Real HMAC helper and WebCrypto; manually controlled clock. Provider/JWT/DB/Resend are in-memory boundaries. P26 models a pinned SQL whitelist; it does not execute PostgreSQL.',
  source_hashes: Object.fromEntries([...reviewedPaths].map(p => [p, createHash('sha256').update(fs.readFileSync(path.join(source, p))).digest('hex')])),
  results };
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'final-endpoints-probe-results.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ passed: results.length, ids: results.map(r => r.id), network: 0, database: 0, environment: 0 }));
