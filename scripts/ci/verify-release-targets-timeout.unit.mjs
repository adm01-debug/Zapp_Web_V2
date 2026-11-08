import assert from 'node:assert/strict';
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
