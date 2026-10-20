import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  classificarTela,
  lerFixture,
  resumoDasTelas,
  gerarRegua,
} from './lado-a-lado.mjs';

/**
 * Placar da régua visual do Talk X (item 479 / TX05): a ausência de captura
 * tem de aparecer com o MOTIVO REAL de cada tela. O defeito corrigido aqui é o
 * inverso: qualquer tela sem captura era rotulada "não existe", escondendo que
 * as telas 02..17 existem e só não têm fixture ainda (contrato de crescimento
 * X003/X004). Estes testes provam a regra a partir da fixture real e do que a
 * execução do spec deixou no disco — nunca de um rótulo fixo.
 */

const FIXTURE_VAZIA = '{}\n';
const FIXTURE_COM_DADOS = JSON.stringify({ talkx_segments: [{ id: 'seg-office' }] });

/** Monta um diretório de fixtures com um JSON por tela. */
function dirDeFixtures(porTela) {
  const dir = mkdtempSync(join(tmpdir(), 'regua-fixtures-'));
  for (const [nn, conteudo] of Object.entries(porTela)) {
    writeFileSync(join(dir, `${nn}-tela-teste.json`), conteudo);
  }
  return dir;
}

test('lerFixture: {} é fixture vazia, JSON com chaves tem dados, arquivo ausente é undefined', () => {
  const dir = dirDeFixtures({ '01': FIXTURE_COM_DADOS, '02': FIXTURE_VAZIA });

  assert.deepEqual(lerFixture('01', dir), { arquivo: '01-tela-teste.json', comDados: true });
  assert.deepEqual(lerFixture('02', dir), { arquivo: '02-tela-teste.json', comDados: false });
  assert.equal(lerFixture('13', dir), undefined); // sem arquivo para a tela
});

test('classificarTela: fixture {} NÃO é "não existe" — é "sem-dados"', () => {
  // O defeito: a tela 02 existe no app e a fixture dela ainda é `{}` (contrato de
  // crescimento). O placar antigo dizia "Tela ainda não existe" para ela.
  const estado = classificarTela({
    temCaptura: false,
    naoExiste: null,
    fixture: { arquivo: '02-segmentos-biblioteca-detalhes.json', comDados: false },
  });
  assert.equal(estado, 'sem-dados');
  assert.notEqual(estado, 'sem-componente');
});

test('classificarTela: marcador nao-existe-NN.txt é o único caso de "sem-componente"', () => {
  assert.equal(
    classificarTela({
      temCaptura: false,
      naoExiste: 'tela ainda não existe: Campanha pausada e retomada',
      fixture: { arquivo: '13-campanha-pausada-retomada.json', comDados: false },
    }),
    'sem-componente',
  );
});

test('classificarTela: fixture com dados e captura é "capturada"', () => {
  assert.equal(
    classificarTela({
      temCaptura: true,
      naoExiste: null,
      fixture: { arquivo: '01-campanhas-visao-geral.json', comDados: true },
    }),
    'capturada',
  );
});

test('classificarTela: fixture com dados sem captura é "sem-captura" (artefato incompleto)', () => {
  // A régua deveria ter medido a tela 01 e não mediu: isso é uma ausência que o
  // placar precisa mostrar, não esconder atrás de "não existe".
  assert.equal(
    classificarTela({
      temCaptura: false,
      naoExiste: null,
      fixture: { arquivo: '01-campanhas-visao-geral.json', comDados: true },
    }),
    'sem-captura',
  );
});

test('classificarTela: tela sem arquivo de fixture conta como "sem-dados", nunca "não existe"', () => {
  assert.equal(
    classificarTela({ temCaptura: false, naoExiste: null, fixture: undefined }),
    'sem-dados',
  );
});

test('resumoDasTelas: conta capturadas, sem dados, sem componente e sem captura', () => {
  const linhas = [
    { estado: 'capturada' },
    { estado: 'sem-dados' },
    { estado: 'sem-dados' },
    { estado: 'sem-componente' },
    { estado: 'sem-captura' },
  ];
  assert.equal(
    resumoDasTelas(linhas),
    '5 telas · 1 capturadas · 2 sem dados ainda · 1 sem componente no app · 1 sem captura',
  );
});

test('gerarRegua: o index.html mostra o motivo real de cada ausência', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'regua-projeto-'));
  const refDir = join(raiz, 'references');
  const capDir = join(raiz, 'capturas');
  const fixDir = dirDeFixtures({ '01': FIXTURE_COM_DADOS, '02': FIXTURE_VAZIA, '13': FIXTURE_VAZIA });
  const outDir = join(raiz, 'saida');
  mkdirSync(refDir, { recursive: true });
  mkdirSync(capDir, { recursive: true });
  for (const nome of ['01_Tela_Um.png', '02_Tela_Dois.png', '13_Tela_Treze.png']) {
    writeFileSync(join(refDir, nome), 'png');
  }
  // Só a tela 01 foi capturada; a 13 é a única sem componente no app.
  writeFileSync(join(capDir, 'captura-01.png'), 'png');
  writeFileSync(join(capDir, 'nao-existe-13.txt'), 'tela ainda não existe: Tela Treze\n');

  const { linhas } = gerarRegua({ refDir, capDir, fixDir, outDir });
  const porTela = Object.fromEntries(linhas.map((l) => [l.nn, l.estado]));
  assert.deepEqual(porTela, { '01': 'capturada', '02': 'sem-dados', '13': 'sem-componente' });

  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  // A tela 02 existe e só não tem fixture: o placar diz o motivo real.
  assert.match(html, /02 — Tela Dois<\/h2><span class="pill falta">sem dados ainda/);
  assert.match(html, /fixture 02-tela-teste\.json ainda é \{\}/);
  // A 13 é a única que pode dizer "não existe".
  assert.match(html, /13 — Tela Treze<\/h2><span class="pill falta">não existe/);
  assert.match(html, /tela ainda não existe: Tela Treze/);
  // A 01 tem captura e não aparece como ausente.
  assert.match(html, /01 — Tela Um<\/h2><span class="pill ok">capturada/);
  assert.equal((html.match(/pill falta">não existe</g) ?? []).length, 1); // só a 13
  assert.match(
    html,
    /3 telas · 1 capturadas · 1 sem dados ainda · 1 sem componente no app · 0 sem captura/,
  );
});

test('gerarRegua: captura de execução anterior não é reexibida quando a fixture esvaziou', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'regua-stale-'));
  const refDir = join(raiz, 'references');
  const capDir = join(raiz, 'capturas');
  const fixDir = dirDeFixtures({ '02': FIXTURE_VAZIA });
  const outDir = join(raiz, 'saida');
  mkdirSync(refDir, { recursive: true });
  mkdirSync(capDir, { recursive: true });
  writeFileSync(join(refDir, '02_Tela_Dois.png'), 'png');
  writeFileSync(join(capDir, 'captura-02.png'), 'captura-velha'); // de um run anterior

  const { linhas } = gerarRegua({ refDir, capDir, fixDir, outDir });
  assert.equal(linhas[0].estado, 'sem-dados');
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /img\/captura\/02\.png/);
});
