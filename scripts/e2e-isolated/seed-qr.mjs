import { readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';
import { assertLocalOrigin, assertLoopbackOnly, assertNoProxy, assertRunId, assertSourceSha,
  currentNetworkNamespace, ORIGIN, PROVIDER_ORIGIN, sha256 } from './runtime-contract.mjs';
import { SUITE_FIXTURES } from './seed-suite.mjs';
import { QR_FIXTURE, QR_FIELDS, QR_SEED_PATH, QR_SEED_FLAGS, assertQrRow, assertQrProviderEvidence,
  readQrJson, validQrId, qrJwt, qrFail, validateQrSeedProof } from './qr-contract.mjs';

/** A third, isolated connection; never promotes the suite's supervisor. */
export async function seedQr({ env = process.env, fetcher = fetch, readFile = readFileSync,
  writeFile = writeFileSync, interfaces = networkInterfaces,
  namespace = currentNetworkNamespace, now = Date.now } = {}) {
  let credentials;
  function proof(path) {
    try {
      const raw = readFile(path, 'utf8');
      if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16384) throw new Error();
      return JSON.parse(raw);
    } catch { qrFail('bootstrap-proof'); }
  }
  function runtime() {
    assertLoopbackOnly(interfaces()); assertNoProxy(env); assertLocalOrigin(env.API_URL);
    if (env.NODE_EXTRA_CA_CERTS !== '/run/zapp-e2e-tls/ca.crt' ||
        env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined || env.NODE_OPTIONS) qrFail('bootstrap-tls');
    const runId = assertRunId(env.ZAPP_E2E_RUN_ID), sourceSha = assertSourceSha(env.GITHUB_SHA);
    const networkNamespace = namespace();
    if (!/^net:\[\d+\]$/.test(networkNamespace)) qrFail('bootstrap-namespace');
    const login = proof('/output/seed-ready.json'), suite = proof('/output/suite-seed-ready.json');
    const owns = value => value?.schema === 1 && value.run_id === runId && value.source_sha === sourceSha;
    if (!owns(login) || !owns(suite) || !validQrId(login.user_id) || !validQrId(login.profile_id) ||
        login.auth_login_real !== true || login.supervisor_rls_read !== true ||
        ['main_contact_rls', 'files_owner_preserved', 'talkx_connection_rls',
          'instance_tokens_stored', 'onboarding_persisted'].some(flag => suite[flag] !== true)) qrFail('bootstrap-proof');
    return { runId, sourceSha, networkNamespace, supervisorId: login.user_id, supervisorProfile: login.profile_id };
  }
  const target = runtime();
  function current() {
    if (JSON.stringify(runtime()) !== JSON.stringify(target)) qrFail('identity-changed');
    if (credentials) {
      for (const [key, value] of Object.entries(credentials)) if (env[key] !== value) qrFail('credential-changed');
      qrJwt(credentials.ANON_KEY, 'anon', now());
      qrJwt(credentials.SERVICE_ROLE_KEY, 'service_role', now());
    }
  }
  async function request(origin, path, options = {}, status = 200, code = 'request') {
    current();
    if (![ORIGIN, PROVIDER_ORIGIN].includes(origin) || !path.startsWith('/') || path.startsWith('//')) qrFail('target');
    let response;
    try { response = await fetcher(origin + path, { ...options, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) }); }
    catch { qrFail(code + '-request'); }
    current();
    if (!(Array.isArray(status) ? status : [status]).includes(response?.status)) {
      try { void response?.body?.cancel().catch(() => {}); } catch { /* best effort */ }
      qrFail(code + '-http');
    }
    const value = await readQrJson(response, code, response.status);
    current();
    return value;
  }
  const expected = { ...target, anonHash: '' };
  const gateway = await request(ORIGIN, '/__e2e/identity');
  if (gateway?.schema !== 1 || gateway.run_id !== target.runId || gateway.source_sha !== target.sourceSha ||
      gateway.origin !== ORIGIN) qrFail('gateway-identity');
  const provider = await request(PROVIDER_ORIGIN, '/__e2e/identity');
  if (provider?.schema !== 1 || provider.run_id !== target.runId || provider.source_sha !== target.sourceSha ||
      provider.origin !== PROVIDER_ORIGIN || provider.network_namespace !== target.networkNamespace) qrFail('provider-identity');

  // No credential is consulted before both fresh identities and the bootstrap guards.
  current();
  const keys = ['SERVICE_ROLE_KEY', 'E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY', 'ANON_KEY',
    'E2E_QR_TEST_EMAIL', 'E2E_QR_TEST_PASSWORD', 'E2E_QR_INSTANCE_TOKEN', 'EVOLUTION_DEFAULT_INSTANCE_TOKEN'];
  credentials = Object.fromEntries(keys.map(key => [key, env[key]]));
  if (!credentials.SERVICE_ROLE_KEY || credentials.SERVICE_ROLE_KEY !== credentials.E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY ||
      credentials.E2E_QR_TEST_EMAIL !== QR_FIXTURE.email ||
      typeof credentials.E2E_QR_TEST_PASSWORD !== 'string' || credentials.E2E_QR_TEST_PASSWORD.length < 24 ||
      !/^e2e-instance-qr-[a-f0-9]{48}$/.test(credentials.E2E_QR_INSTANCE_TOKEN ?? '') ||
      !credentials.EVOLUTION_DEFAULT_INSTANCE_TOKEN?.startsWith('e2e-instance-') ||
      credentials.E2E_QR_INSTANCE_TOKEN === credentials.EVOLUTION_DEFAULT_INSTANCE_TOKEN) qrFail('bootstrap-credentials');
  current();
  expected.anonHash = sha256(credentials.ANON_KEY);
  const service = { apikey: credentials.SERVICE_ROLE_KEY, Authorization: 'Bearer ' + credentials.SERVICE_ROLE_KEY,
    'Content-Type': 'application/json' };
  const post = (path, body, status = 200) => request(ORIGIN, path, {
    method: 'POST', headers: { ...service, Prefer: 'return=representation' }, body: JSON.stringify(body),
  }, status);
  const read = path => request(ORIGIN, path, { headers: service });

  async function existingSnapshot() {
    const f = SUITE_FIXTURES;
    const connections = await read('/rest/v1/whatsapp_connections?id=in.(' + f.connection + ',' + f.filesConnection + ')' +
      '&select=id,instance_id,status,is_default,created_by,phone_number&order=id');
    const names = new Map([[f.connection, f.instance], [f.filesConnection, 'e2e-arquivos-local']]);
    if (!Array.isArray(connections) || connections.length !== 2 || new Set(connections.map(row => row.id)).size !== 2 ||
        connections.some(row => names.get(row.id) !== row.instance_id || row.status !== 'connected')) qrFail('existing-connections');
    const profiles = await read('/rest/v1/profiles?user_id=in.(' + target.supervisorId + ',' + f.filesUser + ')' +
      '&select=id,user_id,role,is_active&order=user_id');
    if (!Array.isArray(profiles) || profiles.length !== 2 ||
        !profiles.some(row => row.user_id === target.supervisorId && row.id === target.supervisorProfile && row.role === 'supervisor' && row.is_active === true) ||
        !profiles.some(row => row.user_id === f.filesUser && row.role === 'agent' && row.is_active === true)) qrFail('existing-roles');
    for (const instance of names.values()) {
      const token = await post('/rest/v1/rpc/get_instance_token', { p_instance_id: instance });
      if (token !== credentials.EVOLUTION_DEFAULT_INSTANCE_TOKEN) qrFail('existing-token');
    }
    const contact = await read('/rest/v1/contacts?id=eq.' + f.contact + '&select=id,assigned_to,whatsapp_connection_id');
    if (!Array.isArray(contact) || contact.length !== 1 || contact[0].id !== f.contact ||
        contact[0].whatsapp_connection_id !== f.connection ||
        contact[0].assigned_to !== profiles.find(row => row.user_id === f.filesUser).id) qrFail('existing-contact');
    return { connections, profiles, contact };
  }
  const before = await existingSnapshot();
  const maintenance = await read('/rest/v1/global_settings?key=eq.whatsapp_maintenance_until&select=value');
  if (!Array.isArray(maintenance) || maintenance.length > 1 || maintenance.some(row =>
      row.value && (!Number.isFinite(Date.parse(row.value)) || Date.parse(row.value) > now()))) qrFail('maintenance-active');

  const collision = await read('/rest/v1/whatsapp_connections?or=' +
    encodeURIComponent('(id.eq.' + QR_FIXTURE.id + ',instance_id.eq.' + QR_FIXTURE.instance + ',name.eq.' + QR_FIXTURE.name + ')') +
    '&select=id');
  if (!Array.isArray(collision) || collision.length !== 0) qrFail('fixture-collision');

  const created = await post('/auth/v1/admin/users', {
    email: credentials.E2E_QR_TEST_EMAIL, password: credentials.E2E_QR_TEST_PASSWORD,
    email_confirm: true, user_metadata: { name: 'Admin QR sintético E2E' },
  }, [200, 201]);
  const userId = created?.id ?? created?.user?.id;
  if (!validQrId(userId) || [target.supervisorId, SUITE_FIXTURES.filesUser].includes(userId)) qrFail('admin-identity');
  const profiles = await read('/rest/v1/profiles?user_id=eq.' + userId + '&select=id,user_id');
  const profile = Array.isArray(profiles) && profiles.length === 1 ? profiles[0] : null;
  if (!profile || !validQrId(profile.id) || profile.user_id !== userId || profile.id === target.supervisorProfile) qrFail('admin-profile');
  await request(ORIGIN, '/rest/v1/profiles?user_id=eq.' + userId + '&select=id,user_id,is_active', {
    method: 'PATCH', headers: { ...service, Prefer: 'return=representation' },
    body: JSON.stringify({ name: 'Admin QR sintético E2E', is_active: true }),
  });
  const role = await post('/rest/v1/user_roles?select=user_id,role', { user_id: userId, role: 'admin' }, 201);
  if (!Array.isArray(role) || role.length !== 1 || role[0].user_id !== userId || role[0].role !== 'admin') qrFail('admin-role');
  await request(ORIGIN, '/rest/v1/user_settings?on_conflict=user_id&select=user_id,onboarding_completed', {
    method: 'POST', headers: { ...service, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ user_id: userId, onboarding_completed: true }),
  }, 201);

  const inserted = await post('/rest/v1/whatsapp_connections?select=' + QR_FIELDS, {
    id: QR_FIXTURE.id, name: QR_FIXTURE.name, phone_number: QR_FIXTURE.phone,
    instance_id: QR_FIXTURE.instance, status: 'disconnected', qr_code: null,
    is_default: false, created_by: profile.id,
  }, 201);
  assertQrRow(inserted, profile.id, 'disconnected');
  const secretId = await post('/rest/v1/rpc/set_instance_token', {
    p_connection_id: QR_FIXTURE.id, p_token: credentials.E2E_QR_INSTANCE_TOKEN,
  });
  if (!validQrId(secretId)) qrFail('token-store');
  const token = await post('/rest/v1/rpc/get_instance_token', { p_instance_id: QR_FIXTURE.instance });
  if (token !== credentials.E2E_QR_INSTANCE_TOKEN) qrFail('token-readback');

  const session = await request(ORIGIN, '/functions/v1/auth-login', {
    method: 'POST', headers: { apikey: credentials.ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: credentials.E2E_QR_TEST_EMAIL, password: credentials.E2E_QR_TEST_PASSWORD,
      userAgent: 'isolated-qr-readiness', mode: 'login' }),
  });
  qrJwt(session?.access_token, 'authenticated', now(), userId);
  if (typeof session.refresh_token !== 'string' || !session.refresh_token) qrFail('admin-login');
  const user = { apikey: credentials.ANON_KEY, Authorization: 'Bearer ' + session.access_token };
  const identity = await request(ORIGIN, '/auth/v1/user', { headers: user });
  if (identity?.id !== userId || identity.email !== QR_FIXTURE.email) qrFail('admin-auth');
  const own = await request(ORIGIN, '/rest/v1/profiles?user_id=eq.' + userId + '&select=id,user_id,role,is_active', { headers: user });
  if (!Array.isArray(own) || own.length !== 1 || own[0].id !== profile.id || own[0].user_id !== userId ||
      own[0].role !== 'admin' || own[0].is_active !== true) qrFail('admin-rls');
  const visible = await request(ORIGIN, '/rest/v1/whatsapp_connections?id=eq.' + QR_FIXTURE.id + '&select=' + QR_FIELDS, { headers: user });
  assertQrRow(visible, profile.id, 'disconnected');
  const settings = await request(ORIGIN, '/rest/v1/user_settings?user_id=eq.' + userId + '&select=user_id,onboarding_completed', { headers: user });
  if (!Array.isArray(settings) || settings.length !== 1 || settings[0].user_id !== userId || settings[0].onboarding_completed !== true) qrFail('admin-onboarding');

  const status = await request(PROVIDER_ORIGIN, '/instance/status', {
    headers: { apikey: credentials.E2E_QR_INSTANCE_TOKEN },
  });
  if (status?.data?.Name !== QR_FIXTURE.instance || status.data.Connected !== false || status.data.LoggedIn !== false) qrFail('provider-state');
  const evidence = assertQrProviderEvidence(await request(PROVIDER_ORIGIN, '/__e2e/evidence'), expected);
  if (evidence.generation !== 0 || evidence.connects !== 0 || evidence.qr_reads !== 0) qrFail('provider-used-before-browser');
  if (JSON.stringify(await existingSnapshot()) !== JSON.stringify(before)) qrFail('existing-fixtures-changed');
  const ready = {
    schema: 1, run_id: target.runId, source_sha: target.sourceSha, origin: ORIGIN,
    network_namespace: target.networkNamespace, anon_key_sha256: expected.anonHash,
    user_id: userId, profile_id: profile.id, connection_id: QR_FIXTURE.id, instance_id: QR_FIXTURE.instance,
    ...Object.fromEntries(QR_SEED_FLAGS.map(flag => [flag, true])),
  };
  validateQrSeedProof(ready, expected); current();
  writeFile(QR_SEED_PATH, JSON.stringify(ready) + '\n', { mode: 0o600 });
  return ready;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await seedQr();
  process.stdout.write('[e2e-isolated] separate QR admin, Vault token and RLS fixture verified\n');
}

