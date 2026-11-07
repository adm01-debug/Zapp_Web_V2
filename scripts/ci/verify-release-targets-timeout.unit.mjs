import assert from 'node:assert/strict';
import test from 'node:test';

import { verificarAlvo } from '../vercel/verify-release-targets.mjs';

test('cada request do monitor de release tem timeout e termina como falha', async () => {
  const fetchImpl = async (_url, options) => new Promise((_resolve, reject) => {
    assert.ok(options.signal, 'fetch precisa receber AbortSignal');
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
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
