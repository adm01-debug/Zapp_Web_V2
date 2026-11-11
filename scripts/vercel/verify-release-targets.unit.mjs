import assert from 'node:assert/strict';
import test from 'node:test';

import { principal } from './verify-release-targets.mjs';

function fetchSaudavelV2(sha) {
  return async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/version.json') {
      return {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'x-frame-options': 'DENY',
          'x-robots-tag': 'noindex, nofollow',
        }),
        async json() { return { buildId: sha }; },
      };
    }
    if (parsed.pathname === '/') {
      return {
        status: 200,
        headers: new Headers({
          'content-type': 'text/html',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'x-frame-options': 'DENY',
          'x-robots-tag': 'noindex, nofollow',
        }),
        async text() { return '<script type="module" src="/assets/index-v2.js"></script>'; },
      };
    }
    return {
      status: 200,
      headers: new Headers({ 'cache-control': 'public, immutable' }),
      async text() { return 'js'; },
    };
  };
}

// R2-WOP-001: GITHUB_STEP_SUMMARY apontando para um caminho sem permissão de
// escrita (ex.: um diretório em vez de arquivo) nao pode derrubar o processo com
// stack trace crua -- a falha de step summary e cosmetica, nao o resultado real
// da verificacao.
test('principal() não lança e preserva o exitCode quando GITHUB_STEP_SUMMARY é inválido', async () => {
  const sha = 'a'.repeat(40);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchSaudavelV2(sha);
  try {
    const exitCode = await principal(
      ['--target=v2', `--expected-sha=${sha}`],
      { GITHUB_STEP_SUMMARY: '/' },
    );
    assert.equal(exitCode, 0, 'deve retornar o exitCode da verificação, não lançar');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('principal() segue funcionando normalmente sem GITHUB_STEP_SUMMARY', async () => {
  const sha = 'a'.repeat(40);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchSaudavelV2(sha);
  try {
    const exitCode = await principal(['--target=v2', `--expected-sha=${sha}`], {});
    assert.equal(exitCode, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
