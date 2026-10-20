import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateRuntimeConfig, loadRealtimeBaseline } from './check-runtime-config.mjs';

const realtimeBaseline = loadRealtimeBaseline();

function fixture() {
  return [{ section: 'identity', database: 'postgres', server_major: 17 },
    { section: 'autovacuum', enabled: true, tables: ['messages', 'contacts', 'email_threads', 'email_messages'].map(table => ({ table, vacuum_scale_factor: '0.05', analyze_scale_factor: '0.05', enabled: true })) },
    { section: 'realtime', publication_present: true, tables: [...realtimeBaseline] },
    { section: 'cron', available: true, jobs: 4, active_jobs: 3 },
    { section: 'storage', available: true, buckets: 3, public_buckets: 1 },
    { section: 'ledger_limitations', available: true, records: [] }];
}
const evaluate = rows => evaluateRuntimeConfig(rows.map(row => JSON.stringify(row)).join('\n'));
test('verified table options never claim full runtime/backup parity', () => {
  const result = evaluate(fixture());
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.coverage.autovacuum, 'VERIFIED');
  assert.equal(result.coverage.realtime, 'VERIFIED');
  assert.equal(result.coverage.backups, 'NOT_VERIFIED_RESTORE_REQUIRED');
});
for (const mode of ['missing', 'extra', 'duplicate', 'absent']) {
  test(`realtime publication ${mode} fails closed`, () => {
    const rows = fixture();
    if (mode === 'missing') rows[2].tables.pop();
    if (mode === 'extra') rows[2].tables.push('public.unreviewed_table');
    if (mode === 'duplicate') rows[2].tables.push(rows[2].tables[0]);
    if (mode === 'absent') rows[2].publication_present = false;
    const result = evaluate(rows);
    assert.equal(result.status, 'FAIL');
    assert.equal(result.coverage.realtime, 'FAIL');
  });
}
for (const mode of ['missing', 'duplicate', 'defaults', 'disabled', 'global']) {
  test(`autovacuum ${mode} fails`, () => {
    const rows = fixture();
    if (mode === 'missing') rows[1].tables.pop();
    if (mode === 'duplicate') rows[1].tables.push(rows[1].tables[0]);
    if (mode === 'defaults') rows[1].tables[0].vacuum_scale_factor = null;
    if (mode === 'disabled') rows[1].tables[0].enabled = false;
    if (mode === 'global') rows[1].enabled = false;
    assert.equal(evaluate(rows).status, 'FAIL');
  });
}
test('wrong server identity fails and absent optional services stay unavailable', () => {
  const rows = fixture();
  rows[0].server_major = 15;
  rows[3] = { section: 'cron', available: false };
  assert.equal(evaluate(rows).status, 'FAIL');
  assert.equal(evaluate(rows).coverage.cron, 'UNAVAILABLE');
});
test('incomplete or duplicate evidence never passes', () => {
  assert.throws(() => evaluate(fixture().slice(1)), /sections/);
  assert.throws(() => evaluate([...fixture(), fixture()[0]]), /sections/);
});
test('CLI fails without canonical credentials and never echoes them', () => {
  const result = spawnSync(process.execPath, ['scripts/db-audit/check-runtime-config.mjs', '/tmp/runtime-should-not-exist.json'], {
    encoding: 'utf8', env: { ...process.env, DESTINO_URL: 'postgres://fixture-private@wrong.invalid/postgres' },
  });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-private/);
});
test('runtime CLI transports canonical identity and pinned TLS via libpq fields', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-transport-'));
  const bin = path.join(tmp, 'psql-fixture.mjs');
  const output = path.join(tmp, 'runtime.json');
  fs.writeFileSync(bin, `#!/usr/bin/env node
if (process.env.PGDATABASE !== 'postgres' || process.env.PGHOST !== 'db.tnnnlkbymytvtqngbbqh.supabase.co'
  || process.env.PGUSER !== 'postgres' || process.env.PGSSLMODE !== 'verify-full'
  || process.env.PGSSLROOTCERT !== 'scripts/db-audit/certs/supabase-prod-ca-2021.crt') process.exit(93);
if (process.env.PGPASSWORD || process.env.DESTINO_URL || !process.env.PGPASSFILE) process.exit(94);
process.stdout.write(${JSON.stringify(fixture().map(row => JSON.stringify(row)).join('\n'))});
`, { mode: 0o700 });
  const result = spawnSync(process.execPath, ['scripts/db-audit/check-runtime-config.mjs', output], {
    encoding: 'utf8', env: { ...process.env, PSQL_BIN: bin,
      DESTINO_URL: 'postgres://postgres:synthetic-only@db.tnnnlkbymytvtqngbbqh.supabase.co/postgres' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).status, 'PARTIAL');
});
test('collection is read-only, bounded and never selects commands/object/customer rows', () => {
  const sql = fs.readFileSync(new URL('./runtime-config.sql', import.meta.url), 'utf8');
  assert.match(sql, /BEGIN READ ONLY/);
  assert.match(sql, /statement_timeout = '10s'/);
  assert.match(sql, /ROLLBACK/);
  assert.doesNotMatch(sql, /SELECT\s+\*|cron\.job_run_details|storage\.objects|FROM public\.|\bcommand\b/i);
});
