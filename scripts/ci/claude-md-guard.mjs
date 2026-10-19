#!/usr/bin/env node
// GA02: garante que CLAUDE.md mantém as seções críticas e não encolheu >30% numa PR.
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ARQUIVO = 'CLAUDE.md';
const SECOES_OBRIGATORIAS = [
  'Banco de dados OFICIAL',
  'Perímetro do GitHub',
];

if (!existsSync(ARQUIVO)) {
  process.stderr.write(`::error::${ARQUIVO} foi apagado ou não existe.\n`);
  process.exit(1);
}

const conteudo = readFileSync(ARQUIVO, 'utf8');
let falhou = false;

for (const secao of SECOES_OBRIGATORIAS) {
  if (!conteudo.includes(secao)) {
    process.stderr.write(`::error::${ARQUIVO} perdeu a seção obrigatória: "${secao}"\n`);
    falhou = true;
  }
}

// Em PR: comparar tamanho com a base para detectar truncamento acidental
const baseSha = process.env.GITHUB_BASE_SHA
  || (process.env.GITHUB_EVENT_NAME === 'pull_request' ? process.env.GITHUB_SHA + '^' : null);
if (baseSha) {
  try {
    const baseConteudo = execSync(`git show "${baseSha}:${ARQUIVO}" 2>/dev/null`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const baseLen = baseConteudo.length;
    const curLen = conteudo.length;
    if (baseLen > 500 && curLen < baseLen * 0.7) {
      process.stderr.write(
        `::error::${ARQUIVO} encolheu mais de 30% nesta PR (${baseLen} → ${curLen} bytes). ` +
        'Confirme que nenhuma seção crítica foi apagada acidentalmente.\n',
      );
      falhou = true;
    }
  } catch {
    // SHA da base indisponível — apenas verifica seções
  }
}

if (falhou) process.exit(1);
process.stdout.write(
  `OK: ${ARQUIVO} contém todas as ${SECOES_OBRIGATORIAS.length} seções obrigatórias.\n`,
);
