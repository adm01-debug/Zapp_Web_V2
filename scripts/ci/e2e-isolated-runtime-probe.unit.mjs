import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as contract from '../e2e-isolated/runtime-contract.mjs';

// Execute the actual CLI body. Only network/files/clock/process observations are
// substituted; certificate trust is exercised separately by the native Node gate.
const source = readFileSync(new URL('../e2e-isolated/runtime-probe.mjs', import.meta.url), 'utf8').replace(/^import[^\n]+;\n/gm, '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const body = new AsyncFunction('readFileSync', 'assertLocalOrigin', 'assertLoopbackOnly', 'assertNoProxy',
  'assertOfficialHostIsLocal', 'currentNetworkNamespace', 'ORIGIN', 'fail', 'process', 'fetch', 'Date', 'setTimeout', 'AbortSignal', source);
const RUN = 'zapp-e2e-tls-readiness-0001', SHA = 'a'.repeat(40);
const identity = { schema: 1, run_id: RUN, source_sha: SHA, origin: contract.ORIGIN };
async function probe(patch = () => undefined) {
  let now = 0, requests = 0, output = '';
  const hits = [];
  const env = { API_URL: contract.ORIGIN, ZAPP_E2E_RUN_ID: RUN, GITHUB_SHA: SHA };
  const fetcher = async (url, options) => {
    assert.ok([contract.ORIGIN + '/__e2e/identity', 'http://127.0.0.1:9000/__e2e/ready'].includes(url));
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    const edge = url.includes(':9000/'); requests++; hits.push(edge ? 'edge' : 'gateway');
    const base = edge ? { ...identity, runtime: 'edge', ready: true } : identity;
    const replacement = patch({ edge, now, requests, base });
    return replacement ?? new Response(JSON.stringify(base), { status: 200 });
  };
  let error;
  try {
    await body(file => { assert.equal(file, '/etc/hosts'); return '127.0.0.1 ' + contract.OFFICIAL_HOST + '\n'; },
      contract.assertLocalOrigin, () => contract.assertLoopbackOnly({ lo: [{ address: '127.0.0.1', internal: true }] }),
      contract.assertNoProxy, contract.assertOfficialHostIsLocal, () => 'net:[1234]', contract.ORIGIN, contract.fail,
      { argv: ['node', 'runtime-probe.mjs', 'tls'], env, stdout: { write: text => { output += text; } } }, fetcher,
      class extends Date { static now() { return now; } }, callback => { now += 2_000; queueMicrotask(callback); }, AbortSignal);
  } catch (caught) { error = caught; }
  assert.ok(requests <= 120, 'readiness has a bounded deadline');
  return { error, output, requests, hits, now };
}
test('TLS boot callback accepts matching HTTPS gateway and temporary Edge identity', async () => {
  const result = await probe(); assert.equal(result.error, undefined); assert.equal(result.requests, 2);
  assert.deepEqual(JSON.parse(result.output), { ...identity, ready: true });
});
test('TLS boot callback retries real readiness observations before emitting proof', async () => {
  const result = await probe(({ now }) => now < 6_000 ? new Response(null, { status: 503 }) : undefined);
  assert.equal(result.error, undefined); assert.equal(result.now, 6_000); assert.equal(result.requests, 8);
});
for (const endpoint of ['gateway', 'edge']) for (const field of ['schema', 'run_id', 'source_sha', 'origin']) {
  test('TLS boot callback rejects mismatched ' + endpoint + ' ' + field + ' immediately', async () => {
    const result = await probe(({ edge, base }) => (edge ? 'edge' : 'gateway') === endpoint ? new Response(JSON.stringify({ ...base, [field]: 'foreign' })) : undefined);
    assert.match(result.error?.message ?? '', /tls-boot-identity/); assert.equal(result.now, 0); assert.equal(result.output, '');
  });
}
for (const [name, patch] of [
  ['gateway unavailable', ({ edge }) => !edge ? new Response(null, { status: 503 }) : undefined],
  ['Edge unavailable', ({ edge }) => edge ? new Response(null, { status: 503 }) : undefined],
  ['network/TLS failure', () => { throw new Error('synthetic transport rejection'); }],
  ['malformed gateway JSON', ({ edge }) => !edge ? new Response('invalid') : undefined],
  ['Edge ready false', ({ edge, base }) => edge ? new Response(JSON.stringify({ ...base, ready: false })) : undefined],
  ['Edge runtime absent', ({ edge, base }) => edge ? new Response(JSON.stringify({ ...base, runtime: undefined })) : undefined],
]) test('TLS boot callback times out closed: ' + name, async () => {
  const result = await probe(patch); assert.match(result.error?.message ?? '', /tls-boot-not-ready/);
  assert.equal(result.now, 120_000); assert.equal(result.output, '');
});
