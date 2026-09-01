import assert from 'node:assert/strict';
import test from 'node:test';
import { smokeFunction } from './smoke-functions.mjs';

const ALLOWED_ORIGIN = 'https://zapp-web-v2.vercel.app';
const DENIED_ORIGIN = 'https://edge-smoke.invalid';

function secureFetchRecorder() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const origin = init.headers.Origin;
    if (init.method === 'POST') return new Response('{}', { status: 401 });
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
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
  assert.equal(recorder.calls.length, 3);
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
  assert.equal(recorder.calls.length, 2);
  assert.ok(recorder.calls.every((call) => call.init.method === 'OPTIONS'));
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
