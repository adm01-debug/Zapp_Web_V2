import assert from 'node:assert/strict';
import test from 'node:test';

import { verificarAlvo } from '../vercel/verify-release-targets.mjs';

const ESPERADO = 'a'.repeat(40);
const PUBLICADO = 'b'.repeat(40);
const V2 = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'x-robots-tag': 'noindex, nofollow',
};

function fetchV2(buildId) {
  return async (url) => {
    if (url.includes('/version.json')) {
      return new Response(JSON.stringify({ buildId }), { headers: { ...V2, 'content-type': 'application/json' } });
    }
    if (url.includes('/assets/')) return new Response('asset', { headers: { 'cache-control': 'public, immutable' } });
    return new Response('<script src="/assets/index.js"></script>', { headers: { ...V2, 'content-type': 'text/html' } });
  };
}

test('run atrasado: alias num sucessor do SHA esperado passa', async () => {
  const chamadas = [];
  const result = await verificarAlvo({
    target: 'v2', expectedSha: ESPERADO, fetchImpl: fetchV2(PUBLICADO),
    ancestralImpl: (a, d) => { chamadas.push([a, d]); return true; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.release, PUBLICADO);
  assert.deepEqual(chamadas, [[ESPERADO, PUBLICADO]]);
});

test('alias num commit que não descende do esperado continua falhando', async () => {
  const result = await verificarAlvo({
    target: 'v2', expectedSha: ESPERADO, fetchImpl: fetchV2(PUBLICADO), ancestralImpl: () => false,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /V2 ainda em bbbbbbbbbbbb; esperado aaaaaaaaaaaa/u);
});

test('alias igual ao esperado não consulta ancestralidade', async () => {
  const result = await verificarAlvo({
    target: 'v2', expectedSha: ESPERADO, fetchImpl: fetchV2(ESPERADO),
    ancestralImpl: () => { throw new Error('não deveria consultar'); },
  });
  assert.equal(result.ok, true);
});
