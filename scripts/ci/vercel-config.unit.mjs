// V156: Contrato do vercel.json.
// Compatível com `node --test scripts/ci/*.unit.mjs`.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VERCEL_JSON = fileURLToPath(new URL('../../vercel.json', import.meta.url));
const config = JSON.parse(readFileSync(VERCEL_JSON, 'utf8'));

test('vercel.json é JSON válido com $schema', () => {
  assert.ok(config.$schema, '$schema ausente');
});

test('installCommand mantém --frozen-lockfile --ignore-scripts', () => {
  assert.ok(config.installCommand?.includes('--frozen-lockfile'), '--frozen-lockfile ausente');
  assert.ok(config.installCommand?.includes('--ignore-scripts'), '--ignore-scripts ausente');
});

test('ignoreCommand aponta para ignore-build.sh', () => {
  assert.ok(config.ignoreCommand, 'ignoreCommand ausente');
  assert.ok(config.ignoreCommand.includes('ignore-build.sh'), 'deve apontar para ignore-build.sh');
});

test('rewrite /l/:slug aponta para banco oficial tnnnlkbymytvtqngbbqh', () => {
  const slug = config.rewrites?.find(r => r.source?.includes('/l/:slug'));
  assert.ok(slug, 'rewrite /l/:slug ausente');
  assert.ok(slug.destination.includes('tnnnlkbymytvtqngbbqh'), 'banco errado no rewrite de encurtador');
  assert.ok(!slug.destination.includes('uqysyzndkfiwfztbqvsl'), 'banco legado uqy no rewrite');
  assert.ok(!slug.destination.includes('vpkmqeumtxhrwgawxdrl'), 'banco legado vpk no rewrite');
});

test('rewrite SPA exclui assets/ e version.json', () => {
  const spa = config.rewrites?.find(r => r.destination === '/index.html');
  assert.ok(spa, 'rewrite SPA ausente');
  assert.ok(spa.source.includes('assets/'), 'SPA deve excluir assets/');
  assert.ok(spa.source.includes('version'), 'SPA deve excluir version.json');
});

test('headers de segurança globais presentes em /(.*)', () => {
  const globalBlock = config.headers?.find(h => h.source === '/(.*)'); 
  assert.ok(globalBlock, 'bloco de headers globais ausente');
  const keys = globalBlock.headers.map(h => h.key.toLowerCase());
  for (const k of ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'x-robots-tag']) {
    assert.ok(keys.includes(k), `header de segurança ausente: ${k}`);
  }
});

test('CSP connect-src contém banco oficial e não bancos legados', () => {
  const globalBlock = config.headers?.find(h => h.source === '/(.*)'); 
  const csp = globalBlock?.headers?.find(h => h.key.toLowerCase().includes('content-security-policy'));
  assert.ok(csp, 'CSP ausente nos headers globais');
  assert.ok(csp.value.includes('tnnnlkbymytvtqngbbqh'), 'banco oficial ausente da CSP');
  assert.ok(!csp.value.includes('uqysyzndkfiwfztbqvsl'), 'banco legado uqy na CSP');
  assert.ok(!csp.value.includes('vpkmqeumtxhrwgawxdrl'), 'banco legado vpk na CSP');
});

test('/assets/* tem Cache-Control com immutable', () => {
  const assets = config.headers?.find(h => h.source === '/assets/(.*)');
  assert.ok(assets, 'regra de cache de /assets/* ausente');
  const cc = assets.headers.find(h => h.key === 'Cache-Control');
  assert.ok(cc?.value.includes('immutable'), 'immutable ausente no cache de assets');
});

test('/version.json tem Cache-Control: no-store', () => {
  const version = config.headers?.find(h => h.source === '/version.json');
  assert.ok(version, 'regra de cache de /version.json ausente');
  const cc = version.headers.find(h => h.key === 'Cache-Control');
  assert.ok(cc?.value.includes('no-store'), 'no-store ausente no cache de version.json');
});

// V098: arquivos de config lidos pelo Vite estão no FRONT_PATHS do ignore-build.sh.
const IGNORE_SH = fileURLToPath(new URL('../../scripts/vercel/ignore-build.sh', import.meta.url));
const ignoreSh = readFileSync(IGNORE_SH, 'utf8');

test('ignore-build.sh cobre todos os arquivos de config do Vite', () => {
  for (const f of ['vite.config.ts', 'tailwind.config.ts', 'postcss.config.js', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'index.html']) {
    assert.ok(ignoreSh.includes(f), `${f} ausente no FRONT_PATHS de ignore-build.sh`);
  }
});

test('Cross-Origin-Opener-Policy é same-origin-allow-popups', () => {
  const globalBlock = config.headers?.find(h => h.source === '/(.*)' );
  const coop = globalBlock?.headers?.find(h => h.key === 'Cross-Origin-Opener-Policy');
  assert.ok(coop, 'Cross-Origin-Opener-Policy ausente nos headers globais');
  assert.equal(coop.value, 'same-origin-allow-popups');
});

test('Reporting-Endpoints define endpoint csp', () => {
  const globalBlock = config.headers?.find(h => h.source === '/(.*)' );
  const re = globalBlock?.headers?.find(h => h.key === 'Reporting-Endpoints');
  assert.ok(re, 'Reporting-Endpoints ausente nos headers globais');
  assert.ok(re.value.includes('csp='), 'Reporting-Endpoints não define endpoint csp');
});
