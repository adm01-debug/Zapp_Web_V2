import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { diferenca, explicar, identificadoresDoTsc, mencionado } from './drift-explicado.mjs';

const SCRIPT = new URL('./drift-explicado.mjs', import.meta.url);

const catalogo = (extra = {}) =>
  JSON.stringify({ format_version: 2, tables: [], views: [], functions: [], enums: [], ...extra });

function cenario({ base = {}, novo = {}, migrations = {} }) {
  const root = mkdtempSync(join(tmpdir(), 'zapp-explicado-'));
  const mig = join(root, 'migrations');
  mkdirSync(mig, { recursive: true });
  writeFileSync(join(root, 'base.json'), catalogo(base));
  writeFileSync(join(root, 'novo.json'), catalogo(novo));
  for (const [nome, sql] of Object.entries(migrations)) writeFileSync(join(mig, nome), sql);
  return { root, mig };
}

function rodar(root, extra = []) {
  const r = spawnSync(
    process.execPath,
    [SCRIPT.pathname, '--base', join(root, 'base.json'), '--novo', join(root, 'novo.json'),
      '--migrations-dir', join(root, 'migrations'), ...extra],
    { encoding: 'utf8' },
  );
  rmSync(root, { recursive: true, force: true });
  return r;
}

test('GA22: tabela nova criada por migration passa', () => {
  const { root } = cenario({
    base: { tables: ['clientes'] },
    novo: { tables: ['clientes', 'pedidos'] },
    migrations: { '20261020090000_pedidos.sql': 'CREATE TABLE public.pedidos (id uuid PRIMARY KEY);' },
  });
  const r = rodar(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /explicado: tabela pedidos/);
});

test('GA22: tabela nova sem migration (DDL por fora) bloqueia', () => {
  const { root } = cenario({
    base: { tables: ['clientes'] },
    novo: { tables: ['clientes', 'tabela_fantasma'] },
    migrations: { '20261020090000_outra.sql': 'CREATE TABLE public.outra (id uuid);' },
  });
  const r = rodar(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /SEM MIGRATION: tabela tabela_fantasma/);
});

test('GA22: coluna nova explicada por ALTER TABLE passa; sem ALTER bloqueia', () => {
  const base = { tables: ['clientes'], columns: ['clientes.nome:text:nullable'] };
  const novo = { ...base, columns: [...base.columns, 'clientes.apelido:text:nullable'] };
  const ok = cenario({
    base, novo,
    migrations: { '20261020100000_col.sql': 'ALTER TABLE public.clientes ADD COLUMN apelido text;' },
  });
  assert.equal(rodar(ok.root).status, 0);
  const ruim = cenario({ base, novo, migrations: { '20261020100000_x.sql': 'SELECT 1;' } });
  const r = rodar(ruim.root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /coluna clientes\.apelido/);
});

test('GA22/GA24: --versions restringe as migrations consideradas', () => {
  const { root, mig } = cenario({
    base: { tables: [] },
    novo: { tables: ['pedidos'] },
    migrations: {
      '20261020090000_a.sql': 'CREATE TABLE public.pedidos (id uuid);',
      '20261020110000_b.sql': 'SELECT 1;',
    },
  });
  void mig;
  const r = rodar(root, ['--versions', '20261020110000']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /SEM MIGRATION/);
});

test('GA22: sem divergencia, exit 0 sem exigir migration', () => {
  const { root } = cenario({ base: { tables: ['a'] }, novo: { tables: ['a'] }, migrations: {} });
  const r = rodar(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /nada a explicar/);
});

test('GA22: entrada ausente e fail-closed (exit 2)', () => {
  const root = mkdtempSync(join(tmpdir(), 'zapp-explicado-'));
  try {
    const r = spawnSync(process.execPath, [SCRIPT.pathname, '--base', join(root, 'x.json')], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unidade: mencionado() aceita schema, aspas e rel.col separados', () => {
  assert.equal(mencionado('pedidos', 'CREATE TABLE public.pedidos (id uuid);'), true);
  assert.equal(mencionado('pedidos', 'CREATE TABLE "pedidos" (id uuid);'), true);
  assert.equal(mencionado('clientes.apelido', 'ALTER TABLE clientes ADD COLUMN apelido text;'), true);
  assert.equal(mencionado('pedidos', 'SELECT 1;'), false);
  // Substring nao e mencao: 'ped' nao explica 'pedidos'.
  assert.equal(mencionado('pedidos', 'CREATE TABLE ped (id int);'), false);
});

test('unidade: diferenca() ignora remocao (assunto do Gate 3)', () => {
  const base = JSON.parse(catalogo({ tables: ['velha', 'viva'] }));
  const novo = JSON.parse(catalogo({ tables: ['viva'] }));
  assert.deepEqual(diferenca(base, novo), []);
});

test('unidade: explicar() separa explicados de DDL por fora', () => {
  const { explicados, naoExplicados } = explicar(
    [{ kind: 'tabela', nome: 'a' }, { kind: 'tabela', nome: 'b' }],
    [{ arquivo: 'm.sql', texto: 'CREATE TABLE a (id int);' }],
  );
  assert.deepEqual(explicados.map((u) => u.nome), ['a']);
  assert.deepEqual(naoExplicados.map((u) => u.nome), ['b']);
});

test('GA23: identificadoresDoTsc extrai nomes citados em erros TS', () => {
  const log = [
    "src/x.ts(3,5): error TS2339: Property 'apelido' does not exist on type 'Cliente'.",
    "src/y.ts(1,1): error TS2304: Cannot find name 'pedidos'.",
    'compilado com sucesso em 12s',
  ].join('\n');
  const ids = identificadoresDoTsc(log);
  assert.ok(ids.includes('apelido'), ids.join(','));
  assert.ok(ids.includes('pedidos'), ids.join(','));
  assert.ok(!ids.includes('compilado'), ids.join(','));
});
