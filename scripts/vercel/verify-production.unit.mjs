import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

const SCRIPT = new URL('./verify-production.mjs', import.meta.url).pathname;
const SHA = 'a'.repeat(40);
const HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

async function executar(handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const child = spawn(process.execPath, [SCRIPT, `--url=http://127.0.0.1:${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const [code] = await once(child, 'close');
  server.close();
  await once(server, 'close');
  return { code, output: stdout + stderr };
}

function responder(res, status, headers, body) {
  res.writeHead(status, { ...HEADERS, ...headers });
  res.end(body);
}

test('recusa buildId que nao seja SHA completo e SPA sem bundle JavaScript', async () => {
  const result = await executar((req, res) => {
    if (req.url === '/version.json') {
      responder(res, 200, { 'content-type': 'application/json' }, JSON.stringify({ buildId: 'not-a-sha' }));
      return;
    }
    responder(res, 200, { 'content-type': 'text/html' }, '<!doctype html><title>sem bundle</title>');
  });
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /esperado SHA completo/u);
  assert.match(result.output, /SPA sem asset JavaScript/u);
});

test('aprova SHA completo, SPA com entry JS e cache imutavel', async () => {
  const result = await executar((req, res) => {
    if (req.url === '/version.json') {
      responder(res, 200, { 'content-type': 'application/json' }, JSON.stringify({ buildId: SHA }));
      return;
    }
    if (req.url === '/assets/app.js') {
      responder(res, 200, { 'content-type': 'text/javascript', 'cache-control': 'public, immutable' }, '');
      return;
    }
    responder(res, 200, { 'content-type': 'text/html' }, '<script type="module" src="/assets/app.js"></script>');
  });
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /Smoke OK/u);
});
