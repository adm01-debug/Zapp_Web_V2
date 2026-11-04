import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as contract from '../e2e-isolated/runtime-contract.mjs';

// Execute the complete seed body; replace only its two imports with controlled I/O.
// No SQL engine is emulated: the transport model represents the reviewed role-sync
// contract, while the disposable native run must prove the actual database trigger.
const raw = readFileSync(new URL('../e2e-isolated/seed-login.mjs', import.meta.url), 'utf8');
const imports = raw.match(/^import .*;\n/gm) ?? [];
assert.equal(imports.length, 2);
const body = imports.reduce((source, line) => source.replace(line, ''), raw);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const names = ['writeFileSync', 'assertLocalOrigin', 'assertLoopbackOnly', 'assertNoProxy', 'assertRunId', 'assertSourceSha', 'ORIGIN', 'fail', 'fetch', 'process', 'AbortSignal'];
const execute = new AsyncFunction(...names, body);
const RUN = 'zapp-e2e-login-seed-0001';
const SHA = 'a'.repeat(40);
const USER = 'e2e65100-0000-4000-a000-000000000001';
const PROFILE = 'e2e65100-0000-4000-a000-000000000002';
const LO = { lo: [{ address: '127.0.0.1', internal: true }] };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const empty = () => new Response(null, { status: 204 });

function fixture(options = {}) {
  const env = { API_URL: contract.ORIGIN, ZAPP_E2E_RUN_ID: RUN, GITHUB_SHA: SHA,
    SERVICE_ROLE_KEY: 'synthetic-service-canary', ANON_KEY: 'synthetic-anon-canary',
    E2E_TEST_EMAIL: 'supervisor.e2e@example.invalid', E2E_TEST_PASSWORD: 'synthetic-password-canary', ...options.env };
  const state = { role: options.role ?? 'agent', is_active: options.active ?? false };
  const calls = [], reports = [], stdout = [];
  const adminHeaders = { apikey: env.SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
  const fetcher = async (target, request) => {
    const url = new URL(target);
    assert.equal(url.origin, contract.ORIGIN);
    assert.equal(request.redirect, 'error');
    assert.ok(request.signal instanceof AbortSignal);
    const call = { path: url.pathname, method: request.method ?? 'GET', query: url.searchParams,
      headers: request.headers ?? {}, body: request.body ? JSON.parse(request.body) : null };
    calls.push(call);
    const injected = options.response?.(call, calls.length, state);
    if (injected) return injected;
    if (call.path === '/__e2e/identity') {
      assert.deepEqual(call.headers, {});
      return json({ run_id: RUN, source_sha: SHA, origin: contract.ORIGIN, ...options.identity });
    }
    if (call.path === '/functions/v1/auth-login') {
      assert.equal(call.method, 'POST');
      assert.deepEqual(call.headers, { apikey: env.ANON_KEY, 'Content-Type': 'application/json' });
      assert.deepEqual(call.body, { email: env.E2E_TEST_EMAIL, password: env.E2E_TEST_PASSWORD, userAgent: 'isolated-readiness', mode: 'login' });
      return json({ access_token: 'synthetic-access-canary', refresh_token: 'synthetic-refresh-canary' });
    }
    const userRequest = call.headers.Authorization === 'Bearer synthetic-access-canary';
    if (userRequest) {
      assert.equal(call.path, '/rest/v1/profiles');
      assert.equal(call.query.get('user_id'), 'eq.' + USER);
      assert.equal(call.headers.apikey, env.ANON_KEY);
      assert.equal(call.query.get('select'), 'id,role,is_active');
      return json([{ id: PROFILE, ...state }]);
    }
    for (const [key, value] of Object.entries(adminHeaders)) assert.equal(call.headers[key], value);
    if (call.path === '/auth/v1/admin/users') {
      assert.equal(call.method, 'POST');
      assert.equal(call.body.email, env.E2E_TEST_EMAIL);
      assert.equal(call.body.email_confirm, true);
      return json(options.nested ? { user: { id: USER } } : { id: USER });
    }
    if (call.path === '/rest/v1/profiles') {
      assert.equal(call.query.get('user_id'), 'eq.' + USER);
      if (call.method === 'GET') return json([{ id: PROFILE }]);
      assert.equal(call.method, 'PATCH');
      // prevent_profile_privilege_escalation rejects a direct role change for
      // service_role without auth.uid(); user_roles triggers the canonical sync.
      if (Object.hasOwn(call.body, 'role') && call.body.role !== state.role)
        return json({ code: 'P0001', message: 'private-response-canary' }, 400);
      Object.assign(state, call.body);
      return empty();
    }
    if (call.path === '/rest/v1/user_roles') {
      if (call.method === 'DELETE') {
        assert.equal(call.query.get('user_id'), 'eq.' + USER);
        state.role = 'agent';
      } else {
        assert.equal(call.method, 'POST');
        assert.deepEqual(call.body, { user_id: USER, role: 'supervisor' });
        state.role = 'supervisor';
      }
      return empty();
    }
    assert.equal(call.path, '/rest/v1/user_settings');
    assert.equal(call.method, 'POST');
    assert.equal(call.query.get('on_conflict'), 'user_id');
    assert.equal(call.body.user_id, USER);
    return empty();
  };
  const run = () => execute(
    (path, value, settings) => { assert.equal(path, '/output/seed-ready.json'); assert.equal(settings.mode, 0o600); reports.push(JSON.parse(value)); },
    contract.assertLocalOrigin, () => contract.assertLoopbackOnly(options.interfaces ?? LO), contract.assertNoProxy,
    contract.assertRunId, contract.assertSourceSha, contract.ORIGIN, contract.fail, fetcher,
    { env, stdout: { write: value => stdout.push(value) } }, AbortSignal,
  );
  return { run, env, state, calls, reports, stdout };
}

for (const role of ['agent', 'supervisor', 'admin']) for (const active of [false, true]) for (const nested of [false, true]) {
  test(`seed uses canonical role sync: ${role}, active=${active}, nested=${nested}`, async () => {
    const f = fixture({ role, active, nested });
    await f.run();
    assert.equal(f.state.role, 'supervisor');
    assert.equal(f.state.is_active, true);
    assert.equal(f.reports.length, 1);
    assert.deepEqual(f.reports[0], { schema: 1, run_id: RUN, source_sha: SHA, user_id: USER, profile_id: PROFILE, auth_login_real: true, supervisor_rls_read: true });
    const update = f.calls.find(call => call.path === '/rest/v1/profiles' && call.method === 'PATCH');
    assert.ok(!Object.hasOwn(update.body, 'role'), 'the seed must let the real user_roles trigger derive profiles.role');
    const publicOutput = JSON.stringify([f.reports, f.stdout]);
    assert.ok(!publicOutput.includes('canary'));
  });
}

const guards = [
  ['remote origin', { env: { API_URL: 'https://example.invalid' } }, 'backend-origin-mismatch'],
  ['different local origin', { env: { API_URL: contract.ORIGIN.replace('127.0.0.1', 'localhost') } }, 'backend-origin-mismatch'],
  ['path in origin', { env: { API_URL: contract.ORIGIN + '/rest/v1' } }, 'backend-origin-mismatch'],
  ['query in origin', { env: { API_URL: contract.ORIGIN + '?q=1' } }, 'backend-origin-mismatch'],
  ['invalid run ID', { env: { ZAPP_E2E_RUN_ID: 'foreign' } }, 'invalid-run-id'],
  ['invalid source SHA', { env: { GITHUB_SHA: 'main' } }, 'invalid-source-sha'],
  ['no namespace interface', { interfaces: {} }, 'external-network-interface'],
  ['extra interface', { interfaces: { ...LO, eth0: [] } }, 'external-network-interface'],
  ['nonlocal address', { interfaces: { lo: [{ address: '10.0.0.1', internal: true }] } }, 'invalid-loopback-interface'],
  ['external loopback marker', { interfaces: { lo: [{ address: '127.0.0.1', internal: false }] } }, 'invalid-loopback-interface'],
  ...['HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ftp_proxy'].map(name => [name, { env: { [name]: 'http://proxy.invalid' } }, 'proxy-not-allowed']),
];
for (const [label, options, code] of guards) test('seed guard: ' + label, async () => {
  const f = fixture(options);
  Object.defineProperty(f.env, 'SERVICE_ROLE_KEY', { get() { throw new Error('credentials read before isolation'); } });
  await assert.rejects(f.run(), new RegExp(code));
  assert.equal(f.calls.length, 0);
  assert.equal(f.reports.length, 0);
});
for (const [field, value] of [['run_id', 'zapp-e2e-foreign-0001'], ['source_sha', 'b'.repeat(40)], ['origin', 'http://127.0.0.1:9000']]) {
  test('gateway identity rejects ' + field + ' before credentials', async () => {
    const f = fixture({ identity: { [field]: value } });
    Object.defineProperty(f.env, 'SERVICE_ROLE_KEY', { get() { throw new Error('credentials read before gateway verification'); } });
    await assert.rejects(f.run(), /foreign-gateway/);
    assert.equal(f.calls.length, 1);
    assert.equal(f.reports.length, 0);
  });
}
for (const name of ['SERVICE_ROLE_KEY', 'ANON_KEY', 'E2E_TEST_EMAIL', 'E2E_TEST_PASSWORD']) test('seed rejects missing ' + name, async () => {
  const f = fixture({ env: { [name]: '' } });
  await assert.rejects(f.run(), /missing-synthetic-credentials/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.reports.length, 0);
});
test('seed rejects non-synthetic email before writes', async () => {
  const f = fixture({ env: { E2E_TEST_EMAIL: 'external@example.com' } });
  await assert.rejects(f.run(), /missing-synthetic-credentials/);
  assert.equal(f.calls.length, 1);
});
for (let step = 1; step <= 9; step++) for (const status of [400, 401, 500]) {
  test(`seed stops on HTTP ${status} at request ${step}`, async () => {
    const f = fixture({ role: 'supervisor', response: (_, count) => count === step ? json({ message: 'private-response-canary' }, status) : undefined });
    await assert.rejects(f.run(), error => error.message === '[e2e-isolated/seed-http-' + status + ']' && !error.message.includes('canary'));
    assert.equal(f.calls.length, step);
    assert.equal(f.reports.length, 0);
  });
}
for (const [label, path, value, code, method] of [
  ['missing auth user', '/auth/v1/admin/users', {}, 'auth-user-not-created', 'POST'],
  ['invalid auth user', '/auth/v1/admin/users', { id: 'invalid' }, 'auth-user-not-created', 'POST'],
  ['missing trigger profile', '/rest/v1/profiles', [], 'profile-trigger-not-ready', 'GET'],
  ['duplicate trigger profile', '/rest/v1/profiles', [{ id: PROFILE }, { id: PROFILE }], 'profile-trigger-not-ready', 'GET'],
  ['invalid trigger profile', '/rest/v1/profiles', [{ id: 'invalid' }], 'profile-trigger-not-ready', 'GET'],
  ['missing access token', '/functions/v1/auth-login', { refresh_token: 'synthetic-refresh-canary' }, 'real-login-not-confirmed', 'POST'],
  ['missing refresh token', '/functions/v1/auth-login', { access_token: 'synthetic-access-canary' }, 'real-login-not-confirmed', 'POST'],
]) test('seed rejects ' + label, async () => {
  const f = fixture({ role: 'supervisor', response: call => call.path === path && call.method === method ? json(value) : undefined });
  await assert.rejects(f.run(), new RegExp(code));
  assert.equal(f.reports.length, 0);
});
for (const [label, value] of [
  ['invisible profile', []], ['multiple profiles', [{ role: 'supervisor', is_active: true }, { role: 'supervisor', is_active: true }]],
  ['unsynced role', [{ id: PROFILE, role: 'agent', is_active: true }]], ['inactive profile', [{ id: PROFILE, role: 'supervisor', is_active: false }]],
]) test('real-login readiness rejects ' + label, async () => {
  const f = fixture({ role: 'supervisor', response: call => call.headers.Authorization === 'Bearer synthetic-access-canary' ? json(value) : undefined });
  await assert.rejects(f.run(), /supervisor-rls-not-ready/);
  assert.equal(f.reports.length, 0);
});
