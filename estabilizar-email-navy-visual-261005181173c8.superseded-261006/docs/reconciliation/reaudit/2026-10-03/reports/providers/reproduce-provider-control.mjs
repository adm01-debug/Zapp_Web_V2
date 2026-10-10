// Audit-only, offline. Unchanged application modules are imported. Only the two
// remote runtime dependencies are replaced: HTTP serve captures the handler and
// the Supabase factory supplies a deterministic authenticated caller boundary.
// No env, credentials, network, DB or source mutations occur in this script.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { verifyProviderSource } from './verify-source.mjs';

const source = path.resolve(process.argv[2] || '/workspace/scratch/f8f9b9cbce53/reaudit/source');
const sourceVerification = verifyProviderSource(source, process.argv[3]);
const fixtureEnv = {
  SUPABASE_URL: 'https://db.invalid',
  SUPABASE_ANON_KEY: 'fixture-public-marker',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-marker',
  EVOLUTION_API_URL: 'https://provider.invalid',
  EVOLUTION_API_KEY: 'fixture-provider-marker',
  EVOLUTION_INSTANCE_TOKEN: 'fixture-instance-marker',
  EVOLUTION_API_FLAVOR: 'go',
};
globalThis.Deno = { env: { get: k => fixtureEnv[k] } };
let authChecks = 0;
let rpcCalls = [];
let networkCaptures = [];
let fetchMode = 'success';
const fixtureDb = {
  auth: { getUser: async () => {
    authChecks++;
    return { data: { user: { id: 'regular-agent-fixture' } }, error: null };
  } },
  rpc: (name, args) => {
    rpcCalls.push({ name, args });
    return Promise.resolve({ data: false, error: null });
  },
  from: table => {
    const q = {};
    const result = { data: null, error: null };
    for (const method of ['select', 'update', 'eq', 'neq', 'delete', 'insert']) q[method] = () => q;
    q.maybeSingle = () => Promise.resolve(result);
    q.single = () => Promise.resolve(result);
    q.then = (r, j) => Promise.resolve(result).then(r, j);
    return q;
  },
};
globalThis.__providerAuditDb = fixtureDb;
globalThis.fetch = async (url, opts = {}) => {
  networkCaptures.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
  const fail = (fetchMode === 'privacy-get-fails' && !opts.method) || fetchMode === 'all-fail';
  return new Response(JSON.stringify(fail ? { message: 'synthetic unavailable' } : { success: true, data: {} }), {
    status: fail ? 503 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
const serveUrl = 'https://deno.land/std@0.168.0/http/server.ts';
const sdkUrl = 'https://esm.sh/@supabase/supabase-js@2.87.1';
const stub = s => `data:text/javascript,${encodeURIComponent(s)}`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === serveUrl) return { url: stub('export const serve = handler => { globalThis.__providerAuditHandler = handler; };'), shortCircuit: true };
    if (specifier === sdkUrl) return { url: stub('export const createClient = () => globalThis.__providerAuditDb;'), shortCircuit: true };
    return next(specifier, context);
  },
});
const logCapture = [];
const originalConsole = { log: console.log, error: console.error, warn: console.warn };
for (const method of Object.keys(originalConsole)) console[method] = (...args) => logCapture.push({ method, args });
await import(pathToFileURL(path.join(source, 'supabase/functions/evolution-api/index.ts')).href);
const handler = globalThis.__providerAuditHandler;
assert.equal(typeof handler, 'function');
async function request(body) {
  networkCaptures = [];
  rpcCalls = [];
  authChecks = 0;
  return handler(new Request('https://edge.invalid/functions/v1/evolution-api', {
    method: 'POST',
    headers: { Authorization: 'Bearer synthetic-caller-fixture', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}
const results = [];

// P11: admission at the auth boundary is valid; no admin/action/connection
// permission is granted by the fake client (every RPC would return false).
const webhookResult = await request({ action: 'set-webhook', instance: 'fixture-connection', url: 'https://recipient.invalid/webhook' });
assert.equal(webhookResult.status, 200);
assert.equal(authChecks, 1);
assert.equal(rpcCalls.length, 0);
assert.equal(networkCaptures.length, 1);
assert.equal(networkCaptures[0].url, 'https://provider.invalid/instance/connect');
results.push({ id: 'P11', authChecks, permissionChecks: rpcCalls.length, transport: networkCaptures, outcome: 'authenticated regular caller reaches provider webhook mutation without role/action/connection check' });

// P12: failed read, successful write. A partial privacy change fills every
// omitted privacy setting with `all` instead of retaining the provider value.
fetchMode = 'privacy-get-fails';
await request({ action: 'update-privacy', instance: 'fixture-connection', profile: 'contacts' });
assert.equal(networkCaptures.length, 2);
const privacyBody = networkCaptures[1].body;
assert.equal(privacyBody.profile, 'contacts');
assert.deepEqual(Object.values(privacyBody).filter(v => v === 'all').length, 6);
results.push({ id: 'P12', transport: networkCaptures, outcome: 'failed privacy GET defaults all six unspecified settings to all' });

// P13: v2 mode does not influence the status action; this is a local route
// mismatch, not a claim about the behavior of a deployed v2 provider.
fixtureEnv.EVOLUTION_API_FLAVOR = 'v2';
fetchMode = 'all-fail';
await request({ action: 'status', instance: 'fixture-connection' });
assert.equal(networkCaptures[0].url, 'https://provider.invalid/instance/status');
results.push({ id: 'P13', mode: 'v2', transport: networkCaptures, outcome: 'status still uses GO route without instance suffix in v2 mode' });

// P14: execute the exact versioned heartbeat statement with a lazy RPC
// thenable. This tests JS consumption of the builder, not a live SDK package.
const workerPath = 'supabase/functions/multiplix-send/index.ts';
const worker = fs.readFileSync(path.join(source, workerPath), 'utf8');
const first = worker.indexOf('heartbeatTimer = setInterval(() => {');
const last = worker.indexOf('}, 30_000);', first) + '}, 30_000);'.length;
assert(first > 0 && last > first);
const heartbeatStatement = worker.slice(first, last);
let callback;
let buildersCreated = 0;
let queriesConsumed = 0;
runInNewContext(heartbeatStatement, {
  heartbeatTimer: undefined,
  setInterval: fn => { callback = fn; return 1; },
  supabase: { rpc: () => { buildersCreated++; return { then: r => { queriesConsumed++; return Promise.resolve({ data: true, error: null }).then(r); } }; } },
  item: { item_id: 'fixture-item' },
  claim: { claim_token: 'fixture-claim' },
});
callback();
assert.equal(buildersCreated, 1);
assert.equal(queriesConsumed, 0);
results.push({ id: 'P14', buildersCreated, queriesConsumed, exact_statement: { path: workerPath, line_start: 520, line_end: 526 }, outcome: 'heartbeat discards lazy RPC builder; no execution occurs' });

// P15: exact pickVariant export. Identical IDs and weights in a different
// PostgREST row order assign the same recipient to a different variant.
const { pickVariant } = await import(pathToFileURL(path.join(source, 'supabase/functions/talkx-send/process-recipient.ts')).href);
const variantRows = [
  { id: 'A', content: 'A', media_url: null, media_type: null, weight: 1 },
  { id: 'B', content: 'B', media_url: null, media_type: null, weight: 1 },
];
const variantDb = rows => ({ from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }) }) });
const firstVariant = await pickVariant(variantDb(variantRows), 'fixture-template', 'fixture-recipient');
const reorderedVariant = await pickVariant(variantDb([...variantRows].reverse()), 'fixture-template', 'fixture-recipient');
assert.notEqual(firstVariant.id, reorderedVariant.id);
results.push({ id: 'P15', first: firstVariant.id, reordered: reorderedVariant.id, outcome: 'variant assignment changes with row order despite identical recipient, IDs and weights' });

for (const method of Object.keys(originalConsole)) console[method] = originalConsole[method];
const files = ['supabase/functions/evolution-api/index.ts', 'supabase/functions/_shared/evolution-api-proxy.ts', 'supabase/functions/_shared/evolution-go-routes.ts', workerPath, 'supabase/functions/talkx-send/process-recipient.ts'];
const output = {
  head: 'da307ba5626dce892f0b37cb6762463f55d14a96',
  source_verification: sourceVerification,
  actual_network_requests: 0, actual_database_requests: 0, actual_environment_reads: 0, source_changes: 0,
  method: 'Direct imports of unchanged application modules with only external serve/client stubs; synthetic auth boundary. P14 executes exact extracted statement against a lazy thenable.',
  source_hashes: Object.fromEntries(files.map(p => [p, createHash('sha256').update(fs.readFileSync(path.join(source, p))).digest('hex')])),
  results,
};
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'provider-control-probe-results.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ passed: results.length, ids: results.map(r => r.id), network: 0, database: 0, sourceChanges: 0 }));
