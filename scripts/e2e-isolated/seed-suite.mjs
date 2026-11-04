import { readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';
import { assertLocalOrigin, assertLoopbackOnly, assertNoProxy, assertRunId, assertSourceSha, ORIGIN, fail } from './runtime-contract.mjs';

// These identities belong to the existing synthetic E2E fixtures. The owner is
// resolved from this run's real login; no hosted profile/user ID is copied.
export const SUITE_FIXTURES = Object.freeze({
  contact: '04dff4dc-c6b1-4283-ac22-bd8639804759',
  contactName: '[E2E] Contato de teste - nao apagar',
  connection: 'e2e0e2e0-0000-4000-a000-e2e000000001',
  connectionName: '[E2E] Conexão WhatsApp Teste',
  connectionPhone: '00000000000',
  instance: 'E2E_LOCAL',
  filesConnection: 'e2e26100-7005-4509-a000-0000000000c0',
  filesUser: 'e2e26100-7005-4509-a000-000000000001',
  filesEmail: 'e2e.arquivos@example.com',
  segment: '621521f3-e9c9-49c2-834e-cea07545d476',
  segmentName: '[E2E] Segmento de Teste',
  incomingMessage: 'e2e65100-0000-4000-a000-000000000101',
  paginationCount: 51,
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId = value => typeof value === 'string' && UUID.test(value);

/** Run after both existing storage seeds, before browser admission is issued. */
export async function seedSuite({ env = process.env, fetcher = fetch, readFile = readFileSync,
  writeFile = writeFileSync, interfaces = networkInterfaces } = {}) {
  assertLoopbackOnly(interfaces());
  assertNoProxy(env);
  assertLocalOrigin(env.API_URL);
  const runId = assertRunId(env.ZAPP_E2E_RUN_ID);
  const sourceSha = assertSourceSha(env.GITHUB_SHA);
  let seed;
  try { seed = JSON.parse(readFile('/output/seed-ready.json', 'utf8')); }
  catch { fail('login-seed-proof-unreadable'); }
  if (seed?.schema !== 1 || seed.run_id !== runId || seed.source_sha !== sourceSha ||
      seed.auth_login_real !== true || seed.supervisor_rls_read !== true ||
      !validId(seed.user_id) || !validId(seed.profile_id)) fail('login-seed-proof-mismatch');

  async function request(path, options = {}) {
    if (!path.startsWith('/') || path.startsWith('//')) fail('invalid-suite-seed-path');
    let response;
    try { response = await fetcher(ORIGIN + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(15_000) }); }
    catch { fail('suite-seed-request-failed'); }
    if (!response.ok) fail('suite-seed-http-' + response.status);
    if (response.status === 204) return null;
    let body;
    try { body = await response.text(); return body ? JSON.parse(body) : null; }
    catch { fail('suite-seed-invalid-json'); }
  }
  const identity = await request('/__e2e/identity');
  if (identity?.schema !== 1 || identity.run_id !== runId || identity.source_sha !== sourceSha ||
      identity.origin !== ORIGIN) fail('foreign-gateway');

  // No credential is read until the namespace, local origin and run are checked.
  const serviceKey = env.SERVICE_ROLE_KEY;
  const anonKey = env.ANON_KEY;
  const email = env.E2E_TEST_EMAIL;
  const password = env.E2E_TEST_PASSWORD;
  const instanceToken = env.EVOLUTION_DEFAULT_INSTANCE_TOKEN;
  if (!serviceKey || !anonKey || !email?.endsWith('@example.invalid') || !password ||
      !instanceToken?.startsWith('e2e-instance-')) fail('missing-synthetic-suite-credentials');
  const admin = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };
  const write = (path, value) => request(path, { method: 'POST', headers: {
    ...admin, Prefer: 'resolution=merge-duplicates,return=minimal',
  }, body: JSON.stringify(value) });
  const session = await request('/functions/v1/auth-login', {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, userAgent: 'isolated-suite-readiness', mode: 'login' }),
  });
  if (typeof session?.access_token !== 'string' || !session.access_token ||
      typeof session?.refresh_token !== 'string' || !session.refresh_token) fail('suite-real-login-not-confirmed');
  const user = { apikey: anonKey, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' };
  const own = await request('/rest/v1/profiles?user_id=eq.' + seed.user_id + '&select=id,role,is_active', { headers: user });
  if (!Array.isArray(own) || own.length !== 1 || own[0].id !== seed.profile_id ||
      own[0].role !== 'supervisor' || own[0].is_active !== true) fail('suite-supervisor-rls-not-ready');

  const fixture = SUITE_FIXTURES;
  const contactPath = '/rest/v1/contacts?id=eq.' + fixture.contact;
  const existing = await request(contactPath + '&select=id,name,assigned_to', { headers: admin });
  if (!Array.isArray(existing) || existing.length !== 1 || existing[0].id !== fixture.contact ||
      existing[0].name !== fixture.contactName || !validId(existing[0].assigned_to) ||
      existing[0].assigned_to === seed.profile_id) fail('canonical-files-seed-not-ready');
  const filesOwner = existing[0].assigned_to;
  const files = await request('/rest/v1/whatsapp_connections?id=eq.' + fixture.filesConnection + '&select=id,instance_id', { headers: admin });
  if (!Array.isArray(files) || files.length !== 1 || files[0].id !== fixture.filesConnection ||
      files[0].instance_id !== 'e2e-arquivos-local') fail('local-files-seed-not-ready');
  const filesProfiles = await request('/rest/v1/profiles?user_id=eq.' + fixture.filesUser + '&select=id,user_id,email,role,is_active', { headers: admin });
  if (!Array.isArray(filesProfiles) || filesProfiles.length !== 1 || !validId(filesProfiles[0].id) ||
      filesProfiles[0].user_id !== fixture.filesUser || filesProfiles[0].email !== fixture.filesEmail ||
      filesProfiles[0].role !== 'agent' || filesProfiles[0].is_active !== true) fail('local-files-profile-not-ready');

  // The current hook reads this boolean, not the existence of a settings row.
  // Keep other preferences and the independent tour-test users untouched.
  await write('/rest/v1/user_settings?on_conflict=user_id', [seed.user_id, fixture.filesUser].map(userId => ({
    user_id: userId, onboarding_completed: true,
  })));

  await write('/rest/v1/whatsapp_connections?on_conflict=id', {
    id: fixture.connection, name: fixture.connectionName, phone_number: fixture.connectionPhone,
    status: 'connected', instance_id: fixture.instance, created_by: seed.profile_id,
  });
  for (const id of [fixture.connection, fixture.filesConnection]) {
    const secretId = await request('/rest/v1/rpc/set_instance_token', {
      method: 'POST', headers: admin, body: JSON.stringify({ p_connection_id: id, p_token: instanceToken }),
    });
    if (!validId(secretId)) fail('instance-token-not-stored');
  }
  await write('/rest/v1/talkx_segments?on_conflict=id', {
    id: fixture.segment, name: fixture.segmentName, origin: 'zapp', status: 'active',
    rules: { groups: [] }, estimated_count: fixture.paginationCount + 1,
    is_favorite: false, created_by: seed.profile_id,
  });
  await request(contactPath, {
    method: 'PATCH', headers: { ...admin, Prefer: 'return=minimal' },
    body: JSON.stringify({ whatsapp_connection_id: fixture.connection, conversation_status: 'open',
      consent_status: 'granted', deleted_at: null }),
  });
  // PAGE_SIZE is 50 in useContactsSearch. Names differ from "[E2E]", so the
  // conversation selector stays unambiguous; these contacts have no messages.
  const pagination = Array.from({ length: fixture.paginationCount }, (_, index) => ({
    id: 'e2e65100-0000-4000-a000-' + String(index + 1).padStart(12, '0'),
    name: 'Sintético E2E Paginação ' + String(index + 1).padStart(3, '0'),
    phone: '5500000100' + String(index + 1).padStart(3, '0'),
    assigned_to: seed.profile_id, contact_type: 'cliente', channel_type: 'whatsapp',
    notes: '[isolated ' + runId + '] pagination fixture', deleted_at: null,
  }));
  await write('/rest/v1/contacts?on_conflict=id', pagination);
  // An incoming synthetic fixture is legitimate seed data. Delivery readiness
  // is separate: it must use enqueue_outbound_message and message-delivery.
  await write('/rest/v1/messages?on_conflict=id', {
    id: fixture.incomingMessage, contact_id: fixture.contact, sender: 'contact',
    content: '[E2E isolado] conversa sintética pronta', message_type: 'text',
    created_at: new Date().toISOString(),
  });

  const visible = await request(contactPath + '&select=id,assigned_to,whatsapp_connection_id', { headers: user });
  if (!Array.isArray(visible) || visible.length !== 1 || visible[0].id !== fixture.contact ||
      visible[0].assigned_to !== filesOwner || visible[0].whatsapp_connection_id !== fixture.connection) fail('main-contact-supervisor-rls-not-ready');
  const search = await request('/rest/v1/rpc/search_contacts', { method: 'POST', headers: user,
    body: JSON.stringify({ search_term: '', sort_field: 'name', sort_direction: 'asc', page_size: 50, page_offset: 50 }),
  });
  if (!Array.isArray(search) || !search.length || !search.every(row => validId(row.id) && Number(row.total_count) > 50)) fail('contact-pagination-rls-not-ready');
  const segments = await request('/rest/v1/talkx_segments?id=eq.' + fixture.segment + '&select=id,name,status,created_by', { headers: user });
  if (!Array.isArray(segments) || segments.length !== 1 || segments[0].id !== fixture.segment ||
      segments[0].name !== fixture.segmentName || segments[0].status !== 'active' ||
      segments[0].created_by !== seed.profile_id) fail('talkx-segment-rls-not-ready');
  const connections = await request('/rest/v1/whatsapp_connections?id=eq.' + fixture.connection + '&select=id,name,phone_number,status,instance_id', { headers: user });
  if (!Array.isArray(connections) || connections.length !== 1 || connections[0].id !== fixture.connection ||
      connections[0].name !== fixture.connectionName || connections[0].phone_number !== fixture.connectionPhone ||
      connections[0].status !== 'connected' || connections[0].instance_id !== fixture.instance) fail('talkx-connection-rls-not-ready');
  const messages = await request('/rest/v1/messages?id=eq.' + fixture.incomingMessage + '&select=id,contact_id,sender', { headers: user });
  if (!Array.isArray(messages) || messages.length !== 1 || messages[0].id !== fixture.incomingMessage ||
      messages[0].contact_id !== fixture.contact || messages[0].sender !== 'contact') fail('inbox-fixture-rls-not-ready');
  for (const [userId, headers] of [[seed.user_id, user], [fixture.filesUser, admin]]) {
    const settings = await request('/rest/v1/user_settings?user_id=eq.' + userId + '&select=user_id,onboarding_completed', { headers });
    if (!Array.isArray(settings) || settings.length !== 1 || settings[0].user_id !== userId ||
        settings[0].onboarding_completed !== true) fail('onboarding-settings-not-ready');
  }

  const ready = { schema: 1, run_id: runId, source_sha: sourceSha,
    main_contact_rls: true, files_owner_preserved: true, pagination_rls: true,
    talkx_connection_rls: true, talkx_segment_rls: true, instance_tokens_stored: true,
    inbox_fixture_rls: true, onboarding_persisted: true, pagination_seed_count: fixture.paginationCount };
  writeFile('/output/suite-seed-ready.json', JSON.stringify(ready) + '\n', { mode: 0o600 });
  return ready;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await seedSuite();
  process.stdout.write('[e2e-isolated] synthetic suite fixtures and user RLS verified\n');
}
