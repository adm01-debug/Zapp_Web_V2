#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { withPsqlEnvironment } from './psql-environment.mjs';
import { evaluateRuntimeConfig } from './check-runtime-config.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zapp-libpq-integration-'));
const container = `zapp-libpq-test-${process.pid}`;
const password = 'synthetic:p@ss\\word';
const uri = `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:5432/postgres?sslmode=disable&connect_timeout=2`;
const options = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000 };
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && key !== 'DESTINO_URL'));
let started = false;
let stage = 'start-container';
function dockerPsql(args, env) {
  const forward = Object.keys(env).filter(key => key.startsWith('PG')).flatMap(key => ['--env', key]);
  return execFileSync('docker', ['exec', ...forward, container, 'psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', ...args], { ...options, env });
}

try {
  fs.chmodSync(directory, 0o700);
  execFileSync('docker', ['run', '--rm', '-d', '--network', 'none', '--name', container,
    '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust',
    '--volume', `${directory}:${directory}:ro`, 'postgres:17-alpine'],
  { ...options, env: { ...cleanEnv, POSTGRES_PASSWORD: password } });
  started = true;
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    const logs = execFileSync('docker', ['logs', container], options);
    if (logs.includes('PostgreSQL init process complete; ready for start up.')) {
      const ping = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], options);
      if (ping.status === 0) { ready = true; break; }
    }
    await delay(500);
  }
  assert.ok(ready, 'disposable PostgreSQL did not start');

  stage = 'reproduce-PGDATABASE-defect';
  // Reproduce the production defect: PGDATABASE does NOT expand the URI.
  assert.throws(() => dockerPsql(['-c', 'SELECT 1'], { ...cleanEnv, PGDATABASE: uri, PGUSER: 'postgres', PGCONNECT_TIMEOUT: '2' }));

  const withConnection = (sql, url = uri) => withPsqlEnvironment(url,
    env => dockerPsql(['-c', sql], env), { baseEnv: cleanEnv, tempRoot: directory });
  stage = 'authenticate-with-pgpass';
  assert.equal(withConnection("SELECT current_database() || '|' || current_user || '|' || (current_setting('server_version_num')::integer / 10000)").trim(), 'postgres|postgres|17');
  stage = 'reject-wrong-password';
  assert.throws(() => withConnection('SELECT 1', uri.replace(encodeURIComponent(password), 'wrong-synthetic-password')));
  // TLS must not silently disappear while transporting URL query parameters.
  stage = 'preserve-TLS-and-clean-passfiles';
  assert.throws(() => withConnection('SELECT 1', uri.replace('sslmode=disable', 'sslmode=verify-full')));
  assert.deepEqual(fs.readdirSync(directory), [], 'temporary passfiles must be removed after success/failure');

  stage = 'create-isolated-fixtures';
  withConnection(`CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text, name text, statements text[]);
INSERT INTO supabase_migrations.schema_migrations VALUES ('20260901000000', 'fixture_demo', NULL);
CREATE TABLE public.messages(id int) WITH (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.05);
CREATE TABLE public.contacts(id int) WITH (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.05);
CREATE TABLE public.email_messages(id int) WITH (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.05);
CREATE TABLE public.email_threads(id int) WITH (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.05);`);

  // Real psql + actual runtime SQL, not a mocked stdout transport.
  stage = 'runtime-SQL';
  const runtimeSql = fs.readFileSync('scripts/db-audit/runtime-config.sql', 'utf8');
  const runtimePath = path.join(directory, 'runtime.sql');
  fs.writeFileSync(runtimePath, runtimeSql, { mode: 0o600 });
  const runtime = withPsqlEnvironment(uri, env => dockerPsql(['-f', runtimePath], env), { baseEnv: cleanEnv, tempRoot: directory });
  assert.equal(evaluateRuntimeConfig(runtime).status, 'PARTIAL');

  // Exercise the complete triple-parity CLI through a real client/server pair.
  stage = 'triple-parity-CLI';
  const migrations = path.join(directory, 'migrations');
  const functions = path.join(directory, 'functions');
  fs.mkdirSync(migrations); fs.mkdirSync(functions); fs.mkdirSync(path.join(functions, 'fixture'));
  fs.writeFileSync(path.join(migrations, '20260901000000_fixture_demo.sql'), 'SELECT 1;');
  const manifest = path.join(directory, 'manifest.json');
  const baseline = path.join(directory, 'grants.json');
  const sql = path.join(directory, 'grants.sql');
  fs.writeFileSync(manifest, JSON.stringify({ functions: [{ name: 'fixture' }] }));
  fs.writeFileSync(baseline, '{"fixture":1}');
  fs.writeFileSync(sql, `SELECT '{"fixture":1}'::jsonb;`);
  const wrapper = path.join(directory, 'psql-wrapper.mjs');
  fs.writeFileSync(wrapper, `#!${process.execPath}
import { spawnSync } from 'node:child_process';
const forward = Object.keys(process.env).filter(k => k.startsWith('PG')).flatMap(k => ['--env', k]);
const r = spawnSync('docker', ['exec', ...forward, ${JSON.stringify(container)}, 'psql', ...process.argv.slice(2)], { encoding: 'utf8' });
if (r.status === 0) process.stdout.write(r.stdout); else process.stderr.write('fixture client failed');
process.exit(r.status ?? 1);
`, { mode: 0o700 });
  const env = { ...cleanEnv, TMPDIR: directory, DESTINO_URL: uri, MIGRATIONS_DIR: migrations,
    FUNCTIONS_DIR: functions, MANIFEST_PATH: manifest, GRANTS_BASELINE_PATH: baseline, GRANTS_SQL_PATH: sql, PSQL_BIN: wrapper };
  const cli = () => spawnSync(process.execPath, ['scripts/db-audit/check-triple-parity.mjs', '--require-live'], { ...options, env });
  assert.equal(cli().status, 0, 'real triple parity must pass with valid transport');
  stage = 'reject-real-ledger-and-grants-drift';
  withConnection("INSERT INTO supabase_migrations.schema_migrations VALUES ('20260902000000', 'extra', NULL)");
  assert.equal(cli().status, 1, 'real ledger drift must remain blocked');
  withConnection("DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260902000000'");
  fs.writeFileSync(baseline, '{"fixture":2}');
  assert.equal(cli().status, 1, 'real grants drift must remain blocked');
  assert.equal(fs.readdirSync(directory).some(name => name.startsWith('zapp-psql-')), false);
  console.log('PASS: real PostgreSQL 17 transport, pgpass escaping/auth, TLS preservation, runtime SQL, triple parity and drift rejection');
} catch {
  console.error(`FAIL: disposable libpq integration at ${stage} (sensitive client diagnostics omitted)`);
  process.exitCode = 1;
} finally {
  if (started) spawnSync('docker', ['rm', '-f', container], { ...options, stdio: 'ignore' });
  // Non-secret fixtures remain outside the repo. Every temporary pgpass was cleaned.
}
