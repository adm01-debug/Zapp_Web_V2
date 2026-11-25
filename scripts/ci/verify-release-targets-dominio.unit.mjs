import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs, validarVersao, verificarAlvo } from '../vercel/verify-release-targets.mjs';

const ESPERADO = 'a'.repeat(40);
const PUBLICADO = 'b'.repeat(40);

// Headers que o projeto V2 publica (vercel.json). A virada do dominio nao pode
// afrouxar a checagem nem herdar os headers do V3 (SAMEORIGIN, sem noindex).
const V2 = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'x-robots-tag': 'noindex, nofollow',
};

function fetchDominio(buildId, headers = V2) {
  return async (url) => {
    if (url.startsWith('https://zappweb.app.br/version.json')) {
      return new Response(JSON.stringify({ buildId }), { headers: { ...headers, 'content-type': 'application/json' } });
    }
    if (url.includes('/assets/')) return new Response('asset', { headers: { 'cache-control': 'public, immutable' } });
    if (url.startsWith('https://zappweb.app.br/')) {
      return new Response('<script src="/assets/index.js"></script>', { headers: { ...headers, 'content-type': 'text/html' } });
    }
    throw new Error(`url inesperada: ${url}`);
  };
}

test('dominio: aceita --target=dominio junto de --expected-sha', () => {
  const parsed = parseArgs(['--target=dominio', `--expected-sha=${ESPERADO}`]);
  assert.equal(parsed.target, 'dominio');
  assert.equal(parsed.expectedSha, ESPERADO);
});

test('dominio: build igual ao SHA esperado passa sem consultar ancestralidade', async () => {
  const result = await verificarAlvo({
    target: 'dominio',
    expectedSha: ESPERADO,
    fetchImpl: fetchDominio(ESPERADO),
    ancestralImpl: () => { throw new Error('nao deveria consultar git'); },
  });
  assert.equal(result.ok, true);
  assert.equal(result.release, ESPERADO);
  assert.equal(result.url, 'https://zappweb.app.br');
});

test('dominio: run atrasado aceita build sucessor do SHA esperado', async () => {
  const chamadas = [];
  const result = await verificarAlvo({
    target: 'dominio',
    expectedSha: ESPERADO,
    fetchImpl: fetchDominio(PUBLICADO),
    ancestralImpl: (a, d) => { chamadas.push([a, d]); return true; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.release, PUBLICADO);
  assert.deepEqual(chamadas, [[ESPERADO, PUBLICADO]]);
});

test('dominio: build que nao descende do SHA esperado falha', async () => {
  const result = await verificarAlvo({
    target: 'dominio',
    expectedSha: ESPERADO,
    fetchImpl: fetchDominio(PUBLICADO),
    ancestralImpl: () => false,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /V2 ainda em bbbbbbbbbbbb/u);
});

test('dominio: header de frame do V3 (SAMEORIGIN) e reprovado', async () => {
  const result = await verificarAlvo({
    target: 'dominio',
    expectedSha: ESPERADO,
    fetchImpl: fetchDominio(ESPERADO, { ...V2, 'x-frame-options': 'SAMEORIGIN' }),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /x-frame-options/u);
});

test('dominio: version.json sem no-store e reprovado', async () => {
  const result = await verificarAlvo({
    target: 'dominio',
    expectedSha: ESPERADO,
    fetchImpl: fetchDominio(ESPERADO, { ...V2, 'cache-control': 'public, max-age=60' }),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /cache-control/u);
});

test('dominio: version.json do V3 (sem buildId) e reprovado', () => {
  assert.throws(
    () => validarVersao('dominio', { gitSha: ESPERADO, releaseId: ESPERADO, builtAt: '2026-01-01T00:00:00Z' }),
    /buildId/u,
  );
});