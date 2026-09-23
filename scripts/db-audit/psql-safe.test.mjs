import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./psql-safe.mjs', import.meta.url));
const FIXTURE_URL = 'postgres://fixture-user:fixture-only-secret@fixture.invalid:6543/fixturedb';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'psql-safe-'));
}

// psql fake: grava o argv e um subconjunto do env recebidos em arquivos JSON,
// ecoa stdin (se houver) prefixado, escreve em stderr e sai com STUB_EXIT_CODE.
function writeStub(tmp) {
  const argvPath = path.join(tmp, 'argv.json');
  const envPath = path.join(tmp, 'env.json');
  const stubPath = path.join(tmp, 'psql-fake.mjs');
  fs.writeFileSync(stubPath, `#!/usr/bin/env node
import fs from 'node:fs';
const keys = ['PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGPASSFILE', 'PGCONNECT_TIMEOUT',
  'PGSSLMODE', 'PGSSLROOTCERT', 'DESTINO_URL'];
fs.writeFileSync(${JSON.stringify(argvPath)}, JSON.stringify(process.argv.slice(2)));
fs.writeFileSync(${JSON.stringify(envPath)}, JSON.stringify(Object.fromEntries(keys.map(k => [k, process.env[k]]))));
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  if (input) process.stdout.write('STDIN:' + input);
  process.stdout.write('stub-stdout\\n');
  process.stderr.write('stub-stderr\\n');
  process.exit(Number(process.env.STUB_EXIT_CODE || '0'));
});
process.stdin.resume();
`, { mode: 0o755 });
  return { stubPath, argvPath, envPath };
}

function run(stubPath, { args = [], env = {}, input } = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    input,
    env: { ...process.env, DESTINO_URL: FIXTURE_URL, PSQL_BIN: stubPath, ...env },
  });
}

test('forwards flags/args to psql without the connection string in argv', () => {
  const tmp = tmpDir();
  const { stubPath, argvPath } = writeStub(tmp);
  const result = run(stubPath, { args: ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-f', 'scripts/db-audit/catalog.sql'] });
  assert.equal(result.status, 0);
  const argv = JSON.parse(fs.readFileSync(argvPath, 'utf8'));
  assert.deepEqual(argv, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-f', 'scripts/db-audit/catalog.sql']);
  for (const a of argv) {
    assert.doesNotMatch(a, /fixture-only-secret/);
    assert.doesNotMatch(a, /postgres:\/\//);
  }
});

test('propagates psql stdin (heredoc), stdout and stderr, and its exit code', () => {
  const tmp = tmpDir();
  const { stubPath } = writeStub(tmp);
  const result = run(stubPath, { args: ['-X', '-At'], input: 'SELECT 1;\n', env: { STUB_EXIT_CODE: '0' } });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'STDIN:SELECT 1;\nstub-stdout\n');
  assert.equal(result.stderr, 'stub-stderr\n');
});

test('propagates a non-zero psql exit code unchanged', () => {
  const tmp = tmpDir();
  const { stubPath } = writeStub(tmp);
  const result = run(stubPath, { args: ['-X'], input: '', env: { STUB_EXIT_CODE: '3' } });
  assert.equal(result.status, 3);
});

test('derives PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSFILE from DESTINO_URL and never leaks DESTINO_URL to the child', () => {
  const tmp = tmpDir();
  const { stubPath, envPath } = writeStub(tmp);
  const result = run(stubPath, { args: ['-X'], input: '' });
  assert.equal(result.status, 0);
  const env = JSON.parse(fs.readFileSync(envPath, 'utf8'));
  assert.equal(env.PGHOST, 'fixture.invalid');
  assert.equal(env.PGPORT, '6543');
  assert.equal(env.PGUSER, 'fixture-user');
  assert.equal(env.PGDATABASE, 'fixturedb');
  assert.ok(env.PGPASSFILE && fs.existsSync(env.PGPASSFILE) === false, 'pgpass file must be cleaned up after the call');
  assert.equal(env.DESTINO_URL, undefined);
});

test('extracts sslmode/sslrootcert from DESTINO_URL query params when present', () => {
  const tmp = tmpDir();
  const { stubPath, envPath } = writeStub(tmp);
  const url = 'postgres://fixture-user:fixture-only-secret@fixture.invalid:6543/fixturedb'
    + '?sslmode=verify-full&sslrootcert=%2Ffixture%2Fca.pem';
  const result = run(stubPath, { args: ['-X'], input: '', env: { DESTINO_URL: url } });
  assert.equal(result.status, 0);
  const env = JSON.parse(fs.readFileSync(envPath, 'utf8'));
  assert.equal(env.PGSSLMODE, 'verify-full');
  assert.equal(env.PGSSLROOTCERT, '/fixture/ca.pem');
});

test('exits 2 without spawning psql when DESTINO_URL is unset', () => {
  const tmp = tmpDir();
  const { stubPath, argvPath } = writeStub(tmp);
  const env = { ...process.env, PSQL_BIN: stubPath };
  delete env.DESTINO_URL;
  const result = spawnSync(process.execPath, [SCRIPT, '-X'], { encoding: 'utf8', input: '', env });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /DESTINO_URL/);
  assert.equal(fs.existsSync(argvPath), false);
});

test('exits 2 with a sanitized error for an invalid DESTINO_URL', () => {
  const tmp = tmpDir();
  const { stubPath } = writeStub(tmp);
  const result = run(stubPath, { args: ['-X'], input: '', env: { DESTINO_URL: 'not-a-postgres-url' } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Invalid or unsupported PostgreSQL connection parameters/);
});
