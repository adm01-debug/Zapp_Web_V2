import { writeFileSync } from 'node:fs';
import { assertLocalOrigin, assertLoopbackOnly, assertNoProxy, assertRunId, assertSourceSha, ORIGIN, fail } from './runtime-contract.mjs';

assertLoopbackOnly();
assertNoProxy(process.env);
assertLocalOrigin(process.env.API_URL);
const runId = assertRunId(process.env.ZAPP_E2E_RUN_ID);
const sourceSha = assertSourceSha(process.env.GITHUB_SHA);

async function localRequest(path, options = {}) {
  if (!path.startsWith('/') || path.startsWith('//')) fail('invalid-seed-path');
  const response = await fetch(ORIGIN + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    // Do not print response bodies, URLs, request bodies or credentials.
    throw new Error('[e2e-isolated/seed-http-' + response.status + ']');
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const identity = await localRequest('/__e2e/identity');
if (identity?.run_id !== runId || identity?.source_sha !== sourceSha || identity?.origin !== ORIGIN) fail('foreign-gateway');

// Credentials are consulted only after local network, origin and ownership checks.
const serviceKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
if (!serviceKey || !anonKey || !email?.endsWith('@example.invalid') || !password) fail('missing-synthetic-credentials');
const adminHeaders = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };
const created = await localRequest('/auth/v1/admin/users', {
  method: 'POST', headers: adminHeaders,
  body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name: 'Supervisor sintético E2E' } }),
});
const userId = created?.id ?? created?.user?.id;
if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/.test(userId)) fail('auth-user-not-created');
const profiles = await localRequest('/rest/v1/profiles?user_id=eq.' + userId + '&select=id', { headers: adminHeaders });
if (!Array.isArray(profiles) || profiles.length !== 1 || !/^[0-9a-f-]{36}$/.test(profiles[0]?.id)) fail('profile-trigger-not-ready');
await localRequest('/rest/v1/profiles?user_id=eq.' + userId, {
  method: 'PATCH', headers: { ...adminHeaders, Prefer: 'return=minimal' },
  body: JSON.stringify({ name: 'Supervisor sintético E2E', is_active: true }),
});
// profiles.role is derived by the real user_roles sync trigger. A direct PATCH
// would correctly trip prevent_profile_privilege_escalation without auth.uid().
await localRequest('/rest/v1/user_roles?user_id=eq.' + userId, { method: 'DELETE', headers: adminHeaders });
await localRequest('/rest/v1/user_roles', {
  method: 'POST', headers: { ...adminHeaders, Prefer: 'return=minimal' },
  body: JSON.stringify({ user_id: userId, role: 'supervisor' }),
});
await localRequest('/rest/v1/user_settings?on_conflict=user_id', {
  method: 'POST', headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ user_id: userId }),
});

// This is the application's actual Edge handler, not direct GoTrue password login.
const session = await localRequest('/functions/v1/auth-login', {
  method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, userAgent: 'isolated-readiness', mode: 'login' }),
});
if (typeof session?.access_token !== 'string' || typeof session?.refresh_token !== 'string') fail('real-login-not-confirmed');
const ownProfile = await localRequest('/rest/v1/profiles?user_id=eq.' + userId + '&select=id,role,is_active', {
  headers: { apikey: anonKey, Authorization: 'Bearer ' + session.access_token },
});
if (!Array.isArray(ownProfile) || ownProfile.length !== 1 || ownProfile[0]?.role !== 'supervisor' || ownProfile[0]?.is_active !== true) fail('supervisor-rls-not-ready');
writeFileSync('/output/seed-ready.json', JSON.stringify({
  schema: 1, run_id: runId, source_sha: sourceSha,
  user_id: userId, profile_id: profiles[0].id,
  auth_login_real: true, supervisor_rls_read: true,
}) + '\n', { mode: 0o600 });
process.stdout.write('[e2e-isolated] synthetic supervisor and real auth-login verified\n');
