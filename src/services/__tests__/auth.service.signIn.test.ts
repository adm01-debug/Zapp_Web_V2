import { describe, it, expect, vi, beforeEach } from 'vitest';

const { authMocks, serverLoginMock } = vi.hoisted(() => ({
  authMocks: { setSession: vi.fn(), signInWithPassword: vi.fn() },
  serverLoginMock: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: authMocks, from: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ log: { warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/serverLogin', () => ({ serverLogin: (...a: unknown[]) => serverLoginMock(...a) }));

import { AuthService } from '@/services/auth.service';

describe('AuthService.signIn (edge auth-login com fallback)', () => {
  beforeEach(() => {
    authMocks.setSession.mockReset().mockResolvedValue({ data: {}, error: null });
    authMocks.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
    serverLoginMock.mockReset();
  });

  it('edge aceitou: faz setSession com os tokens e nao chama signInWithPassword', async () => {
    serverLoginMock.mockResolvedValue({ ok: true, accessToken: 'at', refreshToken: 'rt' });
    const r = await AuthService.signIn('a@b.co', 'pw');
    expect(authMocks.setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' });
    expect(authMocks.signInWithPassword).not.toHaveBeenCalled();
    expect(r).toEqual({ error: null, via: 'edge', lock: null });
  });

  it('edge recusou: devolve o erro e o lock, sem tocar no GoTrue pelo cliente', async () => {
    const lock = { isLocked: true, lockedUntil: new Date(0), attempts: 5, remainingTime: 60 };
    serverLoginMock.mockResolvedValue({ ok: false, unavailable: false, error: 'Account locked', lock });
    const r = await AuthService.signIn('a@b.co', 'pw');
    expect(authMocks.signInWithPassword).not.toHaveBeenCalled();
    expect(authMocks.setSession).not.toHaveBeenCalled();
    expect(r.via).toBe('edge');
    expect(r.error?.message).toBe('Account locked');
    expect(r.lock).toBe(lock);
  });

  it('edge indisponivel: cai no signInWithPassword direto (comportamento anterior)', async () => {
    serverLoginMock.mockResolvedValue({ ok: false, unavailable: true, error: 'auth-login: HTTP 502' });
    const err = new Error('Invalid login credentials');
    authMocks.signInWithPassword.mockResolvedValue({ data: {}, error: err });
    const r = await AuthService.signIn('a@b.co', 'pw');
    expect(authMocks.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw' });
    expect(r).toEqual({ error: err, via: 'direct', lock: null });
  });
});
