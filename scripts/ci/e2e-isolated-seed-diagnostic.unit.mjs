import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import { parseFilesSeedDiagnostic as parse } from '../e2e-isolated/run.mjs';

// Execute the real seed and its assertions. Only Bun SQL, fetch and synchronous
// output are controlled; no database, credentials, network or browser is used.
const seedSource = readFileSync(new URL('../../e2e/fixtures/arquivos-local/seed.ts', import.meta.url), 'utf8');
const dataSource = readFileSync(new URL('../../e2e/fixtures/arquivos-local/dados.ts', import.meta.url), 'utf8');
const stripped = stripTypeScriptTypes(seedSource).replace(/^import .*;\r?\n/gm, '');
const data = vm.runInNewContext('(function () {\n' + stripTypeScriptTypes(dataSource).replace(/^export /gm, '') + '\nreturn { E2E_ARQUIVOS, caminhoObjeto, locatorObjeto }; })()');
const PREFIX = '[e2e-isolated/seed-files-volume-diagnostic] ';
const CANARY = 'CANARY_PRIVATE_PASSWORD_59317';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjYW5hcnkifQ.c2VjcmV0';
const sensitive = 'https://name:' + CANARY + '@127.0.0.1:5173/path?token=' + JWT;
const env = { API_URL: 'https://127.0.0.1:5173', DB_URL: 'postgres://synthetic:local-only@127.0.0.1:5432/postgres', ANON_KEY: 'synthetic-anon', SERVICE_ROLE_KEY: 'synthetic-service' };
const good = { schema: 1, failure: { stage: 'sql-profile-update', error_name: 'PostgresError', code: 'ERR_POSTGRES_SERVER_ERROR', sqlstate: '42501' } };
const line = value => PREFIX + JSON.stringify(value) + '\n';
const result = value => ({ status: 1, stdout: '', stderr: line(value) });
function noLeak(value) {
  const text = JSON.stringify(value);
  for (const denied of [CANARY, JWT, 'https://', 'password=', 'select secret', 'internalQuery']) assert.equal(text.includes(denied), false, denied);
}
function pgError(errno = '42501') { return Object.assign(new Error(CANARY), { name: 'PostgresError', code: 'ERR_POSTGRES_SERVER_ERROR', errno }); }

async function helpers(write = () => {}) {
  const context = vm.createContext({ ...data, Buffer, URL, SQL: () => { throw new Error('helper must not open SQL'); },
    process: { env }, writeSync: (fd, text) => { assert.equal(fd, 2); write(text); } });
  const source = stripped.replace('await main();', 'void 0;');
  return await vm.runInContext('(async () => {\n' + source + '\nreturn { describe: seedFailureDescriptor, emit: emitSeedFailure, stages: SEED_DIAGNOSTIC_STAGES, names: [...SEED_ERROR_NAMES], codes: [...SEED_ERROR_CODES] }; })()', context);
}
const producer = await helpers();

function sqlOperation(parts) {
  const sql = parts.join('?');
  for (const [text, operation] of [
    ['insert into auth.users', 'sql-auth-user'], ['insert into auth.identities', 'sql-auth-identity'],
    ['select id from profiles', 'sql-profile-read'], ['insert into profiles', 'sql-profile-create'],
    ['update profiles', 'sql-profile-update'], ['insert into user_roles', 'sql-user-role'],
    ['insert into user_settings', 'sql-user-settings'], ['insert into whatsapp_connections', 'sql-connection'],
    ['insert into contacts', 'sql-contacts'],
  ]) if (sql.includes(text)) return operation;
  assert.ok(sql.includes('insert into messages'), 'unexpected SQL operation');
  if (sql.includes('generate_series')) return 'sql-pagination';
  if (sql.includes('media_mimetype')) return 'sql-media';
  if (sql.includes('conversa sem mídia')) return 'sql-empty-text';
  return 'sql-text';
}

async function runSeed(options = {}) {
  const observed = { operations: [], markers: [], stdout: '', stderr: '', closeCalls: 0, rejected: false, error: undefined };
  let context;
  const enter = operation => {
    observed.operations.push(operation);
    observed.markers.push([operation, context.stage()]);
    if (operation === options.operation && Object.hasOwn(options, 'operationError')) throw options.operationError;
  };
  const tx = async (parts, ...values) => {
    const operation = sqlOperation(parts);
    enter(operation);
    assert.ok(values.length > 0);
    if (operation === 'sql-profile-read') return options.profileMissing ? [] : [{ id: 'synthetic-profile' }];
    if (operation === 'sql-profile-create') return [{ id: 'synthetic-profile' }];
    return [];
  };
  const SQL = url => {
    assert.equal(url, env.DB_URL);
    enter('db-open');
    return { begin: async callback => { enter('sql-begin'); await callback(tx); enter('sql-commit'); },
      end: async () => { observed.closeCalls++; enter('db-close'); if (Object.hasOwn(options, 'cleanupError')) throw options.cleanupError; } };
  };
  const uploadPaths = new Map([
    [data.caminhoObjeto(data.E2E_ARQUIVOS.mensagens.imagem.objeto), 'storage-upload-image'],
    [data.caminhoObjeto(data.E2E_ARQUIVOS.mensagens.video.objeto), 'storage-upload-video'],
    [data.caminhoObjeto(data.E2E_ARQUIVOS.mensagens.audio.objeto), 'storage-upload-audio'],
    [data.caminhoObjeto(data.E2E_ARQUIVOS.mensagens.documento.objeto), 'storage-upload-document'],
    [data.E2E_ARQUIVOS.contatoPaginacao.id + '/e2e-arquivos-pagina.png', 'storage-upload-pagination'],
  ]);
  const fetch = async (address, init = {}) => {
    const url = new URL(address);
    assert.equal(url.origin, env.API_URL, 'all HTTP targets must remain synthetic loopback');
    let operation, json = {};
    if (url.pathname === '/storage/v1/object/sign/synthetic' && !init.method) {
      operation = 'storage-download';
    } else if (url.pathname === '/auth/v1/token') {
      operation = 'auth-login'; json = options.missingToken ? {} : { access_token: JWT };
    } else if (url.pathname === '/rest/v1/messages') {
      const contact = url.searchParams.get('contact_id');
      const paginated = contact === 'eq.' + data.E2E_ARQUIVOS.contatoPaginacao.id;
      assert.ok(paginated || contact === 'eq.' + data.E2E_ARQUIVOS.contato.id);
      operation = paginated ? 'rls-pagination' : 'rls-media';
      assert.equal(init.headers.authorization, 'Bearer ' + JWT, 'RLS uses the user JWT');
      const count = paginated ? options.paginationCount ?? data.E2E_ARQUIVOS.contatoPaginacao.totalMidias : options.mediaCount ?? data.E2E_ARQUIVOS.contagens.todos;
      json = Array.from({ length: count }, () => ({ id: 'synthetic' }));
    } else if (url.pathname.startsWith('/storage/v1/object/sign/')) {
      operation = 'storage-sign'; json = options.missingSignedUrl ? {} : { signedURL: '/object/sign/synthetic?token=local-only' };
      assert.equal(init.headers.authorization, 'Bearer ' + JWT);
    } else if (url.pathname.startsWith('/storage/v1/object/public/')) {
      operation = 'storage-public-check'; assert.equal(init.headers.authorization, undefined);
    } else if (url.pathname.startsWith('/storage/v1/object/')) {
      operation = uploadPaths.get(url.pathname.slice(('/storage/v1/object/' + data.E2E_ARQUIVOS.bucket + '/').length));
      assert.ok(operation, 'unexpected upload target');
      assert.equal(init.method, 'POST'); assert.equal(init.headers.authorization, 'Bearer ' + env.SERVICE_ROLE_KEY);
    } else assert.fail('unexpected HTTP target');
    enter(operation);
    const status = options.httpFailure === operation ? options.httpStatus ?? 403 : operation === 'storage-public-check' ? options.publicStatus ?? 404 : 200;
    return { ok: status >= 200 && status < 300, status, statusText: CANARY,
      text: async () => sensitive,
      json: async () => { if (options.bodyFailure === operation) throw options.bodyError ?? new SyntaxError(CANARY); return json; },
      arrayBuffer: async () => { if (options.bodyFailure === operation) throw options.bodyError ?? new TypeError(CANARY); return options.wrongBytes ? Buffer.from('wrong synthetic bytes') : context.image(); } };
  };
  context = vm.createContext({ ...data, Buffer, URL, SQL, fetch,
    process: { env: { ...env, ...options.env }, stdout: { write: text => { enter('stdout-summary'); observed.stdout += text; } } },
    writeSync: (fd, text) => { assert.equal(fd, 2); if (options.writeFailure) throw new Error('synthetic EPIPE'); observed.stderr += text; } });
  const source = stripped.replace('try { await main(); }', 'globalThis.stage = () => seedStage; globalThis.image = () => PNG_1X1;\ntry { await main(); }');
  try { await vm.runInContext('(async () => {\n' + source + '\n})()', context); }
  catch (error) { observed.rejected = true; observed.error = error; }
  observed.diagnostic = parse({ status: observed.rejected ? 1 : 0, stdout: observed.stdout, stderr: observed.stderr });
  return observed;
}

const emitterCases = [
  ['postgres-errno', { name: 'PostgresError', code: 'ERR_POSTGRES_SERVER_ERROR', errno: '23505' }, undefined, { sqlstate: '23505' }],
  ['postgres-trigger', { name: 'PostgresError', code: 'ERR_POSTGRES_SERVER_ERROR', errno: 'P0001' }, undefined, { sqlstate: 'P0001' }],
  ['postgres-connection', { name: 'PostgresError', code: 'ERR_POSTGRES_CONNECTION_CLOSED' }, undefined, { code: 'ERR_POSTGRES_CONNECTION_CLOSED' }],
  ['http-failure', new Error(CANARY), 403, { http_status: 403 }],
  ['http-body-contract', new SyntaxError(CANARY), 200, { http_status: 200 }],
  ['missing-code', new Error(sensitive), undefined, {}],
  ['unknown-name', { name: CANARY, message: sensitive }, undefined, { error_name: 'UnknownError' }],
  ['unknown-code', { name: 'Error', code: CANARY }, undefined, {}],
  ['jwt-as-code', { name: 'Error', code: JWT }, undefined, {}],
  ['url-as-errno', { name: 'PostgresError', errno: sensitive }, undefined, {}],
  ['numeric-errno', { name: 'PostgresError', errno: 23505 }, undefined, {}],
  ['mysql-sqlState-ignored', { name: 'Error', sqlState: '23505' }, undefined, {}],
  ['lowercase-errno', { name: 'PostgresError', errno: 'p0001' }, undefined, {}],
  ['sql-success-code-ignored', { name: 'PostgresError', errno: '00000' }, undefined, {}],
  ['string-status-ignored', new Error(), '403', {}],
  ['oversized-status-ignored', new Error(), 600, {}],
  ['fraction-status-ignored', new Error(), 403.5, {}],
  ['thrown-string', sensitive, undefined, { error_name: 'UnknownError' }],
  ['thrown-null', null, undefined, { error_name: 'UnknownError' }],
  ['throwing-getters', Object.defineProperties({}, { name: { get() { throw new Error(CANARY); } }, errno: { get() { throw new Error(JWT); } }, code: { get() { throw new Error(sensitive); } } }), undefined, { error_name: 'UnknownError' }],
];
for (const [name, error, httpStatus, expected] of emitterCases) test('seed diagnostic producer/' + name, () => {
  const value = producer.describe('sql-profile-update', error, httpStatus);
  for (const [key, wanted] of Object.entries(expected)) assert.equal(value[key], wanted);
  if (!Object.hasOwn(expected, 'sqlstate')) assert.equal(value.sqlstate, undefined);
  if (!Object.hasOwn(expected, 'http_status')) assert.equal(value.http_status, undefined);
  noLeak(value); assert.equal(parse(result({ schema: 1, failure: value })).available, true);
});
test('seed diagnostic producer/never-read-sensitive-properties', () => {
  const error = { name: 'PostgresError', errno: '42501', code: 'ERR_POSTGRES_SERVER_ERROR' };
  for (const property of ['message', 'stack', 'detail', 'hint', 'where', 'internalQuery', 'query', 'parameters', 'password', 'url', 'cause']) Object.defineProperty(error, property, { get() { assert.fail('read forbidden property: ' + property); } });
  assert.equal(producer.describe('sql-profile-update', error).sqlstate, '42501');
});

const invalid = [
  ['unknown-stage', { ...good, failure: { ...good.failure, stage: sensitive } }],
  ['unknown-error-name', { ...good, failure: { ...good.failure, error_name: CANARY } }],
  ['unknown-code', { ...good, failure: { ...good.failure, code: JWT } }],
  ['malformed-sqlstate', { ...good, failure: { ...good.failure, sqlstate: '42501\n' + CANARY } }],
  ['string-http-status', { ...good, failure: { ...good.failure, http_status: '403' } }],
  ['message-field', { ...good, failure: { ...good.failure, message: sensitive } }],
  ['query-field', { ...good, query: 'select secret ' + CANARY }],
  ['extra-schema', { ...good, schema: 2 }],
  ['missing-failure', { schema: 1 }],
  ['cleanup-secret', { ...good, cleanup: { stage: 'db-close', error_name: CANARY } }],
  ['cleanup-wrong-stage', { ...good, cleanup: { stage: 'sql-profile-update', error_name: 'Error' } }],
  ['prototype-field', JSON.parse('{"schema":1,"failure":{"stage":"sql-profile-update","error_name":"Error"},"__proto__":{"password":"' + CANARY + '"}}')],
  ['array-record', [good]], ['null-record', null],
];
for (const [name, value] of invalid) test('seed diagnostic consumer/' + name, () => { const parsed = parse(result(value)); assert.equal(parsed.reason, 'invalid'); noLeak(parsed); });
test('seed diagnostic consumer/malformed-json', () => { const parsed = parse({ status: 1, stderr: PREFIX + CANARY + '\n' }); assert.equal(parsed.reason, 'invalid'); noLeak(parsed); });
test('seed diagnostic consumer/oversized-line', () => { const parsed = parse({ status: 1, stderr: line({ ...good, ignored: CANARY.repeat(500) }) }); assert.equal(parsed.reason, 'invalid'); noLeak(parsed); });
test('seed diagnostic consumer/duplicate-valid-lines', () => assert.equal(parse({ status: 1, stdout: line(good), stderr: line(good) }).reason, 'ambiguous'));
test('seed diagnostic consumer/valid-plus-forged-line', () => { const parsed = parse({ status: 1, stderr: line(good) + PREFIX + CANARY }); assert.equal(parsed.reason, 'ambiguous'); noLeak(parsed); });
test('seed diagnostic consumer/no-prefix', () => { const parsed = parse({ status: 1, stdout: sensitive, stderr: 'select secret ' + CANARY }); assert.equal(parsed.reason, 'missing'); noLeak(parsed); });
test('seed diagnostic consumer/prefix-not-at-start', () => assert.equal(parse({ status: 1, stderr: 'noise ' + line(good) }).reason, 'missing'));
test('seed diagnostic consumer/valid-line-with-private-noise', () => { const parsed = parse({ status: 1, stdout: sensitive + '\n', stderr: line(good) + CANARY }); assert.equal(parsed.available, true); noLeak(parsed); });
test('seed diagnostic consumer/crlf', () => assert.equal(parse({ status: 1, stderr: line(good).replace(/\n/g, '\r\n') }).available, true));
test('seed diagnostic consumer/invalid-process-channel', () => { const parsed = parse({ status: 1, stdout: { password: CANARY } }); assert.equal(parsed.reason, 'invalid'); noLeak(parsed); });
test('seed diagnostic consumer/success-ignores-diagnostic', () => assert.equal(parse({ status: 0, stderr: line(good) + CANARY }), null));
test('seed diagnostic consumer/signal-with-zero-status', () => assert.equal(parse({ status: 0, signal: 'SIGTERM', stderr: line(good) }).available, true));
test('seed diagnostic consumer/spawn-error-with-zero-status', () => assert.equal(parse({ status: 0, error: new Error(CANARY), stderr: line(good) }).available, true));
test('seed diagnostic consumer/timeout-without-record', () => { const parsed = parse({ status: null, signal: 'SIGTERM', stderr: CANARY }); assert.equal(parsed.reason, 'missing'); noLeak(parsed); });

for (const mode of ['success', 'sql-error', 'http-error', 'cleanup-only', 'sql-and-cleanup', 'open-error', 'write-error', 'unknown-error']) test('seed diagnostic lifecycle/' + mode, async () => {
  const primary = mode === 'http-error' ? new TypeError(CANARY) : mode === 'unknown-error' ? CANARY : pgError();
  const cleanup = Object.assign(new Error(sensitive), { name: 'PostgresError', code: 'ERR_POSTGRES_CONNECTION_CLOSED' });
  const operation = mode === 'open-error' ? 'db-open' : mode === 'http-error' ? 'storage-upload-image' : 'sql-profile-update';
  const primaryFails = !['success', 'cleanup-only'].includes(mode);
  const cleanupFails = ['cleanup-only', 'sql-and-cleanup'].includes(mode);
  const value = await runSeed({ operation, ...(primaryFails ? { operationError: primary } : {}), ...(cleanupFails ? { cleanupError: cleanup } : {}), writeFailure: mode === 'write-error' });
  assert.equal(value.rejected, primaryFails || cleanupFails);
  assert.equal(value.error, cleanupFails ? cleanup : primaryFails ? primary : undefined, 'same thrown value as original finally');
  assert.equal(value.closeCalls, mode === 'open-error' ? 0 : 1);
  if (mode === 'success' || mode === 'write-error') assert.equal(value.stderr, '');
  else {
    assert.equal(value.diagnostic.available, true); noLeak(value.diagnostic);
    if (mode === 'sql-and-cleanup') { assert.equal(value.diagnostic.failure.stage, operation); assert.equal(value.diagnostic.cleanup.stage, 'db-close'); }
    if (mode === 'cleanup-only') { assert.equal(value.diagnostic.failure.stage, 'db-close'); assert.equal(value.diagnostic.cleanup, undefined); }
  }
});

for (const [label, thrown] of [['null', null], ['zero', 0], ['false', false], ['empty', ''], ['undefined', undefined]]) {
  for (const mode of ['operation', 'cleanup-only', 'operation-and-cleanup']) test('seed diagnostic falsy/' + label + '/' + mode, async () => {
    const original = pgError();
    const value = await runSeed({ operation: 'sql-profile-update', ...(mode === 'operation' ? { operationError: thrown } : mode === 'operation-and-cleanup' ? { operationError: original } : {}), ...(mode !== 'operation' ? { cleanupError: thrown } : {}) });
    assert.equal(value.rejected, true); assert.equal(value.error, thrown); assert.equal(value.closeCalls, 1);
    assert.equal(value.diagnostic.available, true); noLeak(value.diagnostic);
    assert.equal(value.diagnostic.failure.stage, mode === 'cleanup-only' ? 'db-close' : 'sql-profile-update');
    if (mode === 'operation-and-cleanup') { assert.equal(value.diagnostic.cleanup.error_name, 'UnknownError'); assert.equal(value.diagnostic.failure.sqlstate, '42501'); }
  });
}

for (const operation of ['db-open', 'sql-begin', 'sql-auth-user', 'sql-auth-identity', 'sql-profile-read', 'sql-profile-create', 'sql-profile-update', 'sql-user-role', 'sql-user-settings', 'sql-connection', 'sql-contacts', 'sql-media', 'sql-text', 'sql-pagination', 'sql-empty-text', 'sql-commit', 'storage-upload-image', 'storage-upload-video', 'storage-upload-audio', 'storage-upload-document', 'storage-upload-pagination', 'auth-login', 'rls-media', 'rls-pagination', 'storage-sign', 'storage-download', 'storage-public-check', 'stdout-summary', 'db-close']) {
  test('seed diagnostic operation/' + operation, async () => {
    const error = pgError('42601');
    const value = await runSeed({ operation, operationError: error, profileMissing: operation === 'sql-profile-create' });
    assert.equal(value.rejected, true); assert.equal(value.error, error);
    assert.equal(value.diagnostic.failure.stage, operation);
    assert.equal(value.diagnostic.failure.http_status, undefined, 'new operation resets preceding HTTP status');
    assert.ok(value.markers.every(([actual, marker]) => actual === marker));
    assert.equal(value.closeCalls, operation === 'db-open' ? 0 : 1);
    noLeak(value.diagnostic);
  });
}
for (const [label, options, stage, status] of [
  ['media visibility', { mediaCount: 3 }, 'rls-volume-check'],
  ['pagination visibility', { paginationCount: 64 }, 'rls-pagination-check'],
  ['private bytes', { wrongBytes: true }, 'storage-bytes-check'],
  ['public object forbidden', { publicStatus: 200 }, 'storage-public-check', 200],
  ['login token required', { missingToken: true }, 'auth-login', 200],
  ['signed URL required', { missingSignedUrl: true }, 'storage-sign', 200],
  ['login JSON incomplete', { bodyFailure: 'auth-login' }, 'auth-login', 200],
  ['RLS JSON incomplete', { bodyFailure: 'rls-media' }, 'rls-media', 200],
  ['signed JSON incomplete', { bodyFailure: 'storage-sign' }, 'storage-sign', 200],
  ['download incomplete', { bodyFailure: 'storage-download' }, 'storage-download', 200],
]) test('seed diagnostic retained assertion/' + label, async () => {
  const value = await runSeed(options);
  assert.equal(value.rejected, true); assert.equal(value.closeCalls, 1);
  assert.equal(value.diagnostic.failure.stage, stage); assert.equal(value.diagnostic.failure.http_status, status); noLeak(value.diagnostic);
});
for (const operation of ['storage-upload-image', 'storage-upload-video', 'storage-upload-audio', 'storage-upload-document', 'storage-upload-pagination', 'auth-login', 'rls-media', 'rls-pagination', 'storage-sign', 'storage-download']) test('seed diagnostic HTTP status/' + operation, async () => {
  const value = await runSeed({ httpFailure: operation, httpStatus: 503 });
  assert.equal(value.rejected, true); assert.equal(value.diagnostic.failure.stage, operation); assert.equal(value.diagnostic.failure.http_status, 503); noLeak(value.diagnostic);
});
test('seed diagnostic producer/real Bun code names and closed consumer vocabulary', () => {
  assert.ok(producer.codes.includes('ERR_POSTGRES_AUTHENTICATION_FAILED_PBKDF2'));
  assert.ok(producer.codes.includes('ERR_POSTGRES_SYNTAX_ERROR'));
  assert.ok(!producer.codes.includes('ERR_POSTGRES_AUTHENTICATION_FAILED_PBKDF'));
  for (const code of producer.codes) {
    const described = producer.describe('sql-auth-user', { name: 'PostgresError', code });
    assert.equal(described.code, code); assert.equal(parse(result({ schema: 1, failure: described })).available, true);
  }
  for (const stage of producer.stages) assert.equal(parse(result({ schema: 1, failure: producer.describe(stage, new Error()) })).available, true);
});
test('seed diagnostic producer/emission is synchronous and cannot replace the error', async () => {
  const error = pgError(); const value = await runSeed({ operation: 'sql-commit', operationError: error, writeFailure: true });
  assert.equal(value.rejected, true); assert.equal(value.error, error); assert.equal(value.stderr, ''); assert.equal(value.closeCalls, 1);
});
test('seed diagnostic producer/failures before main stay rejected without a forged stage', async () => {
  const value = await runSeed({ env: { API_URL: 'https://external.invalid' } });
  assert.equal(value.rejected, true); assert.equal(value.closeCalls, 0); assert.equal(value.operations.length, 0);
  assert.equal(value.diagnostic.reason, 'missing'); assert.equal(value.stderr, '');
});
test('seed diagnostic success/real seed keeps SQL, HTTP, private readback and cleanup order', async () => {
  const value = await runSeed({ profileMissing: true });
  assert.equal(value.rejected, false); assert.equal(value.diagnostic, null); assert.equal(value.stderr, '');
  assert.ok(value.stdout.startsWith('[seed arquivos-local] ok:'));
  assert.ok(value.operations.indexOf('sql-commit') < value.operations.indexOf('storage-upload-image'));
  assert.ok(value.operations.indexOf('auth-login') < value.operations.indexOf('rls-media'));
  assert.ok(value.operations.indexOf('storage-public-check') < value.operations.indexOf('stdout-summary'));
  assert.equal(value.operations.at(-1), 'db-close'); assert.equal(value.closeCalls, 1);
  assert.ok(value.markers.every(([actual, marker]) => actual === marker));
});
