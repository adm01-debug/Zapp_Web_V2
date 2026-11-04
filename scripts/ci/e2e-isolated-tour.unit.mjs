import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { validateIsolatedAuthEvidence } from '../e2e-isolated/admission.mjs';

// Run the real TypeScript fixture after Node's type erasure. Framework/I/O are
// controlled at import boundaries; this is not a browser or PostgreSQL proof.
const source = readFileSync(new URL('../../e2e/fixtures/onboarding-isolated.ts', import.meta.url), 'utf8');
const js = stripTypeScriptTypes(source, { mode: 'strip' }).replace(/^import .*;\s*$/gm, '')
  .replace(/^export \{ expect \};?\s*$/gm, '').replace(/^export /gm, '');
const build = new Function('base', 'expect', 'randomBytes', 'readFile', 'readlink', 'networkInterfaces',
  'assertIsolatedAuthEnvironment', 'validateIsolatedAuthEvidence', 'process', 'fetch', 'AbortSignal',
  js + '\nreturn {withFreshOnboardingUser, gotoOnboardingContacts, test};');
const ORIGIN = 'https://127.0.0.1:5173';
const RUN = 'zapp-e2e-tour-test-0001';
const SHA = 'a'.repeat(40);
const LO = { lo: [{ address: '127.0.0.1', internal: true }] };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const hash = value => createHash('sha256').update(value).digest('hex');
let sequence = 0;

function fixture(options = {}) {
  const now = Date.now();
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const content = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ role: 'anon', exp: Math.floor(now / 1000) + 3600 });
  const key = content + '.' + createHmac('sha256', 'synthetic-test-only').update(content).digest('base64url');
  const env = {
    ZAPP_E2E_PROOF: '/run/zapp-e2e/proof.json', ZAPP_E2E_RUN_ID: RUN, GITHUB_SHA: SHA,
    VITE_ZAPP_LOCAL_SUPABASE_URL: ORIGIN, VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY: key,
    E2E_SUPABASE_URL_OVERRIDE: ORIGIN, E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE: key,
    SERVICE_ROLE_KEY: 'synthetic-service-canary', E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-canary',
    ...options.env,
  };
  const proof = { schema: 1, run_id: RUN, source_sha: SHA, origin: ORIGIN,
    network_namespace: 'net:[12345]', anon_key_sha256: hash(key), created_at: new Date(now - 1000).toISOString(),
    expires_at: new Date(now + 3_599_000).toISOString(),
    checks: { network_isolated: true, cron_disabled: true, bootstrap_complete: true, seed_ready: true }, ...options.proof };
  const uid = 'e2e65100-0000-4000-a000-' + String(++sequence).padStart(12, '0');
  const profileId = 'e2e65200-0000-4000-a000-' + String(sequence).padStart(12, '0');
  const state = { user: null, role: 'agent', is_active: false, completed: undefined, use: 0, deleted: [], requests: [], pageCalls: [], fixtureDefinition: null };
  const target = () => validateIsolatedAuthEvidence({ baseURL: ORIGIN, env, proof,
    networkNamespace: options.namespace ?? 'net:[12345]', interfaces: options.interfaces ?? LO, now: Date.now() });
  const readFile = async path => {
    assert.equal(path, '/run/zapp-e2e/proof.json');
    if (options.readError) throw new Error('private-file-canary');
    return options.rawProof ?? JSON.stringify(proof);
  };
  const assertAdmission = async () => {
    state.pageCalls.push('admission');
    if (options.admissionFailure) throw new Error('ISOLATION_BROWSER');
    target();
  };
  const fetcher = async (urlString, request) => {
    const url = new URL(urlString);
    assert.equal(url.origin, ORIGIN);
    assert.equal(request.redirect, 'error');
    assert.ok(request.signal instanceof AbortSignal);
    assert.equal(request.headers.apikey, 'synthetic-service-canary');
    assert.equal(request.headers.Authorization, 'Bearer synthetic-service-canary');
    const call = { path: url.pathname, method: request.method, query: url.searchParams,
      body: request.body ? JSON.parse(request.body) : undefined };
    state.requests.push(call);
    const replacement = options.response?.(call, state.requests.length, state);
    if (replacement) return replacement;
    if (call.path === '/auth/v1/admin/users' && call.method === 'POST') {
      assert.match(call.body.email, /^tour\.[a-f0-9]{24}@example\.invalid$/);
      assert.ok(call.body.password.length >= 32);
      assert.equal(call.body.email_confirm, true);
      assert.deepEqual(call.body.app_metadata, { e2e_fixture: 'onboarding-tour', e2e_run_id: RUN, e2e_source_sha: SHA });
      state.user = { id: uid, email: call.body.email, app_metadata: call.body.app_metadata };
      return json(state.user);
    }
    if (call.path.startsWith('/auth/v1/admin/users/')) {
      assert.equal(call.path, '/auth/v1/admin/users/' + uid);
      if (call.method === 'GET') return json(state.user);
      assert.equal(call.method, 'DELETE'); state.deleted.push(uid); return json({});
    }
    if (call.path === '/rest/v1/profiles') {
      assert.equal(call.query.get('user_id'), 'eq.' + uid);
      if (call.method === 'PATCH') {
        assert.deepEqual(call.body, { is_active: true }); state.is_active = true;
        return new Response(null, { status: 204 });
      }
      return json([{ id: profileId, user_id: uid, role: state.role, is_active: state.is_active }]);
    }
    if (call.path === '/rest/v1/user_roles') {
      if (call.method === 'DELETE') { assert.equal(call.query.get('user_id'), 'eq.' + uid); state.role = 'agent'; }
      else { assert.equal(call.method, 'POST'); assert.deepEqual(call.body, { user_id: uid, role: 'supervisor' }); state.role = 'supervisor'; }
      return new Response(null, { status: 204 });
    }
    assert.equal(call.path, '/rest/v1/user_settings');
    if (call.method === 'POST') {
      assert.equal(call.query.get('on_conflict'), 'user_id');
      assert.deepEqual(call.body, { user_id: uid, onboarding_completed: false }); state.completed = false;
      return new Response(null, { status: 204 });
    }
    assert.equal(call.query.get('user_id'), 'eq.' + uid);
    return json([{ user_id: uid, onboarding_completed: state.completed }]);
  };
  const locator = selector => ({
    selector, first() { return this; }, getByRole() { return this; },
    async fill(value) { state.pageCalls.push(['fill', selector, value]); if (options.loginFailure) throw new Error('synthetic-login-failure'); },
    async click() { state.pageCalls.push(['click', selector]); },
  });
  const page = { async goto(url) { state.pageCalls.push(['goto', url]); },
    locator, getByRole: (role, config) => locator(role + ':' + String(config?.name)),
    getByTestId: locator, getByText: locator };
  const expect = value => ({
    async toBeVisible() { assert.ok(value); if (options.visibilityFailure) throw new Error('not-visible'); },
    async toBeAttached() { assert.ok(value); }, async toHaveCount(count) { assert.equal(count, 0); },
  });
  const api = build({ extend: definition => { state.fixtureDefinition = definition; return definition; } }, expect,
    randomBytes, readFile, async path => { assert.equal(path, '/proc/self/ns/net'); return options.namespace ?? 'net:[12345]'; },
    () => options.interfaces ?? LO, assertAdmission, validateIsolatedAuthEvidence, { env }, fetcher, AbortSignal);
  const run = () => api.withFreshOnboardingUser({ page, baseURL: ORIGIN }, async () => {
    state.use++; if (options.useFailure) throw new Error('assertion-failed-canary');
    await options.use?.(state, env, proof);
  });
  return { run, api, state, env, proof, uid, page };
}

test('fresh user lifecycle uses canonical roles, false preference, UI login and owned cleanup', async () => {
  const f = fixture(); await f.run();
  assert.equal(f.state.use, 1); assert.deepEqual(f.state.deleted, [f.uid]);
  assert.equal(f.state.role, 'supervisor'); assert.equal(f.state.completed, false);
  assert.ok(f.state.requests.some(call => call.path === '/rest/v1/profiles' && call.method === 'GET' && call.query.get('select')?.includes('role')),
    'role synchronization must be read back, not inferred from HTTP success');
  assert.ok(f.state.pageCalls.some(call => Array.isArray(call) && call[0] === 'fill' && call[1] === '#login-email' && call[2] === f.state.user.email));
  assert.equal(f.state.fixtureDefinition.freshOnboardingUser[1].auto, true);
});
for (const failure of ['useFailure', 'loginFailure', 'visibilityFailure']) test('owned cleanup follows ' + failure, async () => {
  const f = fixture({ [failure]: true }); await assert.rejects(f.run());
  assert.deepEqual(f.state.deleted, [f.uid]);
});
test('two simultaneous tests own different accounts and never reset each other', async () => {
  let entered = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  const use = async () => { if (++entered === 2) release(); await barrier; };
  const a = fixture({ use }), b = fixture({ use });
  await Promise.all([a.run(), b.run()]);
  assert.notEqual(a.state.user.email, b.state.user.email); assert.notEqual(a.uid, b.uid);
  assert.deepEqual(a.state.deleted, [a.uid]); assert.deepEqual(b.state.deleted, [b.uid]);
});
for (const options of [
  { admissionFailure: true }, { env: { E2E_SUPABASE_URL_OVERRIDE: 'https://example.invalid' } },
  { env: { HTTPS_PROXY: 'http://proxy.invalid' } }, { env: { GITHUB_SHA: 'main' } },
  { namespace: 'net:[99999]' }, { interfaces: { ...LO, eth0: [] } },
  { proof: { expires_at: '2020-01-01T00:00:00.000Z' } }, { proof: { source_sha: 'b'.repeat(40) } },
]) test('isolation precedes credential reads: ' + JSON.stringify(options), async () => {
  const f = fixture(options);
  Object.defineProperty(f.env, 'SERVICE_ROLE_KEY', { get() { throw new Error('credential-getter-reached'); } });
  await assert.rejects(f.run(), error => !error.message.includes('credential-getter-reached'));
  assert.equal(f.state.requests.length, 0); assert.equal(f.state.use, 0);
});
for (const options of [{ readError: true }, { rawProof: '{invalid' }, { rawProof: 'x'.repeat(8193) }]) {
  test('fixture rejects unreadable/invalid proof ' + Object.keys(options)[0] + String(options.rawProof?.length ?? ''), async () => {
    const f = fixture(options); await assert.rejects(f.run(), /isolation-proof/); assert.equal(f.state.requests.length, 0);
  });
}
for (const options of [{ SERVICE_ROLE_KEY: '' }, { E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY: '' }, { E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY: 'other' }]) {
  test('fixture requires matching local service key ' + Object.keys(options)[0] + options[Object.keys(options)[0]], async () => {
    const f = fixture({ env: options }); await assert.rejects(f.run(), /local-service-key/); assert.equal(f.state.requests.length, 0);
  });
}
for (const [field, value] of [['id', 'invalid'], ['email', 'foreign@example.invalid'], ['app_metadata', {}]]) {
  test('refuses foreign create response ' + field, async () => {
    const f = fixture({ response: call => call.path === '/auth/v1/admin/users' ? json({ id: 'e2e65100-0000-4000-a000-000000009999', email: call.body.email, app_metadata: call.body.app_metadata, [field]: value }) : undefined });
    await assert.rejects(f.run(), /created-user-not-owned/); assert.equal(f.state.deleted.length, 0); assert.equal(f.state.use, 0);
  });
}
for (const [field, value] of [['id', 'e2e65100-0000-4000-a000-000000009999'], ['email', 'foreign@example.invalid'], ['app_metadata', {}]]) {
  test('refuses foreign cleanup response ' + field, async () => {
    const f = fixture({ response: (call, _, state) => call.path.startsWith('/auth/v1/admin/users/') && call.method === 'GET' ? json({ ...state.user, [field]: value }) : undefined });
    await assert.rejects(f.run(), /cleanup-user-not-owned/); assert.equal(f.state.deleted.length, 0);
  });
}
const stages = [
  ['create', call => call.path === '/auth/v1/admin/users', false],
  ['profile trigger', call => call.path === '/rest/v1/profiles' && call.method === 'GET' && call.query.get('select') === 'id', false],
  ['active profile', call => call.path === '/rest/v1/profiles' && call.method === 'PATCH', false],
  ['delete roles', call => call.path === '/rest/v1/user_roles' && call.method === 'DELETE', false],
  ['insert role', call => call.path === '/rest/v1/user_roles' && call.method === 'POST', false],
  ['profile readback', call => call.path === '/rest/v1/profiles' && call.method === 'GET' && call.query.get('select')?.includes('role'), false],
  ['write preference', call => call.path === '/rest/v1/user_settings' && call.method === 'POST', false],
  ['read preference', call => call.path === '/rest/v1/user_settings' && call.method === 'GET', false],
  ['cleanup ownership', call => call.path.startsWith('/auth/v1/admin/users/') && call.method === 'GET', true],
  ['owned delete', call => call.path.startsWith('/auth/v1/admin/users/') && call.method === 'DELETE', true],
];
for (const [stage, matches, used] of stages) for (const status of [400, 500]) {
  test(`HTTP ${status} at ${stage} cannot yield success`, async () => {
    let injected = false;
    const f = fixture({ response: call => { if (matches(call)) { injected = true; return json({ message: 'private-response-canary' }, status); } } });
    await assert.rejects(f.run(), error => error.message === `[E2E tour/local-http-${status}]` && !error.message.includes('canary'));
    assert.ok(injected); assert.equal(f.state.use, Number(used));
  });
}
for (const [label, change] of [
  ['wrong role', row => ({ ...row, role: 'agent' })], ['inactive', row => ({ ...row, is_active: false })],
  ['wrong profile', row => ({ ...row, id: 'e2e65200-0000-4000-a000-000000009999' })],
  ['wrong user', row => ({ ...row, user_id: 'e2e65100-0000-4000-a000-000000009999' })],
  ['no row', () => null],
]) test('UI login waits for synchronized profile: ' + label, async () => {
  const f = fixture({ response: (call, _, state) => {
    if (call.path === '/rest/v1/profiles' && call.method === 'GET' && call.query.get('select')?.includes('role')) {
      const row = change({ id: 'e2e65200-0000-4000-a000-' + f.uid.slice(-12), user_id: f.uid, role: state.role, is_active: state.is_active });
      return json(row ? [row] : []);
    }
  } });
  await assert.rejects(f.run(), /fresh-profile-not-ready/);
  assert.equal(f.state.use, 0); assert.deepEqual(f.state.deleted, [f.uid]);
});
for (const value of [true, null, 'false', undefined]) test('fresh preference requires Boolean false: ' + String(value), async () => {
  const f = fixture({ response: (call, _, state) => call.path === '/rest/v1/user_settings' && call.method === 'GET' ? json([{ user_id: state.user.id, onboarding_completed: value }]) : undefined });
  await assert.rejects(f.run(), /fresh-onboarding-not-ready/); assert.equal(f.state.use, 0); assert.deepEqual(f.state.deleted, [f.uid]);
});
for (const [label, change] of [
  ['run', (_, env) => { env.ZAPP_E2E_RUN_ID = 'foreign'; }],
  ['namespace proof', (_, __, proof) => { proof.network_namespace = 'net:[99999]'; }],
  ['expiry', (_, __, proof) => { proof.expires_at = '2020-01-01T00:00:00.000Z'; }],
]) test('cleanup revalidates isolation after the test: ' + label, async () => {
  const f = fixture({ use: change }); await assert.rejects(f.run()); assert.equal(f.state.deleted.length, 0);
});

// Exercise the existing assertion callbacks against deliberate UI state faults.
// The browser engine and timing are not simulated as native integration passes.
const specSource = readFileSync(new URL('../../e2e/onboarding-tour.spec.ts', import.meta.url), 'utf8');
const specJs = stripTypeScriptTypes(specSource, { mode: 'strip' }).replace(/^import .*;\s*$/gm, '');
function tourSpec(fault = 'healthy') {
  const state = { visible: fault !== 'missing tour', completed: false, checked: false, registered: [], annotations: [], config: null, timeout: null };
  const storage = {};
  const window = { localStorage: Object.assign(storage, { removeItem(key) { delete storage[key]; } }) };
  const dismiss = kind => {
    if (fault === kind + ' stuck') return;
    state.visible = false; storage.onboarding_completed_test = 'true';
    if (![kind + ' not persisted', 'not persisted'].includes(fault)) state.completed = true;
  };
  const skip = {
    async waitFor() { if (!state.visible) throw new Error('tour absent'); },
    async click() { dismiss('skip'); },
  };
  const toggle = {
    first() { return this; },
    async getAttribute(name) { assert.equal(name, 'aria-checked'); return String(state.checked); },
    async click() { if (fault === 'click blocked') throw new Error('click blocked'); if (fault !== 'toggle unchanged') state.checked = !state.checked; },
  };
  const dialog = {};
  const expect = value => ({
    toBe(expected) { assert.equal(value, expected); },
    async toBeVisible() { assert.notEqual(fault, 'switch absent'); },
    async toBeHidden() { assert.equal(value, skip); assert.equal(state.visible, false); },
    async toHaveCount(count) { assert.equal(value, skip); assert.equal(Number(state.visible), count); },
    async toHaveAttribute(name, expected) {
      if (value === dialog) { assert.equal(name, 'aria-modal'); assert.equal(fault === 'wrong aria' ? 'false' : 'true', expected); }
      else { assert.equal(value, toggle); assert.equal(name, 'aria-checked'); assert.equal(String(state.checked), expected); }
    },
  });
  const page = {
    getByRole(role) { return role === 'button' ? skip : role === 'dialog' ? dialog : toggle; },
    keyboard: { async press(key) { assert.equal(key, 'Escape'); dismiss('escape'); } },
    async evaluate(callback) { await callback(); },
    async reload() { state.visible = fault === 'reappears' || (!state.completed && !storage.onboarding_completed_test); },
    async waitForTimeout(ms) { assert.equal(ms, 9000); },
  };
  const register = (name, callback) => state.registered.push({ name, callback });
  register.describe = (_, callback) => callback();
  register.info = () => ({ annotations: state.annotations });
  register.skip = (condition) => { if (condition) { const e = new Error('runtime skip'); e.skipped = true; throw e; } };
  register.use = config => { state.config = config; };
  register.setTimeout = value => { state.timeout = value; };
  const load = new Function('test', 'expect', 'gotoContacts', 'gotoOnboardingContacts', 'window', specJs);
  load(register, expect, async () => dismiss('skip'), async () => {}, window);
  return { state, page };
}
test('Tour has two original cases and an empty browser state per test', () => {
  const { state } = tourSpec();
  assert.equal(state.registered.length, 2);
  assert.deepEqual(state.config?.storageState, { cookies: [], origins: [] });
  assert.equal(state.timeout, 120_000);
});
const tourFaults = [
  ['healthy', [true, true]], ['missing tour', [false, false]], ['wrong aria', [false, true]],
  ['escape stuck', [false, true]], ['escape not persisted', [false, true]],
  ['skip stuck', [true, false]], ['skip not persisted', [true, false]],
  ['click blocked', [false, false]], ['toggle unchanged', [false, false]],
  ['switch absent', [false, false]], ['not persisted', [false, false]], ['reappears', [false, false]],
];
for (const [fault, accepted] of tourFaults) for (let index = 0; index < 2; index++) {
  test(`Tour assertion callback ${index + 1}: ${fault}`, async () => {
    const { state, page } = tourSpec(fault);
    let error;
    try { await state.registered[index].callback({ page }); } catch (value) { error = value; }
    assert.notEqual(error?.skipped, true, 'a missing prerequisite must fail rather than skip');
    if (accepted[index]) assert.equal(error, undefined);
    else assert.ok(error, 'the original assertion must detect this UI fault');
  });
}
