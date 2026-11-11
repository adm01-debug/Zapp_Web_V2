#!/usr/bin/env node
/**
 * Verificador das páginas de documentação de Realtime/mensagem.
 *
 * Não altera nada: relê as três páginas, o código e as migrations e falha se a
 * página deixou de corresponder ao repositório. Serve de guarda contra
 * documentação que envelhece em silêncio.
 *
 *   node scripts/docs/verificar-docs-realtime.mjs
 *
 * Confere, para `docs/REALTIME-CHANNELS-INVENTORY.md`,
 * `docs/adr/ADR-009-inbox-fonte-unica-de-mensagens.md` e
 * `docs/JORNADA_MENSAGEM_WHATSAPP.md`:
 *   1. todo `arquivo:linha` citado existe e a linha citada existe no arquivo;
 *   2. todo canal da tabela do inventário aponta a tabela assinada de verdade no
 *      código (`'<tabela>'` aparece em algum `.ts`/`.tsx` de `src/`);
 *   3. o nome do canal aparece no arquivo citado;
 *   4. a tabela consta da projeção lexical de ADD/DROP TABLE das migrations para
 *      `supabase_realtime`; comentários e texto inerte não contam. IF/EXCEPTION
 *      não são avaliados, e a projeção não substitui o estado real do banco;
 *   5. toda tabela listada como "fora da publication" realmente não está, e
 *      continua citada por algum canal;
 *   6. cada migration citada na tabela de publicação realmente adiciona a
 *      tabela que a linha diz.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicationChanges } from './publication.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCS = [
  'docs/REALTIME-CHANNELS-INVENTORY.md',
  'docs/adr/ADR-009-inbox-fonte-unica-de-mensagens.md',
  'docs/JORNADA_MENSAGEM_WHATSAPP.md',
];
const CITACAO = /\b((?:src|supabase|docs|scripts)\/[A-Za-z0-9_./-]+\.(?:tsx|ts|mjs|sql|md|json))(?::(\d+)(?:-(\d+))?)?(?![\w])/g;
const CITACAO_UM = new RegExp(CITACAO.source);
const CITACAO_CURTA = /\b([A-Za-z0-9_-]+\.(?:tsx|ts|mjs|sql|json))(?::(\d+)(?:-(\d+))?)?(?![\w])/g;
const ATALHO = /`([A-Za-z0-9_-]+\.(?:tsx|ts|mjs|sql))`\s*=\s*`([^`]+\.(?:tsx|ts|mjs|sql))`/g;

const erros = [];
const errar = (msg) => erros.push(msg);
let citacoes = 0;
const ler = (rel) => readFileSync(resolve(RAIZ, rel), 'utf8');
const linhas = (rel) => ler(rel).split('\n').length;

function walk(dir, acc = []) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.tmp', 'dist', 'build'].includes(entrada.name)) continue;
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) walk(caminho, acc);
    else acc.push(caminho);
  }
  return acc;
}

function mudancasPublication(rel) {
  try {
    return publicationChanges(ler(rel), rel);
  } catch (erro) {
    if (erro.code !== 'PUBLICATION_UNSUPPORTED') throw erro;
    errar(erro.message);
    return [];
  }
}

function replayPublication() {
  const publicadas = new Set();
  const dir = resolve(RAIZ, 'supabase/migrations');
  for (const arquivo of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    for (const op of mudancasPublication(`supabase/migrations/${arquivo}`)) {
      if (op.action === 'ADD') publicadas.add(op.table);
      else publicadas.delete(op.table);
    }
  }
  return publicadas;
}

function adicionadasPor(rel) {
  return new Set(mudancasPublication(rel).filter((op) => op.action === 'ADD').map((op) => op.table));
}

const codigoSrc = walk(resolve(RAIZ, 'src'))
  .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes(`${sep}__tests__${sep}`))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const arquivosDoRepo = [
  ...walk(resolve(RAIZ, 'src'), []),
  ...walk(resolve(RAIZ, 'supabase'), []),
  ...walk(resolve(RAIZ, 'scripts'), []),
  ...walk(resolve(RAIZ, 'docs'), []),
].map((f) => f.slice(RAIZ.length + 1));

const porBase = new Map();
for (const rel of arquivosDoRepo) {
  const base = rel.split('/').pop();
  porBase.set(base, [...(porBase.get(base) ?? []), rel]);
}

function conferirCitacao(doc, rel, inicio, fim) {
  citacoes += 1;
  if (!existsSync(resolve(RAIZ, rel))) {
    errar(`${doc}: cita arquivo inexistente ${rel}`);
    return;
  }
  if (inicio) {
    const n = Number(inicio);
    const ultimo = fim === undefined ? n : Number(fim);
    const total = linhas(rel);
    const citacao = `${rel}:${inicio}${fim === undefined ? '' : `-${fim}`}`;
    if (!Number.isSafeInteger(n) || n < 1 || !Number.isSafeInteger(ultimo) || ultimo < n) {
      errar(`${doc}: ${citacao} tem intervalo de linhas inválido`);
    } else if (n > total || ultimo > total) {
      errar(`${doc}: ${citacao} passou do fim do arquivo (${total} linhas)`);
    }
  }
}

for (const doc of DOCS) {
  if (!existsSync(resolve(RAIZ, doc))) {
    errar(`documento ausente: ${doc}`);
    continue;
  }
  const texto = ler(doc);
  const atalhos = new Map([...texto.matchAll(ATALHO)].map((m) => [m[1], m[2]]));

  for (const m of texto.matchAll(CITACAO)) conferirCitacao(doc, m[1], m[2], m[3]);

  for (const m of texto.matchAll(CITACAO_CURTA)) {
    if (/[/\w.-]/.test(texto[m.index - 1] ?? '')) continue;
    const [, base, inicio, fim] = m;
    if (atalhos.has(base)) {
      conferirCitacao(doc, atalhos.get(base), inicio, fim);
      continue;
    }
    const candidatos = porBase.get(base) ?? [];
    if (candidatos.length !== 1) {
      errar(`${doc}: citação curta ambígua ou desconhecida "${base}" (${candidatos.length} candidatos)`);
      continue;
    }
    conferirCitacao(doc, candidatos[0], inicio, fim);
  }
}

const inventario = ler(DOCS[0]);
const publicadas = replayPublication();
const foraMatch = inventario.match(/Fora da publication hoje:([^\n]*)/);
const foraDaPublication = new Set(
  [...(foraMatch?.[1] ?? '').matchAll(/`([a-z_][a-z0-9_]*)`/g)].map((m) => m[1]),
);
if (foraDaPublication.size === 0) errar('inventário sem a linha "Fora da publication hoje: ..."');

const tabelasCitadas = new Set();
let canais = 0;
let migrationsCitadas = 0;

for (const linha of inventario.split('\n')) {
  if (!linha.startsWith('|')) continue;
  const celulas = linha.split('|').slice(1, -1).map((c) => c.trim());
  const soBackticks = (c) => [...c.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

  if ((celulas.length === 3 || celulas.length === 5) && /^`/.test(celulas[0])) {
    canais += 1;
    const canal = soBackticks(celulas[0])[0] ?? celulas[0].replace(/`/g, '');
    const base = canal.split(/[{(:]/)[0].replace(/-$/, '');
    const onde = celulas[celulas.length - 1].match(CITACAO_UM);
    if (!onde) {
      errar(`${DOCS[0]}: canal ${canal} sem arquivo:linha`); 
      continue;
    }
    const arquivo = onde[1];
    if (!existsSync(resolve(RAIZ, arquivo))) {
      errar(`${DOCS[0]}: canal ${canal} cita arquivo inexistente ${arquivo}`);
      continue;
    }
    if (!base.includes('{') && base.length >= 6 && !ler(arquivo).includes(base)) {
      errar(`${DOCS[0]}: ${arquivo} não contém o canal ${canal}`);
    }
    if (/presence|broadcast/i.test(celulas[1])) continue;
    for (const tabela of soBackticks(celulas[1]).filter((t) => /^[a-z_][a-z0-9_]*$/.test(t))) {
      tabelasCitadas.add(tabela);
      if (foraDaPublication.has(tabela)) continue;
      if (!publicadas.has(tabela)) errar(`${DOCS[0]}: ${tabela} não está na publication (projeção das migrations)`);
      if (!codigoSrc.includes(`'${tabela}'`)) errar(`${DOCS[0]}: nenhum .ts/.tsx de src/ assina '${tabela}'`);
    }
    continue;
  }

  if (celulas.length === 2) {
    const tabelas = soBackticks(celulas[0]).filter((t) => /^[a-z_][a-z0-9_]*$/.test(t));
    if (tabelas.length === 0) continue;
    // Coluna 0 já é inequívoca (lista de tabelas entre crases): a partir daqui a linha É
    // da tabela tabela→migration, então a 2ª coluna tem de citar um .sql entre crases. Sem
    // essa exigência, um erro de digitação (crase faltando) fazia a linha ser ignorada em
    // silêncio em vez de reprovar — exatamente o drift que este guard existe para pegar.
    const migration = soBackticks(celulas[1]).find((c) => c.endsWith('.sql'));
    migrationsCitadas += 1;
    if (!migration) {
      errar(`${DOCS[0]}: linha com tabela(s) ${tabelas.join(', ')} sem nome de migration .sql entre crases na 2ª coluna`);
      continue;
    }
    const rel = `supabase/migrations/${migration}`;
    if (!existsSync(resolve(RAIZ, rel))) {
      errar(`${DOCS[0]}: migration citada não existe: ${migration}`);
      continue;
    }
    const adicionadas = adicionadasPor(rel);
    for (const tabela of tabelas) {
      if (!adicionadas.has(tabela)) errar(`${DOCS[0]}: ${migration} não adiciona ${tabela}`);
    }
  }
}

for (const tabela of foraDaPublication) {
  if (publicadas.has(tabela)) errar(`${DOCS[0]}: ${tabela} está marcada como fora, mas o replay a publica`);
  if (!tabelasCitadas.has(tabela)) errar(`${DOCS[0]}: ${tabela} está fora da publication e nenhum canal a cita`);
}

if (erros.length > 0) {
  console.error(`FALHOU (${erros.length})`);
  for (const e of erros) console.error(` - ${e}`);
  process.exit(1);
}

console.log(
  `OK: ${DOCS.length} documentos, ${citacoes} citações arquivo:linha, ` +
    `${canais} canais, ${migrationsCitadas} migrations de publicação, ` +
    `${tabelasCitadas.size} tabelas assinadas, ${foraDaPublication.size} fora da publication.`,
);
