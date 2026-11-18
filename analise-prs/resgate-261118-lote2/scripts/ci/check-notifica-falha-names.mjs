#!/usr/bin/env node
// GA10: verifica que todos os workflows listados em notifica-falha-main.yml
// existem como `name:` em .github/workflows/*.yml
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const WORKFLOWS_DIR = path.join(ROOT, '.github/workflows');

const arquivos = (await readdir(WORKFLOWS_DIR)).filter((f) => f.endsWith('.yml'));
const conteudos = {};
for (const f of arquivos) {
  conteudos[f] = await readFile(path.join(WORKFLOWS_DIR, f), 'utf8');
}

const nomesReais = new Set();
for (const [, txt] of Object.entries(conteudos)) {
  const m = /^name:\s+(.+?)\s*$/m.exec(txt);
  if (m) nomesReais.add(m[1]);
}

const notifica = conteudos['notifica-falha-main.yml'];
if (!notifica) {
  process.stderr.write('::error::notifica-falha-main.yml não encontrado\n');
  process.exit(1);
}

const linhas = notifica.split('\n');
let dentroWorkflows = false;
const nomesListados = [];
for (const linha of linhas) {
  if (/^\s{4}workflows:\s*$/.test(linha)) {
    dentroWorkflows = true;
    continue;
  }
  if (dentroWorkflows) {
    const m = /^\s{6}-\s+(.+?)\s*$/.exec(linha);
    if (m) {
      nomesListados.push(m[1]);
      continue;
    }
    if (/^\s{4}\S/.test(linha)) {
      dentroWorkflows = false;
    }
  }
}

if (nomesListados.length === 0) {
  process.stderr.write('::error::Nenhum nome de workflow encontrado em notifica-falha-main.yml\n');
  process.exit(1);
}

const ausentes = nomesListados.filter((n) => !nomesReais.has(n));
if (ausentes.length > 0) {
  process.stderr.write(
    `::error::notifica-falha-main.yml lista workflows inexistentes: ${ausentes.join(', ')}\n`,
  );
  process.exit(1);
}

console.log(
  `OK: todos os ${nomesListados.length} nomes do notifica-falha existem como name: em .github/workflows/*.yml`,
);
