// Read-only, source-pinned audit. Complete handlers, in-memory I/O only.
// No gateway, real environment, PostgreSQL, email or provider is contacted.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { verifyProviderSource } from './verify-source.mjs';

const source = path.resolve(process.argv[2] || '/workspace/scratch/f8f9b9cbce53/reaudit/source');
const manifestPath = process.argv[3] || path.join(path.dirname(source), 'source-integrity.json');
const sourceVerification = verifyProviderSource(source, manifestPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const additionalPaths = [
  'supabase/migrations/20251231115910_4da9c2d9-f6a8-4dc8-90ad-6efa0e1c9de0.sql',
  'supabase/migrations/20261002601230_searchbox_budget_alert_cron.sql',
  'supabase/migrations/20260930760000_searchbox_usage_daily.sql',
  'docs/mapa/USO_SEARCHBOX.md',
];
const additionalPins = additionalPaths.map(rel => {
  const entry = manifest.files.find(x => x.path === rel);
  assert(entry, `Missing additional pin ${rel}`);
  const bytes = fs.readFileSync(path.join(source, rel));
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(bytes.length, entry.bytes, `Size mismatch ${rel}`);
  assert.equal(blob, entry.git_blob_sha, `Blob mismatch ${rel}`);
  return { path: rel, git_blob_sha: blob, sha256: createHash('sha256').update(bytes).digest('hex') };
});
// All application and supporting SQL/document pins passed BEFORE evaluation.
globalThis.fetch = () => { throw new Error('Real network forbidden'); };
globalThis.Deno = { env: { get: () => undefined } };
const validation = await import(pathToFileURL(path.join(source, 'supabase/functions/_shared/validation.ts')).href);
const reviewedPaths = new Set(['supabase/functions/_shared/validation.ts', 'supabase/functions/_shared/schemas.ts', 'supabase/config.toml', ...additionalPaths]);
let clockMs = Date.UTC(2026, 9, 4, 12);
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clockMs])); }
  static now() { return clockMs; }
}
const quietConsole = { log() {}, info() {}, warn() {}, error() {} };
class QuietLogger { info() {} warn() {} error() {} done() {} }
const noNetwork = () => { throw new Error('Unspecified network boundary'); };
const clone = value => JSON.parse(JSON.stringify(value));

function evaluateHandler(rel, additions = {}, envValues = {}, importCount) {
  reviewedPaths.add(rel);
  const input = fs.readFileSync(path.join(source, rel), 'utf8');
  const imports = /^import\s[\s\S]*?;\r?\n/gm;
  assert.equal(input.match(imports)?.length, importCount, 'Re-review import boundary after change');
  let captured;
  const envGet = name => envValues[name];
  const scope = {
    ...validation, Request, Response, Headers, URL, Date: FixtureDate,
    TextEncoder, TextDecoder, Uint8Array, crypto: webcrypto,
    fetch: noNetwork, console: quietConsole, Logger: QuietLogger,
    requireEnv: name => { const v = envGet(name); if (!v) throw new Error(`Missing fixture ${name}`); return v; },
    Deno: { env: { get: envGet }, serve(handler) { captured = handler; } },
    // Zod is an explicit boundary: only already-valid fixture payloads enter.
    RateLimitAlertSchema: {},
    parseBody(_schema, value) {
      assert.equal(value.ip_address, '192.0.2.17');
      assert.equal(value.endpoint, '/fixture');
      assert.equal(value.request_count, 50);
      assert.equal(typeof value.blocked, 'boolean');
      return { success: true, data: value };
    },
    validationErrorResponse() { throw new Error('Invalid-input fixture was not part of these probes'); },
    unauthorizedResponse: headers => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 403, headers }),
    ...additions,
  };
  runInNewContext(stripTypeScriptTypes(input.replace(imports, '')), scope, { filename: rel });
  assert.equal(typeof captured, 'function');
  return captured;
}
const fixtureEnv = {
  SUPABASE_URL: 'https://database.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-only',
  INTERNAL_ALERT_SECRET: 'fixture-internal-only', CRON_SECRET: 'fixture-cron-only', RESEND_API_KEY: 'fixture-resend-only',
};
const validAlert = { ip_address: '192.0.2.17', endpoint: '/fixture', request_count: 50, blocked: true };
function request(body, headers = {}) {
  return new Request('https://edge.invalid/fixture', {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-user-admitted-by-gateway', ...headers },
  });
}

// A small PostgREST boundary, with errors and projections explicit. SQL is not run.
function databaseFixture(initial = {}, failures = {}) {
  const rows = { security_alerts: [], blocked_ips: [], notifications: [], rate_limit_logs: [],
    user_roles: [{ user_id: 'fixture-admin', role: 'admin' }], searchbox_usage_daily: [{ sessoes: 450, dia: '2026-10-04' }],
    ...clone(initial) };
  const calls = [];
  const client = {
    from(table) {
      assert(Object.hasOwn(rows, table), `Unspecified table ${table}`);
      let op = 'select', payload, conflict, columns = '*';
      const filters = [];
      const q = {
        insert(value) { op = 'insert'; payload = value; return q; },
        upsert(value, options) { op = 'upsert'; payload = value; conflict = options?.onConflict; return q; },
        delete() { op = 'delete'; return q; },
        select(value = '*') { columns = value; return q; },
        eq(key, value) { filters.push({ kind: 'eq', key, value }); return q; },
        lt(key, value) { filters.push({ kind: 'lt', key, value }); return q; },
        gte(key, value) { filters.push({ kind: 'gte', key, value }); return q; },
        then(resolve, reject) {
          try {
            calls.push(clone({ table, op, payload: payload ?? null, conflict: conflict ?? null, columns, filters }));
            if (failures[`${table}:${op}`]) return Promise.resolve({ data: null, error: { message: failures[`${table}:${op}`] } }).then(resolve, reject);
            const matches = row => filters.every(f => f.kind === 'eq' ? row[f.key] === f.value
              : f.kind === 'lt' ? row[f.key] != null && row[f.key] < f.value : row[f.key] >= f.value);
            let affected = rows[table].filter(matches);
            if (op === 'insert') {
              affected = clone(Array.isArray(payload) ? payload : [payload]);
              rows[table].push(...affected);
            } else if (op === 'upsert') {
              assert.equal(conflict, 'ip_address');
              const existing = rows[table].find(row => row.ip_address === payload.ip_address);
              if (existing) Object.assign(existing, clone(payload));
              else rows[table].push(clone(payload));
              affected = [rows[table].find(row => row.ip_address === payload.ip_address)];
            } else if (op === 'delete') rows[table] = rows[table].filter(row => !matches(row));
            const data = columns === '*' ? clone(affected) : affected.map(row => Object.fromEntries(columns.split(',').map(c => [c.trim(), row[c.trim()]])));
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          } catch (error) { return Promise.reject(error).then(resolve, reject); }
        },
      };
      return q;
    },
  };
  return { client, rows, calls };
}
const results = [];
const alertPath = 'supabase/functions/send-rate-limit-alert/index.ts';
const cleanupPath = 'supabase/functions/cleanup-rate-limit-logs/index.ts';

// P34: missing configured secret disables the entire application gate.
const noSecretDb = databaseFixture();
let clients = 0;
const ungated = evaluateHandler(alertPath, { createClient: () => { clients++; return noSecretDb.client; } },
  { ...fixtureEnv, INTERNAL_ALERT_SECRET: undefined }, 3);
const ungatedResponse = await ungated(request({ ...validAlert, blocked: false }));
assert.equal(ungatedResponse.status, 200);
assert.equal(clients, 1);
assert.equal(noSecretDb.rows.security_alerts.length, 1);
const guardedDb = databaseFixture();
let deniedClients = 0;
const guarded = evaluateHandler(alertPath, { createClient: () => { deniedClients++; return guardedDb.client; } }, fixtureEnv, 3);
const denied = await guarded(request(validAlert));
assert.equal(denied.status, 401);
assert.equal(deniedClients, 0);
results.push({ id: 'P34', noConfiguredSecret: ungatedResponse.status, configuredSecretMissingHeader: denied.status,
  forbiddenBoundaryCallsAfterRejection: deniedClients,
  outcome: 'Complete handler accepts admitted-user fixture with no INTERNAL_ALERT_SECRET; a configured secret rejects missing header before service client. Gateway and JWT were not executed.' });

// P35: legitimate alert downgrades a permanent decision; normal cleanup removes it.
const permanentDb = databaseFixture({ blocked_ips: [{ id: 'permanent-fixture', ip_address: validAlert.ip_address,
  reason: 'permanent admin fixture', is_permanent: true, expires_at: null }] });
const alert = evaluateHandler(alertPath, { createClient: () => permanentDb.client }, fixtureEnv, 3);
const legitimate = await alert(request(validAlert, { 'X-Internal-Secret': fixtureEnv.INTERNAL_ALERT_SECRET }));
assert.equal(legitimate.status, 200);
assert.equal(permanentDb.rows.blocked_ips[0].is_permanent, false);
assert.equal(permanentDb.rows.blocked_ips[0].expires_at, '2026-10-04T12:15:00.000Z');
const downgraded = clone(permanentDb.rows.blocked_ips[0]);
clockMs += 16 * 60 * 1000;
const cleanup = evaluateHandler(cleanupPath, { createClient: () => permanentDb.client }, fixtureEnv, 2);
const cleanupResponse = await cleanup(request({}));
assert.equal(cleanupResponse.status, 200);
assert.equal(permanentDb.rows.blocked_ips.length, 0);
results.push({ id: 'P35', alertStatus: legitimate.status, resultingPermanent: downgraded.is_permanent,
  expiresAt: downgraded.expires_at, cleanupStatus: cleanupResponse.status, remainingRowsAfter16Minutes: permanentDb.rows.blocked_ips.length,
  outcome: 'Valid internal alert replaces permanent block with 15-minute TTL; complete cleanup handler deletes the now-temporary expired row. Upsert and predicates are simulated from the pinned source; no live SQL or enforcement gate was tested.' });

// P36: failure after the alert insert is acknowledged as successfully blocked.
const failureDb = databaseFixture({}, { 'blocked_ips:upsert': 'fixture storage failure' });
const failureHandler = evaluateHandler(alertPath, { createClient: () => failureDb.client }, fixtureEnv, 3);
const failureResponse = await failureHandler(request(validAlert, { 'X-Internal-Secret': fixtureEnv.INTERNAL_ALERT_SECRET }));
const failureBody = await failureResponse.json();
assert.equal(failureResponse.status, 200);
assert.equal(failureBody.success, true);
assert.equal(failureDb.rows.blocked_ips.length, 0);
assert.match(failureDb.rows.security_alerts[0].description, /O IP foi bloqueado/);
assert.equal(failureDb.rows.notifications[0].metadata.blocked, true);
results.push({ id: 'P36', http: failureResponse.status, success: failureBody.success,
  persistedBlocks: failureDb.rows.blocked_ips.length, persistedAlerts: failureDb.rows.security_alerts.length,
  notificationClaimsBlocked: failureDb.rows.notifications[0].metadata.blocked,
  outcome: 'Complete handler receives a failed block UPSERT but leaves a high-severity blocked alert, creates an admin notification claiming blocking, and acknowledges success.' });

// P37: the monthly ledger belongs only to channel 1. Channel 2 repeats daily.
const cronSource = fs.readFileSync(path.join(source, additionalPaths[1]), 'utf8');
assert.match(cronSource, /SELECT public\.notify_searchbox_budget\(\);\s*SELECT net\.http_post\(/);
const docSource = fs.readFileSync(path.join(source, additionalPaths[3]), 'utf8');
assert(docSource.includes('**1 alerta por mês**'));
const budgetDb = databaseFixture({ notifications: [{ type: 'searchbox_budget_alert', metadata: { mes: '2026-10' } }] });
let emails = 0;
let providerStatus = 200;
const budgetHandler = evaluateHandler('supabase/functions/searchbox-budget-alert/index.ts', {
  createClient: () => budgetDb.client,
  fetch: async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(init.method, 'POST');
    emails++;
    return new Response('{}', { status: providerStatus });
  },
}, fixtureEnv, 3);
const budgetRequest = () => request({}, { 'x-cron-secret': fixtureEnv.CRON_SECRET });
clockMs = Date.UTC(2026, 9, 4, 12);
assert.equal((await budgetHandler(budgetRequest())).status, 200);
clockMs = Date.UTC(2026, 9, 5, 12);
assert.equal((await budgetHandler(budgetRequest())).status, 200);
assert.equal(emails, 2);
assert.equal(budgetDb.calls.some(c => c.table === 'notifications'), false);
const sentAcrossDays = emails;
providerStatus = 500;
const refused = await budgetHandler(budgetRequest());
assert.equal(refused.status, 502);
assert.equal((await refused.json()).enviado, false);
const beforeUnauthorized = emails;
const wrongSecret = await budgetHandler(request({}, { 'x-cron-secret': 'fixture-wrong' }));
assert.equal(wrongSecret.status, 403);
assert.equal(emails, beforeUnauthorized);
results.push({ id: 'P37', sameMonthSuccessfulEmailCalls: sentAcrossDays, monthlyNotificationPresent: true,
  ledgerReadByEdge: false, providerErrorResponse: refused.status, invalidSecretResponse: wrongSecret.status,
  outcome: 'Complete channel-2 handler sends on two cron dates in the same month although the channel-1 ledger exists; provider failure and invalid cron secret correctly fail. Email is intercepted, not delivered.' });

// P38: positive controls for the anonymous bounded CSP collector.
const cspLogs = [];
let rateAllowed = true;
class CSPLogger extends QuietLogger { warn(message, fields) { cspLogs.push({ message, fields }); } }
const csp = evaluateHandler('supabase/functions/csp-report/index.ts', {
  Logger: CSPLogger,
  enforceRateLimit: async () => ({ allowed: rateAllowed }),
}, {}, 1);
const legacy = await csp(request({ 'csp-report': { 'document-uri': 'https://example.invalid/path?q=fixture#fragment',
  'source-file': { unexpected: 'object' }, 'blocked-uri': 'https://other.invalid/source?token=fixture',
  'original-policy': 'x'.repeat(300), ignored: 'not allowlisted' } }));
assert.equal(legacy.status, 204);
assert.equal(cspLogs[0].fields['document-uri'], 'https://example.invalid/path');
assert.equal(cspLogs[0].fields['blocked-uri'], 'https://other.invalid/source');
assert.equal(cspLogs[0].fields['source-file'], undefined);
assert.equal(cspLogs[0].fields.ignored, undefined);
assert.equal(cspLogs[0].fields['original-policy'].length, 257);
cspLogs.length = 0;
const batch = await csp(request(Array.from({ length: 12 }, () => ({ type: 'csp-violation', body: {
  documentURL: 'https://example.invalid/batch?fixture', blockedURL: 'https://other.invalid/blocked#fixture', effectiveDirective: 'script-src',
} }))));
assert.equal(batch.status, 204);
assert.equal(cspLogs.length, 10);
assert.equal(cspLogs[0].fields['document-uri'], 'https://example.invalid/batch');
assert.equal(cspLogs[0].fields['effective-directive'], 'script-src');
let streamCancelled = false;
const stream = new ReadableStream({
  start(controller) { controller.enqueue(new Uint8Array(5000)); controller.enqueue(new Uint8Array(4000)); },
  cancel() { streamCancelled = true; },
});
const oversized = await csp(new Request('https://edge.invalid/csp', { method: 'POST', headers: { 'content-length': '1' }, body: stream, duplex: 'half' }));
assert.equal(oversized.status, 413);
assert.equal(streamCancelled, true);
assert.equal((await csp(new Request('https://edge.invalid/csp', { method: 'POST', body: '{' }))).status, 400);
assert.equal((await csp(new Request('https://edge.invalid/csp'))).status, 405);
rateAllowed = false;
assert.equal((await csp(request({ 'csp-report': {} }))).status, 429);
results.push({ id: 'P38', legacy: legacy.status, reportingApiBatch: batch.status, acceptedBatchCount: 10,
  actualStreamOverLimitDespiteFalseHeader: oversized.status, streamCancelled, malformed: 400, wrongMethod: 405, rateLimited: 429,
  outcome: 'Complete collector removes query/fragments from URL fields, skips objects/unlisted fields, limits batches to 10 and enforces actual bytes with stream cancellation. Rate limit result is simulated; no anonymous attack or live logging occurred.' });

const output = {
  head: sourceVerification.actual_head, source_verification: sourceVerification, additional_pins: additionalPins,
  actual_network_requests: 0, actual_database_requests: 0, actual_environment_reads: 0, source_changes: 0,
  method: 'Complete handler evaluation after reviewed import removal/type erasure; real response/CORS helpers and Web streams. Valid schema result, DB, env, logger, rate limiter, cron-auth response and Resend are explicit in-memory boundaries. SQL predicates/upsert are simulated, not executed. No product code changed.',
  source_hashes: Object.fromEntries([...reviewedPaths].map(rel => [rel, createHash('sha256').update(fs.readFileSync(path.join(source, rel))).digest('hex')])),
  results,
};
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'security-maintenance-probe-results.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ passed: results.length, ids: results.map(r => r.id), network: 0, database: 0, environment: 0 }));
