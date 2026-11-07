import { test as base, expect, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFile, readlink } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { assertIsolatedAuthEnvironment, validateIsolatedAuthEvidence, type IsolatedAuthTarget } from '../../scripts/e2e-isolated/admission.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type LocalUser = { id?: string; email?: string; app_metadata?: Record<string, unknown> };
function fail(code: string): never { throw new Error(`[E2E tour/${code}]`); }

/** A new Auth user per test/attempt; no shared supervisor preference is reset. */
export async function withFreshOnboardingUser(
  { page, baseURL }: { page: Page; baseURL: string | undefined },
  exercise: () => Promise<void>,
): Promise<void> {
  // This verifies the actual browser resolver before any privileged key is read.
  await assertIsolatedAuthEnvironment({ page, baseURL });
  async function isolatedTarget(expected?: IsolatedAuthTarget): Promise<IsolatedAuthTarget> {
    let proof: unknown;
    let namespace: string;
    try {
      const raw = await readFile('/run/zapp-e2e/proof.json', 'utf8');
      if (Buffer.byteLength(raw) > 8192) fail('isolation-proof');
      proof = JSON.parse(raw);
      namespace = await readlink('/proc/self/ns/net');
    } catch { fail('isolation-proof'); }
    const current = validateIsolatedAuthEvidence({ baseURL, env: process.env, proof,
      networkNamespace: namespace, interfaces: networkInterfaces(), now: Date.now() });
    if (expected && (current.origin !== expected.origin || current.run_id !== expected.run_id ||
      current.source_sha !== expected.source_sha ||
      !Object.is(current.anon_key_sha256, expected.anon_key_sha256))) fail('foreign-run');
    return current;
  }
  const owner = await isolatedTarget();
  const service = process.env.SERVICE_ROLE_KEY;
  if (!service || !Object.is(service, process.env.E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY)) fail('local-service-key');
  const email = `tour.${randomBytes(12).toString('hex')}@example.invalid`;
  const password = randomBytes(24).toString('base64url') + 'aA9!';
  const marker = { e2e_fixture: 'onboarding-tour', e2e_run_id: owner.run_id, e2e_source_sha: owner.source_sha };
  const headers = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    await isolatedTarget(owner);
    if (!path.startsWith('/') || path.startsWith('//')) fail('invalid-local-path');
    let response: Response;
    try {
      response = await fetch(owner!.origin + path, { method, headers: { ...headers,
        ...(path.startsWith('/rest/v1/') && method !== 'GET' ? { Prefer: 'resolution=merge-duplicates,return=minimal' } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error', signal: AbortSignal.timeout(15_000) });
    } catch { fail('local-request-failed'); }
    if (!response.ok) fail(`local-http-${response.status}`);
    if (response.status === 204) return null as T;
    try { const raw = await response.text(); return (raw ? JSON.parse(raw) : null) as T; }
    catch { fail('local-response-invalid'); }
  }
  const owned = (user: LocalUser, id?: string) => typeof user?.id === 'string' && UUID.test(user.id) &&
    (!id || user.id === id) && user.email === email && Object.entries(marker).every(([key, value]) => user.app_metadata?.[key] === value);
  const created = await request<LocalUser>('/auth/v1/admin/users', 'POST', {
    email, password, email_confirm: true, app_metadata: marker,
    user_metadata: { name: 'Tour sintético E2E' },
  });
  if (!owned(created)) fail('created-user-not-owned');
  const id = created.id!;
  try {
    const profiles = await request<{ id?: string }[]>(`/rest/v1/profiles?user_id=eq.${id}&select=id`);
    if (!Array.isArray(profiles) || profiles.length !== 1 || !UUID.test(profiles[0]?.id ?? '')) fail('profile-trigger-not-ready');
    await request(`/rest/v1/profiles?user_id=eq.${id}`, 'PATCH', { is_active: true });
    // The canonical user_roles trigger derives profiles.role; direct role PATCH
    // is correctly refused by prevent_profile_privilege_escalation.
    await request(`/rest/v1/user_roles?user_id=eq.${id}`, 'DELETE');
    await request('/rest/v1/user_roles', 'POST', { user_id: id, role: 'supervisor' });
    const synced = await request<{ id?: string; user_id?: string; role?: string; is_active?: unknown }[]>(
      `/rest/v1/profiles?user_id=eq.${id}&select=id,user_id,role,is_active`,
    );
    if (!Array.isArray(synced) || synced.length !== 1 || synced[0].id !== profiles[0].id ||
      synced[0].user_id !== id || synced[0].role !== 'supervisor' || synced[0].is_active !== true) fail('fresh-profile-not-ready');
    // Merge only this preference. The app, not the fixture, must persist true.
    await request('/rest/v1/user_settings?on_conflict=user_id', 'POST', { user_id: id, onboarding_completed: false });
    const settings = await request<{ user_id?: string; onboarding_completed?: unknown }[]>(`/rest/v1/user_settings?user_id=eq.${id}&select=user_id,onboarding_completed`);
    if (!Array.isArray(settings) || settings.length !== 1 || settings[0].user_id !== id ||
      settings[0].onboarding_completed !== false) fail('fresh-onboarding-not-ready');
    await page.goto('/auth');
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await page.getByRole('button', { name: /^entrar$/i }).click();
    await expect(page.locator('#main-navigation')).toBeVisible({ timeout: 60_000 });
    await exercise();
  } finally {
    // Runs even when the test fails. A closed page is not needed for cleanup.
    const current = await request<LocalUser>(`/auth/v1/admin/users/${id}`);
    if (!owned(current, id)) fail('cleanup-user-not-owned');
    await request(`/auth/v1/admin/users/${id}`, 'DELETE');
  }
}

export const test = base.extend<{ freshOnboardingUser: void }>({
  freshOnboardingUser: [async ({ page, baseURL }, provide) => {
    await withFreshOnboardingUser({ page, baseURL }, provide);
  }, { auto: true }],
});
export { expect };

/** Preserve contact readiness without the helper that dismisses the tour. */
export async function gotoOnboardingContacts(page: Page): Promise<void> {
  const heading = page
    .getByRole('main', { name: 'Conteúdo principal' })
    .getByRole('heading', { level: 1, name: 'Contatos' });
  await page.goto('/?view=contacts');
  // O primeiro documento pode ser substituído pela navegação pós-login ainda
  // pendente. Uma única repetição idempotente, acionada pela ausência exata da
  // superfície, evita aprovar uma tela incompleta e não usa espera fixa.
  try {
    await expect(heading).toBeAttached({ timeout: 20_000 });
  } catch {
    await page.goto('/?view=contacts');
    await expect(heading).toBeAttached({ timeout: 20_000 });
  }
  await expect(page.getByTestId('kpi-card').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('tab', { name: /Todos/ })).toBeVisible();
  await expect(page.getByText('Carregando contatos', { exact: false })).toHaveCount(0, { timeout: 20_000 });
}
