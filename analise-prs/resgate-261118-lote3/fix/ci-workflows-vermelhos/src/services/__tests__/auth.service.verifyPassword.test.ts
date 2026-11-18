import { describe, it, expect, vi, beforeEach } from 'vitest';

const { authMocks, serverLoginMock } = vi.hoisted(() => ({
  authMocks: { setSession: vi.fn() },
  serverLoginMock: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: authMocks, from: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ log: { warn: vi.fn(), error: vi.fn() }, createLogger: () => ({ warn: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/serverLogin', () => ({
  serverLogin: (...a: unknown[]) => serverLoginMock(...a),
}));

import { AuthService, NETWORK_BLOCKED_MESSAGE } from '@/services/auth.service';

/**
 * `verifyPassword` é o caminho da reautenticação: confere a senha na Edge e
 * NUNCA troca a sessão — `setSession` com um token AAL1 rebaixava a sessão
 * AAL2 do usuário e o mandava para /2fa.
 */
describe('AuthService.verifyPassword (modo verify, sem trocar a sessão)', () => {
  beforeEach(() => {
    authMocks.setSession.mockReset().mockResolvedValue({ data: {}, error: null });
    serverLoginMock.mockReset();
  });

  it('chama a edge em modo verify e NUNCA faz setSession', async () => {
    serverLoginMock.mockResolvedValue({ ok: true, mode: 'verify' });

    const r = await AuthService.verifyPassword('a@b.co', 'pw');

    expect(serverLoginMock).toHaveBeenCalledWith('a@b.co', 'pw', 'verify');
    expect(authMocks.setSession).not.toHaveBeenCalled();
    expect(r).toEqual({ error: null, via: 'edge', lock: null, unavailable: false });
  });

  it('senha recusada devolve o lock e a mensagem da Edge, sem tocar na sessão', async () => {
    const lock = { isLocked: false, lockedUntil: null, attempts: 3, remainingTime: 0 };
    serverLoginMock.mockResolvedValue({
      ok: false, unavailable: false, error: 'Invalid login credentials', lock,
    });

    const r = await AuthService.verifyPassword('a@b.co', 'pw');

    expect(r.lock).toBe(lock);
    expect(r.error?.message).toBe('Invalid login credentials');
    expect(authMocks.setSession).not.toHaveBeenCalled();
  });

  it('conta travada continua distinguível da senha errada (423)', async () => {
    const lock = { isLocked: true, lockedUntil: new Date(0), attempts: 5, remainingTime: 60 };
    serverLoginMock.mockResolvedValue({ ok: false, unavailable: false, error: 'Account locked', lock });

    const r = await AuthService.verifyPassword('a@b.co', 'pw');

    expect(r.lock?.isLocked).toBe(true);
    expect(r.unavailable).toBe(false);
    expect(r.error?.message).toBe('Account locked');
  });

  it('edge indisponível falha fechada (nunca contorna o lockout pelo cliente)', async () => {
    serverLoginMock.mockResolvedValue({ ok: false, unavailable: true, error: 'auth-login: HTTP 502' });

    const r = await AuthService.verifyPassword('a@b.co', 'pw');

    expect(r).toMatchObject({ via: 'edge', lock: null, unavailable: true });
    expect(r.error?.message).toContain('temporariamente indisponível');
    expect(authMocks.setSession).not.toHaveBeenCalled();
  });

  it('negação da política de rede vira networkBlocked, sem lock e sem sessão', async () => {
    serverLoginMock.mockResolvedValue({
      ok: false, unavailable: false, networkBlocked: true, retryable: false, error: 'Access denied',
    });

    const r = await AuthService.verifyPassword('a@b.co', 'pw');

    expect(r.networkBlocked).toBe(true);
    expect(r.lock).toBeNull();
    expect(r.error?.message).toBe(NETWORK_BLOCKED_MESSAGE);
    expect(authMocks.setSession).not.toHaveBeenCalled();
  });
});
