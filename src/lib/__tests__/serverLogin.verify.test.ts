import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
}));

import { serverLogin } from '@/lib/serverLogin';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function bodyOf(init: RequestInit) {
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

/**
 * Modo `verify` do endpoint: valida a senha SEM emitir sessão. É o que permite
 * reautenticar sem trocar a sessão corrente (a troca rebaixava AAL2 -> AAL1).
 */
describe('serverLogin (modo verify)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('manda mode:verify no corpo e devolve a confirmação SEM tokens', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    const r = await serverLogin('a@b.co', 'secret', 'verify');

    expect(r).toEqual({ ok: true, mode: 'verify' });
    expect(bodyOf(fetchMock.mock.calls[0][1])).toMatchObject({
      email: 'a@b.co',
      password: 'secret',
      mode: 'verify',
    });
  });

  it('login (default) segue sem a chave mode e devolve os tokens', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { access_token: 'at', refresh_token: 'rt' }));

    const r = await serverLogin('a@b.co', 'secret');

    expect(r).toEqual({ ok: true, accessToken: 'at', refreshToken: 'rt' });
    expect(bodyOf(fetchMock.mock.calls[0][1])).not.toHaveProperty('mode');
  });

  it('verify: 200 sem confirmação falha fechado, nunca vira senha aceita', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    const r = await serverLogin('a@b.co', 'secret', 'verify');

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.unavailable).toBe(true);
  });

  it('verify: recusa 401 preserva o lock (mesma trilha do login)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, {
      error: 'Invalid login credentials', isLocked: false, lockedUntil: null, attempts: 2, remainingTime: 0,
    }));

    const r = await serverLogin('a@b.co', 'x', 'verify');

    expect(r).toEqual({
      ok: false, unavailable: false, error: 'Invalid login credentials',
      lock: { isLocked: false, lockedUntil: null, attempts: 2, remainingTime: 0 },
    });
  });

  it('verify: 423 devolve a conta travada com lockedUntil como Date', async () => {
    fetchMock.mockResolvedValue(jsonResponse(423, {
      error: 'Account locked', isLocked: true, lockedUntil: '2026-09-05T10:00:00.000Z', attempts: 5, remainingTime: 120,
    }));

    const r = await serverLogin('a@b.co', 'x', 'verify');

    expect(r.ok).toBe(false);
    if (r.ok || r.unavailable) throw new Error('esperava recusa com lock');
    expect(r.lock.isLocked).toBe(true);
    expect(r.lock.lockedUntil).toEqual(new Date('2026-09-05T10:00:00.000Z'));
  });
});
