import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { verificarAlvo } from '../vercel/verify-release-targets.mjs';

test('cada request do monitor de release tem timeout e termina como falha', async () => {
  // AbortSignal.timeout() usa timer.unref() internamente, então não mantém o event loop ativo.
  // O keepalive timer (ref'd) garante que o event loop não drena antes do AbortSignal disparar.
  const fetchImpl = async (_url, options) => new Promise((_resolve, reject) => {
    assert.ok(options.signal, 'fetch precisa receber AbortSignal');
    const keepalive = setTimeout(() => reject(new Error('keepalive guard: sinal não disparou')), 5_000);
    options.signal.addEventListener('abort', () => {
      clearTimeout(keepalive);
      reject(options.signal.reason);
    }, { once: true });
  });

  const result = await verificarAlvo({
    target: 'v2',
    expectedSha: 'a'.repeat(40),
    fetchImpl,
    requestTimeoutMs: 10,
    nowImpl: () => Date.parse('2026-11-06T12:00:00Z'),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /timeout|aborted|operation/iu);
});

const RELEASE = 'a'.repeat(40);
const NOW = Date.parse('2026-11-06T12:00:00Z');

function headers(target, stage) {
  if (stage === 'js' || stage === 'css') return { 'cache-control': 'public, immutable' };
  return {
    'content-type': stage === 'version' ? 'application/json' : 'text/html',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': target === 'v2' ? 'DENY' : 'SAMEORIGIN',
    ...(target === 'v2' ? { 'x-robots-tag': 'noindex, nofollow' } : {}),
  };
}

function body(target, stage) {
  if (stage === 'version') return JSON.stringify(target === 'v2' ? { buildId: RELEASE } : {
    gitSha: RELEASE, releaseId: RELEASE, builtAt: '2026-11-06T10:00:00Z',
    entry: 'assets/index.js', entryCss: 'assets/index.css',
  });
  return stage === 'root' ? '<script src="/assets/index.js"></script>' : 'asset';
}

async function settleWithin(promise, ms = 1000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('monitor não concluiu dentro do limite do teste')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function localMonitor({ target, stage: selected, condition, retry = false }) {
  let selectedRequests = 0;
  let closeAsset;
  const assetClosed = new Promise((resolve) => { closeAsset = resolve; });
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://local.invalid').pathname;
    const stage = pathname === '/version.json' ? 'version' : pathname === '/' ? 'root'
      : pathname.endsWith('.css') ? 'css' : 'js';
    const selectedRequest = stage === selected && (!retry || selectedRequests++ === 0);
    if (selectedRequest && condition === 'stalled-headers') return;
    res.writeHead(200, headers(target, stage));
    if (selectedRequest && condition !== 'healthy') {
      res.on('close', closeAsset);
      res.flushHeaders();
      if (condition === 'interrupted-body') {
        res.write(stage === 'version' ? '{' : '<');
        setImmediate(() => res.destroy());
      }
      return;
    }
    res.end(body(target, stage));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const check = verificarAlvo({
    target, expectedSha: target === 'v2' ? RELEASE : null,
    attempts: retry ? 2 : 1, requestTimeoutMs: 80, nowImpl: () => NOW,
    fetchImpl: (url, options) => fetch(`http://127.0.0.1:${address.port}${new URL(url).pathname}`, options),
  });
  try {
    const result = await settleWithin(check);
    if ((selected === 'js' || selected === 'css') && condition === 'stalled-body') {
      await settleWithin(assetClosed);
    }
    return result;
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await check;
  }
}

for (const target of ['v2', 'v3']) {
  for (const stage of target === 'v2' ? ['version', 'root', 'js'] : ['version', 'root', 'js', 'css']) {
    for (const condition of ['healthy', 'stalled-headers', 'stalled-body', 'interrupted-body']) {
      test(`monitor ${target} ${stage} ${condition} em HTTP real local`, async () => {
        const result = await localMonitor({ target, stage, condition });
        const asset = stage === 'js' || stage === 'css';
        const expectedOk = condition === 'healthy' || (asset && condition !== 'stalled-headers');
        assert.equal(result.ok, expectedOk, result.error);
        if (!expectedOk && condition.startsWith('stalled-')) {
          assert.match(result.error, /timed out|timeout/iu, 'deadline não pode ser mascarado como JSON inválido');
        }
      });
    }
  }
  for (const stage of ['version', 'root']) {
    test(`monitor ${target} recupera timeout do body ${stage} na segunda tentativa`, async () => {
      const result = await localMonitor({ target, stage, condition: 'stalled-body', retry: true });
      assert.equal(result.ok, true, result.error);
      assert.equal(result.attempt, 2);
    });
  }
}

for (const cancellation of ['pending', 'rejected', 'throws']) {
  test(`cancelamento ${cancellation} do asset não bloqueia nem altera aprovação`, async () => {
    let cancelled = 0;
    const result = await settleWithin(verificarAlvo({
      target: 'v2', expectedSha: RELEASE, nowImpl: () => NOW,
      fetchImpl: async (url) => {
        const pathname = new URL(url).pathname;
        const stage = pathname === '/version.json' ? 'version' : pathname === '/' ? 'root' : 'js';
        return {
          status: 200, headers: new Headers(headers('v2', stage)),
          async json() { return JSON.parse(body('v2', stage)); },
          async text() { return body('v2', stage); },
          ...(stage === 'js' ? { body: { cancel() {
            cancelled++;
            if (cancellation === 'throws') throw new Error('cancelamento falhou');
            return cancellation === 'pending' ? new Promise(() => {}) : Promise.reject(new Error('cancelamento falhou'));
          } } } : {}),
        };
      },
    }));
    assert.equal(result.ok, true, result.error);
    assert.equal(cancelled, 1);
  });
}

test('erro de header cancela body e conserva a falha original', async () => {
  let cancelled = 0;
  const result = await verificarAlvo({
    target: 'v2',
    fetchImpl: async () => ({
      status: 200, headers: new Headers({ 'content-type': 'application/json' }),
      body: { cancel() { cancelled++; return Promise.reject(new Error('erro secundário')); } },
    }),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /cache-control/);
  assert.equal(cancelled, 1);
});

test('JSON malformado conserva diagnóstico próprio quando não houve timeout', async () => {
  const result = await verificarAlvo({
    target: 'v2',
    fetchImpl: async () => new Response('{', { status: 200, headers: headers('v2', 'version') }),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /não é JSON válido/);
});
