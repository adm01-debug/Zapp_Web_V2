// GA17: portao de migration destrutiva — DROP/REVOKE/TRUNCATE/DELETE fora de
// comentarios, strings e corpos dollar-quoted sao barrados sem confirmacao;
// dentro deles, sao invisiveis para o portao.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listarDestrutivos, haDestrutivo, faltandoConfirmacao } from '../db-audit/list-destructive.mjs';

test('GA17: DDL destrutivo real e detectado', () => {
  assert.equal(listarDestrutivos('DROP TABLE public.x;').length, 1);
  assert.equal(listarDestrutivos('ALTER TABLE t DROP COLUMN c;')[0].tipo, 'DROP');
  assert.equal(listarDestrutivos('REVOKE SELECT ON t FROM anon;')[0].tipo, 'REVOKE');
  assert.equal(listarDestrutivos('TRUNCATE public.t;')[0].tipo, 'TRUNCATE');
  assert.equal(listarDestrutivos('DELETE FROM public.t WHERE a = 1;')[0].tipo, 'DELETE');
  assert.equal(haDestrutivo('DROP TABLE x;'), true);
});

test('GA17: comentario, string e corpo dollar-quoted nao disparam o portao', () => {
  assert.deepEqual(listarDestrutivos('-- DROP TABLE x\nCREATE TABLE t (a int);'), []);
  assert.deepEqual(listarDestrutivos('/* DROP TABLE x */ CREATE TABLE t (a int);'), []);
  assert.deepEqual(listarDestrutivos("SELECT 'DROP TABLE x';"), []);
  assert.deepEqual(
    listarDestrutivos('CREATE FUNCTION f() RETURNS void AS $$ BEGIN DROP TABLE x; END; $$ LANGUAGE plpgsql;'),
    [],
  );
  assert.equal(haDestrutivo('CREATE TABLE t (a int);'), false);
  assert.equal(haDestrutivo('ALTER TABLE t ADD COLUMN c int;'), false);
});

test('GA17: confirmacao cobre todas as versions destrutivas', () => {
  assert.deepEqual(faltandoConfirmacao('20261001120000', '20261001120000'), []);
  assert.deepEqual(
    faltandoConfirmacao('20261001120000,20261001130000', '20261001120000'),
    ['20261001130000'],
  );
  const raiz = new URL('../../', import.meta.url).pathname;
  const roda = (args) =>
    spawnSync(process.execPath, ['scripts/db-audit/list-destructive.mjs', ...args], {
      cwd: raiz,
      encoding: 'utf8',
    });
  assert.equal(roda(['--confirmar', '20261001120000', '--com', '20261001120000']).status, 0);
  const r = roda(['--confirmar', '20261001120000', '--com', '']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /confirm_destructive com: 20261001120000/);
});

test('GA17: trecho aponta a evidencia e tipo e canonico', () => {
  const [achado] = listarDestrutivos('CREATE TABLE t (a int);\nDROP TABLE public.antiga;');
  assert.equal(achado.tipo, 'DROP');
  assert.match(achado.trecho, /DROP TABLE public\.antiga/);
});

test('GA17: CLI — exit 0 limpo, 1 destrutivo, 2 erro', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ga17-'));
  try {
    const limpo = join(dir, 'limpa.sql');
    const suja = join(dir, 'suja.sql');
    writeFileSync(limpo, 'CREATE TABLE t (a int);');
    writeFileSync(suja, 'DROP TABLE public.antiga;');
    const raiz = new URL('../../', import.meta.url).pathname;
    const roda = (args) =>
      spawnSync(process.execPath, ['scripts/db-audit/list-destructive.mjs', ...args], {
        cwd: raiz,
        encoding: 'utf8',
      });
    assert.equal(roda(['--arquivo', limpo]).status, 0);
    const r1 = roda(['--arquivo', suja, '--versao', '20261001120000']);
    assert.equal(r1.status, 1);
    assert.match(r1.stderr, /confirm_destructive=20261001120000/);
    assert.equal(roda(['--arquivo', join(dir, 'nao-existe.sql')]).status, 2);
    assert.equal(roda([]).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Furos achados pela revisao automatica da PR #3133 e fechados antes do merge.
// Os tres primeiros passavam como "migration limpa"; os dez de baixo tem de
// continuar passando, senao o portao barra lote legitimo.
test('GA17: DROP de coluna sem a palavra COLUMN é destrutivo', () => {
  // No PostgreSQL a palavra COLUMN é opcional: as duas formas removem a coluna.
  assert.equal(listarDestrutivos('ALTER TABLE public.clientes DROP apelido;')[0].tipo, 'DROP');
  assert.equal(listarDestrutivos('ALTER TABLE public.clientes DROP IF EXISTS apelido;')[0].tipo, 'DROP');
  // E a forma com COLUMN segue detectada.
  assert.equal(listarDestrutivos('ALTER TABLE public.clientes DROP COLUMN apelido;')[0].tipo, 'DROP');
  // Mistura num statement só: a sub-ação inócua não esconde o DROP de coluna.
  assert.equal(listarDestrutivos('ALTER TABLE t ALTER COLUMN a DROP DEFAULT, DROP COLUMN b;').length, 1);
});

test('GA17: DELETE e TRUNCATE embutidos em CTE são destrutivos', () => {
  // O statement começa por `WITH`, então o ancoramento em `^` não os via.
  const cte = listarDestrutivos('WITH r AS (DELETE FROM public.clientes RETURNING id) SELECT count(*) FROM r;');
  assert.equal(cte.length, 1);
  assert.equal(cte[0].tipo, 'DELETE');
  assert.equal(listarDestrutivos('WITH r AS (SELECT 1) TRUNCATE public.clientes;')[0].tipo, 'TRUNCATE');
});

test('GA17: sub-ações de ALTER COLUMN e DML não destrutiva não barram o lote', () => {
  // Estas não removem dado nem estrutura — barrar aqui travaria migration rotineira.
  for (const sql of [
    'ALTER TABLE public.clientes ALTER COLUMN apelido DROP DEFAULT;',
    'ALTER TABLE public.clientes ALTER COLUMN apelido DROP NOT NULL;',
    'ALTER TABLE public.clientes ALTER COLUMN a DROP IDENTITY;',
    'ALTER TABLE public.clientes ALTER COLUMN a DROP EXPRESSION;',
    'ALTER TABLE public.clientes ADD COLUMN apelido text;',
    'CREATE TABLE public.novo (id uuid);',
    'UPDATE public.clientes SET a = 1;',
    'WITH r AS (UPDATE public.clientes SET a=1 RETURNING id) SELECT * FROM r;',
    'INSERT INTO public.clientes (id) VALUES (gen_random_uuid());',
    // O lexer torna a string opaca, então a palavra lá dentro não conta.
    "COMMENT ON TABLE public.clientes IS 'drop table clientes';",
  ]) {
    assert.deepEqual(listarDestrutivos(sql), [], `não deveria acusar: ${sql}`);
  }
});
