#!/usr/bin/env node
// GA10: garante que cada entrada em notifica-falha-main.yml.workflow_run.workflows
// corresponde exatamente ao campo `name:` de um arquivo em .github/workflows/.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const NOTIFICA = join(RAIZ, '.github/workflows/notifica-falha-main.yml');
const DIR_WORKFLOWS = join(RAIZ, '.github/workflows');

const conteudoNotifica = readFileSync(NOTIFICA, 'utf8');

// Extrai a lista de workflows do bloco `workflow_run: workflows: [...]`
const blocoMatch = conteudoNotifica.match(/workflow_run:\s*\n\s*workflows:\s*\[([\s\S]*?)\]/);
if (!blocoMatch) {
  process.stderr.write('::error::Não encontrado bloco workflow_run.workflows em notifica-falha-main.yml\n');
  process.exit(1);
}

const nomes = blocoMatch[1]
  .split('\n')
  .map((l) => l.trim().replace(/^-\s*/, '').replace(/^["']|["']$/g, ''))
  .filter(Boolean);

// Coleta todos os `name:` dos workflows
const arquivos = readdirSync(DIR_WORKFLOWS).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
const nomesReais = new Set();
for (const arquivo of arquivos) {
  const texto = readFileSync(join(DIR_WORKFLOWS, arquivo), 'utf8');
  const m = texto.match(/^name:\s*(.+)$/m);
  if (m) nomesReais.add(m[1].trim());
}

let falhou = false;
for (const nome of nomes) {
  if (!nomesReais.has(nome)) {
    process.stderr.write(`::error::notifica-falha-main.yml referencia "${nome}" mas nenhum workflow tem esse nome.\n`);
    falhou = true;
  }
}

if (falhou) process.exit(1);
process.stdout.write(`OK: todos os ${nomes.length} workflows referenciados no notifica-falha existem.\n`);
