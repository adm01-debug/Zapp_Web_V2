import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seedSuite, SUITE_FIXTURES as F } from '../e2e-isolated/seed-suite.mjs';
import { ORIGIN } from '../e2e-isolated/runtime-contract.mjs';

const RUN = 'zapp-e2e-seed-test-0001';
const SHA = 'a'.repeat(40);
const PROFILE = 'e2e65100-0000-4000-a000-000000009001';
const USER = 'e2e65100-0000-4000-a000-000000009002';
const FILES_OWNER = 'e2e65100-0000-4000-a000-000000009003';
const SECRET_ID = 'e2e65100-0000-4000-a000-000000009004';
const LO = { lo: [{ internal: true, address: '127.0.0.1' }, { internal: true, address: '::1' }] };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('suite seed identities and pagination stay bound to the existing E2E/app fixtures', () => {
  const source = name => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
  const contact = source('e2e/fixtures/e2e-contact.ts');
  const talkx = source('e2e/fixtures/e2e-talkx.ts');
  const arquivos = source('e2e/fixtures/arquivos-local/dados.ts');
  const search = source('src/hooks/crm/useContactsSearch.ts');
  const literal = (text, name) => text.match(new RegExp('export const ' + name + " = '([^']+)';"))?.[1];
  assert.equal(literal(contact, 'E2E_FIXTURE_CONTACT_ID'), F.contact);
  assert.equal(literal(contact, 'E2E_FIXTURE_CONTACT_NAME'), F.contactName);
  assert.equal(literal(talkx, 'E2E_TALKX_CONNECTION_ID'), F.connection);
  assert.equal(literal(talkx, 'E2E_TALKX_CONNECTION_LABEL'), F.connectionName + ' (' + F.connectionPhone + ')');
  assert.equal(literal(talkx, 'E2E_TALKX_SEGMENT_ID'), F.segment);
  assert.equal(literal(talkx, 'E2E_TALKX_SEGMENT_NAME'), F.segmentName);
  assert.equal(arquivos.match(/conexao:\s*\{\s*id: '([^']+)'/)?.[1], F.filesConnection);
  assert.equal(arquivos.match(/usuario:\s*\{\s*\/\*\*[^]*?\*\/\s*id: '([^']+)'/)?.[1], F.filesUser);
  assert.equal(arquivos.match(/email: '([^']+)'/)?.[1], F.filesEmail);
  const pageSize = Number(search.match(/const PAGE_SIZE = (\d+);/)?.[1]);
  assert.equal(pageSize, 50);
  assert.ok(F.paginationCount > pageSize);
});

function fixture(options = {}) {
  const state = {
    contacts: [{ id: F.contact, name: F.contactName, assigned_to: FILES_OWNER }],
    whatsapp_connections: [{ id: F.filesConnection, instance_id: 'e2e-arquivos-local' }],
    talkx_segments: [], messages: [], tokens: new Map(),
    user_settings: [
      { user_id: USER, onboarding_completed: false, theme: 'dark' },
      { user_id: F.filesUser, onboarding_completed: false, sound_volume: 65 },
    ],
  };
  const calls = [];
  const reports = [];
  const env = {
    API_URL: ORIGIN, ZAPP_E2E_RUN_ID: RUN, GITHUB_SHA: SHA,
    SERVICE_ROLE_KEY: 'synthetic-service-key', ANON_KEY: 'synthetic-anon-key',
    E2E_TEST_EMAIL: 'supervisor.e2e@example.invalid', E2E_TEST_PASSWORD: 'synthetic-password',
    EVOLUTION_DEFAULT_INSTANCE_TOKEN: 'e2e-instance-synthetic-token',
    ...options.env,
  };
  const proof = { schema: 1, run_id: RUN, source_sha: SHA, user_id: USER, profile_id: PROFILE,
    auth_login_real: true, supervisor_rls_read: true, ...options.proof };
  const identity = { schema: 1, run_id: RUN, source_sha: SHA, origin: ORIGIN, ...options.identity };
  const args = {
    env, interfaces: () => options.interfaces ?? LO,
    readFile(name) {
      assert.equal(name, '/output/seed-ready.json');
      if (options.readError) throw new Error('sensitive-file-content');
      return options.rawProof ?? JSON.stringify(proof);
    },
    writeFile(name, body, config) {
      assert.equal(name, '/output/suite-seed-ready.json');
      assert.equal(config.mode, 0o600);
      reports.push(JSON.parse(body));
    },
    async fetcher(target, request) {
      const url = new URL(target);
      assert.equal(url.origin, ORIGIN);
      assert.equal(request.redirect, 'error');
      assert.ok(request.signal instanceof AbortSignal);
      const call = { path: url.pathname, query: url.searchParams, method: request.method ?? 'GET',
        headers: request.headers ?? {}, body: request.body ? JSON.parse(request.body) : null };
      calls.push(call);
      const injected = options.response?.(call, state, calls);
      if (injected) return injected;
      if (url.pathname === '/__e2e/identity') {
        assert.deepEqual(call.headers, {});
        return json(identity);
      }
      if (url.pathname === '/functions/v1/auth-login') {
        assert.equal(call.method, 'POST');
        assert.equal(call.headers.apikey, env.ANON_KEY);
        assert.equal(call.headers.Authorization, undefined);
        assert.equal(call.body.email, env.E2E_TEST_EMAIL);
        assert.equal(call.body.password, env.E2E_TEST_PASSWORD);
        return json({ access_token: 'synthetic-user-token', refresh_token: 'synthetic-refresh-token' });
      }
      const admin = call.headers.apikey === env.SERVICE_ROLE_KEY && call.headers.Authorization === 'Bearer ' + env.SERVICE_ROLE_KEY;
      const user = call.headers.apikey === env.ANON_KEY && call.headers.Authorization === 'Bearer synthetic-user-token';
      assert.ok(admin || user, 'request must use one explicit local identity');
      if (url.pathname === '/rest/v1/profiles') {
        if (url.searchParams.get('user_id') === 'eq.' + F.filesUser) {
          assert.ok(admin);
          return json([{ id: FILES_OWNER, user_id: F.filesUser, email: F.filesEmail, role: 'agent', is_active: true }]);
        }
        assert.ok(user);
        assert.equal(url.searchParams.get('user_id'), 'eq.' + USER);
        return json([{ id: PROFILE, role: 'supervisor', is_active: true }]);
      }
      if (url.pathname === '/rest/v1/rpc/set_instance_token') {
        assert.ok(admin);
        assert.deepEqual(Object.keys(call.body).sort(), ['p_connection_id', 'p_token']);
        assert.ok([F.connection, F.filesConnection].includes(call.body.p_connection_id));
        assert.equal(call.body.p_token, env.EVOLUTION_DEFAULT_INSTANCE_TOKEN);
        assert.ok(state.whatsapp_connections.some(row => row.id === call.body.p_connection_id));
        state.tokens.set(call.body.p_connection_id, call.body.p_token);
        return json(SECRET_ID);
      }
      if (url.pathname === '/rest/v1/rpc/search_contacts') {
        assert.ok(user);
        assert.deepEqual(call.body, { search_term: '', sort_field: 'name', sort_direction: 'asc', page_size: 50, page_offset: 50 });
        const visible = state.contacts.filter(row => row.assigned_to === PROFILE || row.id === F.contact);
        const rows = [...visible].sort((a, b) => a.name.localeCompare(b.name)).slice(50, 100);
        return json(rows.map(row => ({ ...row, total_count: visible.length })));
      }
      const name = url.pathname.slice('/rest/v1/'.length);
      assert.ok(Object.hasOwn(state, name), 'unknown table: ' + name);
      let rows = state[name];
      if (call.method === 'POST') {
        assert.ok(admin);
        const key = name === 'user_settings' ? 'user_id' : 'id';
        assert.equal(url.searchParams.get('on_conflict'), key);
        for (const row of Array.isArray(call.body) ? call.body : [call.body]) {
          const old = rows.find(item => item[key] === row[key]);
          if (old) Object.assign(old, row); else rows.push(structuredClone(row));
        }
        return new Response(null, { status: 204 });
      }
      const key = name === 'user_settings' ? 'user_id' : 'id';
      const id = url.searchParams.get(key)?.slice(3);
      assert.ok(id);
      rows = rows.filter(row => row[key] === id);
      if (call.method === 'PATCH') {
        assert.ok(admin);
        assert.equal(name, 'contacts');
        assert.equal(id, F.contact);
        assert.ok(!Object.hasOwn(call.body, 'assigned_to'), 'must preserve the real files agent');
        for (const row of rows) Object.assign(row, call.body);
        return new Response(null, { status: 204 });
      }
      assert.equal(call.method, 'GET');
      const fields = url.searchParams.get('select').split(',');
      return json(rows.map(row => Object.fromEntries(fields.map(field => [field, row[field]]))));
    },
  };
  return { args, state, calls, reports, env };
}

async function rejects(options, code, inspect = () => {}) {
  const f = fixture(options);
  await assert.rejects(seedSuite(f.args), new RegExp('\\[e2e-isolated/' + code + '\\]'));
  assert.equal(f.reports.length, 0);
  inspect(f);
}

test('suite seed uses real transport contracts, preserves the files owner, and verifies user RLS', async () => {
  const f = fixture();
  const result = await seedSuite(f.args);
  assert.equal(result.pagination_seed_count, 51);
  assert.equal(f.reports.length, 1);
  assert.equal(f.state.contacts.length, 52);
  assert.equal(new Set(f.state.contacts.map(row => row.id)).size, 52);
  assert.equal(new Set(f.state.contacts.slice(1).map(row => row.phone)).size, 51);
  assert.ok(f.state.contacts.slice(1).every(row => row.assigned_to === PROFILE && row.notes.includes(RUN) && !row.name.includes('[E2E]')));
  assert.equal(f.state.contacts[0].assigned_to, FILES_OWNER);
  assert.equal(f.state.tokens.size, 2);
  assert.equal(f.state.messages.length, 1);
  assert.equal(f.state.messages[0].sender, 'contact');
  assert.equal(f.state.talkx_segments[0].created_by, PROFILE);
  assert.equal(result.onboarding_persisted, true);
  assert.ok(f.calls.every(call => !/claim_|complete_|enqueue_outbound_message/.test(call.path)), 'seed must not invent a delivered outbound');
  const publicText = JSON.stringify(result);
  for (const value of Object.values(f.env).filter(value => /synthetic-(?:service|anon|password|token)/.test(value))) assert.ok(!publicText.includes(value));
});

test('suite seed repeats without duplicate rows and rechecks every readiness contract', async () => {
  const f = fixture();
  await seedSuite(f.args);
  const firstCount = f.calls.length;
  await seedSuite(f.args);
  assert.equal(f.state.contacts.length, 52);
  assert.equal(f.state.messages.length, 1);
  assert.equal(f.state.talkx_segments.length, 1);
  assert.equal(f.state.whatsapp_connections.length, 2);
  assert.equal(f.calls.length, firstCount * 2);
  assert.equal(f.reports.length, 2);
});

const guards = [
  ['remote backend', { env: { API_URL: 'https://example.invalid' } }, 'backend-origin-mismatch'],
  ['local alias differs', { env: { API_URL: 'http://localhost:5173' } }, 'backend-origin-mismatch'],
  ['second interface', { interfaces: { ...LO, eth0: [{ internal: false, address: '10.0.0.2' }] } }, 'external-network-interface'],
  ['non-loopback address', { interfaces: { lo: [{ internal: true, address: '10.0.0.2' }] } }, 'invalid-loopback-interface'],
  ['proxy', { env: { HTTPS_PROXY: 'http://127.0.0.1:9000' } }, 'proxy-not-allowed'],
  ['run ID', { env: { ZAPP_E2E_RUN_ID: 'unowned' } }, 'invalid-run-id'],
  ['source SHA', { env: { GITHUB_SHA: 'main' } }, 'invalid-source-sha'],
  ['unreadable proof', { readError: true }, 'login-seed-proof-unreadable'],
  ['malformed proof', { rawProof: '{sensitive' }, 'login-seed-proof-unreadable'],
  ['foreign proof run', { proof: { run_id: 'zapp-e2e-foreign-0001' } }, 'login-seed-proof-mismatch'],
  ['foreign proof source', { proof: { source_sha: 'b'.repeat(40) } }, 'login-seed-proof-mismatch'],
  ['proof schema', { proof: { schema: 2 } }, 'login-seed-proof-mismatch'],
  ['unproven login', { proof: { auth_login_real: false } }, 'login-seed-proof-mismatch'],
  ['unproven RLS', { proof: { supervisor_rls_read: false } }, 'login-seed-proof-mismatch'],
  ['invalid proof user', { proof: { user_id: 'unknown' } }, 'login-seed-proof-mismatch'],
  ['invalid proof profile', { proof: { profile_id: 'unknown' } }, 'login-seed-proof-mismatch'],
];
for (const [label, options, code] of guards) test('suite seed blocks ' + label + ' before HTTP or credentials', async () => {
  const f = fixture(options);
  for (const name of ['SERVICE_ROLE_KEY', 'ANON_KEY', 'E2E_TEST_EMAIL', 'E2E_TEST_PASSWORD', 'EVOLUTION_DEFAULT_INSTANCE_TOKEN'])
    Object.defineProperty(f.env, name, { get() { throw new Error('credential read too early'); } });
  await assert.rejects(seedSuite(f.args), new RegExp(code));
  assert.equal(f.calls.length, 0);
  assert.equal(f.reports.length, 0);
});
for (const [field, value] of [['schema', 2], ['run_id', 'zapp-e2e-foreign-0001'], ['source_sha', 'b'.repeat(40)], ['origin', 'http://127.0.0.1:9000']])
  test('gateway identity ' + field + ' must match before credentials', async () => {
    const f = fixture({ identity: { [field]: value } });
    Object.defineProperty(f.env, 'SERVICE_ROLE_KEY', { get() { throw new Error('credential read too early'); } });
    await assert.rejects(seedSuite(f.args), /foreign-gateway/);
    assert.equal(f.calls.length, 1);
  });
for (const name of ['SERVICE_ROLE_KEY', 'ANON_KEY', 'E2E_TEST_EMAIL', 'E2E_TEST_PASSWORD', 'EVOLUTION_DEFAULT_INSTANCE_TOKEN'])
  test('missing synthetic ' + name + ' blocks before login/write', async () => {
    await rejects({ env: { [name]: '' } }, 'missing-synthetic-suite-credentials', f => assert.equal(f.calls.length, 1));
  });
test('non-reserved login identity is refused', async () => rejects({ env: { E2E_TEST_EMAIL: 'external@example.com' } }, 'missing-synthetic-suite-credentials'));
test('instance token must be synthetic', async () => rejects({ env: { EVOLUTION_DEFAULT_INSTANCE_TOKEN: 'foreign-token' } }, 'missing-synthetic-suite-credentials'));

const at = (path, body, condition = () => true) => ({ response: call => call.path === path && condition(call) ? json(body) : undefined });
const userCall = call => call.headers.Authorization === 'Bearer synthetic-user-token';
const failures = [
  ['missing login token', at('/functions/v1/auth-login', { refresh_token: 'synthetic' }), 'suite-real-login-not-confirmed'],
  ['missing refresh token', at('/functions/v1/auth-login', { access_token: 'synthetic' }), 'suite-real-login-not-confirmed'],
  ['profile invisible', at('/rest/v1/profiles', []), 'suite-supervisor-rls-not-ready'],
  ['wrong profile', at('/rest/v1/profiles', [{ id: FILES_OWNER, role: 'supervisor', is_active: true }]), 'suite-supervisor-rls-not-ready'],
  ['inactive profile', at('/rest/v1/profiles', [{ id: PROFILE, role: 'supervisor', is_active: false }]), 'suite-supervisor-rls-not-ready'],
  ['agent instead of supervisor', at('/rest/v1/profiles', [{ id: PROFILE, role: 'agent', is_active: true }]), 'suite-supervisor-rls-not-ready'],
  ['canonical contact absent', at('/rest/v1/contacts', [], call => call.method === 'GET' && !userCall(call)), 'canonical-files-seed-not-ready'],
  ['canonical owner overwritten', at('/rest/v1/contacts', [{ id: F.contact, name: F.contactName, assigned_to: PROFILE }], call => call.method === 'GET' && !userCall(call)), 'canonical-files-seed-not-ready'],
  ['wrong fixture name', at('/rest/v1/contacts', [{ id: F.contact, name: 'other', assigned_to: FILES_OWNER }], call => call.method === 'GET' && !userCall(call)), 'canonical-files-seed-not-ready'],
  ['files connection absent', at('/rest/v1/whatsapp_connections', [], call => call.method === 'GET' && !userCall(call)), 'local-files-seed-not-ready'],
  ['token RPC missing result', at('/rest/v1/rpc/set_instance_token', null), 'instance-token-not-stored'],
  ['main contact invisible to supervisor', at('/rest/v1/contacts', [], call => call.method === 'GET' && userCall(call)), 'main-contact-supervisor-rls-not-ready'],
  ['main contact owner changed', at('/rest/v1/contacts', [{ id: F.contact, assigned_to: PROFILE, whatsapp_connection_id: F.connection }], call => call.method === 'GET' && userCall(call)), 'main-contact-supervisor-rls-not-ready'],
  ['second page empty', at('/rest/v1/rpc/search_contacts', []), 'contact-pagination-rls-not-ready'],
  ['second page count insufficient', at('/rest/v1/rpc/search_contacts', [{ id: F.contact, total_count: 50 }]), 'contact-pagination-rls-not-ready'],
  ['second page malformed', at('/rest/v1/rpc/search_contacts', [{ id: 'unknown', total_count: 52 }]), 'contact-pagination-rls-not-ready'],
  ['segment hidden', at('/rest/v1/talkx_segments', [], userCall), 'talkx-segment-rls-not-ready'],
  ['segment wrong owner', at('/rest/v1/talkx_segments', [{ id: F.segment, name: F.segmentName, status: 'active', created_by: FILES_OWNER }], userCall), 'talkx-segment-rls-not-ready'],
  ['connection hidden', at('/rest/v1/whatsapp_connections', [], userCall), 'talkx-connection-rls-not-ready'],
  ['connection disconnected', at('/rest/v1/whatsapp_connections', [{ id: F.connection, name: F.connectionName, phone_number: F.connectionPhone, status: 'disconnected', instance_id: F.instance }], userCall), 'talkx-connection-rls-not-ready'],
  ['incoming message hidden', at('/rest/v1/messages', [], userCall), 'inbox-fixture-rls-not-ready'],
  ['incoming message wrong contact', at('/rest/v1/messages', [{ id: F.incomingMessage, contact_id: FILES_OWNER, sender: 'contact' }], userCall), 'inbox-fixture-rls-not-ready'],
];
for (const [label, options, code] of failures) test('suite seed refuses ' + label, async () => rejects(options, code));

for (const path of ['/rest/v1/whatsapp_connections', '/rest/v1/rpc/set_instance_token', '/rest/v1/talkx_segments', '/rest/v1/contacts', '/rest/v1/messages'])
  test('HTTP write failure is not treated as readiness: ' + path, async () => {
    await rejects({ response: call => call.path === path && call.method === 'POST' ? json({ leaked: 'sensitive-body' }, 503) : undefined }, 'suite-seed-http-503');
  });
test('network exception is sanitized and blocks readiness', async () => rejects({ response() { throw new Error('sensitive-response-content'); } }, 'suite-seed-request-failed'));
test('malformed response body is sanitized and blocks readiness', async () => rejects({ response() { return new Response('sensitive-response-content'); } }, 'suite-seed-invalid-json'));
test('partial failure followed by recovery keeps rows unique and reruns all checks', async () => {
  let failOnce = true;
  const f = fixture({ response(call) {
    if (failOnce && call.path === '/rest/v1/talkx_segments' && call.method === 'POST') {
      failOnce = false; return json({}, 503);
    }
  } });
  await assert.rejects(seedSuite(f.args), /suite-seed-http-503/);
  assert.equal(f.reports.length, 0);
  await seedSuite(f.args);
  assert.equal(f.reports.length, 1);
  assert.equal(f.state.contacts.length, 52);
  assert.equal(f.state.whatsapp_connections.length, 2);
  assert.equal(f.state.tokens.size, 2);
});

for (const supervisor of [undefined, false, true]) for (const files of [undefined, false, true]) {
  test(`onboarding seed persists the actual column for both local UI users (${supervisor}/${files}) without replacing preferences`, async () => {
    const f = fixture();
    const unrelated = { user_id: SECRET_ID, onboarding_completed: false, theme: 'light' };
    f.state.user_settings = [
      ...(supervisor === undefined ? [] : [{ user_id: USER, onboarding_completed: supervisor, theme: 'dark' }]),
      ...(files === undefined ? [] : [{ user_id: F.filesUser, onboarding_completed: files, sound_volume: 65 }]),
      structuredClone(unrelated),
    ];
    await seedSuite(f.args);
    assert.equal(f.state.user_settings.find(row => row.user_id === USER).onboarding_completed, true);
    assert.equal(f.state.user_settings.find(row => row.user_id === F.filesUser).onboarding_completed, true);
    assert.deepEqual(f.state.user_settings.find(row => row.user_id === SECRET_ID), unrelated);
    if (supervisor !== undefined) assert.equal(f.state.user_settings.find(row => row.user_id === USER).theme, 'dark');
    if (files !== undefined) assert.equal(f.state.user_settings.find(row => row.user_id === F.filesUser).sound_volume, 65);
    const writes = f.calls.filter(call => call.path === '/rest/v1/user_settings' && call.method === 'POST');
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].body, [{ user_id: USER, onboarding_completed: true }, { user_id: F.filesUser, onboarding_completed: true }]);
    const read = f.calls.find(call => call.path === '/rest/v1/user_settings' && call.method === 'GET' && call.query.get('user_id') === 'eq.' + USER);
    assert.ok(userCall(read), 'supervisor preferences must be verified through that user RLS');
  });
}

const fileProfileFailures = [
  ['absent', []],
  ['wrong user', [{ id: FILES_OWNER, user_id: USER, email: F.filesEmail, role: 'agent', is_active: true }]],
  ['wrong email', [{ id: FILES_OWNER, user_id: F.filesUser, email: 'another@example.invalid', role: 'agent', is_active: true }]],
  ['wrong role', [{ id: FILES_OWNER, user_id: F.filesUser, email: F.filesEmail, role: 'supervisor', is_active: true }]],
  ['inactive', [{ id: FILES_OWNER, user_id: F.filesUser, email: F.filesEmail, role: 'agent', is_active: false }]],
  ['invalid profile', [{ id: 'unknown', user_id: F.filesUser, email: F.filesEmail, role: 'agent', is_active: true }]],
];
for (const [label, rows] of fileProfileFailures) test('onboarding does not mutate an unproven files UI identity: ' + label, async () => {
  await rejects(at('/rest/v1/profiles', rows, call => call.query.get('user_id') === 'eq.' + F.filesUser),
    'local-files-profile-not-ready', f => assert.equal(f.calls.filter(call => call.method !== 'GET' && call.path.startsWith('/rest/v1/')).length, 0));
});

for (const userId of [USER, F.filesUser]) for (const [label, rows] of [
  ['hidden', []],
  ['false', [{ user_id: userId, onboarding_completed: false }]],
  ['null', [{ user_id: userId, onboarding_completed: null }]],
  ['string true', [{ user_id: userId, onboarding_completed: 'true' }]],
  ['foreign user', [{ user_id: SECRET_ID, onboarding_completed: true }]],
  ['duplicate rows', [{ user_id: userId, onboarding_completed: true }, { user_id: userId, onboarding_completed: true }]],
]) test(`onboarding readiness rejects ${label} for ${userId === USER ? 'supervisor' : 'files UI user'}`, async () => {
  await rejects(at('/rest/v1/user_settings', rows, call => call.method === 'GET' && call.query.get('user_id') === 'eq.' + userId), 'onboarding-settings-not-ready');
});

test('onboarding HTTP write failure blocks the proof and its body stays private', async () => {
  await rejects({ response: call => call.path === '/rest/v1/user_settings' && call.method === 'POST' ? json({ sensitive: 'must-not-leak' }, 503) : undefined }, 'suite-seed-http-503');
});
test('onboarding write recovers idempotently after a real transport failure', async () => {
  let failOnce = true;
  const f = fixture({ response(call) {
    if (call.path === '/rest/v1/user_settings' && call.method === 'POST' && failOnce) {
      failOnce = false;
      return json({}, 503);
    }
  } });
  await assert.rejects(seedSuite(f.args), /suite-seed-http-503/);
  assert.equal(f.reports.length, 0);
  await seedSuite(f.args);
  assert.equal(f.state.user_settings.length, 2);
  assert.ok(f.state.user_settings.every(row => row.onboarding_completed === true));
  assert.equal(f.reports[0].onboarding_persisted, true);
});
