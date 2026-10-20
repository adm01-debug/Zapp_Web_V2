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

// --- Retry de falha de transporte (db-live-guard). Desligado por padrao: um
// timeout do pooler abria issue de "contrato quebrado" que nao era verdade,
// mas ligar isso para todo mundo daria retry em escrita (register-migration).
const semRetry = { PATH: '/fixture/bin' };
const comRetry = { PATH: '/fixture/bin', PSQL_CONNECT_RETRIES: '2', PSQL_CONNECT_RETRY_DELAY_MS: '0' };
const transporte = () => Object.assign(new Error('psql falhou'), {
  stderr: 'psql: error: connection to server at "pooler.invalid" (10.0.0.1), port 5432 failed: timeout expired',
});

test('sem PSQL_CONNECT_RETRIES uma falha de transporte nao e repetida', () => {
  let chamadas = 0;
  assert.throws(() => withPsqlEnvironment(uri, () => { chamadas += 1; throw transporte(); },
    { baseEnv: semRetry }), /psql falhou/);
  assert.equal(chamadas, 1);
});

test('com retry, falha de transporte tenta ate o limite e propaga o erro original', () => {
  let chamadas = 0;
  assert.throws(() => withPsqlEnvironment(uri, () => { chamadas += 1; throw transporte(); },
    { baseEnv: comRetry }), /psql falhou/);
  assert.equal(chamadas, 3);
});

test('com retry, sucesso numa tentativa seguinte devolve o valor', () => {
  let chamadas = 0;
  const valor = withPsqlEnvironment(uri, () => {
    chamadas += 1;
    if (chamadas < 2) throw transporte();
    return 'ok';
  }, { baseEnv: comRetry });
  assert.equal(valor, 'ok');
  assert.equal(chamadas, 2);
});

test('retry nunca cobre erro deterministico: SQL, autenticacao e drift falham de primeira', () => {
  for (const stderr of [
    'ERROR:  relation "public.inexistente" does not exist',
    'psql: error: connection to server failed: FATAL:  password authentication failed for user "postgres"',
    'psql: error: connection to server failed: FATAL:  no pg_hba.conf entry for host',
  ]) {
    let chamadas = 0;
    assert.throws(() => withPsqlEnvironment(uri, () => {
      chamadas += 1;
      throw Object.assign(new Error('psql falhou'), { stderr });
    }, { baseEnv: comRetry }), /psql falhou/);
    assert.equal(chamadas, 1, `nao devia repetir: ${stderr.slice(0, 40)}`);
  }
});

test('o passfile temporario e removido mesmo depois de esgotar os retries', () => {
  let file;
  assert.throws(() => withPsqlEnvironment(uri, env => { file = env.PGPASSFILE; throw transporte(); },
    { baseEnv: comRetry }), /psql falhou/);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(path.dirname(file)), false);
});

// Paridade com TRANSIENT_CONNECTION_RE de check-migration-drift.mjs: o
// db-live-guard desliga o retry de la (LEDGER_RETRY_DELAYS_MS="") para nao
// multiplicar tentativas, entao esta camada precisa reconhecer os mesmos casos.
test('reconhece como transporte os padroes herdados do retry do ledger', () => {
  for (const stderr of [
    'psql: error: connection to server failed: timeout expired',
    'psql: error: ECHECKOUTRETRIES: could not obtain connection from pool',
    'FATAL:  sorry, too many clients already',
    'FATAL:  terminating connection due to administrator command',
    'server closed the connection unexpectedly',
    'psql: error: connection reset by peer',
    'psql: error: connection terminated',
    'could not translate host name "pooler.invalid" to address',
    'psql: error: could not connect to server: Connection refused',
  ]) {
    let chamadas = 0;
    assert.throws(() => withPsqlEnvironment(uri, () => {
      chamadas += 1;
      throw Object.assign(new Error('psql falhou'), { stderr });
    }, { baseEnv: comRetry }), /psql falhou/);
    assert.equal(chamadas, 3, `devia repetir: ${stderr.slice(0, 45)}`);
  }
});
