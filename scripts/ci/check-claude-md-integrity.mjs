#!/usr/bin/env node
/**
 * GA02: garante que as instrucoes para agentes nao foram apagadas ou esvaziadas por outra sessao.
 * Alvo: AGENTS.md (regras) + docs/agentes/*.md (referencia). CLAUDE.md e so `@AGENTS.md`.
 * Verifica: AGENTS.md existe, cabecalhos obrigatorios presentes, o conjunto
 * AGENTS.md + CLAUDE.md + docs/agentes/*.md nao encolheu >30% em bytes vs a base, e cada arquivo
 * vigiado (AGENTS.md e cada docs/agentes/*.md que exista na base) continua existindo com >=50% do
 * tamanho que tem na base (o limiar do conjunto sozinho nao pega o esvaziamento de 1 arquivo).
 * Base: CLAUDE_MD_BASE (no CI, a main buscada; no checkout do CI o HEAD e o proprio arquivo
 * e a comparacao viraria no-op). Localmente, sem a variavel, compara com o HEAD.
 * Na base o conjunto e o que existir la (na main antiga, CLAUDE.md + AGENTS.md).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const AGENTS = 'AGENTS.md';
const DOCS_DIR = 'docs/agentes';
const CONJUNTO_RAIZ = ['AGENTS.md', 'CLAUDE.md'];
const REQUIRED_SECTIONS = [
  '## Postura',
  '## Bugs e funcionalidades',
  '## Comunicação',
  '## Fluxo Git',
  '## Banco',
  '## Serviços',
  '## Stack e comandos',
  '## Grafo de código',
];
const SHRINK_THRESHOLD = 0.30;
const FILE_SHRINK_THRESHOLD = 0.50;

let content;
try {
  content = readFileSync(AGENTS, 'utf8');
} catch {
  console.error(`::error::${AGENTS} nao encontrado. Outra sessao pode ter apagado o arquivo.`);
  process.exitCode = 1;
  process.exit();
}

const missing = REQUIRED_SECTIONS.filter((s) => !content.includes(s));
if (missing.length > 0) {
  for (const s of missing) console.error(`::error::${AGENTS}: secao obrigatoria ausente: ${s}`);
  process.exitCode = 1;
  process.exit();
}

function bytesAtuais() {
  let total = 0;
  for (const f of CONJUNTO_RAIZ) {
    if (existsSync(f)) total += Buffer.byteLength(readFileSync(f, 'utf8'));
  }
  if (existsSync(DOCS_DIR)) {
    for (const f of readdirSync(DOCS_DIR)) {
      if (f.endsWith('.md')) total += Buffer.byteLength(readFileSync(join(DOCS_DIR, f), 'utf8'));
    }
  }
  return total;
}

// Tamanho na base de cada arquivo do conjunto: { total, porArquivo: Map(path -> bytes) } ou null
// quando a base nao tem nenhum deles (ref inexistente, checkout raso sem a main).
function bytesNaBase(base) {
  const porArquivo = new Map();
  const tamanho = (path) => {
    try {
      const out = execSync(`git cat-file -s ${base}:${path}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      porArquivo.set(path, Number.parseInt(out.trim(), 10) || 0);
    } catch {
      /* nao existe na base */
    }
  };
  for (const f of CONJUNTO_RAIZ) tamanho(f);
  let lista = '';
  try {
    lista = execSync(`git ls-tree -r --name-only ${base} -- ${DOCS_DIR}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    lista = '';
  }
  for (const path of lista.split('\n').map((l) => l.trim()).filter((l) => l.endsWith('.md'))) tamanho(path);
  if (porArquivo.size === 0) return null;
  let total = 0;
  for (const n of porArquivo.values()) total += n;
  return { total, porArquivo };
}

const BASE = process.env.CLAUDE_MD_BASE || 'HEAD';
const atual = bytesAtuais();
const base = bytesNaBase(BASE);

if (base) {
  const ratio = atual / base.total;
  if (ratio < (1 - SHRINK_THRESHOLD)) {
    console.error(`::error::Instrucoes para agentes (AGENTS.md + CLAUDE.md + ${DOCS_DIR}/*.md) encolheram ${Math.round((1 - ratio) * 100)}% vs ${BASE} (atual: ${atual} bytes, base: ${base.total} bytes). Possivel wipe por sessao paralela.`);
    process.exitCode = 1;
    process.exit();
  }
  // Por arquivo: AGENTS.md e cada docs/agentes/*.md que exista na base precisa continuar existindo
  // com >= 50% do tamanho de la. CLAUDE.md fica de fora: e so `@AGENTS.md` por design.
  let falhas = 0;
  for (const [path, naBase] of base.porArquivo) {
    if (path === 'CLAUDE.md' || naBase === 0) continue;
    if (!existsSync(path)) {
      console.error(`::error::${path} existia em ${BASE} (${naBase} bytes) e sumiu. Possivel wipe por sessao paralela.`);
      falhas += 1;
      continue;
    }
    const agora = Buffer.byteLength(readFileSync(path, 'utf8'));
    if (agora < naBase * FILE_SHRINK_THRESHOLD) {
      console.error(`::error::${path} encolheu ${Math.round((1 - agora / naBase) * 100)}% vs ${BASE} (atual: ${agora} bytes, base: ${naBase} bytes); limite por arquivo e ${Math.round(FILE_SHRINK_THRESHOLD * 100)}%.`);
      falhas += 1;
    }
  }
  if (falhas > 0) {
    process.exitCode = 1;
    process.exit();
  }
}

console.log(`${AGENTS} OK: ${REQUIRED_SECTIONS.length} secoes presentes; conjunto com ${DOCS_DIR}/: ${atual} bytes${base ? ` (base ${BASE}: ${base.total} bytes em ${base.porArquivo.size} arquivos, cada um >= ${Math.round(FILE_SHRINK_THRESHOLD * 100)}% do tamanho na base)` : ''}.`);
