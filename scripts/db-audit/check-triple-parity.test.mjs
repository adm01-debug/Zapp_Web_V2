import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./check-triple-parity.mjs', import.meta.url));

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex');
}

function makeFixture({ versoes, dirs, manifestNames, ledger, grantsFresco, grantsCommitado }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'triple-parity-'));
  const migDir = path.join(tmp, 'migrations');
  fs.mkdirSync(migDir);
  for (const v of versoes) fs.writeFileSync(path.join(migDir, `${v}_fixture_demo.sql`), 'SELECT 1;\n');
  // _foreign nao pode contar (regra CLAUDE.md §1.8)
  fs.mkdirSync(path.join(migDir, '_foreign'));
  fs.writeFileSync(path.join(migDir, '_foreign', '20200101000000_fora.sql'), 'SELECT 1;\n');

  const fnDir = path.join(tmp, 'functions');
  fs.mkdirSync(fnDir);
  fs.mkdirSync(path.join(fnDir, '_shared'));
  for (const d of dirs) fs.mkdirSync(path.join(fnDir, d));

  const manifestPath = path.join(tmp, 'deployment-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    functions: manifestNames.map((name) => ({ name, verify_jwt: true })),
  }));

  const grantsSqlPath = path.join(tmp, 'grants-baseline.sql');
  fs.writeFileSync(grantsSqlPath, '-- fixture\n');
  const grantsBaselinePath = path.join(tmp, 'grants-baseline.json');
  fs.writeFileSync(grantsBaselinePath, JSON.stringify(grantsCommitado));

  // psql fake: -c => count|md5 do ledger; -f => grants frescos
  const ledgerJoined = `${ledger.join('\n')}\n`;
  const psqlPath = path.join(tmp, 'psql-fake.mjs');
  fs.writeFileSync(psqlPath, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes('-c')) {
  process.stdout.write(${JSON.stringify(`${ledger.length}|${md5(ledgerJoined)}`)} + '\\n');
} else {
  process.stdout.write(${JSON.stringify(JSON.stringify(grantsFresco))});
}
`, { mode: 0o755 });

  return { tmp, migDir, fnDir, manifestPath, grantsSqlPath, grantsBaselinePath, psqlPath };
}

function run(fx, { env = {}, args = [] } = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DESTINO_URL: 'postgres://fixture:synthetic-only@fixture.invalid:5432/postgres',
      MIGRATIONS_DIR: fx.migDir,
      FUNCTIONS_DIR: fx.fnDir,
      MANIFEST_PATH: fx.manifestPath,
      GRANTS_SQL_PATH: fx.grantsSqlPath,
      GRANTS_BASELINE_PATH: fx.grantsBaselinePath,
      PSQL_BIN: fx.psqlPath,
      ...env,
    },
  });
}

test('paridade tripla verde quando as tres pernas batem (generated_at ignorado)', () => {
  const fx = makeFixture({
    versoes: ['20260901000000', '20260902000000'],
    dirs: ['fn-a', 'fn-b'],
    manifestNames: ['fn-a', 'fn-b'],
    ledger: ['20260901000000', '20260902000000'],
    grantsFresco: { generated_at: '2026-09-21', r: 1 },
    grantsCommitado: { generated_at: '2026-09-16', r: 1 },
  });
  const res = run(fx);
  assert.equal(res.status, 0, res.stderr + res.stdout);
  assert.match(res.stdout, /OK: paridade tripla verificada/);
});

test('detecta divergencia arquivos↔ledger (md5/count)', () => {
  const fx = makeFixture({
    versoes: ['20260901000000', '20260902000000'],
    dirs: ['fn-a'],
    manifestNames: ['fn-a'],
    ledger: ['20260901000000'],
    grantsFresco: { r: 1 },
    grantsCommitado: { r: 1 },
  });
  const res = run(fx);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /count divergente/);
});

test('detecta edge em disco fora do manifesto e vice-versa', () => {
  const fx = makeFixture({
    versoes: ['20260901000000'],
    dirs: ['fn-a', 'fn-nova'],
    manifestNames: ['fn-a', 'fn-removida'],
    ledger: ['20260901000000'],
    grantsFresco: { r: 1 },
    grantsCommitado: { r: 1 },
  });
  const res = run(fx);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /so em disco.*fn-nova/);
  assert.match(res.stderr, /so no manifesto: fn-removida/);
});

test('detecta grants-baseline desatualizado', () => {
  const fx = makeFixture({
    versoes: ['20260901000000'],
    dirs: ['fn-a'],
    manifestNames: ['fn-a'],
    ledger: ['20260901000000'],
    grantsFresco: { r: 2 },
    grantsCommitado: { r: 1 },
  });
  const res = run(fx);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /grants-baseline desatualizado/);
});

test('sem DESTINO_URL roda so a perna local de edges', () => {
  const fx = makeFixture({
    versoes: ['20260901000000'],
    dirs: ['fn-a'],
    manifestNames: ['fn-a'],
    ledger: [],
    grantsFresco: { r: 1 },
    grantsCommitado: { r: 1 },
  });
  const res = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DESTINO_URL: '',
      MIGRATIONS_DIR: fx.migDir,
      FUNCTIONS_DIR: fx.fnDir,
      MANIFEST_PATH: fx.manifestPath,
      GRANTS_SQL_PATH: fx.grantsSqlPath,
      GRANTS_BASELINE_PATH: fx.grantsBaselinePath,
      PSQL_BIN: fx.psqlPath,
    },
  });
  assert.equal(res.status, 0, res.stderr + res.stdout);
  assert.match(res.stdout, /\[migrations\] pulado/);
  assert.match(res.stdout, /\[grants\] pulado/);
  assert.match(res.stdout, /PARCIAL:.*1\/3/);
  assert.doesNotMatch(res.stdout, /OK: paridade tripla verificada/);
});

test('grants com chaves em ordem diferente mas conteudo igual PASSAM (comparacao canonica)', () => {
  const fx = makeFixture({
    versoes: ['20260901000000'],
    dirs: ['fn-a'],
    manifestNames: ['fn-a'],
    ledger: ['20260901000000'],
    grantsFresco: { b: 2, a: 1 },
    grantsCommitado: { a: 1, b: 2 },
  });
  const res = run(fx);
  assert.equal(res.status, 0, res.stderr + res.stdout);
});

test('psql com exit!=0 vira falha controlada sem vazar a DESTINO_URL', () => {
  const fx = makeFixture({
    versoes: ['20260901000000'],
    dirs: ['fn-a'],
    manifestNames: ['fn-a'],
    ledger: ['20260901000000'],
    grantsFresco: { r: 1 },
    grantsCommitado: { r: 1 },
  });
  fs.writeFileSync(fx.psqlPath, '#!/usr/bin/env node\nprocess.stderr.write("connection refused");\nprocess.exit(2);\n', { mode: 0o755 });
  const res = run(fx);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /psql falhou \(exit 2\)/);
  assert.doesNotMatch(res.stderr, /postgres:\/\//);
  assert.doesNotMatch(res.stdout + res.stderr, /at .*check-triple-parity\.mjs/, 'sem stack trace');
});

function minimalFixture() {
  return makeFixture({ versoes: ['20260901000000'], dirs: ['fn-a'], manifestNames: ['fn-a'],
    ledger: ['20260901000000'], grantsFresco: { r: 1 }, grantsCommitado: { r: 1 } });
}

test('--require-live falha fechado sem banco, sem sucesso global', () => {
  const result = run(minimalFixture(), { env: { DESTINO_URL: '' }, args: ['--require-live'] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /require-live/);
  assert.doesNotMatch(result.stdout, /OK: paridade tripla verificada/);
});

test('argumento desconhecido falha para evitar typo desativar requisito live', () => {
  assert.equal(run(minimalFixture(), { args: ['--require-lvie'] }).status, 1);
});

test('erro do psql nao propaga stdout/stderr com URL, senha ou payload', () => {
  const fx = minimalFixture();
  fs.writeFileSync(fx.psqlPath, '#!/usr/bin/env node\nprocess.stderr.write("postgres://u:fixture-secret@db/test Authorization: Bearer fixture-secret"); process.exit(2);', { mode: 0o755 });
  const result = run(fx);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-secret|postgres:\/\//);
});

test('manifesto com nome duplicado nao pode ser mascarado por Set', () => {
  const fx = minimalFixture();
  fs.writeFileSync(fx.manifestPath, JSON.stringify({ functions: [{ name: 'fn-a' }, { name: 'fn-a' }] }));
  assert.equal(run(fx).status, 1);
});

test('stdout inesperado do psql nao pode vazar payload em count/hash', () => {
  const fx = minimalFixture();
  fs.writeFileSync(fx.psqlPath, '#!/usr/bin/env node\nprocess.stdout.write("fixture-private-response");', { mode: 0o755 });
  const result = run(fx);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-private-response/);
});

test('a URL fica fora do argv do psql', () => {
  const fx = minimalFixture();
  fs.writeFileSync(fx.psqlPath, '#!/usr/bin/env node\nif(process.argv.some(a=>a.startsWith("postgres:")))process.exit(91); process.exit(12);', { mode: 0o755 });
  const result = run(fx);
  assert.match(result.stderr, /exit 12/);
  assert.doesNotMatch(result.stderr, /exit 91/);
});

test('psql recebe parametros libpq separados, nao URI em PGDATABASE', () => {
  const fx = minimalFixture();
  const script = fs.readFileSync(fx.psqlPath, 'utf8');
  fs.writeFileSync(fx.psqlPath, script.replace('const args =', `
if (process.env.PGDATABASE !== 'postgres' || process.env.PGHOST !== 'fixture.invalid'
  || process.env.PGUSER !== 'fixture' || process.env.PGPORT !== '5432') process.exit(93);
if (process.env.PGPASSWORD || process.env.DESTINO_URL || !process.env.PGPASSFILE) process.exit(94);
const args =`));
  const result = run(fx);
  assert.equal(result.status, 0, result.stderr);
});

test('SQL local com versao duplicada falha mesmo sem acesso ao banco', () => {
  const fx = minimalFixture();
  fs.writeFileSync(path.join(fx.migDir, '20260901000000_duplicate.sql'), 'SELECT 1;');
  assert.equal(run(fx, { env: { DESTINO_URL: '' } }).status, 1);
});

test('SQL local com nome invalido nao desaparece da contagem', () => {
  const fx = minimalFixture();
  fs.writeFileSync(path.join(fx.migDir, 'bad.sql'), 'SELECT 1;');
  assert.equal(run(fx, { env: { DESTINO_URL: '' } }).status, 1);
});

test('grants: note/how_to_regenerate divergentes PASSAM; mudanca de ACL continua FALHANDO', () => {
  const base = { versoes: ['20260901000000'], dirs: ['fn-a'], manifestNames: ['fn-a'], ledger: ['20260901000000'] };
  const soTexto = run(makeFixture({
    ...base,
    grantsFresco: { note: 'texto do SQL', how_to_regenerate: 'x.sql', anon_execute: ['f()'] },
    grantsCommitado: { note: 'texto editado a mao', how_to_regenerate: 'y.sql', anon_execute: ['f()'] },
  }));
  assert.equal(soTexto.status, 0, soTexto.stderr + soTexto.stdout);
  const acl = run(makeFixture({
    ...base,
    grantsFresco: { note: 'n', anon_execute: ['f()', 'g()'] },
    grantsCommitado: { note: 'n', anon_execute: ['f()'] },
  }));
  assert.equal(acl.status, 1);
  assert.match(acl.stderr, /grants-baseline desatualizado/);
});
