#!/usr/bin/env node
// GA31: verifica que todas as variaveis de ambiente usadas pelas edge functions
// estao declaradas no baseline. Falha com ::error:: se houver var nao declarada.
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const AQUI = new URL('.', import.meta.url).pathname;
const RAIZ = join(AQUI, '../..');
const BASELINE_PATH = join(AQUI, 'edge-env-baseline.json');
const FUNCTIONS_DIR = join(RAIZ, 'supabase/functions');

function walkTs(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTs(full));
    } else if (entry.isFile() && extname(entry.name) === '.ts' && !entry.name.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}

function extractEnvVars(source) {
  const pattern = /Deno\.env\.get\(['"]([^'"]+)['"]\)/g;
  const vars = new Set();
  let m;
  while ((m = pattern.exec(source)) !== null) {
    vars.add(m[1]);
  }
  return vars;
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const declared = new Set(baseline.declared ?? []);
const files = walkTs(FUNCTIONS_DIR);
const used = new Set();
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const v of extractEnvVars(src)) {
    used.add(v);
  }
}
const undeclared = [...used].filter((v) => !declared.has(v)).sort();
if (undeclared.length > 0) {
  console.error(`::error::Variaveis de ambiente novas em supabase/functions/ sem declaracao no baseline:`);
  for (const v of undeclared) {
    console.error(`  - ${v}`);
  }
  console.error(`Adicione-as em scripts/ci/edge-env-baseline.json na lista "declared".`);
  process.exit(1);
}
console.log(`[check-edge-envs] OK — ${used.size} variaveis usadas, todas declaradas no baseline (${declared.size} declaradas).`);
