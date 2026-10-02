import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
}));

import { serverLogin } from '@/lib/serverLogin';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('serverLogin', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('chama a edge auth-login com apikey/bearer anon e devolve os tokens', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600 }));
    const r = await serverLogin('a@b.co', 'secret');
    expect(r).toEqual({ ok: true, accessToken: 'at', refreshToken: 'rt' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co/functions/v1/auth-login?forceFunctionRegion=us-west-2');
    expect(init.headers.apikey).toBe('anon-key');
    expect(init.headers.Authorization).toBe('Bearer anon-key');
    expect(JSON.parse(init.body)).toMatchObject({ email: 'a@b.co', password: 'secret' });
  });

  it('fixa a regiao us-west-2 na invocacao (banco/GoTrue vivem la — T06)', async () => {
    // O auth-login faz ~5 round-trips ao banco/GoTrue. Sem o pin a edge roda na
    // regiao do usuario (sa-east-1 no Brasil) e cada salto cruza o continente:
    // p50 medido 925ms em sa-east-1 contra 101ms em us-east-1 (T06).
    fetchMock.mockResolvedValue(jsonResponse(200, { access_token: 'at', refresh_token: 'rt' }));
    await serverLogin('a@b.co', 'secret');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('forceFunctionRegion=us-west-2');
    // x-region exigiria liberar o header no preflight CORS (getCorsHeaders lista
    // os headers permitidos); o query param e o caminho documentado para browser.
    expect(init.headers['x-region']).toBeUndefined();
  });

  it('401 devolve a recusa com o estado do lock', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, {
      error: 'Invalid login credentials', isLocked: false, lockedUntil: null, attempts: 3, remainingTime: 0,
    }));
    const r = await serverLogin('a@b.co', 'x');
    expect(r).toEqual({
      ok: false, unavailable: false, error: 'Invalid login credentials',
      lock: { isLocked: false, lockedUntil: null, attempts: 3, remainingTime: 0 },
    });
  });

  it('423 devolve conta travada com lockedUntil como Date', async () => {
    fetchMock.mockResolvedValue(jsonResponse(423, {
      error: 'Account locked', isLocked: true, lockedUntil: '2026-09-05T10:00:00.000Z', attempts: 5, remainingTime: 120,
    }));
    const r = await serverLogin('a@b.co', 'x');
    expect(r.ok).toBe(false);
    if (r.ok || r.unavailable) throw new Error('esperava recusa com lock');
    expect(r.lock.isLocked).toBe(true);
    expect(r.lock.lockedUntil).toEqual(new Date('2026-09-05T10:00:00.000Z'));
    expect(r.lock.remainingTime).toBe(120);
  });

  it.each([
    ['rede', () => { throw new TypeError('Failed to fetch'); }],
    ['5xx', () => jsonResponse(500, { error: 'Internal error' })],
    ['429', () => jsonResponse(429, { error: 'Rate limit exceeded' })],
    ['200 sem tokens', () => jsonResponse(200, { ok: true })],
    ['corpo nao-JSON', () => new Response('<html>', { status: 502 })],
  ])('%s vira unavailable para o chamador cair no signInWithPassword', async (_name, impl) => {
    fetchMock.mockImplementation(async () => impl());
    const r = await serverLogin('a@b.co', 'x');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.unavailable).toBe(true);
  });
});
