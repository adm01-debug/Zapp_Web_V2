#!/usr/bin/env node
/**
 * scripts/ci/workflow-invariants.mjs — invariantes estáticos R3 e R5
 *
 * R3: bun run test:coverage deve aparecer em no máximo 1 job do ci.yml
 *     (evita rodar a suíte de cobertura duas vezes em paralelo).
 *
 * R5: nenhum job de required-check pode ter `if: always()` no nível do job —
 *     usar `!cancelled()` em vez disso. Um run cancelado com `if: always()` pinta
 *     o check de vermelho e bloqueia o merge, mesmo que o código esteja correto.
 *
 * W46: upload-artifact para `dist` deve ter um `if:` guard (não pode subir
 *      incondicionalmente em todo run).
 *
 * Uso: node scripts/ci/workflow-invariants.mjs
 * Saída: 0 = tudo OK, 1 = violação encontrada
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CI_YML = resolve('.github/workflows/ci.yml');

let violations = 0;
const fail = (msg) => { process.stderr.write(`❌ ${msg}\n`); violations++; };
const pass = (msg) => process.stdout.write(`✅ ${msg}\n`);

let text;
try {
  text = readFileSync(CI_YML, 'utf8');
} catch (err) {
  fail(`Não foi possível ler ${CI_YML}: ${err.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// R3: test:coverage deve aparecer em no máximo 1 job
// ---------------------------------------------------------------------------
const coverageMatches = [...text.matchAll(/bun run test:coverage/g)];
if (coverageMatches.length > 1) {
  fail(`R3: 'bun run test:coverage' aparece ${coverageMatches.length} vezes em ci.yml — deve aparecer em no máximo 1 job`);
} else {
  pass('R3: test:coverage não duplicado');
}

// ---------------------------------------------------------------------------
// R5: nenhum job de required-check pode ter `if: always()` no nível do job.
// Um job-level `if:` fica recuado com exatamente 4 espaços (nível 2 no YAML
// de workflow). A regex captura o padrão específico de job + if: always().
// ---------------------------------------------------------------------------
const REQUIRED_JOBS = [
  'lint-and-typecheck', 'test', 'build', 'security', 'e2e',
];

for (const jobId of REQUIRED_JOBS) {
  // Padrão: `  <jobId>:` seguido de qualquer coisa e depois `    if: always()`
  // dentro do mesmo bloco (antes do próximo job de nível 2).
  const jobBlockRe = new RegExp(
    `^  ${jobId}:\n([\\s\\S]*?)(?=^  [\\w-]+:|\\z)`,
    'm',
  );
  const match = text.match(jobBlockRe);
  if (match && /^    if:\s+always\s*\(\)/m.test(match[1] ?? '')) {
    fail(`R5: job '${jobId}' em ci.yml usa always() no nível do job — usar !cancelled()`);
  }
}
pass('R5: nenhum required-check usa always() no nível do job');

// ---------------------------------------------------------------------------
// W46: upload-artifact para `dist` deve ter um `if:` guard
// ---------------------------------------------------------------------------
const distArtifactRe = /upload-artifact[\s\S]{0,600}?name:\s+dist\b/;
const distBlock = text.match(distArtifactRe);
if (distBlock) {
  // Verifica se há um `if:` antes do `uses: actions/upload-artifact` deste bloco.
  // O `if:` no YAML de step fica na mesma indentação do `uses:`.
  const blockText = distBlock[0];
  if (!/^\s+if:/m.test(blockText)) {
    fail('W46: upload-artifact para dist não tem `if:` guard — subiria em todo run');
  } else {
    pass('W46: dist artifact tem if: guard');
  }
} else {
  pass('W46: nenhum upload-artifact para dist encontrado (ok se removido)');
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------
if (violations > 0) {
  process.stderr.write(`\n${violations} violação(ões) de invariante encontrada(s).\n`);
  process.exit(1);
}
process.stdout.write('\nTodos os invariantes de workflow OK.\n');
