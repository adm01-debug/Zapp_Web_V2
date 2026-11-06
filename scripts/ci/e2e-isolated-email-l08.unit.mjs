import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

// Actual TS helpers; admission, transport and Page are controlled boundaries.
// These contracts do not claim PostgreSQL, browser, TLS or admission internals.
const source = readFileSync(new URL('../../e2e/email-link-contato.spec.ts', import.meta.url), 'utf8');
const ORIGIN = 'https://127.0.0.1:5173';
const CONTACT = '04dff4dc-c6b1-4283-ac22-bd8639804759';
const NOW = 1_800_000_000_000;
const token = (claims = {}, header = {}) => [
  { alg: 'HS256', typ: 'JWT', ...header },
  { role: 'service_role', iss: 'supabase', exp: (NOW + 3_600_000) / 1000, ...claims },
].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.c3ludGhldGlj';
const SERVICE = token(), ANON = token({ role: 'anon' }), USER = token({ role: 'authenticated', sub: 'e2e-user' });
const CANARY = 'PRIVATE_TRANSPORT_CANARY';

function harness(options = {}, inputSource = source) {
  let clock = NOW, secretReads = 0;
  const requests = [], admissions = [], registered = [], skipped = [];
  const secret = options.secret === undefined ? SERVICE : options.secret;
  const alias = options.alias === undefined ? secret : options.alias;
  const env = { ZAPP_E2E_LOCAL: '1', API_URL: ORIGIN, ...options.env };
  Object.defineProperty(env, 'SERVICE_ROLE_KEY', { get() { secretReads++; return secret; } });
  Object.defineProperty(env, 'E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY', { get() { secretReads++; return alias; } });
  const declared = (name, callback) => registered.push({ name, callback });
  declared.skip = value => skipped.push(value);
  declared.describe = (_name, callback) => callback();
  declared.describe.configure = () => {};
  declared.afterAll = () => {};
  class Clock extends Date { static now() { return clock; } }
  const state = { env, requests, admissions, registered, skipped, reads: () => secretReads, advance: value => { clock += value; } };
  const context = vm.createContext({
    process: { env }, Buffer, URL, Response, AbortSignal, Date: Clock,
    SUPABASE_URL: options.supabaseURL ?? ORIGIN, SUPABASE_ANON_KEY: ANON,
    E2E_FIXTURE_CONTACT_ID: CONTACT, E2E_FIXTURE_CONTACT_DISPLAY_NAME: '[E2E]',
    test: declared, expect: (value, message) => ({ toBeTruthy() { assert.ok(value, message); } }),
    assertIsolatedFixtureEnvironment: async input => {
      admissions.push({ input, secretReads });
      assert.equal(input.baseURL, ORIGIN); assert.equal(input.anonKey, ANON);
      await options.admit?.(state);
    },
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (options.fetcher) return options.fetcher(url, init, state);
      return init.method === 'GET' ? Response.json([{ id: CONTACT, conversation_status: 'open' }]) : new Response(null, { status: 204 });
    },
  });
  const js = stripTypeScriptTypes(inputSource.replace(/^import .*;\r?\n/gm, ''), { mode: 'strip' });
  vm.runInContext(js + '\n;globalThis.helpers = { restAdmin, limparSemeadura, garantirConversaAberta };', context, { timeout: 1000 });
  return { ...state, helpers: context.helpers, page: { evaluate: async () => ({ access_token: USER, user_id: 'e2e-user' }) } };
}
function safeError(error, code) {
  assert.match(String(error), new RegExp('\\[e2e-email/' + code + '\\]'));
  assert.ok(!String(error).includes(CANARY)); assert.ok(!String(error).includes(SERVICE));
  return true;
}
const admin = h => h.helpers.restAdmin('POST', 'messages', { content: 'fixture' }, { Prefer: 'return=minimal' });

test('L08 accepts exact HTTPS at collection without reading a privileged credential', () => {
  const h = harness(); assert.deepEqual(h.skipped, [false]); assert.equal(h.registered.length, 5);
  assert.equal(h.reads(), 0); assert.equal(h.admissions.length, 0); assert.equal(h.requests.length, 0);
});
// Nonempty invalid modes are rejected earlier by the real imported resolver.
for (const mode of [undefined, '0', 'false']) test(`L08 spec-local skip with controlled resolver (${String(mode)})`, async () => {
  const h = harness({ env: { ZAPP_E2E_LOCAL: mode, API_URL: 'https://project.supabase.co' }, supabaseURL: 'https://project.supabase.co' });
  assert.deepEqual(h.skipped, [true]); assert.equal(h.reads(), 0);
  await assert.rejects(admin(h), e => safeError(e, 'local-configuration'));
  assert.equal(h.requests.length, 0); assert.equal(h.reads(), 0);
});
for (const [id, url] of [
  ['missing', undefined], ['http', 'http://127.0.0.1:5173'], ['alias', 'https://localhost:5173'],
  ['port', 'https://127.0.0.1:5174'], ['production', 'https://project.supabase.co'],
  ['userinfo', 'https://user@127.0.0.1:5173'], ['path', ORIGIN + '/rest'], ['query', ORIGIN + '?x=1'],
  ['fragment', ORIGIN + '#x'], ['slash', ORIGIN + '/'], ['space', ' ' + ORIGIN], ['suffix', 'https://127.0.0.1.example.com:5173'],
]) test(`L08 refuses divergent API before collection (${id})`, () => {
  assert.throws(() => harness({ env: { API_URL: url } }), e => safeError(e, 'local-configuration'));
});
test('L08 refuses divergent fixture URL despite a correct API', () => {
  assert.throws(() => harness({ supabaseURL: 'https://localhost:5173' }), e => safeError(e, 'local-configuration'));
});
test('L08 admission failure prevents secret reads and writes', async () => {
  const h = harness({ admit: () => { throw new Error(CANARY); } });
  await assert.rejects(admin(h), e => safeError(e, 'admission')); assert.equal(h.reads(), 0); assert.equal(h.requests.length, 0);
});
for (const field of ['API_URL', 'ZAPP_E2E_LOCAL']) test(`L08 rechecks after admission (${field})`, async () => {
  const h = harness({ admit: state => { state.env[field] = 'changed'; } });
  await assert.rejects(admin(h), e => safeError(e, 'local-configuration')); assert.equal(h.reads(), 0); assert.equal(h.requests.length, 0);
});
for (const [id, secret, alias] of [
  ['missing', '', ''], ['alias', SERVICE, token({ exp: (NOW + 7_200_000) / 1000 })], ['malformed', 'not-jwt'],
  ['alg-none', token({}, { alg: 'none' })], ['role', token({ role: 'anon' })], ['issuer', token({ iss: 'external' })],
  ['expired', token({ exp: NOW / 1000 - 1 })], ['boundary', token({ exp: NOW / 1000 })], ['string-exp', token({ exp: String((NOW + 3_600_000) / 1000) })],
]) test(`L08 invalid service credential is refused after admission (${id})`, async () => {
  const h = harness({ secret, ...(alias === undefined ? {} : { alias }) });
  await assert.rejects(admin(h), e => safeError(e, 'service-credential'));
  assert.equal(h.admissions.length, 1); assert.equal(h.admissions[0].secretReads, 0); assert.equal(h.requests.length, 0);
});
test('L08 expiry during admission prevents fetch', async () => {
  const h = harness({ admit: state => state.advance(3_600_000) });
  await assert.rejects(admin(h), e => safeError(e, 'service-credential')); assert.equal(h.requests.length, 0);
});
test('L08 privileged write uses admitted fixed Node transport', async () => {
  const h = harness(); await admin(h); assert.equal(h.admissions[0].secretReads, 0); assert.equal(h.requests.length, 1);
  const { url, init } = h.requests[0]; assert.equal(url, ORIGIN + '/rest/v1/messages');
  assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal);
  assert.equal(init.headers.apikey, SERVICE); assert.equal(init.headers.Authorization, 'Bearer ' + SERVICE); assert.equal(init.headers.Prefer, 'return=minimal');
});
for (const [id, method, path, extra] of [
  ['get', 'GET', 'messages', {}], ['put', 'PUT', 'messages', {}], ['rpc', 'POST', 'rpc/arbitrary', {}],
  ['absolute', 'POST', 'https://outside.example', {}], ['parent', 'POST', '../messages', {}],
  ['auth-header', 'POST', 'messages', { Authorization: CANARY }], ['apikey-header', 'POST', 'messages', { apikey: CANARY }],
  ['prefer', 'POST', 'messages', { Prefer: 'unknown' }],
]) test(`L08 refuses unapproved request shape (${id})`, async () => {
  const h = harness(); await assert.rejects(h.helpers.restAdmin(method, path, {}, extra), e => safeError(e, 'request-shape'));
  assert.equal(h.admissions.length, 0); assert.equal(h.reads(), 0); assert.equal(h.requests.length, 0);
});
for (const status of [400, 401, 403, 500]) test(`L08 refuses HTTP ${status} without copying its body`, async () => {
  const h = harness({ fetcher: () => new Response(CANARY, { status }) }); await assert.rejects(admin(h), e => safeError(e, 'http-failed'));
});
test('L08 redirected success is refused', async () => {
  const h = harness({ fetcher: () => { const r = new Response(null, { status: 204 }); Object.defineProperty(r, 'redirected', { value: true }); return r; } });
  await assert.rejects(admin(h), e => safeError(e, 'http-failed'));
});
test('L08 transport errors stay closed', async () => {
  const h = harness({ fetcher: () => { throw new Error(CANARY + SERVICE); } }); await assert.rejects(admin(h), e => safeError(e, 'request-failed'));
});
test('L08 RPC uses p_next with user JWT and exact open-contact readback', async () => {
  const h = harness(); await h.helpers.garantirConversaAberta(h.page); assert.equal(h.requests.length, 3);
  const [rpc, readback, seed] = h.requests;
  assert.equal(rpc.url, ORIGIN + '/rest/v1/rpc/set_conversation_status');
  assert.deepEqual(JSON.parse(rpc.init.body), { p_contact_id: CONTACT, p_next: 'open' });
  for (const r of [rpc, readback]) { assert.equal(r.init.headers.apikey, ANON); assert.equal(r.init.headers.Authorization, 'Bearer ' + USER); assert.equal(r.init.redirect, 'error'); }
  assert.equal(readback.url, ORIGIN + '/rest/v1/contacts?id=eq.' + CONTACT + '&select=id,conversation_status');
  assert.equal(seed.init.headers.apikey, SERVICE);
  assert.deepEqual(JSON.parse(seed.init.body), { contact_id: CONTACT, sender: 'agent', content: '[E2E L08 setup] mensagem para abrir a conversa', message_type: 'text' });
});
for (const status of [403, 404]) test(`L08 RPC HTTP ${status} blocks all privileged seed writes`, async () => {
  const h = harness({ fetcher: () => new Response(CANARY, { status }) });
  await assert.rejects(h.helpers.garantirConversaAberta(h.page), e => safeError(e, 'conversation-prepare')); assert.equal(h.requests.length, 1); assert.equal(h.reads(), 0);
});
for (const [id, result] of [
  ['empty', []], ['ambiguous', [{ id: CONTACT, conversation_status: 'open' }, { id: CONTACT, conversation_status: 'open' }]],
  ['different', [{ id: 'other', conversation_status: 'open' }]], ['closed', [{ id: CONTACT, conversation_status: 'resolved' }]], ['not-array', { id: CONTACT, conversation_status: 'open' }],
]) test(`L08 readback refuses ${id} before seed`, async () => {
  const h = harness({ fetcher: (_url, init) => init.method === 'GET' ? Response.json(result) : new Response(null, { status: 204 }) });
  await assert.rejects(h.helpers.garantirConversaAberta(h.page), e => safeError(e, 'conversation-prepare')); assert.equal(h.requests.length, 2); assert.equal(h.reads(), 0);
});
test('L08 malformed readback does not prove an open contact', async () => {
  const h = harness({ fetcher: (_url, init) => init.method === 'GET' ? new Response(CANARY) : new Response(null, { status: 204 }) });
  await assert.rejects(h.helpers.garantirConversaAberta(h.page), e => safeError(e, 'conversation-prepare')); assert.equal(h.reads(), 0);
});
test('L08 retains five scoped cleanup operations and checks each HTTP result', async () => {
  const h = harness(); await h.helpers.limparSemeadura();
  assert.deepEqual(h.requests.map(r => [r.init.method, r.url.replace(ORIGIN + '/rest/v1/', '')]), [
    ['DELETE', 'email_messages?gmail_message_id=like.e2e-l08-msg%'], ['DELETE', 'email_threads?gmail_thread_id=like.e2e-l08-thread%'],
    ['DELETE', 'gmail_accounts?email_address=eq.e2e.l08.conta@example.com'],
    ['DELETE', 'messages?content=eq.' + encodeURIComponent('[E2E L08 setup] mensagem para abrir a conversa')], ['PATCH', 'contacts?id=eq.' + CONTACT],
  ]); assert.equal(h.admissions.length, 5); assert.deepEqual(JSON.parse(h.requests.at(-1).init.body), { email: null });
});
for (let failure = 1; failure <= 5; failure++) test(`L08 cleanup operation ${failure} cannot fail silently`, async () => {
  const h = harness({ fetcher: (_url, _init, state) => state.requests.length === failure ? new Response(CANARY, { status: 403 }) : new Response(null, { status: 204 }) });
  await assert.rejects(h.helpers.limparSemeadura(), e => safeError(e, 'http-failed')); assert.equal(h.requests.length, failure);
});
