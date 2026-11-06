import { test as base, expect, type Page, type Request } from '@playwright/test';
import { assertIsolatedAuthEnvironment } from '../../scripts/e2e-isolated/admission.mjs';
import { createIsolatedQrFixtureAccess, createQrOperationTracker,
  type IsolatedQrFixtureAccess, type QrOperationTracker, type QrCompletion } from '../../scripts/e2e-isolated/qr-fixture-access.mjs';
import { QR_FIXTURE } from '../../scripts/e2e-isolated/qr-contract.mjs';
import { SUPABASE_ANON_KEY, SUPABASE_STORAGE_KEY, SUPABASE_URL } from './supabase-env';

/** A strict scenario match is separate from conservative cleanup tracking. */
export function qrRequestOperation(request: Request): { action: 'connect' | 'status'; valid: boolean } | null {
  try {
    const url = new URL(request.url());
    if (url.origin !== SUPABASE_URL || !/^\/functions\/v1\/evolution-api(?:\/|$)/.test(url.pathname) ||
        request.method() === 'OPTIONS') return null;
    let body: Record<string, unknown> | undefined;
    try {
      const parsed: unknown = request.postDataJSON();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch { /* An ambiguous local operation cannot authorize a reset. */ }
    const last = url.pathname.split('/').filter(Boolean).at(-1);
    const action = last === 'evolution-api' ? body?.action : last;
    if (action !== 'connect' && action !== 'status') {
      if (last !== 'evolution-api' || body) return null;
      return { action: 'connect', valid: false };
    }
    // Ignore only an unambiguous different instance. Aliases or malformed bodies remain tracked.
    if (body && typeof body.instanceName === 'string' && body.instanceName &&
        body.instanceName !== QR_FIXTURE.instance && body.instance === undefined) return null;
    const valid = url.search === '' && request.method() === 'POST' &&
      url.pathname === '/functions/v1/evolution-api/' + action && !!body &&
      Object.keys(body).length === 1 && body.instanceName === QR_FIXTURE.instance;
    return { action, valid };
  } catch { return null; }
}
export function qrRequestAction(request: Request): 'connect' | 'status' | null {
  const operation = qrRequestOperation(request);
  return operation?.valid ? operation.action : null;
}
interface QrAdminSession {
  page: Page;
  access: IsolatedQrFixtureAccess;
  token: string;
  operations: QrOperationTracker;
  closeDialog(): Promise<QrCompletion>;
}
export const test = base.extend<{ qrAdmin: QrAdminSession }>({
  qrAdmin: [async ({ browser, baseURL }, use) => {
    if (typeof baseURL !== 'string') throw new Error('[e2e-isolated/qr-base-url]');
    const access = await createIsolatedQrFixtureAccess({ baseURL, anonKey: SUPABASE_ANON_KEY });
    const operations = createQrOperationTracker();
    let closeDialog: (() => Promise<QrCompletion>) | undefined;
    let token: string | undefined;
    let ownsFixture = false;
    let primary: unknown;
    let cleanup: unknown;
    const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      page.on('request', request => {
        const operation = qrRequestOperation(request);
        if (operation) operations.started(request, operation.action, operation.valid);
      });
      page.on('requestfinished', request => operations.finished(request));
      page.on('requestfailed', request => operations.failed(request));
      closeDialog = async () => {
        if (await page.getByRole('dialog').isVisible()) await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toBeHidden();
        operations.close();
        return operations.completion();
      };
      // This canonical browser preflight and the Node admission precede login credentials.
      await assertIsolatedAuthEnvironment({ page, baseURL });
      const credentials = await access.loginCredentials();
      await page.goto('/auth', { timeout: 15000 });
      await page.getByRole('textbox', { name: /e-?mail/i }).fill(credentials.email);
      await page.locator('input[type="password"]').fill(credentials.password);
      await page.getByRole('button', { name: /^entrar$/i }).click();
      const shell = page.locator('#main-navigation');
      const refusal = page.getByText(/erro ao entrar|e-?mail ou senha incorretos|conta bloqueada|invalid login|credenciais? inv[aá]lid|temporariamente indispon[ií]vel|^acesso bloqueado$/i);
      await expect(shell.or(refusal).first()).toBeVisible({ timeout: 120000 });
      if (!(await shell.isVisible())) throw new Error('[e2e-isolated/qr-admin-login]');
      token = await page.evaluate(key => {
        try { return JSON.parse(localStorage.getItem(key) ?? 'null')?.access_token; }
        catch { return undefined; }
      }, SUPABASE_STORAGE_KEY);
      if (typeof token !== 'string') throw new Error('[e2e-isolated/qr-admin-session]');
      await access.assertBaseline(token);
      ownsFixture = true;
      await use({ page, access, token, operations, closeDialog });
    } catch (error) { primary = error; }
    finally {
      try {
        if (ownsFixture && token && closeDialog) {
          // Do not abort the context while a mutating request may still complete.
          const completion = await closeDialog();
          await context.close();
          await access.reset(token, completion);
        }
      } catch (error) { cleanup = error; }
      finally {
        try { await context.close(); } catch {
          cleanup ??= new Error('[e2e-isolated/qr-context-close]');
        }
      }
    }
    if (primary && cleanup) throw new AggregateError([primary, cleanup], '[e2e-isolated/qr-test-and-cleanup]');
    if (primary) throw primary;
    if (cleanup) throw cleanup;
  }, { timeout: 180000 }],
});

