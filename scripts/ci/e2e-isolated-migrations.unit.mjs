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


const GMAIL_CRON = '20260829110000_gmail_incremental_sync_cron.sql';
const gmailCronSource = readFileSync(new URL('../../supabase/migrations/' + GMAIL_CRON, import.meta.url), 'utf8');
const JWT_PATTERN = /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g;
const historicalToken = [...gmailCronSource.matchAll(JWT_PATTERN)][0]?.[0];
const priorCronURL = 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/gmail-cron-sync';
const localKeyExpression = "current_setting('app.settings.e2e_anon_key', true)";

test('cron Gmail revisado: só chave e destino usam configuração local, sem token no SQL ou evidência', () => {
  assert.equal(gitBlob(gmailCronSource), '0eac1be96bcd4649db4059caad6b223f957c1ade');
  assert.equal([...gmailCronSource.matchAll(JWT_PATTERN)].length, 1);
  const result = prepareMigration(GMAIL_CRON, gmailCronSource);
  const expected = gmailCronSource.replace("'" + historicalToken + "'", localKeyExpression)
    .replace(priorCronURL, ORIGIN + '/functions/v1/gmail-cron-sync');
  assert.equal(result.sql === expected, true, 'only the reviewed literals change');
  assert.equal(JWT_PATTERN.test(result.sql), false);
  assert.equal(result.sql.includes(priorCronURL), false);
  assert.equal(JSON.stringify(result.evidence).includes(historicalToken), false);
  assert.equal(result.evidence.original_git_blob, gitBlob(gmailCronSource));
  assert.notEqual(result.evidence.original_sha256, result.evidence.applied_sha256);
  assert.deepEqual(result.evidence.transformations, [
    { operation: 'historical-anon-key-to-local-setting', replacements: 1 },
    { operation: 'cron-url-to-isolated-origin', replacements: 1 },
  ]);
});

const sourceMutations = [
  ['new origin', s => s.replace('tnnnlkbymytvtqngbbqh', 'external')],
  ['new protocol', s => s.replace('https://', 'http://')],
  ['new edge path', s => s.replace('/functions/v1/gmail-cron-sync', '/functions/v1/other')],
  ['new cron name', s => s.replace("'gmail-incremental-sync'", "'other-sync'")],
  ['new schedule', s => s.replace('*/5 * * * *', '*/1 * * * *')],
  ['new header name', s => s.replace("'apikey'", "'Authorization'")],
  ['token removed', s => s.replace(historicalToken, '')],
  ['token duplicated', s => s.replace(historicalToken, historicalToken + "', 'extra', '" + historicalToken)],
  ['token signature changed', s => s.replace(historicalToken, historicalToken.slice(0, -1) + (historicalToken.endsWith('a') ? 'b' : 'a'))],
  ['new timeout', s => s.replace('30000', '60000')],
  ['new body', s => s.replace("'{}'::jsonb", "'{\"changed\":true}'::jsonb")],
  ['new secret name', s => s.replace("name = 'gmail_cron_secret'", "name = 'other_secret'")],
  ['new secret schema', s => s.replace('FROM vault.decrypted_secrets', 'FROM public.decrypted_secrets')],
  ['new secret column', s => s.replace('SELECT decrypted_secret', 'SELECT other_secret')],
  ['new method', s => s.replace('net.http_post(', 'net.http_get(')],
  ['new cron schema', s => s.replace('cron.schedule(', 'public.schedule(')],
  ['new content type', s => s.replace("'application/json'", "'text/plain'")],
  ['new header case', s => s.replace("'apikey'", "'APIKEY'")],
  ['header prefix', s => s.replace("'" + historicalToken + "'", "'Bearer " + historicalToken + "'")],
  ['SQL appended', s => s + '\nselect 1;\n'],
  ['SQL prepended', s => 'select 1;\n' + s],
  ['comment appended', s => s + '-- changed\n'],
  ['comment prepended', s => '-- changed\n' + s],
  ['CRLF', s => s.replaceAll('\n', '\r\n')],
  ['trailing newline removed', s => s.trimEnd()],
  ['BOM', s => '\uFEFF' + s],
  ['trailing spaces', s => s.replace('SELECT cron.schedule(', 'SELECT cron.schedule(  ')],
  ['C-style leading comment', s => '/* new review required */\n' + s],
  ['second URL', s => s + "\n-- " + priorCronURL + '\n'],
  ['URL query', s => s.replace(priorCronURL, priorCronURL + '?changed=1')],
  ['URL fragment', s => s.replace(priorCronURL, priorCronURL + '#changed')],
  ['URL credentials', s => s.replace('https://', 'https://fixture@')],
];
for (const [label, mutate] of sourceMutations) {
  test('cron Gmail: nova revisão obrigatória se mudar ' + label, () => {
    const changed = mutate(gmailCronSource);
    assert.equal(changed === gmailCronSource, false);
    assert.throws(() => prepareMigration(GMAIL_CRON, changed), /historical-jwt-needs-local-transform/);
  });
}
for (const name of ['20260829110001_gmail_incremental_sync_cron.sql', '20260829110000_other.sql', '20260101000000_fixture.sql']) {
  test('cron Gmail: hash revisado não autoriza outro nome ' + name, () => {
    assert.throws(() => prepareMigration(name, gmailCronSource), /historical-jwt-needs-local-transform/);
  });
}
for (const template of ["select 'TOKEN';", '-- TOKEN\nselect 1;', '/* TOKEN */\nselect 1;', "select $$TOKEN$$;", "select jsonb_build_object('apikey', 'TOKEN');", "select 'Bearer TOKEN';"]) {
  test('JWT não revisado permanece bloqueado no contexto ' + template, () => {
    const source = template.replace('TOKEN', 'eyJaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaa');
    assert.throws(() => prepareMigration('20260101000000_fixture.sql', source), /historical-jwt-needs-local-transform/);
  });
}
