#!/usr/bin/env node
// GA02: proteção anti-substituição do CLAUDE.md
// Verifica que o CLAUDE.md contém as seções obrigatórias e não encolheu >30%.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md');

const SECOES_OBRIGATORIAS = [
  'Banco de dados OFICIAL',
  'Perímetro do GitHub',
  'CI sem desperdício',
];

const conteudo = await readFile(CLAUDE_MD, 'utf8');
const erros = [];

for (const secao of SECOES_OBRIGATORIAS) {
  if (!conteudo.includes(secao)) {
    erros.push(`Seção obrigatória ausente: "${secao}"`);
  }
}

const baseSha = process.env.GITHUB_BASE_SHA;
if (baseSha) {
  try {
    const conteudoBase = execSync(`git show ${baseSha}:CLAUDE.md`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const tamanhoAtual = Buffer.byteLength(conteudo, 'utf8');
    const tamanhoBase = Buffer.byteLength(conteudoBase, 'utf8');
    if (tamanhoBase > 0) {
      const reducao = (tamanhoBase - tamanhoAtual) / tamanhoBase;
      if (reducao > 0.3) {
        erros.push(
          `CLAUDE.md encolheu ${Math.round(reducao * 100)}% vs commit base (limite: 30%)`,
        );
      }
    }
  } catch {
    // base SHA não disponível ou CLAUDE.md não existia — não falhar
  }
}

if (erros.length > 0) {
  for (const e of erros) {
    process.stderr.write(`::error::${e}\n`);
  }
  process.exit(1);
}

console.log(`OK: CLAUDE.md contém as ${SECOES_OBRIGATORIAS.length} seções obrigatórias`);
