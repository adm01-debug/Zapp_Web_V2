import { readFileSync, readlinkSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { validateIsolatedAuthEvidence } from './admission.mjs';
import { assertIsolatedFixtureEnvironment } from './fixture-access.mjs';
import { ORIGIN, PROVIDER_ORIGIN } from './runtime-contract.mjs';
import { QR_FIXTURE, QR_FIELDS, QR_SEED_PATH, validateQrSeedProof, assertQrRow,
  assertQrProviderEvidence, readQrJson, qrJwt, qrFail } from './qr-contract.mjs';

const completions = new WeakMap();
/** Tracks fixture operations and ambiguous local requests; failure is not server completion. */
export function createQrOperationTracker() {
  const pending = new Set();
  let closed = false, uncertain = false, serial = 0;
  const counts = { connects: 0, statuses: 0, completed: 0, failed: 0, invalid: 0, after_close: 0 };
  const wake = new Set();
  const notify = () => { for (const listener of wake) listener(); };
  const settled = () => closed && !uncertain && pending.size === 0;
  return {
    started(request, action, valid = true) {
      if (!['connect', 'status'].includes(action) || !request || typeof request !== 'object' ||
          pending.has(request) || serial >= 128) qrFail('operation-shape');
      if (closed) counts.after_close += 1;
      if (valid !== true) { uncertain = true; counts.invalid += 1; }
      counts[action === 'connect' ? 'connects' : 'statuses'] += 1;
      serial += 1; pending.add(request); notify();
    },
    finished(request) {
      if (pending.delete(request)) { counts.completed += 1; notify(); }
    },
    failed(request) {
      if (pending.delete(request)) { uncertain = true; counts.failed += 1; notify(); }
    },
    close() { closed = true; notify(); },
    snapshot() { return { ...counts, pending: pending.size }; },
    async completion(timeoutMs = 45000) {
      if (!closed || !Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 45000) qrFail('operations-open');
      if (!settled() && !uncertain) await new Promise((resolve, reject) => {
        const finish = () => {
          if (!settled() && !uncertain) return;
          clearTimeout(timer); wake.delete(finish); resolve();
        };
        const timer = setTimeout(() => { wake.delete(finish); reject(new Error('[e2e-isolated/qr-operation-timeout]')); }, timeoutMs);
        wake.add(finish); finish();
      });
      if (!settled() || counts.after_close > 0) qrFail('operation-unconfirmed');
      const proof = Object.freeze({});
      const observed = serial;
      completions.set(proof, () => settled() && serial === observed && counts.after_close === 0);
      return proof;
    },
  };
}
function requireCompletion(proof) {
  if (!proof || completions.get(proof)?.() !== true) qrFail('operation-unconfirmed');
}

/** Node-only access to the one QR fixture; no service/provider key is read here. */
export async function createIsolatedQrFixtureAccess(input, testDependencies) {
  const deps = { env: process.env, readFile: readFileSync, readlink: readlinkSync, interfaces: networkInterfaces,
    now: Date.now, fetcher: globalThis.fetch, ...testDependencies };
  if (!input || input.baseURL !== ORIGIN || typeof input.anonKey !== 'string') qrFail('configuration');
  const readProof = path => {
    try {
      const raw = deps.readFile(path, 'utf8');
      if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16384) throw new Error();
      return JSON.parse(raw);
    } catch { qrFail('proof-unreadable'); }
  };
  const observe = () => {
    if (deps.env.ZAPP_E2E_LOCAL !== '1' || deps.env.API_URL !== ORIGIN ||
        input.anonKey !== deps.env.E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE?.trim() ||
        deps.env.NODE_EXTRA_CA_CERTS !== '/run/zapp-e2e-tls/ca.crt' ||
        deps.env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined || deps.env.NODE_OPTIONS) qrFail('configuration');
    let networkNamespace;
    try { networkNamespace = deps.readlink('/proc/self/ns/net'); } catch { qrFail('namespace'); }
    const target = validateIsolatedAuthEvidence({ baseURL: input.baseURL, env: deps.env,
      proof: readProof('/run/zapp-e2e/proof.json'), networkNamespace, interfaces: deps.interfaces(), now: deps.now() });
    const expected = { runId: target.run_id, sourceSha: target.source_sha, networkNamespace, anonHash: target.anon_key_sha256 };
    const ids = validateQrSeedProof(readProof(QR_SEED_PATH), expected);
    return { ...expected, ...ids };
  };
  const target = observe();
  const current = () => {
    if (JSON.stringify(observe()) !== JSON.stringify(target)) qrFail('identity-changed');
  };
  // The seam is private to Node tests; the public .d.mts exposes no injection.
  await assertIsolatedFixtureEnvironment(input, deps);
  current();
  async function request(origin, path, options = {}, code = 'fixture') {
    current();
    if (![ORIGIN, PROVIDER_ORIGIN].includes(origin) || !path.startsWith('/') || path.startsWith('//')) qrFail('target');
    let response;
    try { response = await deps.fetcher(origin + path, { ...options, cache: 'no-store',
      redirect: 'error', signal: AbortSignal.timeout(10000) }); }
    catch { qrFail(code + '-request'); }
    current();
    const value = await readQrJson(response, code);
    current();
    return value;
  }
  function userHeaders(accessToken) {
    current(); qrJwt(accessToken, 'authenticated', deps.now(), target.userId);
    return { apikey: input.anonKey, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' };
  }
  async function authenticated(accessToken) {
    const headers = userHeaders(accessToken);
    const auth = await request(ORIGIN, '/auth/v1/user', { headers }, 'auth');
    if (auth?.id !== target.userId || auth.email !== QR_FIXTURE.email) qrFail('auth-identity');
    const profiles = await request(ORIGIN, '/rest/v1/profiles?user_id=eq.' + target.userId + '&select=id,user_id,role,is_active',
      { headers }, 'profile');
    if (!Array.isArray(profiles) || profiles.length !== 1 || profiles[0].id !== target.profileId ||
        profiles[0].user_id !== target.userId || profiles[0].role !== 'admin' || profiles[0].is_active !== true) qrFail('admin-rls');
    userHeaders(accessToken);
    return headers;
  }
  async function row(accessToken, status) {
    const headers = await authenticated(accessToken);
    const rows = await request(ORIGIN, '/rest/v1/whatsapp_connections?id=eq.' + QR_FIXTURE.id + '&select=' + QR_FIELDS,
      { headers }, 'readback');
    userHeaders(accessToken);
    return assertQrRow(rows, target.profileId, status);
  }
  return Object.freeze({
    async loginCredentials() {
      await assertIsolatedFixtureEnvironment(input, deps); current();
      const email = deps.env.E2E_QR_TEST_EMAIL, password = deps.env.E2E_QR_TEST_PASSWORD;
      if (email !== QR_FIXTURE.email || typeof password !== 'string' || password.length < 24) qrFail('login-credentials');
      return { email, password };
    },
    async assertBaseline(accessToken) { await row(accessToken, 'disconnected'); },
    async assertPending(accessToken) { await row(accessToken, 'qr_pending'); },
    async evidence() {
      return assertQrProviderEvidence(await request(PROVIDER_ORIGIN, '/__e2e/evidence', {}, 'provider'), target);
    },
    async reset(accessToken, completion) {
      requireCompletion(completion);
      const before = await row(accessToken);
      requireCompletion(completion);
      const query = new URLSearchParams({
        id: 'eq.' + QR_FIXTURE.id, instance_id: 'eq.' + QR_FIXTURE.instance,
        created_by: 'eq.' + target.profileId, is_default: 'eq.false',
        updated_at: 'eq.' + before.updated_at, status: 'eq.' + before.status,
        select: QR_FIELDS,
      });
      const headers = userHeaders(accessToken);
      const changed = await request(ORIGIN, '/rest/v1/whatsapp_connections?' + query.toString(), {
        method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'disconnected', qr_code: null }),
      }, 'reset');
      requireCompletion(completion);
      assertQrRow(changed, target.profileId, 'disconnected');
      await row(accessToken, 'disconnected');
      requireCompletion(completion);
    },
  });
}

