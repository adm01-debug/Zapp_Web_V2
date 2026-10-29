import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { smokeFunction } from './smoke-functions.mjs';

const _require = createRequire(import.meta.url);
const _originsConfig = _require('./allowed-origins.json');

// W61: origens canônicas lidas de allowed-origins.json
const CANONICAL_ORIGINS = _originsConfig.exact;
const ALLOWED_ORIGIN = CANONICAL_ORIGINS[0]; // zapp-web-v2.vercel.app
const ALLOWED_ORIGIN_2 = CANONICAL_ORIGINS[1]; // zappweb.app.br
const DENIED_ORIGIN = _originsConfig.denied_example ?? 'https://edge-smoke.invalid';

// Recorder que reflete qualquer origem da lista canônica
function secureFetchRecorder(allowedSet = new Set(CANONICAL_ORIGINS)) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const origin = init.headers.Origin;
    if (init.method === 'POST') return new Response('{}', { status: 401 });
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': allowedSet.has(origin) ? origin : ALLOWED_ORIGIN,
      },
    });
  };
  return { calls, fetchImpl };
}

function disabledPublicApiFetchRecorder(allowedSet = new Set(CANONICAL_ORIGINS)) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const origin = init.headers.Origin;
    if (init.method === 'POST') {
      return new Response('{"error":"Public API is disabled"}', { status: 410 });
    }
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': allowedSet.has(origin) ? origin : ALLOWED_ORIGIN,
      },
    });
  };
  return { calls, fetchImpl };
}

test('smokeFunction validates positive CORS, denied origin, and JWT gateway', async () => {
  const recorder = secureFetchRecorder();
  const result = await smokeFunction({
    fn: { name: 'secured', verify_jwt: true },
    baseUrl: 'https://project.supabase.co/functions/v1',
    retries: 1,
    fetchImpl: recorder.fetchImpl,
  });
  assert.equal(result.passed, true);
  assert.equal(result.checks.availability.allow_origin, ALLOWED_ORIGIN);
  assert.notEqual(result.checks.denied_origin.allow_origin, DENIED_ORIGIN);
  assert.deepEqual(result.checks.anonymous_gateway, { status: 401, passed: true });
  // W61: +1 call por origem canônica extra (2 origens × OPTIONS + denied OPTIONS + POST = 4)
  assert.equal(recorder.calls.length, 2 + CANONICAL_ORIGINS.length);
});

test('smokeFunction never POSTs to a public webhook', async () => {
  const recorder = secureFetchRecorder();
  const result = await smokeFunction({
    fn: { name: 'public-webhook', verify_jwt: false },
    baseUrl: 'https://project.supabase.co/functions/v1',
    retries: 1,
    fetchImpl: recorder.fetchImpl,
  });
  assert.equal(result.passed, true);
  assert.equal(result.checks.anonymous_gateway, null);
  // W61: N origens canônicas + denied = N+1 OPTIONS calls
  assert.equal(recorder.calls.length, 1 + CANONICAL_ORIGINS.length);
  assert.ok(recorder.calls.every((call) => call.init.method === 'OPTIONS'));
});

test('smokeFunction proves the public-api kill switch with a negative credential', async () => {
  const recorder = disabledPublicApiFetchRecorder();
  const result = await smokeFunction({
    fn: { name: 'public-api', verify_jwt: false },
    baseUrl: 'https://project.supabase.co/functions/v1',
    retries: 1,
    fetchImpl: recorder.fetchImpl,
  });
  assert.equal(result.passed, true);
  assert.deepEqual(result.checks.disabled_endpoint, { status: 410, passed: true });
  // W61: N origens + denied OPTIONS + POST = N+2 calls; POST está no último índice
  assert.equal(recorder.calls.length, 2 + CANONICAL_ORIGINS.length);
  assert.equal(recorder.calls[CANONICAL_ORIGINS.length + 1].init.headers['x-api-key'], 'invalid-smoke-credential');
});

test('smokeFunction proves internal auth for the public cron gateway', async () => {
  const recorder = secureFetchRecorder();
  const result = await smokeFunction({
    fn: { name: 'crm-integration', verify_jwt: false },
    baseUrl: 'https://project.supabase.co/functions/v1',
    retries: 1,
    fetchImpl: recorder.fetchImpl,
  });
  assert.equal(result.passed, true);
  assert.deepEqual(result.checks.anonymous_gateway, { status: 401, passed: true });
  // W61: N origens + denied OPTIONS + POST = N+2 calls
  assert.equal(recorder.calls.length, 2 + CANONICAL_ORIGINS.length);
});

test('smokeFunction fails closed when an endpoint returns wildcard CORS', async () => {
  const result = await smokeFunction({
    fn: { name: 'wildcard', verify_jwt: false },
    baseUrl: 'https://project.supabase.co/functions/v1',
    retries: 1,
    fetchImpl: async () => new Response(null, {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
  });
  assert.equal(result.passed, false);
  assert.equal(result.checks.denied_origin.passed, false);
});

// W61: cada origem canônica deve ser aceita no smoke
test('smokeFunction valida cada origem canônica (W61)', async () => {
  const recorder = secureFetchRecorder();
  const result = await smokeFunction({
    fn: { name: 'secured', verify_jwt: true },
    baseUrl: 'https://project.supabase.co/functions/v1',
    retries: 1,
    fetchImpl: recorder.fetchImpl,
  });
  assert.equal(result.passed, true, 'deve passar com todas as origens canônicas');
  assert.ok(result.checks.canonical_origins, 'deve incluir canonical_origins nos checks');
  for (const check of result.checks.canonical_origins) {
    assert.equal(check.passed, true, `origem ${check.origin} deve ser aceita`);
  }
  const origins = result.checks.canonical_origins.map((c) => c.origin);
  assert.ok(origins.includes(ALLOWED_ORIGIN), `deve incluir ${ALLOWED_ORIGIN}`);
  assert.ok(origins.includes(ALLOWED_ORIGIN_2), `deve incluir ${ALLOWED_ORIGIN_2}`);
});
