#!/usr/bin/env node
// V069: Valida que vars proibidas não estão presentes e que vars obrigatórias existem.
// Em CI: passa lista de vars reais via stdin JSON ou argumento --vars-file=<path>.
// Uso: echo '["VITE_A","VITE_B"]' | node scripts/ci/vercel-env-baseline.unit.mjs --target=production
//      node scripts/ci/vercel-env-baseline.unit.mjs --target=production --vars-file=vars.json

import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const BASELINE_PATH = new URL('../../scripts/ci/vercel-env-baseline.json', import.meta.url).pathname;
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    })
);

const target = args['target'] || 'production';
const targetConfig = baseline[target];
if (!targetConfig) {
  console.error(`Target "${target}" não encontrado no baseline.`);
  process.exit(2);
}

async function readVars() {
  if (args['vars-file']) {
    return JSON.parse(readFileSync(args['vars-file'], 'utf8'));
  }
  // Lê stdin se não for TTY.
  if (!process.stdin.isTTY) {
    const lines = [];
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) lines.push(line);
    return JSON.parse(lines.join(''));
  }
  // Modo self-test: retorna lista vazia (apenas testa parsing/lógica).
  console.log('Nenhuma lista de vars fornecida — executando auto-teste de lógica.\n');
  return null;
}

function check(actualVars) {
  if (actualVars === null) {
    console.log('✅  Baseline JSON parseado com sucesso.');
    console.log(`    Targets disponíveis: ${Object.keys(baseline).filter(k => !k.startsWith('_')).join(', ')}`);
    console.log(`    Target "${target}" — required: ${(targetConfig.required || []).length} | forbidden: ${((targetConfig.forbidden || []).concat(targetConfig.forbidden_nonvite || [])).length}`);
    return 0;
  }

  const actual = new Set(actualVars);
  const errors = [];
  const warnings = [];

  for (const k of (targetConfig.required || [])) {
    if (!actual.has(k)) errors.push(`FALTANDO obrigatória: ${k}`);
  }

  for (const k of (targetConfig.forbidden || [])) {
    if (actual.has(k)) errors.push(`PROIBIDA presente: ${k}`);
  }

  for (const k of (targetConfig.forbidden_nonvite || [])) {
    if (actual.has(k)) errors.push(`PROIBIDA (segurança) presente: ${k}`);
  }

  if (errors.length === 0) {
    console.log(`✅  Baseline OK para target="${target}" (${actual.size} vars verificadas).`);
  } else {
    for (const e of errors) console.error(`❌  ${e}`);
  }

  return errors.length > 0 ? 1 : 0;
}

const vars = await readVars();
process.exit(check(vars));
