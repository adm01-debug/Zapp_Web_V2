#!/usr/bin/env node
/**
 * scripts/db-tests/run-all.mjs
 * Suite de regressao de banco — Fase 4 do plano de 50 etapas
 * Uso: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/db-tests/run-all.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_KEY');
  process.exit(1);
}

async function execSQL(sql) {
  const res = await fetch(`${url}/rest/v1/rpc/mcp_exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SQL failed: ${err}`);
  }
  return res.json();
}

const files = (await readdir(__dir))
  .filter(f => f.endsWith('.sql') && f !== 'run-all.mjs')
  .sort();

let totalPass = 0;
let totalFail = 0;
const results = {};

for (const file of files) {
  const sql = await readFile(join(__dir, file), 'utf8');
  const assertions = sql.match(/-- ASSERT: .+/g) || [];
  console.log(`\n▶ ${file} (${assertions.length} asserts)`);
  try {
    const rows = await execSQL(sql);
    const failed = rows.filter(r => r.result === 'FAIL');
    const passed = rows.filter(r => r.result === 'PASS');
    totalPass += passed.length;
    totalFail += failed.length;
    results[file] = { pass: passed.length, fail: failed.length, rows };
    passed.forEach(r => console.log(`  ✓ ${r.test}`));
    failed.forEach(r => console.error(`  ✗ ${r.test}: ${r.detail}`));
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
    results[file] = { error: e.message };
    totalFail++;
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`RESULTADO: ${totalPass} PASS / ${totalFail} FAIL`);
if (totalFail > 0) process.exit(1);
