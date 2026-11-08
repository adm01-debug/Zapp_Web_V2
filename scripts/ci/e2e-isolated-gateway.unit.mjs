import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { PassThrough, Readable } from 'node:stream';
import { createGateway, routeRequest } from '../e2e-isolated/gateway.mjs';
import { ORIGIN } from '../e2e-isolated/runtime-contract.mjs';
import { createTlsMaterial, readGatewayTls, TLS_PNG } from '../e2e-isolated/tls.mjs';

const RUN = 'zapp-e2e-gateway-native-node';
const SHA = 'a'.repeat(40);
const identity = { schema: 1, run_id: RUN, source_sha: SHA, origin: ORIGIN };
let temporary, material, tls, ca;
before(() => {
  temporary = mkdtempSync(path.join(tmpdir(), 'isolated-gateway-tls-test-'));
  material = createTlsMaterial({ directory: path.join(temporary, 'tls'), runId: RUN, sourceSha: SHA,
    command(program, args, options) { return program === 'certutil' ? { status: 0, stdout: '', stderr: '' } : spawnSync(program, args, options); } });
  ca = readFileSync(path.join(material.publicDirectory, 'ca.crt'));
  tls = readGatewayTls({ env: { ZAPP_E2E_RUN_ID: RUN, GITHUB_SHA: SHA },
    publicDirectory: material.publicDirectory, privateDirectory: material.privateDirectory,
    interfaces: { lo: [{ address: '127.0.0.1', internal: true }] } });
});
after(() => { if (temporary) rmSync(temporary, { recursive: true, force: true }); });
async function gateway(t, response = {}) {
  const forwarded = [];
  const server = createGateway(identity, { tls, request(options, callback) {
    forwarded.push(options);
    const request = new PassThrough();
    request.setTimeout = () => request;
    request.on('finish', () => {
      const incoming = Readable.from([Buffer.from(response.body ?? 'local upstream')]);
      incoming.statusCode = response.status ?? 200;
      incoming.headers = response.headers ?? { 'content-type': 'text/plain' };
      callback(incoming);
    });
    return request;
  } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const send = (url, { method = 'GET', host = '127.0.0.1:5173', trust = ca } = {}) => new Promise((resolve, reject) => {
    const request = https.request({ hostname: '127.0.0.1', port: server.address().port, path: url, method,
      ca: trust, servername: '', rejectUnauthorized: true, headers: { host, 'proxy-authorization': 'synthetic-proxy-header' } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks), headers: response.headers }));
    });
    request.on('error', reject); request.end();
  });
  return { send, forwarded };
}

test('gateway requires TLS material and the exact owned origin', () => {
  assert.throws(() => createGateway(identity), /gateway-tls-required/);
  assert.throws(() => createGateway({ ...identity, origin: 'http://127.0.0.1:5173' }, { tls }), /gateway-tls-required/);
});
test('actual Node HTTPS accepts only this run CA, without certificate bypass', async t => {
  const value = await gateway(t);
  assert.equal((await value.send('/__e2e/identity')).status, 200);
  await assert.rejects(value.send('/__e2e/identity', { trust: null }), error => ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(error.code));
});
for (const endpoint of ['/__e2e/identity', '/__e2e/preflight', '/__e2e/tls-probe', '/__e2e/tls-probe.png']) {
  test('gateway serves local TLS/admission endpoint without upstream: ' + endpoint, async t => {
    const value = await gateway(t);
    const response = await value.send(endpoint);
    assert.equal(response.status, 200); assert.equal(value.forwarded.length, 0);
    if (endpoint.endsWith('/identity')) assert.deepEqual(JSON.parse(response.body), identity);
    if (endpoint.endsWith('.png')) assert.deepEqual(response.body, TLS_PNG);
    if (endpoint.endsWith('/tls-probe')) assert.match(response.body.toString(), /src="\/__e2e\/tls-probe\.png"/);
    assert.equal((await value.send(endpoint, { method: 'POST' })).status, 405);
  });
}
for (const host of ['localhost:5173', '127.0.0.1:5174', 'tnnnlkbymytvtqngbbqh.supabase.co']) {
  test('gateway rejects foreign Host before serving identity: ' + host, async t => {
    const value = await gateway(t);
    assert.equal((await value.send('/__e2e/identity', { host })).status, 400);
    assert.equal(value.forwarded.length, 0);
  });
}
for (const [url, port, target] of [
  ['/auth/v1/token?grant_type=password', 9999, '/token?grant_type=password'],
  ['/rest/v1/rpc/consume_login_gate', 3000, '/rpc/consume_login_gate'],
  ['/storage/v1/object/sign/local/x', 5000, '/object/sign/local/x'],
  ['/realtime/v1/api/broadcast', 4000, '/api/broadcast'],
  ['/functions/v1/auth-login', 9000, '/auth-login'],
  ['/auth', 5174, '/auth'],
  ['/__e2e/catalog/product.png', 8081, '/catalog/product.png'],
]) test('HTTPS gateway forwards to the existing internal loopback service: ' + url, async t => {
  const value = await gateway(t);
  assert.equal((await value.send(url)).status, 200);
  assert.equal(value.forwarded.length, 1);
  const request = value.forwarded[0];
  assert.equal(request.hostname, '127.0.0.1'); assert.equal(request.port, port); assert.equal(request.path, target);
  assert.equal(request.headers['x-forwarded-proto'], 'https');
  assert.equal(request.headers['x-forwarded-host'], '127.0.0.1:5173');
  assert.equal(request.headers.host, port === 4000 ? 'realtime-dev.supabase-realtime' : '127.0.0.1:' + port);
  assert.equal(request.headers['proxy-authorization'], undefined);
});
test('catalog image allows GET/HEAD only and no prefix or query proxy', async t => {
  const value = await gateway(t);
  assert.equal((await value.send('/__e2e/catalog/product.png', { method: 'HEAD' })).status, 200);
  assert.equal((await value.send('/__e2e/catalog/product.png', { method: 'POST' })).status, 405);
  assert.equal(value.forwarded.length, 1);
  for (const url of ['/__e2e/catalog/product.png/other', '/__e2e/catalog/product.png?url=https://external.invalid', '/__e2e/catalog/other.png']) assert.equal(routeRequest(url).service, 'app');
});
for (const location of ['https://external.invalid/auth', 'http://127.0.0.1:5173/auth', '//external.invalid/auth']) {
  test('gateway rejects an upstream redirect out of its exact HTTPS origin: ' + location, async t => {
    const value = await gateway(t, { status: 302, headers: { location } });
    assert.equal((await value.send('/auth')).status, 502);
  });
}
test('gateway preserves relative redirects within the owned HTTPS origin', async t => {
  const value = await gateway(t, { status: 302, headers: { location: '/auth' } });
  const response = await value.send('/');
  assert.equal(response.status, 302); assert.equal(response.headers.location, '/auth');
});
