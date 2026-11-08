#!/usr/bin/env node
/**
 * GA02: garante que as instrucoes para agentes nao foram apagadas ou esvaziadas por outra sessao.
 * Alvo: AGENTS.md (regras) + docs/agentes/*.md (referencia) + os dois skills do repo. CLAUDE.md e
 * so `@AGENTS.md`.
 * Verifica: AGENTS.md existe, cabecalhos obrigatorios presentes, toda referencia docs/agentes/*.md
 * citada no AGENTS.md existe em disco e todo arquivo da pasta e citado (referencia orfa), os dois
 * skills do repo (.claude/skills/zapp-web-v2 e .agents/skills/zapp-web-v2) sao copias identicas, e
 * o conjunto AGENTS.md + CLAUDE.md + docs/agentes/*.md nao encolheu >30% em bytes vs a base, com
 * cada arquivo vigiado (AGENTS.md e cada docs/agentes/*.md que exista na base) continuando a existir
 * com >=50% do tamanho que tem na base (o limiar do conjunto sozinho nao pega o esvaziamento de 1
 * arquivo).
 * Base: CLAUDE_MD_BASE (no CI, a main buscada; no checkout do CI o HEAD e o proprio arquivo e a
 * comparacao viraria no-op). Localmente, sem a variavel, compara com o HEAD. Na base o conjunto e o
 * que existir la (na main antiga, CLAUDE.md + AGENTS.md).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AGENTS = 'AGENTS.md';
export const CLAUDE = 'CLAUDE.md';
export const DOCS_DIR = 'docs/agentes';
export const SKILL_NAME = 'zapp-web-v2';
export const SKILL_FILES = [
  `.claude/skills/${SKILL_NAME}/SKILL.md`,
  `.agents/skills/${SKILL_NAME}/SKILL.md`,
];
const CONJUNTO_RAIZ = [AGENTS, CLAUDE];
export const REQUIRED_SECTIONS = [
  '## Postura',
  '## Bugs e funcionalidades',
  '## Comunicação',
  '## Fluxo Git',
  '## Banco',
  '## Serviços',
  '## Stack e comandos',
  '## Grafo de código',
];
export const SHRINK_THRESHOLD = 0.30;
export const FILE_SHRINK_THRESHOLD = 0.50;

export function secoesFaltando(content) {
  return REQUIRED_SECTIONS.filter((s) => !content.includes(s));
}

// Toda referencia docs/agentes/<arquivo>.md citada no AGENTS.md precisa existir em disco, e todo
// arquivo da pasta precisa ser citado — referencia orfa e instrucao que ninguem le.
export function referenciasDocsInvalidas(agentsContent, nomesEmDisco) {
  const citados = new Set(
    [...agentsContent.matchAll(/docs\/agentes\/([A-Za-z0-9._-]+\.md)/g)].map((m) => m[1]),
  );
  const presentes = new Set(nomesEmDisco);
  const erros = [];
  for (const nome of [...citados].sort()) {
    if (nome.includes('<')) continue; // placeholder tipo docs/agentes/<tema>.md
    if (!presentes.has(nome)) erros.push(`${AGENTS} cita ${DOCS_DIR}/${nome}, que nao existe.`);
  }
  for (const nome of [...presentes].sort()) {
    if (!citados.has(nome)) erros.push(`${DOCS_DIR}/${nome} nao e citado pelo ${AGENTS} (referencia orfa).`);
  }
  return erros;
}

// Os dois skills do repo (Claude Code e Codex) precisam ser copias byte a byte identicas.
export function skillsDivergentes(conteudos) {
  const [primeiro, ...resto] = conteudos;
  if (primeiro === undefined) return [`skill ${SKILL_NAME} nao encontrado.`];
  const erros = [];
  for (const [i, conteudo] of resto.entries()) {
    if (conteudo !== primeiro) erros.push(`${SKILL_FILES[i + 1]} difere de ${SKILL_FILES[0]}; os dois skills devem ser copias identicas.`);
  }
  return erros;
}

function nomesDocsEmDisco() {
  return existsSync(DOCS_DIR) ? readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md')).sort() : [];
}

function bytesAtuais() {
  let total = 0;
  for (const f of CONJUNTO_RAIZ) {
    if (existsSync(f)) total += Buffer.byteLength(readFileSync(f, 'utf8'));
  }
  for (const nome of nomesDocsEmDisco()) total += Buffer.byteLength(readFileSync(join(DOCS_DIR, nome), 'utf8'));
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
  let lista;
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

export function erroDeEncolhimento(atual, base) {
  if (!base) return [];
  const erros = [];
  const ratio = atual.total / base.total;
  if (ratio < 1 - SHRINK_THRESHOLD) {
    erros.push(
      `Instrucoes para agentes (${AGENTS} + ${CLAUDE} + ${DOCS_DIR}/*.md) encolheram ${Math.round((1 - ratio) * 100)}% vs a base (atual: ${atual.total} bytes, base: ${base.total} bytes). Possivel wipe por sessao paralela.`,
    );
  }
  // Por arquivo: AGENTS.md e cada docs/agentes/*.md que exista na base precisa continuar existindo
  // com >= 50% do tamanho de la. CLAUDE.md fica de fora: e so `@AGENTS.md` por design.
  for (const [path, naBase] of base.porArquivo) {
    if (path === CLAUDE || naBase === 0) continue;
    const agora = atual.porArquivo[path];
    if (agora === undefined) {
      erros.push(`${path} existia na base (${naBase} bytes) e sumiu. Possivel wipe por sessao paralela.`);
      continue;
    }
    if (agora < naBase * FILE_SHRINK_THRESHOLD) {
      erros.push(
        `${path} encolheu ${Math.round((1 - agora / naBase) * 100)}% vs a base (atual: ${agora} bytes, base: ${naBase} bytes); limite por arquivo e ${Math.round(FILE_SHRINK_THRESHOLD * 100)}%.`,
      );
    }
  }
  return erros;
}

function atualPorArquivo() {
  const porArquivo = {};
  for (const f of CONJUNTO_RAIZ) {
    if (existsSync(f)) porArquivo[f] = Buffer.byteLength(readFileSync(f, 'utf8'));
  }
  for (const nome of nomesDocsEmDisco()) {
    const caminho = join(DOCS_DIR, nome);
    porArquivo[caminho] = Buffer.byteLength(readFileSync(caminho, 'utf8'));
  }
  return porArquivo;
}

function main() {
  let content;
  try {
    content = readFileSync(AGENTS, 'utf8');
  } catch {
    console.error(`::error::${AGENTS} nao encontrado. Outra sessao pode ter apagado o arquivo.`);
    process.exitCode = 1;
    process.exit();
  }

  const erros = [];
  for (const s of secoesFaltando(content)) erros.push(`${AGENTS}: secao obrigatoria ausente: ${s}`);
  erros.push(...referenciasDocsInvalidas(content, nomesDocsEmDisco()));
  const skillsFaltando = SKILL_FILES.filter((f) => !existsSync(f));
  if (skillsFaltando.length > 0) erros.push(...skillsFaltando.map((f) => `${f} nao encontrado.`));
  else erros.push(...skillsDivergentes(SKILL_FILES.map((f) => readFileSync(f, 'utf8'))));

  if (erros.length > 0) {
    for (const e of erros) console.error(`::error::${e}`);
    process.exitCode = 1;
    process.exit();
  }

  const BASE = process.env.CLAUDE_MD_BASE || 'HEAD';
  const atual = { total: bytesAtuais(), porArquivo: atualPorArquivo() };
  const base = bytesNaBase(BASE);
  const errosEncolhimento = erroDeEncolhimento(atual, base);
  if (errosEncolhimento.length > 0) {
    for (const e of errosEncolhimento) console.error(`::error::${e}`);
    process.exitCode = 1;
    process.exit();
  }

  console.log(
    `${AGENTS} OK: ${REQUIRED_SECTIONS.length} secoes, ${nomesDocsEmDisco().length} arquivos em ${DOCS_DIR}/ sem referencia orfa, skills identicos; conjunto com ${atual.total} bytes${base ? ` (base ${BASE}: ${base.total} bytes em ${base.porArquivo.size} arquivos, cada um >= ${Math.round(FILE_SHRINK_THRESHOLD * 100)}% do tamanho na base)` : ''}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
