import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { assertIsolatedFixtureEnvironment, insertIsolatedFixtureMessage } from '../e2e-isolated/fixture-access.mjs';

const ORIGIN = 'https://127.0.0.1:5173';
const APP_ORIGIN = 'https://app.example.test';
const STORAGE_KEY = 'sb-127-auth-token';
const CONTACT = '04dff4dc-c6b1-4283-ac22-bd8639804759';
const NAME = '[E2E] Contato de teste - nao apagar';
const CONTENT = '[E2E fixture setup]';
const SHA = '03e9568c194342bfef82291b20e78c34bae3796d';
const NOW = Date.parse('2026-11-05T12:00:00Z');
const UUID = 'f63bfad9-6123-4371-a4cb-30d5ccfa1f56';
const FIELDS = 'id,contact_id,sender,content,message_type';
const CANARY = 'synthetic_secret_canary_not_a_real_credential';
const hash = value => createHash('sha256').update(value).digest('hex');
const token = (role, extra = {}, alg = 'HS256') => [
  Buffer.from(JSON.stringify({ alg })).toString('base64url'),
  Buffer.from(JSON.stringify({ role, iss: 'supabase', exp: NOW / 1000 + 1800, ...extra })).toString('base64url'),
  'synthetic_signature',
].join('.');
const fixedRow = id => ({ id: id ?? UUID, contact_id: CONTACT, sender: 'contact', content: CONTENT, message_type: 'text' });
const plain = value => JSON.parse(JSON.stringify(value));
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

function harness() {
  const anon = token('anon');
  let service = token('service_role'), alias = service;
  const h = {
    input: { baseURL: ORIGIN, anonKey: anon, accessToken: token('authenticated', { sub: '40d47d67-25b3-40a6-9d44-a0042ca5dff1' }) },
    env: { ZAPP_E2E_LOCAL: '1', ZAPP_E2E_PROOF: '/run/zapp-e2e/proof.json',
      ZAPP_E2E_RUN_ID: 'fixture-unit-run', GITHUB_SHA: SHA, API_URL: ORIGIN,
      VITE_ZAPP_LOCAL_SUPABASE_URL: ORIGIN, E2E_SUPABASE_URL_OVERRIDE: ORIGIN,
      VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY: anon, E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE: anon },
    proof: { schema: 1, run_id: 'fixture-unit-run', source_sha: SHA, origin: ORIGIN,
      anon_key_sha256: hash(anon), network_namespace: 'net:[1234]',
      created_at: new Date(NOW - 1000).toISOString(), expires_at: new Date(NOW + 1800000).toISOString(),
      checks: { network_isolated: true, cron_disabled: true, bootstrap_complete: true, seed_ready: true } },
    identity: { schema: 1, run_id: 'fixture-unit-run', source_sha: SHA, origin: ORIGIN },
    ns: 'net:[1234]', net: { lo: [{ address: '127.0.0.1', internal: true }] },
    time: NOW, reads: [], requests: [], events: [], secretReads: 0, postAttempts: 0,
    hooks: {}, responses: {}, statuses: {}, contact: [{ id: CONTACT, name: NAME }],
    rows: [
      { id: 'dd4a0932-1040-4a23-9970-2fa0bb545e14', contact_id: CONTACT, sender: 'contact', content: 'seed incoming', message_type: 'text' },
      { id: '3f0be8e4-e56c-4243-a2f3-c25da3e0aba9', contact_id: CONTACT, sender: 'agent', content: 'audio canônico', message_type: 'audio' },
      { id: '32fad4a0-d5b9-43be-89f9-27b905234f88', contact_id: CONTACT, sender: 'agent', content: 'provider readiness', message_type: 'text' },
    ],
  };
  for (const name of ['SERVICE_ROLE_KEY', 'E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY']) {
    Object.defineProperty(h.env, name, {
      enumerable: true, configurable: true,
      get() { h.secretReads += 1; h.events.push(name); return name === 'SERVICE_ROLE_KEY' ? service : alias; },
      set(value) { if (name === 'SERVICE_ROLE_KEY') service = value; else alias = value; },
    });
  }
  h.setService = value => { service = value; alias = value; };
  h.deps = {
    env: h.env,
    readFile(path, encoding) {
      h.reads.push([path, encoding]); assert.equal(path, '/run/zapp-e2e/proof.json'); assert.equal(encoding, 'utf8');
      if (h.readError) throw new Error(CANARY);
      return h.rawProof === undefined ? JSON.stringify(h.proof) : h.rawProof;
    },
    readlink(path) { assert.equal(path, '/proc/self/ns/net'); if (h.linkError) throw new Error(CANARY); return h.ns; },
    interfaces: () => h.net, now: () => h.time,
    async fetcher(url, init) {
      assert.equal(new URL(url).origin, ORIGIN, 'all traffic stays on the fixed HTTPS origin');
      assert.equal(init.redirect, 'error');
      assert.ok(init.signal instanceof AbortSignal);
      const suffix = url.slice(ORIGIN.length);
      let stage;
      if (suffix === '/__e2e/identity') stage = 'identity';
      else if (suffix === '/rest/v1/contacts?id=eq.' + CONTACT + '&select=id,name') stage = 'contact';
      else if (suffix === '/rest/v1/messages?select=' + FIELDS) stage = 'insert';
      else if (suffix.startsWith('/rest/v1/messages?id=eq.') && suffix.endsWith('&select=' + FIELDS)) stage = 'readback';
      else assert.fail('unexpected endpoint: ' + suffix);
      h.requests.push({ url, init, stage }); h.events.push(stage);
      if (stage === 'insert') h.postAttempts += 1;
      await h.hooks[stage]?.(h, init);
      if (h.responses[stage]) return h.responses[stage](h, init);
      const status = h.statuses[stage] ?? (stage === 'insert' ? 201 : 200);
      if (stage === 'identity') {
        assert.equal(init.method, 'GET'); assert.equal(init.headers, undefined); assert.equal(init.body, undefined);
        return jsonResponse(h.identity, status);
      }
      if (stage === 'contact' || stage === 'readback') {
        assert.equal(init.method, 'GET'); assert.equal(init.headers.apikey, h.input.anonKey);
        assert.equal(init.headers.Authorization, 'Bearer ' + h.input.accessToken); assert.equal(init.body, undefined);
      }
      if (stage === 'contact') return jsonResponse(h.contact, status);
      if (stage === 'insert') {
        assert.equal(init.method, 'POST'); assert.equal(init.headers.apikey, service);
        assert.equal(init.headers.Authorization, 'Bearer ' + service);
        assert.equal(init.headers.Prefer, 'return=representation');
        assert.equal(init.headers['Content-Type'], 'application/json');
        const body = JSON.parse(init.body);
        assert.deepEqual(body, { contact_id: CONTACT, sender: 'contact', content: CONTENT, message_type: 'text' });
        const id = h.postAttempts === 1 ? UUID : 'e8c149bd-e5f2-44c2-a8bb-b43f58e4c55e';
        const row = { id, ...body };
        if (status === 201) h.rows.push(row);
        return jsonResponse([row], status);
      }
      const id = new URL(url).searchParams.get('id')?.slice(3);
      return jsonResponse(h.rows.filter(row => row.id === id), status);
    },
  };
  return h;
}

async function rejected(h, pattern, { secrets = 0, posts = 0 } = {}) {
  await assert.rejects(insertIsolatedFixtureMessage(h.input, h.deps), error => {
    assert.match(error.message, pattern);
    assert.ok(!error.message.includes(CANARY)); assert.ok(!error.stack.includes(CANARY));
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.ok(h.secretReads <= secrets, 'privileged credentials were read before their admission point');
  assert.equal(h.postAttempts, posts, 'no unexpected privileged POST');
}

test('closed POST creates a fresh incoming text; exact row is read with the real user JWT', async () => {
  const h = harness(); const prior = plain(h.rows);
  assert.equal(await insertIsolatedFixtureMessage(h.input, h.deps), undefined);
  assert.deepEqual(h.events, ['identity', 'contact', 'SERVICE_ROLE_KEY', 'E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY', 'insert', 'readback']);
  assert.deepEqual(h.rows.slice(0, prior.length), prior, 'preseed, audio and provider messages preserved');
  assert.deepEqual(h.rows.at(-1), fixedRow());
  assert.equal(h.requests.at(-1).url, ORIGIN + '/rest/v1/messages?id=eq.' + UUID + '&select=' + FIELDS);
  assert.equal(h.reads.length, 5, 'proof re-read initially and after all four network waits');
});

test('a second preparation adds a distinct fresh row without replacing seed or audio', async () => {
  const h = harness();
  await insertIsolatedFixtureMessage(h.input, h.deps);
  await insertIsolatedFixtureMessage(h.input, h.deps);
  assert.equal(h.rows.length, 5);
  assert.notEqual(h.rows[3].id, h.rows[4].id);
  assert.equal(h.rows.filter(r => r.message_type === 'audio').length, 1);
  assert.equal(h.requests.filter(r => r.stage === 'insert').length, 2);
});

test('admission exposes no key or browser operation and returns only undefined', async () => {
  const h = harness(); h.setService(undefined);
  assert.equal(await assertIsolatedFixtureEnvironment({ baseURL: h.input.baseURL, anonKey: h.input.anonKey }, h.deps), undefined);
  assert.equal(h.secretReads, 0); assert.deepEqual(h.events, ['identity']); assert.equal(h.reads.length, 2);
});

test('extra caller properties cannot change contact, content, method, endpoint or credentials', async () => {
  const h = harness();
  Object.assign(h.input, { contactId: UUID, content: 'replace', messageType: 'audio', sender: 'agent',
    endpoint: 'https://external.invalid/rest/v1/messages', method: 'DELETE', serviceRoleKey: CANARY });
  await insertIsolatedFixtureMessage(h.input, h.deps);
  assert.deepEqual(h.rows.at(-1), fixedRow());
  assert.ok(h.requests.every(r => !JSON.stringify({ url: r.url, headers: r.init.headers, body: r.init.body }).includes(CANARY)));
});

const before = [
  ['missing local mode', h => { delete h.env.ZAPP_E2E_LOCAL; }, /local-configuration/],
  ['invalid local mode', h => { h.env.ZAPP_E2E_LOCAL = 'true'; }, /local-configuration/],
  ['external origin', h => { h.input.baseURL = 'https://external.invalid'; }, /local-configuration/],
  ['plain HTTP', h => { h.input.baseURL = 'http://127.0.0.1:5173'; }, /local-configuration/],
  ['alternate loopback port', h => { h.input.baseURL = 'https://127.0.0.1:5174'; }, /local-configuration/],
  ['origin userinfo', h => { h.input.baseURL = 'https://user@127.0.0.1:5173'; }, /local-configuration/],
  ['origin query', h => { h.input.baseURL += '?url=external'; }, /local-configuration/],
  ['API origin mismatch', h => { h.env.API_URL = 'https://external.invalid'; }, /local-configuration/],
  ['caller anon differs', h => { h.input.anonKey = token('anon', { nonce: 1 }); }, /local-configuration/],
  ['application origin differs', h => { h.env.VITE_ZAPP_LOCAL_SUPABASE_URL = 'http://127.0.0.1:5173'; }, /ISOLATION_CONFIGURATION/],
  ['fixture origin differs', h => { h.env.E2E_SUPABASE_URL_OVERRIDE = 'https://localhost:5173'; }, /ISOLATION_CONFIGURATION/],
  ['application anon differs', h => { h.env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY = token('anon', { nonce: 2 }); }, /ISOLATION_CONFIGURATION/],
  ['proof file unreadable', h => { h.readError = true; }, /proof-unreadable/],
  ['proof JSON invalid', h => { h.rawProof = CANARY; }, /proof-unreadable/],
  ['proof too large', h => { h.rawProof = ' '.repeat(8193); }, /proof-unreadable/],
  ['proof alternate path', h => { h.env.ZAPP_E2E_PROOF = '/tmp/proof'; }, /ISOLATION_PROOF/],
  ['proof missing', h => { h.proof = null; }, /ISOLATION_NETWORK/],
  ['namespace unreadable', h => { h.linkError = true; }, /proof-unreadable/],
  ['namespace different', h => { h.ns = 'net:[999]'; }, /ISOLATION_NETWORK/],
  ['non-loopback interface', h => { h.net.eth0 = [{ address: '10.0.0.1', internal: false }]; }, /ISOLATION_NETWORK/],
  ['dummy interface stays refused', h => { h.net.dummy0 = [{ address: '192.0.2.1', internal: false }]; }, /ISOLATION_NETWORK/],
  ['loopback marked external', h => { h.net.lo[0].internal = false; }, /ISOLATION_NETWORK/],
  ['loopback invalid address', h => { h.net.lo[0].address = '127.0.0.2'; }, /ISOLATION_NETWORK/],
  ['proof expired', h => { h.proof.expires_at = new Date(NOW).toISOString(); }, /ISOLATION_PROOF/],
  ['proof in future', h => { h.proof.created_at = new Date(NOW + 1).toISOString(); }, /ISOLATION_PROOF/],
  ['proof lifetime exceeds hour', h => { h.proof.expires_at = new Date(NOW + 7200000).toISOString(); }, /ISOLATION_PROOF/],
  ['proof has different run', h => { h.proof.run_id = 'other'; }, /ISOLATION_PROOF/],
  ['proof has different SHA', h => { h.proof.source_sha = 'a'.repeat(40); }, /ISOLATION_PROOF/],
  ['proof has different anon hash', h => { h.proof.anon_key_sha256 = 'a'.repeat(64); }, /ISOLATION_PROOF/],
  ['HTTP proxy', h => { h.env.http_proxy = 'http://proxy.invalid'; }, /ISOLATION_NETWORK/],
  ['HTTPS proxy', h => { h.env.HTTPS_PROXY = 'http://proxy.invalid'; }, /ISOLATION_NETWORK/],
  ['global agent proxy', h => { h.env.GLOBAL_AGENT_HTTPS_PROXY = 'http://proxy.invalid'; }, /ISOLATION_NETWORK/],
  ['Node proxy flag', h => { h.env.NODE_OPTIONS = '--use-env-proxy'; }, /ISOLATION_NETWORK/],
  ['Node proxy env', h => { h.env.NODE_USE_ENV_PROXY = '1'; }, /ISOLATION_NETWORK/],
];
for (const check of ['network_isolated', 'cron_disabled', 'bootstrap_complete', 'seed_ready']) {
  before.push(['missing required check ' + check, h => { h.proof.checks[check] = false; }, /ISOLATION_PROOF/]);
}
for (const [name, change, code] of before) test('refuses before network or secret: ' + name, async () => {
  const h = harness(); change(h); await rejected(h, code); assert.equal(h.requests.length, 0);
});

for (const [name, value] of [['schema', 2], ['run_id', 'other'], ['source_sha', 'a'.repeat(40)], ['origin', 'https://external.invalid']]) {
  test('gateway identity rejects mismatched ' + name, async () => {
    const h = harness(); h.identity[name] = value; await rejected(h, /gateway-identity/);
    assert.deepEqual(h.events, ['identity']);
  });
}

for (const stage of ['identity', 'contact', 'insert', 'readback']) {
  const post = ['insert', 'readback'].includes(stage);
  for (const [name, change, code] of [
    ['coherent run switch', h => { h.env.ZAPP_E2E_RUN_ID = 'replacement-run'; h.proof.run_id = h.env.ZAPP_E2E_RUN_ID; h.identity.run_id = h.env.ZAPP_E2E_RUN_ID; }, /identity-changed/],
    ['coherent SHA switch', h => { h.env.GITHUB_SHA = 'b'.repeat(40); h.proof.source_sha = h.env.GITHUB_SHA; h.identity.source_sha = h.env.GITHUB_SHA; }, /identity-changed/],
    ['coherent anon switch', h => { const key = token('anon', { nonce: 9 }); h.env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY = key; h.env.E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE = key; h.proof.anon_key_sha256 = hash(key); }, /local-configuration/],
    ['namespace switch', h => { h.ns = 'net:[999]'; }, /ISOLATION_NETWORK/],
    ['proof expiry', h => { h.proof.expires_at = new Date(NOW).toISOString(); }, /ISOLATION_PROOF/],
    ['new proxy', h => { h.env.ALL_PROXY = 'http://proxy.invalid'; }, /ISOLATION_NETWORK/],
  ]) {
    test('after ' + stage + ' await: ' + name, async () => {
      const h = harness(); h.hooks[stage] = change;
      await rejected(h, code, { secrets: post ? 2 : 0, posts: post ? 1 : 0 });
    });
  }
}

const userInvalid = [
  ['malformed', CANARY, /credential-shape/],
  ['anon role', token('anon'), /user-credential/],
  ['service role', token('service_role'), /user-credential/],
  ['expired', token('authenticated', { exp: NOW / 1000 }), /user-credential/],
  ['no expiry', token('authenticated', { exp: undefined }), /user-credential/],
  ['algorithm none', token('authenticated', {}, 'none'), /user-credential/],
  ['algorithm absent', token('authenticated', {}, undefined).replace(/^.*?\./, Buffer.from('{}').toString('base64url') + '.'), /user-credential/],
];
for (const [name, value, code] of userInvalid) test('user JWT refused before contact or secret: ' + name, async () => {
  const h = harness(); h.input.accessToken = value; await rejected(h, code); assert.deepEqual(h.events, ['identity']);
});

test('user token signature is enforced by the authenticated contact request', async () => {
  const h = harness(); h.input.accessToken = token('authenticated').replace(/[^.]+$/, 'tampered_signature');
  h.statuses.contact = 401; await rejected(h, /contact-http/); assert.equal(h.secretReads, 0);
});

test('user expiry during contact await refuses before secret', async () => {
  const h = harness(); h.input.accessToken = token('authenticated', { exp: NOW / 1000 + 1 });
  h.hooks.contact = x => { x.time += 1000; }; await rejected(h, /user-credential/);
});

for (const [name, value] of [
  ['invisible', []], ['two rows', [{ id: CONTACT, name: NAME }, { id: CONTACT, name: NAME }]],
  ['wrong ID', [{ id: UUID, name: NAME }]], ['wrong name', [{ id: CONTACT, name: 'other' }]],
  ['object instead of array', { id: CONTACT, name: NAME }], ['null row', [null]],
]) test('contact RLS gate: ' + name, async () => {
  const h = harness(); h.contact = value; await rejected(h, /contact-rls/);
});

for (const [name, value] of [
  ['missing', undefined], ['malformed', CANARY], ['user role', token('authenticated')],
  ['anon role', token('anon')], ['wrong issuer', token('service_role', { iss: 'elsewhere' })],
  ['expired', token('service_role', { exp: NOW / 1000 })], ['algorithm none', token('service_role', {}, 'none')],
  ['algorithm RS256', token('service_role', {}, 'RS256')],
]) test('service key gate after user read: ' + name, async () => {
  const h = harness(); h.setService(value);
  await rejected(h, /service-configuration|credential-shape|service-credential/, { secrets: 2 });
  assert.deepEqual(h.requests.map(r => r.stage), ['identity', 'contact']);
});

test('service key aliases must be exactly equal', async () => {
  const h = harness(); h.env.E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY = token('service_role', { nonce: 1 });
  await rejected(h, /service-configuration/, { secrets: 2 });
});

for (const stage of ['identity', 'contact', 'insert', 'readback']) {
  const post = ['insert', 'readback'].includes(stage);
  const limits = { secrets: post ? 2 : 0, posts: post ? 1 : 0 };
  test(stage + ' HTTP403 closes error without response body', async () => {
    const h = harness(); h.responses[stage] = () => jsonResponse({ error: CANARY }, 403);
    await rejected(h, new RegExp(stage + '-http'), limits);
  });
  test(stage + ' transport rejection redacts cause', async () => {
    const h = harness(); h.responses[stage] = () => { throw new Error(CANARY); };
    await rejected(h, new RegExp(stage + '-request'), limits);
  });
  test(stage + ' redirected response refused', async () => {
    const h = harness(); h.responses[stage] = () => ({ status: stage === 'insert' ? 201 : 200, redirected: true, body: null });
    await rejected(h, new RegExp(stage + '-http'), limits);
  });
  test(stage + ' malformed JSON refuses', async () => {
    const h = harness(); h.responses[stage] = () => new Response(CANARY, { status: stage === 'insert' ? 201 : 200 });
    await rejected(h, new RegExp(stage + '-json'), limits);
  });
}

for (const [name, make] of [
  ['oversized body', () => new Response('x'.repeat(8193))],
  ['invalid UTF8', () => new Response(new Uint8Array([0xc3, 0x28]))],
  ['empty body', () => new Response(null)],
  ['empty-chunk stream', () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array()); } }))],
  ['65-chunk stream', () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array([32])); } }))],
  ['read error', () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(CANARY)); } }))],
]) test('bounded JSON transport rejects ' + name, async () => {
  const h = harness(); h.responses.identity = make; await rejected(h, /identity-json/);
});

test('chunked valid identity is decoded and cancellation does not leak data', async () => {
  const h = harness();
  const bytes = new TextEncoder().encode(JSON.stringify(h.identity));
  h.responses.identity = () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(bytes.slice(0, 7)); controller.enqueue(bytes.slice(7)); controller.close(); },
  }));
  await assertIsolatedFixtureEnvironment(h.input, h.deps); assert.equal(h.secretReads, 0);
});

test('a non-completing stream cancellation cannot hold a refusal open', { timeout: 1000 }, async () => {
  const h = harness();
  h.responses.identity = () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array()); },
    cancel() { return new Promise(() => {}); },
  }));
  await rejected(h, /identity-json/);
});

test('POST requires201 rather than accepting any2xx', async () => {
  const h = harness(); h.statuses.insert = 200;
  await rejected(h, /insert-http/, { secrets: 2, posts: 1 });
});

for (const stage of ['insert', 'readback']) {
  for (const [name, rows] of [
    ['no rows', []], ['two rows', [fixedRow(), fixedRow()]], ['null row', [null]],
    ['object instead of array', fixedRow()], ['malformed UUID', [fixedRow('x?admin=true')]],
    ['wrong contact', [{ ...fixedRow(), contact_id: UUID }]], ['wrong sender', [{ ...fixedRow(), sender: 'agent' }]],
    ['wrong content', [{ ...fixedRow(), content: CANARY }]], ['wrong message type', [{ ...fixedRow(), message_type: 'audio' }]],
  ]) test(stage + ' rejects ' + name, async () => {
    const h = harness(); h.responses[stage] = () => jsonResponse(rows, stage === 'insert' ? 201 : 200);
    await rejected(h, new RegExp(stage + '-row'), { secrets: 2, posts: 1 });
  });
}

test('RLS readback must return exactly the inserted UUID', async () => {
  const h = harness(); h.responses.readback = () => jsonResponse([fixedRow('e8c149bd-e5f2-44c2-a8bb-b43f58e4c55e')]);
  await rejected(h, /readback-id/, { secrets: 2, posts: 1 });
});

test('failed RLS readback does not claim rollback of an accepted insertion', async () => {
  const h = harness(); h.responses.readback = () => jsonResponse([]);
  await rejected(h, /readback-row/, { secrets: 2, posts: 1 });
  assert.equal(h.rows.filter(r => r.content === CONTENT).length, 1);
});

// Executa as funções reais da fixture TS com dependências injetadas, sem
// Playwright, navegador, arquivo .env ou backend externo. As imports são o
// único limite substituído; o corpo da fixture é o mesmo do checkout testado.
function fixtureModule(mode, helper) {
  const source = readFileSync(new URL('../../e2e/fixtures/e2e-contact.ts', import.meta.url), 'utf8');
  const code = stripTypeScriptTypes(source, { mode: 'strip' })
    .replace(/^import .*?;\s*$/gm, '')
    .replace(/\bexport (?=(?:async )?function|const)/g, '');
  return runInNewContext(code + '\n({ ensureFixtureConversationOpen, cleanupFixtureMessages });', {
    process: { env: { ZAPP_E2E_LOCAL: mode, PLAYWRIGHT_BASE_URL: APP_ORIGIN } },
    SUPABASE_URL: ORIGIN, SUPABASE_ANON_KEY: 'fixture_public_anon', SUPABASE_STORAGE_KEY: STORAGE_KEY,
    AUTH_STORAGE_ENTRY_NAME: STORAGE_KEY,
    insertIsolatedFixtureMessage: helper, console, URL,
  });
}

function pageDouble({ rpcStatus = 200, rpcBody = '', messageStatus = 201, tokenValue = 'fixture_user_jwt',
  sessionOrigin = APP_ORIGIN, storageKey = STORAGE_KEY, extraOrigins = [] } = {}) {
  const calls = [];
  const page = {
    context: () => ({ storageState: async () => {
      calls.push({ type: 'session' });
      return { cookies: [], origins: [
        ...extraOrigins,
        { origin: sessionOrigin, localStorage: tokenValue ? [{
          name: storageKey,
          value: JSON.stringify({ access_token: tokenValue, user: { id: UUID } }),
        }] : [] },
      ] };
    } }),
    request: {
      async post(url, options) {
        calls.push({ type: 'POST', url, options: plain(options) });
        if (url.endsWith('/rpc/set_conversation_status')) return { ok: () => rpcStatus === 200, status: () => rpcStatus, text: async () => rpcBody };
        return { ok: () => messageStatus === 201, status: () => messageStatus, text: async () => 'message_sender_forbidden 42501' };
      },
      async delete(url, options) { calls.push({ type: 'DELETE', url, options: plain(options) }); return { ok: () => true }; },
    },
  };
  return { page, calls };
}

test('actual TS fixture routes isolated insertion after the unchanged user RPC', async () => {
  const p = pageDouble();
  const module = fixtureModule('1', async input => {
    assert.deepEqual(plain(input), { baseURL: ORIGIN, anonKey: 'fixture_public_anon', accessToken: 'fixture_user_jwt' });
    p.calls.push({ type: 'helper' });
  });
  await module.ensureFixtureConversationOpen(p.page);
  assert.deepEqual(p.calls.map(c => c.type), ['session', 'POST', 'helper']);
  assert.deepEqual(p.calls[1].options, { headers: { apikey: 'fixture_public_anon', Authorization: 'Bearer fixture_user_jwt', 'Content-Type': 'application/json' }, data: { p_contact_id: CONTACT, p_next: 'open' } });
  assert.equal(p.calls[1].url, ORIGIN + '/rest/v1/rpc/set_conversation_status');
});

test('actual TS fixture still treats the legacy open→open RPC transition as no-op', async () => {
  for (const rpcBody of ['invalid transition', 'invalid_transition']) {
    const p = pageDouble({ rpcStatus: 400, rpcBody });
    let count = 0;
    await fixtureModule('1', async () => { count += 1; }).ensureFixtureConversationOpen(p.page);
    assert.equal(count, 1);
  }
});

test('actual TS fixture stops before helper on an unrelated RPC failure', async () => {
  const p = pageDouble({ rpcStatus: 403, rpcBody: 'forbidden' });
  let count = 0;
  await assert.rejects(fixtureModule('1', async () => { count += 1; }).ensureFixtureConversationOpen(p.page), /HTTP 403/);
  assert.equal(count, 0); assert.equal(p.calls.filter(c => c.type === 'POST').length, 1);
});

test('actual TS fixture propagates helper refusal without falling back to legacy POST', async () => {
  const p = pageDouble();
  await assert.rejects(fixtureModule('1', async () => { throw new Error('fixture-refusal'); }).ensureFixtureConversationOpen(p.page), /fixture-refusal/);
  assert.equal(p.calls.filter(c => c.type === 'POST').length, 1);
});

test('actual TS fixture preserves the legacy authenticated INSERT body and headers', async () => {
  const p = pageDouble();
  await fixtureModule(undefined, async () => assert.fail('legacy must not call isolated helper')).ensureFixtureConversationOpen(p.page);
  assert.equal(p.calls.length, 3);
  assert.deepEqual(p.calls[2], { type: 'POST', url: ORIGIN + '/rest/v1/messages', options: {
    headers: { apikey: 'fixture_public_anon', Authorization: 'Bearer fixture_user_jwt', 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    data: { contact_id: CONTACT, sender: 'contact', content: CONTENT, message_type: 'text' },
  } });
});

test('actual legacy fixture reproduces the guard refusal403/42501 under controlled HTTP', async () => {
  const p = pageDouble({ messageStatus: 403 });
  await assert.rejects(fixtureModule(undefined, async () => assert.fail()).ensureFixtureConversationOpen(p.page), /HTTP 403 message_sender_forbidden 42501/);
});

test('actual TS cleanup remains user-authenticated, fixed-contact and fixed-content only', async () => {
  const p = pageDouble();
  await fixtureModule('1', async () => assert.fail('cleanup must not use service')).cleanupFixtureMessages(p.page);
  assert.deepEqual(p.calls, [{ type: 'session' }, { type: 'DELETE',
    url: ORIGIN + '/rest/v1/messages?contact_id=eq.' + CONTACT + '&content=eq.[E2E%20fixture%20setup]',
    options: { headers: { apikey: 'fixture_public_anon', Authorization: 'Bearer fixture_user_jwt', 'Content-Type': 'application/json' } } }]);
});

test('actual TS fixture cannot start RPC or helper without browser user session', async () => {
  const p = pageDouble({ tokenValue: null });
  await assert.rejects(fixtureModule('1', async () => assert.fail()).ensureFixtureConversationOpen(p.page), /Sessão do Supabase não encontrada/);
  assert.deepEqual(p.calls, [{ type: 'session' }]);
});

test('actual TS fixture ignores a Supabase token from another origin', async () => {
  const p = pageDouble({ sessionOrigin: 'https://foreign.supabase.co' });
  await assert.rejects(
    fixtureModule('1', async () => assert.fail()).ensureFixtureConversationOpen(p.page),
    /Sessão do Supabase não encontrada/,
  );
  assert.deepEqual(p.calls, [{ type: 'session' }]);
});

test('actual TS fixture ignores a token de outro projeto na origem correta do app', async () => {
  const p = pageDouble({ storageKey: 'sb-foreign-auth-token' });
  await assert.rejects(
    fixtureModule('1', async () => assert.fail()).ensureFixtureConversationOpen(p.page),
    /Sessão do Supabase não encontrada/,
  );
  assert.deepEqual(p.calls, [{ type: 'session' }]);
});

test('actual TS fixture selects the expected origin when storageState has multiple tokens', async () => {
  const p = pageDouble({ extraOrigins: [{
    origin: 'https://foreign.supabase.co',
    localStorage: [{
      name: 'sb-foreign-auth-token',
      value: JSON.stringify({ access_token: 'foreign_jwt', user: { id: 'foreign-user' } }),
    }],
  }] });
  await fixtureModule('1', async input => {
    assert.equal(input.accessToken, 'fixture_user_jwt');
  }).ensureFixtureConversationOpen(p.page);
  assert.equal(p.calls[1].options.headers.Authorization, 'Bearer fixture_user_jwt');
});
