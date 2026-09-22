import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { withPsqlEnvironment } from './psql-environment.mjs';

const uri = 'postgresql://postgres.project:synthetic%3Ap%40ss%5Cword@fixture.invalid:6543/postgres?sslmode=verify-full&sslrootcert=fixtures%2Froot%20ca.pem&connect_timeout=7';

test('separates URI parameters, preserves TLS and hides credentials in private temporary passfile', () => {
  let file;
  const baseEnv = { PATH: '/fixture/bin', DESTINO_URL: uri, PGDATABASE: uri, PGHOSTADDR: 'other',
    PGSERVICE: 'other', PGSERVICEFILE: '/other', PGPASSFILE: '/other', PGPASSWORD: 'other', PGSSLMODE: 'disable' };
  const original = { ...baseEnv };
  assert.equal(withPsqlEnvironment(uri, env => {
    file = env.PGPASSFILE;
    assert.equal(env.PGHOST, 'fixture.invalid');
    assert.equal(env.PGUSER, 'postgres.project');
    assert.equal(env.PGPORT, '6543');
    assert.equal(env.PGDATABASE, 'postgres');
    assert.equal(env.PGSSLMODE, 'verify-full');
    assert.equal(env.PGSSLROOTCERT, 'fixtures/root ca.pem');
    assert.equal(env.PGCONNECT_TIMEOUT, '7');
    assert.equal(env.PATH, '/fixture/bin');
    for (const key of ['DESTINO_URL', 'PGPASSWORD', 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE']) assert.equal(env[key], undefined);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
    assert.equal(fs.readFileSync(file, 'utf8'), 'fixture.invalid:6543:postgres:postgres.project:synthetic\\:p@ss\\\\word\n');
    return 42;
  }, { baseEnv }), 42);
  assert.deepEqual(baseEnv, original);
  assert.equal(fs.existsSync(file), false);
});

test('cleans the exact temporary password file on child failure', () => {
  let file;
  assert.throws(() => withPsqlEnvironment(uri, env => { file = env.PGPASSFILE; throw new Error('child failed'); }), /child failed/);
  assert.equal(fs.existsSync(file), false);
});

test('IPv6, escaped usernames/databases and empty password preserve libpq semantics', () => {
  withPsqlEnvironment('postgres://user%3Aname@[::1]/db%20name', env => {
    assert.equal(env.PGHOST, '::1');
    assert.equal(env.PGDATABASE, 'db name');
    assert.equal(env.PGPORT, '5432');
    assert.equal(fs.readFileSync(env.PGPASSFILE, 'utf8'), '\\:\\:1:5432:db name:user\\:name:\n');
  });
});

for (const query of ['host=wrong', 'hostaddr=127.0.0.1', 'user=wrong', 'dbname=wrong', 'password=wrong',
  'service=other', 'sslmode=verify-full&sslmode=disable', 'unknown_option=1']) {
  test(`rejects URI overrides/ambiguous options: ${query.split('=')[0]}`, () => {
    assert.throws(() => withPsqlEnvironment(`postgres://u:synthetic-only@fixture.invalid/postgres?${query}`, () => assert.fail()), error => {
      assert.doesNotMatch(error.message, /synthetic-only|postgres:\/\//);
      return true;
    });
  });
}

for (const invalid of ['invalid-synthetic-secret', 'https://u:p@fixture.invalid/postgres',
  'postgres://u:secret%0Aline@fixture.invalid/postgres', 'postgres://u:secret%00null@fixture.invalid/postgres',
  'postgres://u:secret%ZZ@fixture.invalid/postgres', 'postgres://u:p@fixture.invalid/',
  'postgres://u:p@fixture.invalid/postgres#fragment']) {
  test('invalid connection is rejected without copying input into diagnostics', () => {
    assert.throws(() => withPsqlEnvironment(invalid, () => assert.fail()), error => {
      assert.equal(error.message, 'Invalid or unsupported PostgreSQL connection parameters (details omitted)');
      return true;
    });
  });
}
