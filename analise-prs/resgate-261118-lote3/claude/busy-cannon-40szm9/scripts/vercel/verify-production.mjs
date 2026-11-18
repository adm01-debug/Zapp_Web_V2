#!/usr/bin/env node
// V162: Smoke de pós-deploy do Vercel para ZAPP Web V2.
// Uso: node scripts/vercel/verify-production.mjs [--url=https://zappweb.app.br]
//      Retorna exit 0 se tudo OK, exit 1 em qualquer falha.
//
// O que verifica:
//   1. GET /version.json   → 200, JSON válido com campo buildId
//   2. GET /               → 200 (SPA carrega)
//   3. Headers de segurança presentes em todas as respostas
//   4. Cache-Control correto: /assets/* = immutable; / = no-store
//   5. X-Robots-Tag: noindex, nofollow
//   6. X-Frame-Options: DENY

import { fileURLToPath } from 'node:url';

const DEFAULT_URL = 'https://zappweb.app.br';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);

const BASE_URL = (args.url || process.env.SMOKE_BASE_URL || DEFAULT_URL).replace(/\/$/, '');

let failures = 0;

function ok(label) {
  console.log(`  ✅  ${label}`);
}

function fail(label, detail = '') {
  console.error(`  ❌  ${label}${detail ? `: ${detail}` : ''}`);
  failures++;
}

function checkSecurityHeaders(headers, path) {
  const required = [
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
    ['x-robots-tag', 'noindex, nofollow'],
    ['referrer-policy', 'strict-origin-when-cross-origin'],
  ];
  for (const [key, expected] of required) {
    const val = headers.get(key);
    if (!val) {
      fail(`${path} — header ausente: ${key}`);
    } else if (!val.toLowerCase().includes(expected.toLowerCase())) {
      fail(`${path} — ${key}: esperado "${expected}", obtido "${val}"`);
    }
  }
}

async function checkVersionJson() {
  console.log('\n[1] /version.json');
  try {
    const res = await fetch(`${BASE_URL}/version.json`);
    if (res.status !== 200) { fail('/version.json status', res.status); return; }
    const body = await res.json();
    if (typeof body.buildId !== 'string' || !body.buildId) {
      fail('/version.json campo buildId ausente ou inválido');
    } else {
      ok(`/version.json → buildId="${body.buildId}"`);
    }
    const cc = res.headers.get('cache-control') || '';
    if (cc.toLowerCase().includes('no-store')) {
      ok('/version.json Cache-Control: no-store ✓');
    } else {
      fail('/version.json Cache-Control deve conter no-store', cc);
    }
    checkSecurityHeaders(res.headers, '/version.json');
  } catch (e) {
    fail('/version.json fetch error', e.message);
  }
}

async function checkRoot() {
  console.log('\n[2] / (SPA root)');
  try {
    const res = await fetch(`${BASE_URL}/`);
    if (res.status !== 200) { fail('/ status', res.status); return; }
    ok(`/ → ${res.status}`);
    const cc = res.headers.get('cache-control') || '';
    if (cc.toLowerCase().includes('no-store')) {
      ok('/ Cache-Control: no-store ✓');
    } else {
      fail('/ Cache-Control deve conter no-store', cc);
    }
    checkSecurityHeaders(res.headers, '/');
  } catch (e) {
    fail('/ fetch error', e.message);
  }
}

async function checkAssetCaching() {
  console.log('\n[3] /assets/* cache imutável');
  try {
    const rootRes = await fetch(`${BASE_URL}/`);
    const html = await rootRes.text();
    const assetMatch = html.match(/\/assets\/[^"' >]+\.js/);
    if (!assetMatch) {
      ok('/assets/* — nenhum asset JS encontrado no HTML; pulando verificação de cache');
      return;
    }
    const assetPath = assetMatch[0];
    const res = await fetch(`${BASE_URL}${assetPath}`);
    if (res.status !== 200) { fail(`${assetPath} status`, res.status); return; }
    const cc = res.headers.get('cache-control') || '';
    if (cc.toLowerCase().includes('immutable')) {
      ok(`${assetPath} → Cache-Control: immutable ✓`);
    } else {
      fail(`${assetPath} Cache-Control deve conter immutable`, cc);
    }
  } catch (e) {
    fail('/assets/* fetch error', e.message);
  }
}

console.log(`\nSmoke de pós-deploy — ${BASE_URL}`);
console.log('─'.repeat(50));

await checkVersionJson();
await checkRoot();
await checkAssetCaching();

console.log('\n' + '─'.repeat(50));
if (failures === 0) {
  console.log('✅  Smoke OK — todos os checks passaram.');
  process.exit(0);
} else {
  console.error(`❌  Smoke FALHOU — ${failures} check(s) com erro.`);
  process.exit(1);
}
