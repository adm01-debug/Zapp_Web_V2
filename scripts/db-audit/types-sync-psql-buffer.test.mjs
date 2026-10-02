/**
 * Regressao (02/10/2026): o passo "Gerar candidatos em diretorio temporario" do
 * types-sync morreu com
 *
 *   Error: spawnSync psql ENOBUFS
 *
 * quando o dump de grants passou de 1 MB (medido: 1.039.627 bytes, run
 * 37053521236). O heredoc nao declarava `maxBuffer` e o default do Node e 1 MB.
 * Consequencia real: o pipeline oficial parou de propor o PR de sincronizacao e
 * o drift do "Contrato DB vivo" deixou de fechar sozinho.
 *
 * Este teste NAO reimplementa o heredoc: ele le o bloco REAL de
 * .github/workflows/types-sync.yml, exige o `maxBuffer` e executa o mesmo codigo
 * contra um psql de mentira que emite ~1,6 MB. Tambem executa a variante SEM o
 * `maxBuffer` para provar que o cenario discrimina (ENOBUFS).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOW = path.join(ROOT, '.github/workflows/types-sync.yml');
const MINIMO_ESPERADO = 8 * 1024 * 1024;

function extrairHeredoc() {
  const yml = fs.readFileSync(WORKFLOW, 'utf8');
  // O arquivo tem outros heredocs (ex.: o do passo "Exigir credencial do banco
  // oficial"). Ancorar no nome do passo para pegar o bloco certo.
  const inicioPasso = yml.indexOf('Gerar candidatos em diretorio temporario');
  assert.ok(inicioPasso > -1, 'passo "Gerar candidatos" nao encontrado em types-sync.yml');
  const m = /node --input-type=module <<'NODE'\r?\n([\s\S]*?)\r?\n\s*NODE\r?\n/.exec(yml.slice(inicioPasso));
  assert.ok(m, 'heredoc do passo "Gerar candidatos" nao encontrado em types-sync.yml');
  const codigo = m[1].replace(/^\s{10}/gm, '');
  assert.match(codigo, /function psqlFile\(file\)/, 'o heredoc extraido nao contem psqlFile()');
  return codigo;
}

function criarStubPsql() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'types-sync-buffer-'));
  const bin = path.join(dir, 'psql');
  // ~1,6 MB de saída, imitando o dump de grants (head+tr e instantaneo).
  const corpo = [
    '#!/bin/sh',
    'printf \'{"fim":1,"pad":"\'',
    'head -c 1600000 /dev/zero | tr \'\\0\' \'x\'',
    'printf \'"}\'',
    '',
  ].join('\n');
  fs.writeFileSync(bin, corpo, { mode: 0o755 });
  return bin;
}

function rodarHeredoc(codigo, binPsql) {
  const arquivo = path.join(ROOT, '.types-sync-heredoc.test.tmp.mjs');
  fs.writeFileSync(arquivo, codigo);
  try {
    return spawnSync(process.execPath, [arquivo], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PSQL_BIN: binPsql,
        DESTINO_URL: 'postgresql://postgres.fixture:senha@db.fixture.invalid:5432/postgres',
      },
    });
  } finally {
    fs.rmSync(arquivo, { force: true });
  }
}

const heredoc = extrairHeredoc();
const binPsql = criarStubPsql();

test('types-sync.yml: o execFileSync do psql declara maxBuffer suficiente', () => {
  const m = /maxBuffer:\s*([0-9_*\s]+?)\s*[,}]/.exec(heredoc);
  assert.ok(m, 'psqlFile() sem maxBuffer — o default de 1 MB volta a estourar ENOBUFS');
  const valor = eval(m[1].trim()); // eslint-disable-line no-eval
  assert.ok(
    valor >= MINIMO_ESPERADO,
    `maxBuffer=${valor} e menor que o minimo de ${MINIMO_ESPERADO} bytes`,
  );
  assert.match(heredoc, /function psqlFile\(file\)/, 'psqlFile() nao encontrada no heredoc');
});

test('heredoc real processa um dump acima de 1 MB', () => {
  const r = rodarHeredoc(heredoc, binPsql);
  assert.equal(
    r.status,
    0,
    `o heredoc falhou com um dump >1 MB (status=${r.status}): ${(r.stderr || '').slice(0, 400)}`,
  );
  assert.doesNotMatch(r.stderr || '', /ENOBUFS/, 'ENOBUFS: maxBuffer insuficiente');
});

test('sem maxBuffer o mesmo heredoc estoura ENOBUFS (o cenario discrimina)', () => {
  const semMaxBuffer = heredoc.replace(/,\s*maxBuffer:\s*[0-9_*\s]+/, '');
  assert.notEqual(semMaxBuffer, heredoc, 'nao foi possivel remover o maxBuffer para o controle');
  const r = rodarHeredoc(semMaxBuffer, binPsql);
  assert.notEqual(r.status, 0, 'sem maxBuffer o heredoc deveria falhar com um dump >1 MB');
  assert.match(
    `${r.stderr || ''}${r.stdout || ''}`,
    /ENOBUFS/,
    'o controle deveria falhar com ENOBUFS — se nao falhou, este teste nao prova nada',
  );
});
