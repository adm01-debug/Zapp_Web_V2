#!/usr/bin/env node
// E66 / SL-178 — registro das exceções CONSCIENTES de tipografia.
//
// `docs/tipografia/EXCECOES.md` é a lista das exceções conscientes ao padrão de tipografia,
// pedida pela etapa 66 do PLANO_AUDITORIA_FONTES_100_ETAPAS_2026-09-24.md e pela regra de
// execução do mesmo plano: "Exceções conscientes (120px do NotFound, `system-ui` do boot
// error) vão para `EXCECOES.md`, não somem."
//
// Um registro de exceções só serve se não puder mentir em nenhuma das duas direções:
//   (a) exceção registrada cujo uso sumiu do código → o registro virou fóssil e a próxima
//       sessão lê como exceção algo que já não existe;
//   (b) uso que é exceção e desapareceu do registro → volta a ser dívida anônima, que é
//       exatamente o que a etapa 66 quis impedir.
//
// Este teste lê o documento REAL e os arquivos-fonte REAIS e acusa os dois lados; as
// fixtures em string rodam a MESMA regra sem depender do estado de hoje, e provam o lado
// negativo (registro vazio, exceção ausente, valor omitido, uso que sumiu do código,
// caminho inventado).
//
// Se um uso for corrigido de propósito, o certo é remover a linha do registro E o caso
// correspondente de EXCECOES_OBRIGATORIAS: exceção que acabou volta a ser decisão
// explícita, não evapora.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const REGISTRO = 'docs/tipografia/EXCECOES.md';

// Exceções que o plano de auditoria (etapa 66) exige registradas, com o uso que as sustenta
// no código: `marcador` tem de continuar existindo no arquivo, senão a exceção registrada é
// fóssil.
export const EXCECOES_OBRIGATORIAS = [
  {
    id: 'notfound-404-120px',
    arquivo: 'src/pages/NotFound.tsx',
    valor: '120px',
    marcador: /text-\[120px\]/u,
  },
  {
    id: 'boot-error-system-ui',
    arquivo: 'index.html',
    valor: 'system-ui',
    marcador: /font-family:\s*system-ui/u,
  },
];

// Leitor padrão: o repositório de verdade. As fixtures injetam um leitor de mentira.
export const LEITOR_REAL = {
  existe: (rel) => existsSync(path.join(RAIZ, rel)),
  ler: (rel) => readFileSync(path.join(RAIZ, rel), 'utf8'),
};

/**
 * Linhas da seção `## Exceções registradas` (até o próximo `##`), ou `null` se a seção não
 * existe. É o único trecho onde caminhos de arquivo contam como exceção registrada.
 */
export function linhasRegistradas(doc) {
  const linhas = String(doc).split('\n');
  const inicio = linhas.findIndex((l) => /^##\s+Exce[çc][õo]es registradas\b/u.test(l));
  if (inicio === -1) return null;
  const resto = linhas.slice(inicio + 1);
  const fim = resto.findIndex((l) => /^##\s/u.test(l));
  return resto.slice(0, fim === -1 ? resto.length : fim);
}

/**
 * Violações do registro. Lista vazia = as exceções obrigatórias estão registradas e cada uso
 * documentado continua existindo no código. Exportada para as fixtures rodarem a MESMA regra
 * do documento real.
 */
export function violacoesDoRegistro(doc, fontes = LEITOR_REAL) {
  const violacoes = [];
  const texto = String(doc ?? '');
  if (texto.trim() === '') {
    return ['o registro de exceções conscientes está vazio ou ausente'];
  }

  for (const ex of EXCECOES_OBRIGATORIAS) {
    if (!texto.includes(ex.arquivo)) {
      violacoes.push(`a exceção "${ex.id}" não cita o arquivo ${ex.arquivo}`);
    }
    if (!texto.includes(ex.valor)) {
      violacoes.push(`a exceção "${ex.id}" não registra o valor ${ex.valor}`);
    }
    if (!fontes.existe(ex.arquivo)) {
      violacoes.push(
        `a exceção "${ex.id}" aponta para ${ex.arquivo}, que não existe no repositório`,
      );
      continue;
    }
    if (!ex.marcador.test(fontes.ler(ex.arquivo))) {
      violacoes.push(
        `a exceção "${ex.id}" está registrada, mas ${ex.arquivo} não contém mais o uso documentado (${ex.marcador})`,
      );
    }
  }

  // Toda linha da tabela de exceções registradas tem de apontar para arquivo existente:
  // registro que cita caminho inventado mente para quem for conferir.
  const linhas = linhasRegistradas(texto);
  if (!linhas) {
    violacoes.push('falta a seção "## Exceções registradas"');
    return violacoes;
  }

  let registradas = 0;
  for (const linha of linhas) {
    if (!linha.startsWith('|')) continue;
    if (/^\|\s*-+/u.test(linha)) continue; // separador do cabeçalho
    if (/^\|\s*#\s*\|/u.test(linha)) continue; // cabeçalho
    registradas += 1;
    for (const [, caminho] of linha.matchAll(/`([^`]+?\.(?:tsx|ts|html|css))(?::\d+(?:-\d+)?)?`/gu)) {
      if (!fontes.existe(caminho)) {
        violacoes.push(`a tabela registra "${caminho}", que não existe no repositório`);
      }
    }
  }
  if (registradas === 0) {
    violacoes.push('a seção "## Exceções registradas" não tem nenhuma linha de tabela');
  }

  return violacoes;
}

// ---------------------------------------------------------------------------
// Fixtures em string: provam os dois lados sem depender do estado do documento.
// ---------------------------------------------------------------------------

const CAMINHOS_REAIS = new Set(['src/pages/NotFound.tsx', 'index.html']);

const FONTES_OK = {
  existe: (rel) => CAMINHOS_REAIS.has(rel),
  ler: (rel) =>
    rel === 'src/pages/NotFound.tsx'
      ? 'className="text-[120px] font-bold leading-none select-none"'
      : 'font-family:system-ui,sans-serif;padding:24px;',
};

const REGISTRO_OK = [
  '# Exceções conscientes — tipografia',
  '',
  '## Exceções registradas',
  '',
  '| # | Exceção | Onde (arquivo:linha) | Valor | Por que é consciente |',
  '|---|---|---|---|---|',
  '| E1 | numeral "404" do NotFound | `src/pages/NotFound.tsx:27` | `120px` | decoração, não texto de leitura |',
  '| E2 | fonte da tela de erro de boot | `index.html:78` | `system-ui` | roda antes da fonte web |',
  '',
  '## Como registrar uma exceção nova',
].join('\n');

test('fixture: registro vazio é acusado', () => {
  assert.deepEqual(violacoesDoRegistro('', FONTES_OK), [
    'o registro de exceções conscientes está vazio ou ausente',
  ]);
});

test('fixture: registro completo e coerente com o código não tem violação', () => {
  assert.deepEqual(violacoesDoRegistro(REGISTRO_OK, FONTES_OK), []);
});

test('fixture: exceção obrigatória ausente do texto é acusada', () => {
  const semNotFound = REGISTRO_OK.replace(/src\/pages\/NotFound\.tsx(:27)?/gu, 'a página 404');
  const violacoes = violacoesDoRegistro(semNotFound, FONTES_OK);
  assert.ok(
    violacoes.some((v) => v.includes('não cita o arquivo src/pages/NotFound.tsx')),
    `esperava a ausência do arquivo, veio ${JSON.stringify(violacoes)}`,
  );
});

test('fixture: citar o arquivo sem registrar o valor é acusado', () => {
  const semValor = REGISTRO_OK.replace(/`120px`/gu, '`grande`');
  const violacoes = violacoesDoRegistro(semValor, FONTES_OK);
  assert.ok(
    violacoes.some((v) => v.includes('não registra o valor 120px')),
    `esperava o valor ausente, veio ${JSON.stringify(violacoes)}`,
  );
});

test('fixture: exceção registrada cujo uso sumiu do código é acusada (registro fóssil)', () => {
  const fontes = { existe: () => true, ler: () => 'className="text-2xl" /* uso corrigido */' };
  const violacoes = violacoesDoRegistro(REGISTRO_OK, fontes);
  assert.ok(
    violacoes.some((v) => v.includes('não contém mais o uso documentado')),
    `esperava o uso ausente no código, veio ${JSON.stringify(violacoes)}`,
  );
});

test('fixture: exceção registrada apontando para arquivo que não existe é acusada', () => {
  const inventada = REGISTRO_OK.replace(
    '| E1 |',
    '| E3 | erro de boot do proxy | `src/pages/ErroDeBoot.tsx:78` | `system-ui` | ver |\n| E1 |',
  );
  assert.notEqual(inventada, REGISTRO_OK, 'a fixture não chegou a inserir a linha inventada');
  const violacoes = violacoesDoRegistro(inventada, FONTES_OK);
  assert.ok(
    violacoes.some((v) => v.includes('"src/pages/ErroDeBoot.tsx", que não existe')),
    `esperava o caminho inventado, veio ${JSON.stringify(violacoes)}`,
  );
});

test('fixture: tabela de exceções vazia é acusada', () => {
  const semLinhas = [
    '# Exceções conscientes — tipografia',
    '',
    '## Exceções registradas',
    '',
    'Nada registrado.',
  ].join('\n');
  const violacoes = violacoesDoRegistro(semLinhas, FONTES_OK);
  assert.ok(
    violacoes.some((v) => v.includes('não tem nenhuma linha de tabela')),
    `esperava a tabela vazia, veio ${JSON.stringify(violacoes)}`,
  );
});

// ---------------------------------------------------------------------------
// Asserções sobre o documento real e os arquivos-fonte reais.
// ---------------------------------------------------------------------------

test('registro real: as exceções obrigatórias continuam existindo no código', () => {
  for (const ex of EXCECOES_OBRIGATORIAS) {
    assert.ok(LEITOR_REAL.existe(ex.arquivo), `${ex.arquivo} sumiu do repositório`);
    assert.match(
      LEITOR_REAL.ler(ex.arquivo),
      ex.marcador,
      `${ex.arquivo} não contém mais o uso documentado (${ex.marcador})`,
    );
  }
});

test('registro real: o arquivo existe, não está vazio e não viola a própria regra', () => {
  assert.ok(existsSync(path.join(RAIZ, REGISTRO)), `${REGISTRO} não existe`);
  const doc = readFileSync(path.join(RAIZ, REGISTRO), 'utf8');
  assert.ok(doc.length > 0, `${REGISTRO} está vazio`);
  assert.deepEqual(
    violacoesDoRegistro(doc),
    [],
    `${REGISTRO} não registra as exceções conscientes exigidas pelo plano`,
  );
});
