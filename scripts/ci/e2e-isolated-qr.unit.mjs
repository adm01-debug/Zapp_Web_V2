import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { createProviders } from '../e2e-isolated/providers.mjs';
import { seedQr } from '../e2e-isolated/seed-qr.mjs';
import { createIsolatedQrFixtureAccess, createQrOperationTracker } from '../e2e-isolated/qr-fixture-access.mjs';
import { ORIGIN, PROVIDER_ORIGIN, syntheticCredentials, makeProof, sha256, browserEnvironment } from '../e2e-isolated/runtime-contract.mjs';
import { QR_FIXTURE as Q, QR_SEED_FLAGS, QR_SEED_PATH, assertQrImage,
  readQrJson, qrJwt, validateQrSeedProof } from '../e2e-isolated/qr-contract.mjs';
import { SUITE_FIXTURES as F } from '../e2e-isolated/seed-suite.mjs';

// Deterministic HTTP protocol adapter. Real seed/provider/guard code runs;
// this does not replace native Auth signatures, Postgres RLS/triggers or Vault.
const RUN = 'zapp-e2e-qr-models-00000001';
const SHA = 'a'.repeat(40);
const LO = { lo: [{ address: '127.0.0.1', internal: true }, { address: '::1', internal: true }] };
const NS = 'net:[12345]';
const SUP = 'e2e65100-0000-4000-a000-000000009001';
const SUP_P = 'e2e65100-0000-4000-a000-000000009002';
const FILE_P = 'e2e65100-0000-4000-a000-000000009003';
const CONTACT_OWNER = 'e2e65100-0000-4000-a000-000000009004';
const QR_USER = 'e2e71190-7005-4509-a000-000000000001';
const QR_PROFILE = 'e2e71190-7005-4509-a000-000000000002';
const SECRET = 'e2e71190-7005-4509-a000-000000000003';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function jwt(sub, role = 'authenticated', now = Date.now(), extra = {}) {
  return [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub, role, exp: Math.floor(now / 1000) + 3600, ...extra })).toString('base64url'), 'model-signature'].join('.');
}
function backend(options = {}) {
  const now = Date.now();
  const c = syntheticCredentials(now);
  const env = {
    API_URL: ORIGIN, ANON_KEY: c.anonKey, SERVICE_ROLE_KEY: c.serviceRoleKey,
    E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY: c.serviceRoleKey,
    ZAPP_E2E_RUN_ID: RUN, GITHUB_SHA: SHA, ZAPP_E2E_LOCAL: '1',
    ZAPP_E2E_PROOF: '/run/zapp-e2e/proof.json',
    E2E_SUPABASE_URL_OVERRIDE: ORIGIN, E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE: c.anonKey,
    VITE_ZAPP_LOCAL_SUPABASE_URL: ORIGIN, VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY: c.anonKey,
    E2E_QR_TEST_EMAIL: c.qrEmail, E2E_QR_TEST_PASSWORD: c.qrPassword, E2E_QR_INSTANCE_TOKEN: c.qrInstanceToken,
    EVOLUTION_DEFAULT_INSTANCE_TOKEN: c.instanceToken,
    NODE_EXTRA_CA_CERTS: '/run/zapp-e2e-tls/ca.crt',
    ...options.env,
  };
  const state = {
    profiles: [
      { id: SUP_P, user_id: SUP, role: 'supervisor', is_active: true },
      { id: FILE_P, user_id: F.filesUser, role: 'agent', is_active: true },
    ],
    user_roles: [{ user_id: SUP, role: 'supervisor' }, { user_id: F.filesUser, role: 'agent' }],
    user_settings: [],
    whatsapp_connections: [
      { id: F.connection, instance_id: F.instance, status: 'connected', is_default: true, created_by: SUP_P, phone_number: F.connectionPhone },
      { id: F.filesConnection, instance_id: 'e2e-arquivos-local', status: 'connected', is_default: false, created_by: FILE_P, phone_number: '00000000002' },
    ],
    // seed-files-tab.mjs runs after arquivos-local/seed.ts and intentionally
    // assigns this canonical contact to its own synthetic profile.
    contacts: [{ id: F.contact, assigned_to: CONTACT_OWNER, whatsapp_connection_id: F.connection }],
    global_settings: [],
    tokens: new Map([[F.instance, c.instanceToken], ['e2e-arquivos-local', c.instanceToken]]),
    auth: new Map(),
    files: new Map(),
    calls: [], edgeCalls: [], providerCalls: [], patchCalls: [], writes: [], clock: now, sequence: 0,
    dbFail: false, neverQr: false,
  };
  state.files.set('/output/seed-ready.json', { schema: 1, run_id: RUN, source_sha: SHA, user_id: SUP,
    profile_id: SUP_P, auth_login_real: true, supervisor_rls_read: true });
  state.files.set('/output/suite-seed-ready.json', { schema: 1, run_id: RUN, source_sha: SHA,
    main_contact_rls: true, files_owner_preserved: true, talkx_connection_rls: true,
    instance_tokens_stored: true, onboarding_persisted: true });
  state.files.set('/run/zapp-e2e/proof.json', makeProof({ runId: RUN, sourceSha: SHA, anonKey: c.anonKey,
    networkNamespace: NS, now, checks: { network_isolated: true, cron_disabled: true, bootstrap_complete: true, seed_ready: true } }));
  let outsideFetches = 0;
  const providerEnv = { ZAPP_E2E_RUN_ID: RUN, GITHUB_SHA: SHA, NODE_EXTRA_CA_CERTS: '/run/zapp-e2e-tls/ca.crt',
    EVOLUTION_API_KEY: c.evolutionKey, EVOLUTION_DEFAULT_INSTANCE_TOKEN: c.instanceToken,
    E2E_QR_INSTANCE_TOKEN: c.qrInstanceToken, PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY: c.catalogKey };
  const app = createProviders({ env: providerEnv, interfaces: () => LO, namespace: () => NS,
    now: () => state.clock, fetcher: async () => { outsideFetches++; throw Error('no-network-model'); } });
  const stamp = () => new Date(now + ++state.sequence).toISOString();
  const pick = (row, select) => !select || select === '*' ? structuredClone(row)
    : Object.fromEntries(select.split(',').map(key => [key.trim(), row[key.trim()]]));
  const filter = (rows, params) => rows.filter(row => [...params].every(([key, value]) => {
    if (['select', 'order', 'on_conflict'].includes(key)) return true;
    if (key === 'or') return [row.id === Q.id, row.instance_id === Q.instance, row.name === Q.name].some(Boolean);
    if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
    if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(row[key]);
    throw Error('unsupported model filter ' + key);
  }));
  const role = token => {
    const id = state.auth.get(token);
    return state.profiles.find(row => row.user_id === id)?.role;
  };
  async function fetcher(target, init = {}) {
    const url = new URL(target);
    const headers = new Headers(init.headers);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    const call = { origin: url.origin, path: url.pathname, params: url.searchParams, method, body, headers };
    state.calls.push(call);
    const intercepted = await options.onCall?.(call, state, env);
    if (intercepted) return intercepted;
    if (url.origin === PROVIDER_ORIGIN) {
      state.providerCalls.push(call);
      const response = await app.handler(new Request(target, init));
      return state.neverQr && url.pathname === '/instance/qr' ? json({ data: {} }) : response;
    }
    if (url.origin !== ORIGIN) { outsideFetches++; throw Error('model forbids network'); }
    if (url.pathname === '/__e2e/identity') return json({ schema: 1, run_id: RUN, source_sha: SHA, origin: ORIGIN });
    const service = headers.get('apikey') === c.serviceRoleKey && headers.get('authorization') === 'Bearer ' + c.serviceRoleKey;
    const token = headers.get('authorization')?.slice('Bearer '.length);
    const userId = state.auth.get(token);
    if (url.pathname === '/auth/v1/admin/users') {
      assert.ok(service); assert.equal(method, 'POST'); assert.equal(body.email, Q.email);
      assert.equal(body.password, c.qrPassword);
      state.profiles.push({ id: QR_PROFILE, user_id: QR_USER, email: Q.email, role: 'agent', is_active: false });
      state.user_roles.push({ user_id: QR_USER, role: 'agent' });
      state.writes.push(call); return json({ id: QR_USER }, 200);
    }
    if (url.pathname === '/functions/v1/auth-login') {
      assert.equal(headers.get('apikey'), c.anonKey);
      assert.equal(headers.get('authorization'), null);
      assert.equal(body.email, Q.email); assert.equal(body.password, c.qrPassword);
      const access = jwt(QR_USER, 'authenticated', state.clock);
      state.auth.set(access, QR_USER); return json({ access_token: access, refresh_token: 'model-refresh' });
    }
    if (url.pathname === '/auth/v1/user') return userId ? json({ id: userId, email: userId === QR_USER ? Q.email : 'other@example.invalid' }) : json({ error: true }, 401);
    if (!service && (!userId || headers.get('apikey') !== c.anonKey)) return json({ code: '42501' }, 403);
    if (url.pathname === '/rest/v1/rpc/get_instance_token') {
      if (!service) return json({ code: '42501' }, 403);
      return json(state.tokens.get(body.p_instance_id) ?? null);
    }
    if (url.pathname === '/rest/v1/rpc/set_instance_token') {
      assert.ok(service);
      const row = state.whatsapp_connections.find(row => row.id === body.p_connection_id);
      assert.ok(row); assert.equal(row.id, Q.id); assert.equal(body.p_token, c.qrInstanceToken);
      state.tokens.set(row.instance_id, body.p_token); state.writes.push(call); return json(SECRET);
    }
    const table = url.pathname.replace('/rest/v1/', '');
    if (!Array.isArray(state[table])) throw Error('unsupported model route ' + url.pathname);
    const rows = state[table];
    if (method === 'GET') {
      let matches = filter(rows, url.searchParams);
      if (!service && table === 'profiles') matches = matches.filter(row => row.user_id === userId);
      if (!service && table === 'whatsapp_connections' && !['admin', 'supervisor'].includes(role(token))) matches = [];
      if (url.searchParams.has('order')) matches = [...matches].sort((a, b) => String(a[url.searchParams.get('order')]).localeCompare(String(b[url.searchParams.get('order')])));
      return json(matches.map(row => pick(row, url.searchParams.get('select'))));
    }
    if (method === 'POST') {
      assert.ok(service); state.writes.push(call);
      if (table === 'user_roles') {
        assert.equal(body.user_id, QR_USER); assert.equal(body.role, 'admin');
        rows.push(structuredClone(body));
        state.profiles.find(row => row.user_id === QR_USER).role = 'admin';
        return json([pick(body, url.searchParams.get('select'))], 201);
      }
      if (table === 'user_settings') {
        assert.equal(body.user_id, QR_USER); rows.push(structuredClone(body)); return json([body], 201);
      }
      if (table === 'whatsapp_connections') {
        assert.equal(body.id, Q.id); assert.ok(!rows.some(row => row.id === body.id));
        const added = { ...body, updated_at: stamp() }; rows.push(added);
        return json([pick(added, url.searchParams.get('select'))], 201);
      }
    }
    if (method === 'PATCH') {
      state.writes.push(call);
      if (table === 'profiles') {
        assert.ok(service); assert.equal(body.role, undefined); assert.equal(url.searchParams.get('user_id'), 'eq.' + QR_USER);
      } else if (table === 'whatsapp_connections') {
        assert.ok(!service, 'fixture reset must use user JWT');
        assert.equal(role(token), 'admin'); state.patchCalls.push(call);
      } else throw Error('unsupported PATCH table');
      const matches = filter(rows, url.searchParams);
      for (const row of matches) { Object.assign(row, body); row.updated_at = stamp(); }
      return json(matches.map(row => pick(row, url.searchParams.get('select'))));
    }
    throw Error('unsupported model request ' + method + ' ' + table);
  }
  const deps = {
    env, fetcher, interfaces: () => options.interfaces ?? LO, namespace: () => options.namespace ?? NS,
    readlink: () => options.namespace ?? NS, now: () => state.clock,
    readFile(name) { const value = state.files.get(name); if (!value) throw Error('missing model proof'); return JSON.stringify(value); },
    writeFile(name, raw, settings) { assert.equal(settings.mode, 0o600); state.files.set(name, JSON.parse(raw)); },
  };
  async function seed() { return seedQr(deps); }
  async function access() { return createIsolatedQrFixtureAccess({ baseURL: ORIGIN, anonKey: c.anonKey }, deps); }
  const token = () => [...state.auth.entries()].find(([, id]) => id === QR_USER)?.[0];
  return { c, env, state, app, deps, seed, access, token, fetcher, outsideFetches: () => outsideFetches };
}

const seeded = async options => { const b = backend(options); await b.seed(); return b; };
const row = b => b.state.whatsapp_connections.find(r => r.id === Q.id);
const completed = async () => { const t = createQrOperationTracker(); t.close(); return t.completion(0); };
const expected = b => ({ runId: RUN, sourceSha: SHA, networkNamespace: NS, anonHash: sha256(b.c.anonKey) });
const connectBody = () => ({ subscribe: ['ALL'], immediate: true, webhookUrl: ORIGIN + '/functions/v1/evolution-webhook' });
const call = (b, path, method = 'GET', body, key = b.c.qrInstanceToken) => b.app.handler(new Request(PROVIDER_ORIGIN + path, {
  method, headers: { apikey: key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}));

test('QR seed: distinct admin, third disconnected fixture, Vault roundtrip and authenticated readbacks', async () => {
  const b = backend(); const before = structuredClone({ profiles: b.state.profiles, roles: b.state.user_roles,
    rows: b.state.whatsapp_connections, contacts: b.state.contacts, tokens: b.state.tokens });
  await b.seed(); assert.equal(row(b).status, 'disconnected'); assert.equal(row(b).qr_code, null);
  assert.equal(row(b).is_default, false); assert.equal(row(b).created_by, QR_PROFILE);
  assert.deepEqual(b.state.whatsapp_connections.filter(r => r.id !== Q.id), before.rows);
  assert.deepEqual(b.state.profiles.filter(r => r.user_id !== QR_USER), before.profiles);
  assert.deepEqual(b.state.user_roles.filter(r => r.user_id !== QR_USER), before.roles);
  assert.deepEqual(b.state.contacts, before.contacts);
  for (const [instance, token] of before.tokens) assert.equal(b.state.tokens.get(instance), token);
  assert.equal(b.state.tokens.get(Q.instance), b.c.qrInstanceToken); assert.notEqual(b.c.qrInstanceToken, b.c.instanceToken);
  assert.deepEqual(validateQrSeedProof(b.state.files.get(QR_SEED_PATH), expected(b)), { userId: QR_USER, profileId: QR_PROFILE });
  const access = await b.access(); await access.assertBaseline(b.token());
  assert.ok(b.state.calls.some(c => c.path === '/rest/v1/whatsapp_connections' && c.headers.get('authorization') === 'Bearer ' + b.token()));
  assert.ok(!b.state.writes.some(c => c.path === '/rest/v1/profiles' && Object.hasOwn(c.body, 'role')));
  assert.equal(b.outsideFetches(), 0);
});
for (const owner of ['', SUP_P]) test('QR seed refuses invalid canonical contact owner ' + (owner || 'empty'), async () => {
  const b = backend(); b.state.contacts[0].assigned_to = owner;
  await assert.rejects(b.seed(), /existing-contact/);
  assert.ok(!b.state.writes.some(c => c.path === '/auth/v1/admin/users'));
});
test('QR bootstrap precedes browser proof without a circular prerequisite', async () => {
  const b = backend(); b.state.files.delete('/run/zapp-e2e/proof.json'); await b.seed();
  assert.ok(b.state.files.has(QR_SEED_PATH)); await assert.rejects(b.access());
});
for (const field of ['id', 'name', 'instance_id']) test('QR seed refuses collision by ' + field, async () => {
  const b = backend(); b.state.whatsapp_connections.push({ id: 'other', name: 'other', instance_id: 'other',
    [field]: { id: Q.id, name: Q.name, instance_id: Q.instance }[field] });
  await assert.rejects(b.seed(), /collision/); assert.ok(!b.state.writes.some(c => c.path === '/auth/v1/admin/users'));
});
for (const path of ['/rest/v1/rpc/set_instance_token', '/functions/v1/auth-login']) test('QR seed never writes readiness after failure: ' + path, async () => {
  const b = backend({ onCall(c) { if (c.path === path) return json({ error: true }, 403); } });
  await assert.rejects(b.seed()); assert.ok(!b.state.files.has(QR_SEED_PATH));
});
for (const env of [{ API_URL: 'https://example.invalid' }, { HTTPS_PROXY: 'http://example.invalid' },
  { NODE_TLS_REJECT_UNAUTHORIZED: '0' }, { NODE_OPTIONS: '--inspect' }]) test('QR bootstrap rejects forbidden environment ' + Object.keys(env)[0], async () => {
  const b = backend({ env }); await assert.rejects(b.seed()); assert.equal(b.state.calls.length, 0);
});
test('QR seed rejects maintenance and repeat creation without changing existing rows', async () => {
  const b = backend(); b.state.global_settings.push({ key: 'whatsapp_maintenance_until', value: new Date(b.state.clock + 60000).toISOString() });
  await assert.rejects(b.seed(), /maintenance/); assert.ok(!b.state.writes.some(c => c.path === '/auth/v1/admin/users'));
  const ready = await seeded(); await assert.rejects(ready.seed(), /collision/); assert.equal(ready.state.whatsapp_connections.length, 3);
});
test('QR credentials are unread until bootstrap identities are verified', async () => {
  const b = backend({ env: { API_URL: 'https://example.invalid' } });
  for (const key of ['SERVICE_ROLE_KEY', 'E2E_QR_TEST_PASSWORD', 'E2E_QR_INSTANCE_TOKEN'])
    Object.defineProperty(b.env, key, { get() { assert.fail('credential read before admission'); } });
  await assert.rejects(b.seed(), /origin/); assert.equal(b.state.calls.length, 0);
});
test('QR browser allowlist excludes new credentials and all privileged keys', () => {
  const b = backend(), publicEnv = browserEnvironment({ ...b.env, PATH: '/model' });
  assert.deepEqual(publicEnv, { PATH: '/model' });
});
for (const field of ['ZAPP_E2E_RUN_ID', 'GITHUB_SHA', 'E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE']) test('QR access rejects identity mutation across await: ' + field, async () => {
  let armed = false; const b = await seeded({ onCall(c, _s, env) { if (armed && c.path === '/auth/v1/user') env[field] += 'x'; } });
  const access = await b.access(); armed = true; await assert.rejects(access.assertBaseline(b.token())); assert.equal(b.state.patchCalls.length, 0);
});
for (const flag of QR_SEED_FLAGS) test('QR admission requires readiness ' + flag, async () => {
  const b = await seeded(); b.state.files.get(QR_SEED_PATH)[flag] = false; await assert.rejects(b.access());
});
test('QR Node fixture never reads service or provider credentials', async () => {
  const b = await seeded();
  for (const key of ['SERVICE_ROLE_KEY', 'E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY', 'E2E_QR_INSTANCE_TOKEN', 'EVOLUTION_DEFAULT_INSTANCE_TOKEN'])
    Object.defineProperty(b.env, key, { get() { assert.fail('privileged credential read'); } });
  const access = await b.access(); await access.assertBaseline(b.token()); await access.loginCredentials();
  await access.reset(b.token(), await completed());
});
test('QR provider delays first read, returns exact harmless image and resets each generation', async () => {
  const b = backend(); assert.deepEqual((await (await call(b, '/instance/qr')).json()).data, {});
  for (let generation = 1; generation <= 2; generation++) {
    assert.equal((await call(b, '/instance/connect', 'POST', connectBody())).status, 200);
    assert.deepEqual((await (await call(b, '/instance/qr')).json()).data, {});
    const result = (await (await call(b, '/instance/qr')).json()).data;
    assert.equal(result.code, Q.payload); assertQrImage(result.qrcode); assert.equal(b.app.evidence().qr.generation, generation);
  }
  const status = (await (await call(b, '/instance/status')).json()).data;
  assert.deepEqual(status, { Name: Q.instance, Connected: false, LoggedIn: false });
  assert.equal(b.app.evidence().count, 0); assert.equal(b.outsideFetches(), 0);
  for (const secret of [b.c.qrInstanceToken, b.c.instanceToken, b.c.evolutionKey]) assert.ok(!JSON.stringify(b.app.evidence()).includes(secret));
});
for (const credential of ['instanceToken', 'evolutionKey', 'catalogKey']) test('QR provider refuses scope ' + credential, async () => {
  const b = backend(); assert.equal((await call(b, '/instance/connect', 'POST', connectBody(), b.c[credential])).status, 401);
  assert.equal(b.app.evidence().qr.connects, 0);
});
for (const [path, method, body] of [
  ['/instance/connect', 'GET'], ['/instance/qr', 'POST'], ['/instance/status', 'POST'],
  ['/instance/connect?extra=1', 'POST', connectBody()], ['/prefix/instance/connect', 'POST', connectBody()],
  ['/instance/connect', 'POST', { ...connectBody(), webhookUrl: 'https://example.invalid' }],
  ['/instance/connect', 'POST', { ...connectBody(), extra: true }], ['/instance/connect', 'POST', {}],
  ['/instance/create', 'POST', {}], ['/instance/delete', 'POST', {}], ['/instance/logout', 'POST', {}],
  ['/send/text', 'POST', { number: Q.phone, text: 'no-delivery' }],
]) test('QR provider fails closed: ' + method + ' ' + path + ' ' + JSON.stringify(body ?? null), async () => {
  const b = backend(); assert.ok((await call(b, path, method, body)).status >= 400);
  assert.equal(b.app.evidence().qr.connects, 0); assert.equal(b.app.evidence().count, 0);
});
test('QR reset uses exact CAS with user JWT, one representation, authenticated readback', async () => {
  const b = await seeded(), access = await b.access(); row(b).status = 'qr_pending'; row(b).qr_code = Q.image;
  await access.assertPending(b.token()); await access.reset(b.token(), await completed());
  const call = b.state.patchCalls[0]; assert.equal(call.headers.get('authorization'), 'Bearer ' + b.token());
  assert.equal(call.headers.get('apikey'), b.c.anonKey); assert.equal(call.headers.get('prefer'), 'return=representation');
  assert.deepEqual([...call.params.keys()].sort(), ['created_by', 'id', 'instance_id', 'is_default', 'select', 'status', 'updated_at']);
  assert.deepEqual(call.body, { status: 'disconnected', qr_code: null }); await access.assertBaseline(b.token());
});
for (const fault of ['none', 'multiple', 'minimal']) test('QR reset rejects unconfirmed representation ' + fault, async () => {
  const b = await seeded({ onCall(c, s) { if (c.method === 'PATCH' && c.path === '/rest/v1/whatsapp_connections')
    return fault === 'minimal' ? new Response(null, { status: 204 }) : json(fault === 'none' ? [] : [s.whatsapp_connections[2], s.whatsapp_connections[2]]); } });
  const access = await b.access(); await assert.rejects(access.reset(b.token(), await completed()));
});
for (const field of ['created_by', 'instance_id', 'updated_at']) test('QR reset CAS blocks concurrent ' + field + ' change', async () => {
  let armed = false;
  const b = await seeded({ onCall(c, s) { if (armed && c.method === 'PATCH') s.whatsapp_connections.find(r => r.id === Q.id)[field] =
    field === 'updated_at' ? new Date(s.clock + 100000).toISOString() : 'other'; } });
  const access = await b.access(); row(b).status = 'qr_pending'; row(b).qr_code = Q.image; armed = true;
  await assert.rejects(access.reset(b.token(), await completed())); assert.equal(row(b).status, 'qr_pending');
});
test('QR operation completion waits for requestfinished and cannot be forged', async () => {
  const b = await seeded(), access = await b.access(), t = createQrOperationTracker(), request = {};
  t.started(request, 'connect'); t.close(); let resolved = false; const done = t.completion(1000).then(proof => { resolved = true; return proof; });
  await Promise.resolve(); assert.equal(resolved, false); t.finished(request); await access.reset(b.token(), await done);
  await assert.rejects(access.reset(b.token(), {}));
});
for (const fault of ['failed', 'invalid', 'after-close', 'pending']) test('QR tracker refuses reset after ' + fault, async () => {
  const b = await seeded(), t = createQrOperationTracker(), request = {};
  if (fault === 'after-close') t.close(); t.started(request, 'connect', fault !== 'invalid');
  if (fault === 'failed') t.failed(request); else if (fault !== 'pending') t.finished(request); t.close();
  await assert.rejects(t.completion(0)); assert.equal(b.state.patchCalls.length, 0);
});
test('QR new operation invalidates an already issued completion proof', async () => {
  const b = await seeded(), access = await b.access(), t = createQrOperationTracker(); t.close(); const proof = await t.completion(0);
  const request = {}; t.started(request, 'status'); t.finished(request);
  await assert.rejects(access.reset(b.token(), proof)); assert.equal(b.state.patchCalls.length, 0);
});
function classifier() {
  const ts = readFileSync(new URL('../../e2e/fixtures/isolated-qr.ts', import.meta.url), 'utf8');
  const js = stripTypeScriptTypes(ts, { mode: 'strip' }).replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+(const|function)\s/gm, '$1 ');
  return vm.runInNewContext(js + '\n;({qrRequestOperation,qrRequestAction})', {
    URL, QR_FIXTURE: Q, SUPABASE_URL: ORIGIN, base: { extend: () => ({}) },
  });
}
const request = (path, body = { instanceName: Q.instance }) => ({ url: () => ORIGIN + path, method: () => 'POST',
  postDataJSON() { if (body === 'invalid') throw Error('parse failed'); return body; } });
test('QR scenario matches only the canonical endpoint and exact fixture body', () => {
  const c = classifier(); for (const action of ['connect', 'status']) assert.equal(c.qrRequestAction(request('/functions/v1/evolution-api/' + action)), action);
  assert.equal(c.qrRequestOperation(request('/functions/v1/evolution-api/status', { instanceName: 'other' })), null);
});
for (const [path, body] of [
  ['/functions/v1/evolution-api/connect?extra=1'], ['/functions/v1/evolution-api/status?extra=1'],
  ['/functions/v1/evolution-api/connect/'], ['/functions/v1/evolution-api//status'],
  ['/functions/v1/evolution-api', { action: 'connect', instanceName: Q.instance }],
  ['/functions/v1/evolution-api/connect', { instance: Q.instance }],
  ['/functions/v1/evolution-api/connect', { instanceName: 'other', instance: Q.instance }],
  ['/functions/v1/evolution-api/connect', 'invalid'], ['/functions/v1/evolution-api/connect', null],
  ['/functions/v1/evolution-api/connect', []], ['/functions/v1/evolution-api/connect', {}],
]) test('QR cleanup tracks and rejects noncanonical operation ' + path + ' ' + JSON.stringify(body ?? null), async () => {
  const c = classifier(), req = request(path, body), operation = c.qrRequestOperation(req);
  assert.equal(c.qrRequestAction(req), null); assert.equal(operation.valid, false);
  const t = createQrOperationTracker(); t.started(req, operation.action, operation.valid); t.finished(req); t.close();
  await assert.rejects(t.completion(0));
});
for (const value of ['', 'data:image/png;base64,invalid', Q.image.replace('iVBOR', 'xVBOR')]) test('QR image digest refuses changed bytes ' + value.length, () => assert.throws(() => assertQrImage(value)));
for (const claims of [{ exp: 1 }, { role: 'service_role' }, { sub: SUP }]) test('QR user JWT rejects claims ' + Object.keys(claims)[0], () => {
  assert.throws(() => qrJwt(jwt(QR_USER, 'authenticated', Date.now(), claims), 'authenticated', Date.now(), QR_USER));
});
test('QR JSON reader rejects oversized, malformed and unexpected-status bodies without exposing content', async () => {
  for (const response of [new Response('sensitive-invalid-json'), new Response('x'.repeat(65537)), json({ secret: 'sentinel' }, 500)]) {
    await assert.rejects(readQrJson(response, 'bounded'), error => !/sensitive|sentinel/.test(error.message));
  }
});
