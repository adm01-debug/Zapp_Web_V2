import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import crypto from 'node:crypto';
import { splitStatements, buildInsertSql, parseMigrationFile } from './register-migration.mjs';

const SCRIPT = fileURLToPath(new URL('./register-migration.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '../..');

function withTmpFile(name, content, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'register-migration-test-'));
  const filePath = path.join(tmp, name);
  fs.writeFileSync(filePath, content);
  try {
    return fn(filePath, tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Identidade de fixture (E46): ref valido de 20 chars + database 'test',
// para que os testes de --apply passem pela blindagem de banco sem tocar
// na identidade oficial versionada.
const FIXTURE_REF = 'aaaaaaaaaaaaaaaaaaaa';
const FIXTURE_URL = `postgres://postgres:pw@db.${FIXTURE_REF}.supabase.co/test`;
function fixtureIdentity(tmp) {
  const file = path.join(tmp, 'identity.json');
  const sha = crypto.createHash('sha256').update(FIXTURE_REF).digest('hex');
  fs.writeFileSync(file, JSON.stringify({
    format_version: 1,
    connection_provider: 'supabase-cloud',
    project_ref_sha256: sha,
    database: 'test',
    schema: 'public',
    server_major: 17,
  }));
  return file;
}

function fakePsql(tmp, { maxVersionOutput = '', insertOutput = '', failOnInsert = false } = {}) {
  const script = path.join(tmp, 'fake-psql.mjs');
  fs.writeFileSync(
    script,
    `#!/usr/bin/env node
const sql = process.argv[process.argv.length - 1];
if (sql.startsWith('SELECT max(version)')) {
  process.stdout.write(${JSON.stringify(maxVersionOutput)});
  process.exit(0);
}
if (${failOnInsert}) { process.exit(1); }
process.stdout.write(${JSON.stringify(insertOutput)});
`,
    { mode: 0o700 },
  );
  return script;
}

function runScript(filePath, env) {
  return spawnSync(process.execPath, [SCRIPT, filePath, '--apply'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 10_000,
  });
}

test('splitStatements respects dollar-quoted function bodies (does not split on internal semicolons)', () => {
  const sql = `CREATE OR REPLACE FUNCTION public.demo()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO t (a) VALUES (1);
  UPDATE t SET a = 2;
END;
$$;
GRANT EXECUTE ON FUNCTION public.demo() TO service_role;`;
  const statements = splitStatements(sql);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /BEGIN[\s\S]*END;\s*\$\$$/);
  assert.equal(statements[1], 'GRANT EXECUTE ON FUNCTION public.demo() TO service_role');
});

test('splitStatements strips line comments but preserves them inside dollar-quoted bodies', () => {
  const sql = `-- top-level comment, must be stripped
CREATE TABLE public.demo (id integer); -- trailing comment
CREATE OR REPLACE FUNCTION public.f() RETURNS int LANGUAGE sql AS $$
  SELECT 1; -- comment inside body must survive, it is part of the function text
$$;`;
  const statements = splitStatements(sql);
  assert.equal(statements.length, 2);
  assert.equal(statements[0], 'CREATE TABLE public.demo (id integer);'.replace(/;$/, ''));
  assert.match(statements[1], /comment inside body must survive/);
});

test('buildInsertSql picks a dollar-quote tag that does not collide with the statement body', () => {
  const sql = buildInsertSql('20260101000000', 'demo', ['$stmt$ this contains the default tag $stmt$ already']);
  assert.match(sql, /\$reg\$/);
  assert.doesNotMatch(sql, /\$stmt\$ \$reg\$/);
});

test('parseMigrationFile rejects a filename that does not match the version_name.sql convention', () => {
  withTmpFile('not-a-migration.sql', 'SELECT 1;', (filePath) => {
    assert.throws(() => parseMigrationFile(filePath), /Nome de arquivo invalido/);
  });
});

test('parseMigrationFile rejects a file with no real statements', () => {
  withTmpFile('20260101000000_empty.sql', '-- only a comment\n', (filePath) => {
    assert.throws(() => parseMigrationFile(filePath), /Nenhum statement real/);
  });
});

test('register --apply aborts when the file version is not strictly greater than the live max(version)', () => {
  withTmpFile('20260101000000_demo.sql', 'CREATE TABLE public.demo (id integer);', (filePath, tmp) => {
    const psql = fakePsql(tmp, { maxVersionOutput: '20260101000000' }); // same version already registered
    const result = runScript(filePath, { DESTINO_URL: FIXTURE_URL, DATABASE_IDENTITY_PATH: fixtureIdentity(tmp), PSQL_BIN: psql });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /nao e estritamente maior que max\(version\)/);
  });
});

test('register --apply aborts when INSERT ... ON CONFLICT DO NOTHING RETURNING comes back empty (masked collision)', () => {
  // Simula exatamente o bug real desta sessao: duas migrations paralelas
  // escolhem a mesma versao antes de qualquer uma mergear. A segunda a
  // aplicar tem max(version) < sua propria versao (parece livre), mas o
  // INSERT colide silenciosamente porque a outra ja ocupou a linha.
  withTmpFile('20260916999000_demo.sql', 'CREATE TABLE public.demo (id integer);', (filePath, tmp) => {
    const psql = fakePsql(tmp, { maxVersionOutput: '20260916210000', insertOutput: '' });
    const result = runScript(filePath, { DESTINO_URL: FIXTURE_URL, DATABASE_IDENTITY_PATH: fixtureIdentity(tmp), PSQL_BIN: psql });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /RETURNING vazio -- versao 20260916999000 ja existe no ledger/);
  });
});

test('register --apply succeeds and reports the registered version when RETURNING is non-empty', () => {
  withTmpFile('20260916999100_demo.sql', 'CREATE TABLE public.demo (id integer);', (filePath, tmp) => {
    const psql = fakePsql(tmp, {
      maxVersionOutput: '20260916210000',
      insertOutput: '20260916999100|demo|1',
    });
    const result = runScript(filePath, { DESTINO_URL: FIXTURE_URL, DATABASE_IDENTITY_PATH: fixtureIdentity(tmp), PSQL_BIN: psql });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /OK: migration 20260916999100 \(demo\) registrada/);
  });
});

test('register without --apply/DESTINO_URL only prints the SQL block (dry-run, never touches the database)', () => {
  withTmpFile('20260916999200_demo.sql', 'CREATE TABLE public.demo (id integer);', (filePath) => {
    const result = spawnSync(process.execPath, [SCRIPT, filePath], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, DESTINO_URL: '' },
      timeout: 10_000,
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /INSERT INTO supabase_migrations\.schema_migrations/);
    assert.match(result.stdout, /ON CONFLICT \(version\) DO NOTHING/);
  });
});

test('register --apply aborta ANTES de qualquer escrita quando a DESTINO_URL aponta para outro projeto (E46)', () => {
  withTmpFile('20260916999200_demo.sql', 'CREATE TABLE public.demo (id integer);', (filePath, tmp) => {
    const psql = fakePsql(tmp, { maxVersionOutput: '20260916210000', insertOutput: 'x' });
    const result = runScript(filePath, {
      DESTINO_URL: 'postgres://postgres:pw@db.bbbbbbbbbbbbbbbbbbbb.supabase.co/test',
      DATABASE_IDENTITY_PATH: fixtureIdentity(tmp),
      PSQL_BIN: psql,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ABORT identidade: DESTINO_URL aponta para outro projeto/);
  });
});
