#!/usr/bin/env node
// SL-233 — item 99b do `docs/migration/PLANO.md`: "Backlog residual: ... chunks
// >500 kB (`vendor-maps` 1,67 MB)". O que faltava no repositório era o TAMANHO
// RAW do maior chunk do build: `docs/mapa/ARQUITETURA_BUSCA.md` registrava só o
// gzip (492,3 KB, dentro do teto de 550 KB) e as cifras de raw espalhadas pelo
// repositório não batiam entre si (1,67 MB no plano de migração, 1,827 MB numa
// auditoria de 22/09, ~1,9 MB no comentário do carregador).
//
// Medir uma vez não fecha a lacuna: sem regra, o número volta a ser folclore.
// Esta guarda lê o documento REAL, o `vite.config.ts` REAL (é o `codeSplitting`
// que cria o chunk), o `performance-budget.json` REAL (é o teto) e o carregador
// REAL (é o `import()` dinâmico que mantém o chunk fora do first paint), e exige:
//   (a) uma linha do MAIOR chunk com raw E gzip — a lacuna era exatamente a linha sem raw;
//   (b) o nome registrado é um grupo de `codeSplitting` de verdade (não um nome inventado);
//   (c) raw > gzip e as duas cifras de KB conferem com os bytes;
//   (d) o gzip bate com a tabela de orçamento do MESMO documento e não estoura o teto de `performance-budget.json`;
//   (e) o maior chunk está fora do grafo inicial (linha com "lazy" + carregador citado existe e usa `import()`);
//   (f) o registro é datado e reproduzível (data + `bun run build` + o env do CI) e repete o número em bytes.
// Cada regra tem fixture que passa e fixture que NÃO passa.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DOC = 'docs/mapa/ARQUITETURA_BUSCA.md';
export const VITE_CONFIG = 'vite.config.ts';
export const BUDGET = 'performance-budget.json';
export const CARREGADOR = 'src/lib/mapboxLoader.ts';

const ler = (rel) => readFileSync(path.join(RAIZ, rel), 'utf8');

/** "1.839.438" -> 1839438 ; "492,3" -> 492.3 */
export function numeroPtBr(texto) {
  const valor = Number(String(texto ?? '').trim().replace(/\./gu, '').replace(',', '.'));
  return Number.isFinite(valor) ? valor : Number.NaN;
}

/** 1839438 -> "1.839.438" */
export const comPontos = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/gu, '.');

/** O texto da seção "## Bundle (medido no build real)" até o próximo "## ". */
export function secaoBundle(markdown) {
  const linhas = markdown.split('\n');
  const inicio = linhas.findIndex((linha) => /^##\s+Bundle\b/u.test(linha));
  if (inicio === -1) return null;
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    if (/^##\s/u.test(linhas[i])) return linhas.slice(inicio, i).join('\n');
  }
  return linhas.slice(inicio).join('\n');
}

/** Nomes dos grupos de `codeSplitting` em `vite.config.ts` (o `priority` é o que distingue a entrada do grupo). */
export function gruposDeChunk(viteConfig) {
  return [...viteConfig.matchAll(/\{\s*name:\s*"([^"]+)",\s*priority:/gu)].map((m) => m[1]);
}

const LINHA_CHUNK = /^\|\s*`([A-Za-z0-9][A-Za-z0-9-]*)-\*\.js`/u;
const PAR_BYTES_KB = /([\d.]+)\s*B\s*\(([\d.,]+)\s*KB\)/u;
const TOLERANCIA_KB = 0.06;

/** Colunas da tabela acima da linha: é o cabeçalho que diz qual medida mora em cada célula. */
export function colunas(cabecalho) {
  if (!cabecalho || !cabecalho.trim().startsWith('|')) return null;
  const nomes = cabecalho.split('|').slice(1, -1).map((c) => c.replace(/`/gu, '').trim().toLowerCase());
  return {
    nomes,
    raw: nomes.findIndex((n) => /^raw\b/u.test(n)),
    gzip: nomes.findIndex((n) => /gzip/u.test(n)),
    teto: nomes.findIndex((n) => /largest-chunk/u.test(n)),
  };
}

/** O cabeçalho da tabela em que a linha vive: sobe até a linha de separação (`|---|`) e lê a de cima. */
export function colunasDaTabela(linhas, indice) {
  for (let i = indice - 1; i > 0; i -= 1) {
    if (linhas[i].includes('-') && /^\|[\s:|-]+\|$/u.test(linhas[i])) return colunas(linhas[i - 1]);
  }
  return null;
}

/** Linhas de tabela que descrevem um chunk de JS (`| `Nome-*.js` ... |`). */
export function linhasDeChunk(secao) {
  const encontradas = [];
  const linhas = secao.split('\n');
  linhas.forEach((linha, indice) => {
    const nome = LINHA_CHUNK.exec(linha);
    if (!nome) return;
    const celulas = linha.split('|').slice(1, -1);
    const cols = colunasDaTabela(linhas, indice) ?? { nomes: [], raw: 1, gzip: 2, teto: 3 };
    const celula = (i) => (i >= 0 ? celulas[i] ?? '' : '');
    const casa = cols.nomes.length === 0 || celulas.length === cols.nomes.length;
    const raw = casa ? PAR_BYTES_KB.exec(celula(cols.raw)) : null;
    const gzip = casa ? PAR_BYTES_KB.exec(celula(cols.gzip)) : null;
    // A coluna do teto é identificada pelo CABEÇALHO (`largest-chunk`): só a linha que preenche
    // essa coluna mede o chunk contra o teto do maior chunk.
    const valorTeto = celula(cols.teto).trim();
    const citaTeto = cols.teto >= 0 && valorTeto !== '';
    encontradas.push({
      nome: nome[1],
      indice,
      descricao: celulas[0] ?? '',
      colunas: cols.nomes.length,
      celulas: celulas.length,
      bytesRaw: raw ? numeroPtBr(raw[1]) : null,
      kbRaw: raw ? numeroPtBr(raw[2]) : null,
      bytesGzip: gzip ? numeroPtBr(gzip[1]) : null,
      kbGzip: gzip ? numeroPtBr(gzip[2]) : null,
      kbTeto: citaTeto ? numeroPtBr(/([\d.,]+)\s*KB/u.exec(valorTeto)?.[1]) : null,
      citaTeto,
    });
  });
  return encontradas;
}

/** O valor medido do maior chunk na tabela de orçamento do próprio documento. */
export function valorDoOrcamento(secao) {
  const m = /^\|\s*`largest-chunk`[^|]*\|\s*([\d.,]+)\s*KB/um.exec(secao);
  return m ? numeroPtBr(m[1]) : null;
}

/** O primeiro parágrafo depois da linha `indice` (a prova escrita do número). */
export function blocoDepois(secao, indice) {
  const linhas = secao.split('\n');
  let i = indice + 1;
  while (i < linhas.length && linhas[i].trim() === '') i += 1;
  const bloco = [];
  for (; i < linhas.length; i += 1) {
    const texto = linhas[i].trim();
    if (texto === '' || texto.startsWith('#') || texto.startsWith('|')) break;
    bloco.push(linhas[i]);
  }
  return bloco.join('\n');
}

export function violacoes(secao, { grupos = [], tetoKB = null, carregador = '' } = {}) {
  if (secao === null) return ['o documento não tem a seção "## Bundle (medido no build real)"'];

  const linhas = linhasDeChunk(secao);
  if (linhas.length === 0) return ['o documento não lista nenhum chunk (`| `Nome-*.js` | ... |`)'];

  const out = [];

  // (a) toda linha de chunk registra raw E gzip, com as colunas da sua tabela.
  for (const linha of linhas) {
    if (linha.colunas > 0 && linha.celulas !== linha.colunas) {
      out.push(`chunk ${linha.nome}: a linha tem ${linha.celulas} colunas e a tabela tem ${linha.colunas}`);
    }
    if (linha.bytesRaw === null) {
      out.push(`chunk ${linha.nome}: linha sem o tamanho raw (só gzip) — é a lacuna do item 99b`);
    }
    if (linha.bytesGzip === null) out.push(`chunk ${linha.nome}: linha sem o gzip`);
  }

  // (c) raw > gzip e as duas cifras de KB conferem com os bytes.
  for (const linha of linhas) {
    if (linha.bytesRaw !== null && linha.bytesGzip !== null && linha.bytesRaw <= linha.bytesGzip) {
      out.push(`chunk ${linha.nome}: o raw (${linha.bytesRaw} B) não é maior que o gzip (${linha.bytesGzip} B)`);
    }
    for (const [rotulo, bytes, kb] of [
      ['raw', linha.bytesRaw, linha.kbRaw],
      ['gzip', linha.bytesGzip, linha.kbGzip],
    ]) {
      if (bytes === null || kb === null) continue;
      if (Math.abs(bytes / 1024 - kb) > TOLERANCIA_KB) {
        out.push(`chunk ${linha.nome}: o ${rotulo} em KB (${kb}) não confere com os bytes (${bytes} B = ${(bytes / 1024).toFixed(2)} KB)`);
      }
    }
  }

  // (d) existe UMA linha do maior chunk, com o teto `largest-chunk`.
  const registradas = linhas.filter((l) => l.citaTeto);
  if (registradas.length === 0) {
    out.push('não há registro do MAIOR chunk do build (linha com raw, gzip e a coluna do teto `largest-chunk`) — é a lacuna do item 99b');
  }
  if (registradas.length > 1) {
    out.push(`mais de uma linha preenche a coluna do teto largest-chunk: ${registradas.map((l) => l.nome).join(', ')}`);
  }

  const maior = registradas[0] ?? null;
  if (maior) {
    // (b) o nome registrado tem de ser um grupo de `codeSplitting` de verdade.
    if (grupos.length > 0 && !grupos.includes(maior.nome)) {
      out.push(`maior chunk (${maior.nome}): não é grupo de codeSplitting de ${VITE_CONFIG} (grupos: ${grupos.join(', ')})`);
    }
    if (maior.kbTeto === null || Number.isNaN(maior.kbTeto)) {
      out.push(`maior chunk (${maior.nome}): a linha preenche a coluna largest-chunk sem o valor do teto em KB`);
    } else {
      if (tetoKB !== null && Math.abs(maior.kbTeto - tetoKB) > 0.001) {
        out.push(`maior chunk (${maior.nome}): teto ${maior.kbTeto} KB diverge de ${BUDGET} (${tetoKB} KB)`);
      }
      if (maior.kbGzip !== null && maior.kbGzip > maior.kbTeto) {
        out.push(`maior chunk (${maior.nome}): gzip ${maior.kbGzip} KB acima do teto ${maior.kbTeto} KB`);
      }
    }
    const orcamento = valorDoOrcamento(secao);
    if (orcamento !== null && maior.kbGzip !== null && Math.abs(maior.kbGzip - orcamento) > 0.05) {
      out.push(`maior chunk (${maior.nome}): gzip ${maior.kbGzip} KB diverge do valor da tabela de orçamento (${orcamento} KB)`);
    }
    const maiorDosOutros = linhas
      .filter((l) => l !== maior && l.kbGzip !== null)
      .reduce((m, l) => Math.max(m, l.kbGzip), 0);
    if (maior.kbGzip !== null && maior.kbGzip < maiorDosOutros) {
      out.push(`maior chunk (${maior.nome}): ${maior.kbGzip} KB não é o maior da tabela (${maiorDosOutros} KB)`);
    }

    // (e) o maior chunk continua fora do grafo inicial.
    if (!/lazy|dinâmic/iu.test(maior.descricao)) {
      out.push(`maior chunk (${maior.nome}): a linha precisa dizer que o chunk é lazy (import dinâmico)`);
    }
    if (!maior.descricao.includes(CARREGADOR)) {
      out.push(`maior chunk (${maior.nome}): a linha precisa citar o carregador ${CARREGADOR}`);
    }
    if (!/import\s*\(/u.test(carregador)) {
      out.push(`${CARREGADOR}: não tem import() dinâmico — o maior chunk voltaria ao first paint`);
    }

    // (f) o registro é datado e reproduzível, e repete o número em bytes.
    const registro = blocoDepois(secao, maior.indice);
    if (!/(20\d\d-\d\d-\d\d|\d{2}\/\d{2}\/\d{4})/u.test(registro)) {
      out.push(`maior chunk (${maior.nome}): o registro não é datado (falta a data da medição)`);
    }
    if (!/bun run build/u.test(registro)) {
      out.push(`maior chunk (${maior.nome}): o registro não cita o comando de build`);
    }
    if (!/VITE_CRM_INTEGRATION_ENABLED=true/u.test(registro)) {
      out.push(`maior chunk (${maior.nome}): o registro não cita o env do CI (VITE_CRM_INTEGRATION_ENABLED=true)`);
    }
    if (maior.bytesRaw !== null && !registro.includes(comPontos(maior.bytesRaw))) {
      out.push(`maior chunk (${maior.nome}): o registro não repete o número em bytes (${comPontos(maior.bytesRaw)} B)`);
    }
  }

  return out;
}

// ---------------------------------------------------------------- fixtures

const ORCAMENTO = [
  '**Orçamento (`performance-budget.json`) — saída crua do gate:**',
  '',
  '| Métrica | Medido (gzip) | Budget (`maxKB`) | Folga |',
  '|---|---|---|---|',
  '| `initial-js` | 342,6 KB | 341 | +1,6 KB |',
  '| `largest-chunk` (inclui lazy) | 492,3 KB | 550 | −57,7 KB |',
].join('\n');

const TABELA_MODULO = [
  '| Chunk | raw | gzip |',
  '|---|---|---|',
  '| `ContactForm-*.js` (cadastro de contato, lazy) | 18.124 B (17,70 KB) | 5.427 B (5,30 KB) |',
].join('\n');

const GRUPOS = ['vendor-core', 'vendor-ui', 'vendor-charts', 'vendor-maps'];

function linhaDoMaior(ajustes = {}) {
  const {
    nome = 'vendor-maps',
    bytesRaw = 1839438,
    kbRaw = '1.796,3',
    bytesGzip = 504146,
    kbGzip = '492,3',
    teto = '550 KB',
    descricao = '(`mapbox-gl`, lazy por `src/lib/mapboxLoader.ts`)',
  } = ajustes;
  return `| \`${nome}-*.js\` ${descricao} | ${comPontos(bytesRaw)} B (${kbRaw} KB) | ${comPontos(bytesGzip)} B (${kbGzip} KB) | ${teto} |`;
}

const REGISTRO_OK = 'Medido em 08/10/2026 (`VITE_CRM_INTEGRATION_ENABLED=true bun run build`): `dist/assets/vendor-maps-1ahjwT7Z.js` com 1.839.438 B raw e 504.146 B gzip.';

const CABECALHO_MAIOR = ['| Chunk | raw | gzip | Teto (`largest-chunk`) |', '|---|---|---|---|'].join('\n');

function documento(partes) {
  return ['## Bundle (medido no build real)', '', ...partes, '', '**Quem verifica:** o gate roda de verdade.'].join('\n');
}

const DOC_OK = documento([
  TABELA_MODULO,
  '',
  '**Maior chunk do build (não é deste módulo):**',
  '',
  CABECALHO_MAIOR,
  linhaDoMaior(),
  '',
  REGISTRO_OK,
  '',
  ORCAMENTO,
]);

const OPCOES = { grupos: GRUPOS, tetoKB: 550, carregador: 'export function loadMapbox() {\n  return import(\'mapbox-gl\');\n}' };

const comLinha = (linha) => documento([TABELA_MODULO, '', CABECALHO_MAIOR, linha, '', REGISTRO_OK, '', ORCAMENTO]);

test('fixture: documento com raw + gzip + teto datado passa', () => {
  assert.deepEqual(violacoes(DOC_OK, OPCOES), []);
});

test('fixture: sem a linha do maior chunk (o estado da lacuna) é recusado', () => {
  const falhas = violacoes(documento([TABELA_MODULO, '', ORCAMENTO]), OPCOES);
  assert.equal(falhas.length, 1);
  assert.match(falhas[0], /não há registro do MAIOR chunk/u);
});

test('fixture: seção ausente ou sem tabela de chunk é recusada', () => {
  assert.match(violacoes(null, OPCOES)[0], /não tem a seção/u);
  const semTabela = violacoes(documento(['Nada de chunk aqui, só prosa.']), OPCOES);
  assert.match(semTabela[0], /não lista nenhum chunk/u);
  const semMaior = violacoes(documento([TABELA_MODULO]), OPCOES);
  assert.match(semMaior[0], /não há registro do MAIOR chunk/u);
});

test('fixture: duas linhas preenchendo a coluna do teto, ou coluna do teto vazia, são recusadas', () => {
  const duasVazias = documento([CABECALHO_MAIOR, linhaDoMaior({ teto: ' ' }), linhaDoMaior({ nome: 'vendor-charts', teto: ' ', bytesRaw: 2000000, kbRaw: '1.953,1', bytesGzip: 600000, kbGzip: '585,9' }), '', REGISTRO_OK]);
  const semRegistro = violacoes(duasVazias, OPCOES);
  assert.ok(semRegistro.some((f) => /não há registro do MAIOR chunk/u.test(f)), semRegistro.join(' | '));

  const duasPreenchidas = documento([
    CABECALHO_MAIOR,
    linhaDoMaior(),
    linhaDoMaior({ nome: 'vendor-charts', bytesRaw: 2000000, kbRaw: '1.953,1', bytesGzip: 600000, kbGzip: '585,9' }),
    '',
    REGISTRO_OK,
  ]);
  const falhas = violacoes(duasPreenchidas, OPCOES);
  assert.ok(falhas.some((f) => /mais de uma linha preenche a coluna do teto/u.test(f)), falhas.join(' | '));
});

test('fixture: tabela de chunk sem a coluna raw (ou linha sem a célula) é recusada', () => {
  const tabelaSoGzip = [
    '| Chunk | gzip |',
    '|---|---|',
    '| `ContactForm-*.js` (cadastro de contato, lazy) | 5.427 B (5,30 KB) |',
  ].join('\n');
  const semColuna = violacoes(documento([tabelaSoGzip]), OPCOES);
  assert.ok(semColuna.some((f) => /sem o tamanho raw/u.test(f)), semColuna.join(' | '));

  const celulaSumida = TABELA_MODULO.replace('| 18.124 B (17,70 KB) | 5.427 B (5,30 KB) |', '| 5.427 B (5,30 KB) |');
  const celulasErradas = violacoes(documento([celulaSumida]), OPCOES);
  assert.ok(celulasErradas.some((f) => /a linha tem 2 colunas e a tabela tem 3/u.test(f)), celulasErradas.join(' | '));
});

test('fixture: nome que não é grupo de codeSplitting é recusado', () => {
  const falhas = violacoes(comLinha(linhaDoMaior({ nome: 'vendor-fantasma' })), OPCOES);
  assert.ok(falhas.some((f) => /não é grupo de codeSplitting/u.test(f)), falhas.join(' | '));
});

test('fixture: raw menor que o gzip e KB que não confere com os bytes são recusados', () => {
  const menorQueGzip = violacoes(comLinha(linhaDoMaior({ bytesRaw: 400000, kbRaw: '390,6' })), OPCOES);
  assert.ok(menorQueGzip.some((f) => /não é maior que o gzip/u.test(f)), menorQueGzip.join(' | '));
  const kbTorto = violacoes(comLinha(linhaDoMaior({ kbRaw: '900,0' })), OPCOES);
  assert.ok(kbTorto.some((f) => /não confere com os bytes/u.test(f)), kbTorto.join(' | '));
});

test('fixture: gzip divergente da tabela de orçamento do próprio documento é recusado', () => {
  const falhas = violacoes(comLinha(linhaDoMaior({ bytesGzip: 512000, kbGzip: '500,0' })), OPCOES);
  assert.ok(falhas.some((f) => /diverge do valor da tabela de orçamento/u.test(f)), falhas.join(' | '));
});

test('fixture: teto divergente do performance-budget.json e gzip acima do teto são recusados', () => {
  const tetoTorto = violacoes(comLinha(linhaDoMaior({ teto: '700 KB' })), OPCOES);
  assert.ok(tetoTorto.some((f) => /diverge de performance-budget\.json/u.test(f)), tetoTorto.join(' | '));
  const estourado = violacoes(comLinha(linhaDoMaior({ teto: '400 KB' })), OPCOES);
  assert.ok(estourado.some((f) => /acima do teto/u.test(f)), estourado.join(' | '));
});

test('fixture: linha registrada como maior mas menor que outra da tabela é recusada', () => {
  const outra = '| `vendor-charts-*.js` (lazy por `src/lib/mapboxLoader.ts`) | 2.000.000 B (1.953,1 KB) | 600.000 B (585,9 KB) |  |';
  const falhas = violacoes(documento([CABECALHO_MAIOR, outra, linhaDoMaior(), '', REGISTRO_OK]), OPCOES);
  assert.ok(falhas.some((f) => /não é o maior da tabela/u.test(f)), falhas.join(' | '));
});

test('fixture: registro sem data, sem comando ou sem o número em bytes é recusado', () => {
  const semData = violacoes(documento([CABECALHO_MAIOR, linhaDoMaior(), '', 'Medido com `VITE_CRM_INTEGRATION_ENABLED=true bun run build`.']), OPCOES);
  assert.ok(semData.some((f) => /não é datado/u.test(f)), semData.join(' | '));
  const semComando = violacoes(documento([CABECALHO_MAIOR, linhaDoMaior(), '', 'Medido em 08/10/2026 com o env do CI.']), OPCOES);
  assert.ok(semComando.some((f) => /não cita o comando de build/u.test(f)), semComando.join(' | '));
  const semEnv = violacoes(documento([CABECALHO_MAIOR, linhaDoMaior(), '', 'Medido em 08/10/2026 com `bun run build`: 1.839.438 B.']), OPCOES);
  assert.ok(semEnv.some((f) => /env do CI/u.test(f)), semEnv.join(' | '));
  const semBytes = violacoes(documento([CABECALHO_MAIOR, linhaDoMaior(), '', 'Medido em 08/10/2026 (`VITE_CRM_INTEGRATION_ENABLED=true bun run build`).']), OPCOES);
  assert.ok(semBytes.some((f) => /não repete o número em bytes/u.test(f)), semBytes.join(' | '));
});

test('fixture: chunk marcado como inicial (sem lazy) e carregador sem import() são recusados', () => {
  const semLazy = violacoes(comLinha(linhaDoMaior({ descricao: '(`mapbox-gl`, `src/lib/mapboxLoader.ts`)' })), OPCOES);
  assert.ok(semLazy.some((f) => /precisa dizer que o chunk é lazy/u.test(f)), semLazy.join(' | '));
  const semLoader = violacoes(comLinha(linhaDoMaior({ descricao: '(`mapbox-gl`, lazy)' })), OPCOES);
  assert.ok(semLoader.some((f) => /precisa citar o carregador/u.test(f)), semLoader.join(' | '));
  const loaderEstatico = violacoes(DOC_OK, { ...OPCOES, carregador: "import mapboxgl from 'mapbox-gl';" });
  assert.ok(loaderEstatico.some((f) => /não tem import\(\) dinâmico/u.test(f)), loaderEstatico.join(' | '));
});

// ------------------------------------------------------------- o real

const doc = ler(DOC);
const grupos = gruposDeChunk(ler(VITE_CONFIG));
const carregador = ler(CARREGADOR);
const tetoKB = JSON.parse(ler(BUDGET)).budgets['largest-chunk'].maxKB;

test('âncoras: o grupo vendor-maps, o carregador e o teto existem no repositório', () => {
  assert.ok(grupos.includes('vendor-maps'), `grupos encontrados: ${grupos.join(', ')}`);
  assert.match(carregador, /import\s*\(/u, `${CARREGADOR} precisa manter o import() dinâmico`);
  assert.equal(tetoKB, 550);
});

test('o documento registra o tamanho raw do maior chunk (item 99b)', () => {
  assert.deepEqual(violacoes(secaoBundle(doc), { grupos, tetoKB, carregador }), []);
});
