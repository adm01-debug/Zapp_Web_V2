import type { Page, Request, Response } from '@playwright/test';

export const ISOLATED_HTTP_ORIGIN = 'https://127.0.0.1:5173';
export type ObservedFunction = 'get-sip-password' | 'detect-new-device';

export interface CompletedFunctionCall {
  request: Request;
  status: number;
  body: unknown;
}

type Outcome = { ok: true; call: CompletedFunctionCall } | { ok: false; code: string };
const rejected = (code: string): Outcome => ({ ok: false, code });
const fail = (code: string): never => { throw new Error('[e2e-http/' + code + ']'); };

function exactPost(request: Request, target: string): boolean {
  return request.method() === 'POST' && request.url() === target;
}

async function readCall(request: Request, target: string): Promise<Outcome> {
  let response: Response | null;
  try { response = await request.response(); }
  catch { return rejected('response-unavailable'); }
  if (!response || response.request() !== request || response.url() !== target) {
    return rejected('response-mismatch');
  }
  try {
    if (await response.finished()) return rejected('response-unfinished');
  } catch { return rejected('response-unfinished'); }
  try {
    const body: unknown = await response.json();
    return { ok: true, call: { request, status: response.status(), body } };
  } catch { return rejected('response-json'); }
}

/**
 * Registra antes do gatilho. Só resolve após POST real e corpo concluído.
 * O prazo de conclusão começa em completed(), depois do boot/gatilho do teste.
 * Ausência, pendência, fechamento e cleanup nunca aprovam um resultado vazio.
 */
export function observeIsolatedFunctionPosts(page: Page, name: ObservedFunction) {
  if (name !== 'get-sip-password' && name !== 'detect-new-device') fail('function-name');
  const target = ISOLATED_HTTP_ORIGIN + '/functions/v1/' + name;
  const calls = new Map<Request, { completion: Promise<Outcome>; failed: () => void }>();
  let wakeFirst!: () => void;
  const first = new Promise<void>((resolve) => { wakeFirst = resolve; });
  let end!: (value: Outcome) => void;
  const ended = new Promise<Outcome>((resolve) => { end = resolve; });
  let stopped = false;
  const onRequest = (request: Request) => {
    if (stopped || !exactPost(request, target) || calls.has(request)) return;
    let rejectRequest!: (value: Outcome) => void;
    const failed = new Promise<Outcome>((resolve) => { rejectRequest = resolve; });
    calls.set(request, {
      completion: Promise.race([readCall(request, target), failed, ended]),
      failed: () => rejectRequest(rejected('request-failed')),
    });
    wakeFirst();
  };
  const onFailed = (request: Request) => { calls.get(request)?.failed(); };
  const onClose = () => { end(rejected('page-closed')); wakeFirst(); };
  page.on('request', onRequest);
  page.on('requestfailed', onFailed);
  page.on('close', onClose);

  return {
    async completed(): Promise<CompletedFunctionCall[]> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('[e2e-http/completion-timeout]')), 30_000);
      });
      try {
        await Promise.race([first, deadline]);
        if (stopped || calls.size === 0) fail('no-completed-request');
        const completed: CompletedFunctionCall[] = [];
        // Prazo único: uma segunda chamada não reinicia os 30 s da barreira.
        for (const record of calls.values()) {
          const outcome = await Promise.race([record.completion, deadline]);
          if (!outcome.ok) return fail(outcome.code);
          completed.push(outcome.call);
        }
        if (stopped) fail('observer-disposed');
        return completed;
      } finally {
        clearTimeout(timer);
      }
    },
    dispose(): void {
      if (stopped) return;
      stopped = true;
      page.off('request', onRequest);
      page.off('requestfailed', onFailed);
      page.off('close', onClose);
      end(rejected('observer-disposed'));
      wakeFirst();
    },
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export function requireSipNotConfigured(call: CompletedFunctionCall): void {
  if (call.status !== 503 || !record(call.body) || Object.keys(call.body).length !== 2 ||
      call.body.error !== 'SIP não configurado' || call.body.code !== 'SIP_NOT_CONFIGURED') {
    fail('sip-contract');
  }
}

export interface DeviceResult {
  is_new_device: boolean;
  device_id: string;
  session_id: string;
  message: string;
}

export function requireDeviceResult(status: number, value: unknown): DeviceResult {
  if (status !== 200 || !record(value) || Object.keys(value).length !== 4 ||
      typeof value.is_new_device !== 'boolean' || !uuid(value.device_id) || !uuid(value.session_id) ||
      value.message !== (value.is_new_device ? 'New device detected and email sent' : 'Known device updated')) {
    fail('device-contract');
  }
  return value as unknown as DeviceResult;
}

export interface SessionIdentity { userId: string; authSessionId: string }

/** Só interpreta identidade; /auth/v1/user e RLS validam a credencial real. */
export function readIsolatedSessionIdentity(token: string): SessionIdentity {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) fail('session-token');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || claims.role !== 'authenticated' ||
        claims.iss !== ISOLATED_HTTP_ORIGIN + '/auth/v1' || !uuid(claims.sub) || !uuid(claims.session_id) ||
        !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) fail('session-token');
    return { userId: claims.sub, authSessionId: claims.session_id };
  } catch { return fail('session-token'); }
}

export function requireSessionAbsent(rows: unknown): void {
  if (!Array.isArray(rows) || rows.length !== 0) fail('session-already-present');
}

export function requireCanonicalSession(
  rows: unknown, identity: SessionIdentity, result: DeviceResult,
): void {
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (!record(row) || row.id !== result.session_id || row.user_id !== identity.userId ||
      row.auth_session_id !== identity.authSessionId || row.device_id !== result.device_id ||
      row.is_active !== true) fail('session-canonical');
}

export function requireOwnedDevice(
  rows: unknown, identity: SessionIdentity, result: DeviceResult,
): string {
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (!record(row) || row.id !== result.device_id || row.user_id !== identity.userId ||
      typeof row.device_fingerprint !== 'string' || row.device_fingerprint.length < 1 ||
      row.device_fingerprint.length > 500) fail('device-ownership');
  return row.device_fingerprint;
}

export function requireSameKnownSession(results: DeviceResult[], deviceId: string): DeviceResult {
  if (results.length !== 2 || results.some((result) => result.is_new_device || result.device_id !== deviceId) ||
      results[0].session_id !== results[1].session_id) fail('session-concurrency');
  return results[0];
}

export function readBearerAccessToken(header: string | null): string {
  if (typeof header !== 'string' || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(header)) {
    return fail('authorization');
  }
  return header.slice(7);
}

export function readLoginAccessToken(body: unknown): string {
  if (!record(body) || typeof body.access_token !== 'string' || !body.access_token) return fail('login-token');
  return body.access_token;
}

export function requireSyntheticUser(
  user: unknown, identity: SessionIdentity, expectedEmail: string,
): void {
  if (!expectedEmail.endsWith('@example.invalid') || !record(user) ||
      user.id !== identity.userId || user.email !== expectedEmail) fail('authenticated-user');
}

export function requireFreshAuthSession(fresh: SessionIdentity, previous: SessionIdentity): void {
  if (fresh.userId !== previous.userId || fresh.authSessionId === previous.authSessionId) fail('session-not-fresh');
}
