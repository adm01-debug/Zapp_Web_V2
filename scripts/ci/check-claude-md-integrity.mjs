#!/usr/bin/env node
/**
 * GA02: garante que o CLAUDE.md nao foi apagado ou esvaziado por outra sessao.
 * Verifica: arquivo existe, cabecalhos obrigatorios presentes, nao encolheu >30% vs HEAD.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const REQUIRED_SECTIONS = [
  '## 0. Onde se trabalha',
  '## 1. Banco de dados OFICIAL',
  '## 2. Evolution GO',
  '## 3. Repo e escrita',
];
const SHRINK_THRESHOLD = 0.30;

let content;
try {
  content = readFileSync('CLAUDE.md', 'utf8');
} catch {
  console.error('::error::CLAUDE.md nao encontrado. Outra sessao pode ter apagado o arquivo.');
  process.exitCode = 1;
  process.exit();
}

const missing = REQUIRED_SECTIONS.filter((s) => !content.includes(s));
if (missing.length > 0) {
  for (const s of missing) console.error(`::error::CLAUDE.md: secao obrigatoria ausente: ${s}`);
  process.exitCode = 1;
  process.exit();
}

let headContent;
try {
  headContent = execSync('git show HEAD:CLAUDE.md', { encoding: 'utf8' });
} catch {
  headContent = null;
}

if (headContent) {
  const ratio = content.length / headContent.length;
  if (ratio < (1 - SHRINK_THRESHOLD)) {
    console.error(`::error::CLAUDE.md encolheu ${Math.round((1 - ratio) * 100)}% vs HEAD (atual: ${content.length} bytes, HEAD: ${headContent.length} bytes). Possivel wipe por sessao paralela.`);
    process.exitCode = 1;
    process.exit();
  }
}

console.log(`CLAUDE.md OK: ${REQUIRED_SECTIONS.length} secoes presentes, ${content.length} bytes.`);
