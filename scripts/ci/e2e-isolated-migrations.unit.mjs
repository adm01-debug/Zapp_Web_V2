import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { gitBlob, prepareMigration, migrationFailure } from '../e2e-isolated/migrations.mjs';
import { ORIGIN } from '../e2e-isolated/runtime-contract.mjs';

for (const name of ['20261001391230_talkx_engine_tick.sql', '20260929610000_multiplix_cron_window_and_limits.sql']) {
  const source = readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8');
  test('fixture SQL real: configuração local rastreável em ' + name, () => {
    const result = prepareMigration(name, source);
    assert.equal(result.evidence.original_git_blob, gitBlob(source));
    assert.notEqual(result.evidence.applied_sha256, result.evidence.original_sha256);
    assert.deepEqual(result.evidence.transformations, [{ operation: 'vault-url-to-isolated-origin', replacements: 1 }]);
    assert.equal(result.sql.includes(ORIGIN), true);
    const before = source.match(/(vault\.create_secret\s*\(\s*)'(https?:\/\/(?:[^']|'')*)'/i);
    assert.ok(before);
    const prior = new URL(before[2].replaceAll("''", "'"));
    const replacement = before[1] + "'" + ORIGIN + (prior.pathname === '/' ? '' : prior.pathname) + "'";
    assert.equal(result.sql, source.replace(before[0], replacement), 'only the reviewed configuration literal changes');
    assert.equal(JSON.stringify(result.evidence).includes(source), false);
  });
  test('fixture SQL real: mudança de bytes exige nova revisão em ' + name, () => {
    assert.throws(() => prepareMigration(name, source + '\n-- changed\n'), /unreviewed-vault-configuration/);
  });
}

test('migration comum conserva integralmente a lógica SQL', () => {
  const source = 'create function example() returns int language sql as $$ select 1; $$;\n';
  const result = prepareMigration('20260101000000_example.sql', source);
  assert.equal(result.sql, source);
  assert.equal(result.evidence.original_sha256, result.evidence.applied_sha256);
  assert.deepEqual(result.evidence.transformations, []);
});
test('erro SQL publica apenas código e classificação, nunca SQL ou corpo', () => {
  const result = migrationFailure('example.sql', { status: 1, stderr: 'ERROR:  42P01\nprivate-sentinel-query', stdout: '' }, {});
  assert.deepEqual(result, { name: 'example.sql', success: false, sqlstate: '42P01', expected: false });
  assert.equal(JSON.stringify(result).includes('private-sentinel'), false);
});
test('erro de processo não é absorvido pelo nome da lista histórica', () => {
  const result = migrationFailure('example.sql', { status: null, error: new Error('timeout'), stderr: 'ERROR:  42P01' }, { 'example.sql': {} });
  assert.deepEqual(result, { name: 'example.sql', success: false, sqlstate: 'PROCESS_FAILURE', expected: false });
});
test('sucesso e falha histórica continuam resultados distintos', () => {
  assert.deepEqual(migrationFailure('example.sql', { status: 0 }, {}), { name: 'example.sql', success: true });
  assert.deepEqual(migrationFailure('example.sql', { status: 1, stderr: 'ERROR:  42601' }, { 'example.sql': {} }), { name: 'example.sql', success: false, sqlstate: '42601', expected: true });
});
