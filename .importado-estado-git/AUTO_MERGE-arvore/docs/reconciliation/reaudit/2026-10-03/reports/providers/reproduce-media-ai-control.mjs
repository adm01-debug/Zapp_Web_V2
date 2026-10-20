// Offline, source-pinned provider audit. No real provider, DB, environment or secrets.
// Complete ai-proxy body runs after import wiring/type erasure. Zod/auth/DB are
// explicit valid-input/identity/data boundaries; actual routing and fetch adapters run.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { verifyProviderSource } from './verify-source.mjs';

const source = path.resolve(process.argv[2] || '/workspace/scratch/f8f9b9cbce53/reaudit/source');
const sourceVerification = verifyProviderSource(source, process.argv[3]);
const importSource = rel => import(pathToFileURL(path.join(source, rel)).href);
globalThis.fetch = () => { throw new Error('Network forbidden in audit probe'); };
globalThis.Deno = { env: { get: () => undefined } };
const adapter = await importSource('supabase/functions/_shared/messaging/evolution-go.ts');
const validation = await importSource('supabase/functions/_shared/validation.ts');
const routing = await importSource('supabase/functions/_shared/ai-routing.ts');
const capabilities = await importSource('supabase/functions/_shared/ai-capabilities.ts');
const providers = await importSource('supabase/functions/_shared/ai-providers.ts');
const results = [];

// P22: cancellation supplied to send cannot cancel the awaited presence call.
const controller = new AbortController();
let releasePresence;
const presencePending = new Promise(resolve => { releasePresence = resolve; });
const sends = [];
let settled = false;
const sending = adapter.send({ kind: 'text', to: '5511000000000', instanceId: 'fixture', text: 'fixture' }, {
  evolutionUrl: 'https://provider.invalid', evolutionKey: 'fixture-not-secret', signal: controller.signal,
  fetch: async (url, init) => {
    sends.push({ path: new URL(url).pathname, hasSignal: Boolean(init.signal), aborted: init.signal?.aborted ?? false });
    if (sends.length === 1) { await presencePending; return new Response('{}'); }
    if (init.signal?.aborted) throw new DOMException('fixture aborted', 'AbortError');
    return new Response(JSON.stringify({ key: { id: 'fixture-id' } }));
  },
}).then(value => { settled = true; return value; }, error => { settled = true; return error; });
await Promise.resolve();
controller.abort();
await Promise.resolve();
await Promise.resolve();
assert.equal(sends.length, 1);
assert.equal(sends[0].hasSignal, false);
assert.equal(settled, false);
results.push({ id: 'P22', beforeRelease: structuredClone(sends), settledAfterAbort: settled,
  outcome: 'Caller signal is aborted, but awaited presence has no signal and keeps send unresolved until manually released.' });
releasePresence();
const cancellation = await sending;
assert.equal(cancellation.name, 'AbortError');
assert.equal(sends[1].hasSignal, true);
assert.equal(sends[1].aborted, true);

// P23/P24: same valid identity, denied quota, valid provider. Only test differs.
const sourcePath = 'supabase/functions/ai-proxy/index.ts';
const input = fs.readFileSync(path.join(source, sourcePath), 'utf8');
const importPattern = /^import\s[\s\S]*?;\r?\n/gm;
assert.equal(input.match(importPattern)?.length, 8, 'Imports changed; review the boundary before executing');
const executable = stripTypeScriptTypes(input.replace(importPattern, ''));
const providerId = '11111111-1111-4111-8111-111111111111';
const provider = { id: providerId, name: 'fixture provider', provider_type: 'openai_compatible', api_endpoint: 'https://provider.invalid/chat', api_key_secret_name: 'FIXTURE_PROVIDER_KEY', model: 'fixture-model', system_prompt: 'fixture policy', config: {}, is_active: true, is_default: true, use_for: ['copilot'] };
const counters = { auth: 0, guard: 0, usage: 0, provider: 0, permissions: 0 };
let handler;
const client = {
  from(table) {
    assert.equal(table, 'ai_providers');
    const q = { select: () => q, eq: () => q, contains: () => q, order: () => q,
      then: (resolve, reject) => Promise.resolve({ data: [provider], error: null }).then(resolve, reject) };
    return q;
  },
  rpc() { counters.permissions++; throw new Error('No permission RPC expected in this source path'); },
};
const schema = new Proxy(() => schema, { get: () => schema });
const requestBody = { messages: [{ role: 'user', content: 'fixture custom request' }], provider_id: providerId, use_for: 'copilot', test: true, stream: false };
const fixtureEnv = new Map([['SUPABASE_URL', 'https://db.invalid'], ['SUPABASE_SERVICE_ROLE_KEY', 'fixture-service'], ['FIXTURE_PROVIDER_KEY', 'fixture-provider']]);
globalThis.fetch = async (url, init) => {
  assert.equal(url, provider.api_endpoint);
  counters.provider++;
  assert.equal(JSON.parse(init.body).messages[0].content, 'fixture custom request');
  return new Response(JSON.stringify({ choices: [{ message: { content: 'fixture generated result' } }], model: 'fixture-model', usage: { prompt_tokens: 20, completion_tokens: 10 } }), { headers: { 'content-type': 'application/json' } });
};
const scope = {
  ...validation, ...routing, ...capabilities, ...providers,
  Request, Response, console: { log() {}, warn() {}, error() {} },
  Deno: { env: { get: name => fixtureEnv.get(name) }, serve: fn => { handler = fn; } },
  z: schema, parseBody: (_schema, body) => ({ success: true, data: body }),
  validationErrorResponse: () => { throw new Error('Valid fixture only'); },
  requireAuth: async () => { counters.auth++; return { userId: 'fixture-user' }; },
  requireEnv: name => { assert(fixtureEnv.has(name)); return fixtureEnv.get(name); },
  enforceAiGuards: async () => { counters.guard++; return new Response('fixture quota denied', { status: 429 }); },
  extractUserIdFromRequest: () => 'fixture-user',
  logAiUsageDetached: async () => { counters.usage++; },
  extractTokenUsage: data => ({ inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens, model: data.model }),
  medirStream: () => { throw new Error('No stream in fixture'); },
  createClient: () => client,
  Logger: class { info() {} warn() {} error() {} done() {} },
};
runInNewContext(executable, scope);
assert.equal(typeof handler, 'function');
const request = body => new Request('https://edge.invalid/ai-proxy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const testResponse = await handler(request(requestBody));
const testData = await testResponse.json();
assert.equal(testResponse.status, 200);
assert.equal(testData.ok, true);
assert.equal(counters.guard, 0);
assert.equal(counters.provider, 1);
assert.equal(counters.permissions, 0);
assert.equal(counters.usage, 0);
results.push({ id: 'P23', httpStatus: testResponse.status, counters: structuredClone(counters), detail: testData.detail,
  outcome: 'test:true executes the provider adapter for a regular valid identity while skipping denied quota and usage logging.' });
const normalResponse = await handler(request({ ...requestBody, test: false }));
assert.equal(normalResponse.status, 429);
assert.equal(counters.guard, 1);
assert.equal(counters.provider, 1);
results.push({ id: 'P24', httpStatus: normalResponse.status, counters: structuredClone(counters),
  outcome: 'Positive control: same identity and request in normal mode is stopped by the quota before provider I/O.' });
globalThis.fetch = () => { throw new Error('Network forbidden in audit probe'); };
const paths = ['supabase/functions/_shared/messaging/evolution-go.ts', sourcePath];
const out = { head: sourceVerification.actual_head, source_verification: sourceVerification,
  actual_network_requests: 0, actual_database_requests: 0, actual_environment_reads: 0, source_changes: 0,
  method: 'Actual messaging adapter with manually released presence and aborted caller signal; complete ai-proxy handler after type/import wiring with real routing/capability/provider adapters. Zod, auth, DB, quota and usage are explicit fixture boundaries. No real JWT, quota, RLS, network or environment.',
  source_hashes: Object.fromEntries(paths.map(p => [p, createHash('sha256').update(fs.readFileSync(path.join(source, p))).digest('hex')])), results };
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'media-ai-control-probe-results.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ passed: results.length, ids: results.map(x => x.id), network: 0, database: 0, environment: 0 }));
