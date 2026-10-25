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
// R5: nenhum job que compõe os required checks deste workflow pode ter
// `if: always()` no nível do job. IDs reais: estes são os gates do CI; o job de
// mutação é informativo e continua fora da lista por `continue-on-error`.
// ---------------------------------------------------------------------------
const REQUIRED_JOBS = [
  'typecheck', 'unit-tests', 'node-scripts', 'build', 'security', 'e2e',
];

function workflowJobBlocks(source) {
  const lines = source.split(/\r?\n/);
  const jobsIndex = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line));
  if (jobsIndex === -1) return new Map();

  const jobs = new Map();
  let currentId = null;
  let currentLines = [];
  const save = () => {
    if (currentId !== null) jobs.set(currentId, currentLines.join('\n'));
  };

  for (let index = jobsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const jobHeader = /^ {2}([\w-]+):\s*(?:#.*)?$/.exec(line);
    if (jobHeader) {
      save();
      currentId = jobHeader[1];
      currentLines = [line];
      continue;
    }

    if (currentId !== null) currentLines.push(line);
  }
  save();
  return jobs;
}

const jobs = workflowJobBlocks(text);
const missingRequiredJobs = REQUIRED_JOBS.filter((jobId) => !jobs.has(jobId));
for (const jobId of missingRequiredJobs) {
  fail(`R5: required-check '${jobId}' não foi encontrado em ci.yml — atualize a lista de jobs protegidos`);
}

let requiredJobUsesAlways = false;
for (const jobId of REQUIRED_JOBS) {
  const block = jobs.get(jobId);
  if (block && /^ {4}if:\s*(?:\$\{\{\s*)?always\s*\(\s*\)/im.test(block)) {
    fail(`R5: job '${jobId}' em ci.yml usa always() no nível do job — usar !cancelled()`);
    requiredJobUsesAlways = true;
  }
}
if (missingRequiredJobs.length === 0 && !requiredJobUsesAlways) {
  pass('R5: nenhum required-check usa always() no nível do job');
}

// ---------------------------------------------------------------------------
// W46: upload-artifact para `dist` deve ter um `if:` guard
// ---------------------------------------------------------------------------
function workflowStepBlocks(source) {
  const lines = source.split(/\r?\n/);
  const blocks = [];

  for (let i = 0; i < lines.length; i += 1) {
    const stepsHeader = /^(\s*)steps:\s*(?:#.*)?$/.exec(lines[i]);
    if (!stepsHeader) continue;

    const stepsIndent = stepsHeader[1].length;
    let itemIndent = null;
    let block = null;
    const saveBlock = () => {
      if (block) blocks.push(block);
      block = null;
    };

    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (!line.trim() || /^\s*#/.test(line)) {
        if (block) block.push(line);
        continue;
      }

      const indent = line.length - line.trimStart().length;
      if (indent <= stepsIndent) break;

      const sequenceItem = /^(\s*)-\s+/.exec(line);
      if (!sequenceItem) {
        if (block) block.push(line);
        continue;
      }

      const sequenceIndent = sequenceItem[1].length;
      if (itemIndent === null) itemIndent = sequenceIndent;
      if (sequenceIndent === itemIndent) {
        saveBlock();
        block = [line];
      } else if (sequenceIndent > itemIndent && block) {
        // Lista aninhada dentro de um step (por exemplo, um valor de `with`).
        block.push(line);
      }
    }

    saveBlock();
  }

  return blocks;
}

function distArtifactStepHasIf(source) {
  let foundDistArtifact = false;

  for (const block of workflowStepBlocks(source)) {
    const item = /^(\s*)-\s+(.*)$/.exec(block[0]);
    if (!item) continue;

    const itemIndent = item[1].length;
    const fieldIndent = itemIndent + 2;
    let usesUploadArtifact = false;
    let hasDistNameInWith = false;
    let hasIf = false;
    let inWith = false;
    const distNameRe = new RegExp(`^ {${fieldIndent + 2}}name:\\s*(.*?)\\s*(?:#.*)?$`);

    for (let i = 0; i < block.length; i += 1) {
      const line = block[i];
      const firstLine = i === 0;
      const fieldMatch = firstLine
        ? /^\s*-\s+([\w-]+):\s*(.*)$/.exec(line)
        : new RegExp(`^ {${fieldIndent}}([\\w-]+):\\s*(.*)$`).exec(line);

      if (fieldMatch) {
        const key = fieldMatch[1];
        const value = fieldMatch[2].trim();
        inWith = key === 'with';
        if (key === 'uses' && /^actions\/upload-artifact(?:@|$)/.test(value)) {
          usesUploadArtifact = true;
        }
        if (key === 'if') hasIf = true;
        continue;
      }

      const nameMatch = inWith ? distNameRe.exec(line) : null;
      if (nameMatch) {
        const name = nameMatch[1];
        if (name === 'dist' || name === '"dist"' || name === "'dist'") {
          hasDistNameInWith = true;
        }
      }
    }

    if (usesUploadArtifact && hasDistNameInWith) {
      foundDistArtifact = true;
      if (!hasIf) return false;
    }
  }

  return foundDistArtifact ? true : null;
}

const distArtifactGuard = distArtifactStepHasIf(text);
if (distArtifactGuard !== null) {
  if (!distArtifactGuard) {
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
