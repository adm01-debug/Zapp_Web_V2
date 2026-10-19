import { describe, it, expect, vi, beforeEach } from 'vitest';

const { authMocks, serverLoginMock } = vi.hoisted(() => ({
  authMocks: { setSession: vi.fn(), signInWithPassword: vi.fn() },
  serverLoginMock: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: authMocks, from: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ log: { warn: vi.fn(), error: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })} , getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }), createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),}));
vi.mock('@/lib/serverLogin', () => ({ serverLogin: (...a: unknown[]) => serverLoginMock(...a) }));

import { AuthService, NETWORK_BLOCKED_MESSAGE, NETWORK_UNAVAILABLE_MESSAGE } from '@/services/auth.service';

describe('AuthService.signIn (edge auth-login fail-closed)', () => {
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
    expect(r).toEqual({ error: null, via: 'edge', lock: null, unavailable: false });
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

  it('edge indisponivel: falha fechado e nunca contorna o lockout pelo cliente', async () => {
    serverLoginMock.mockResolvedValue({ ok: false, unavailable: true, error: 'auth-login: HTTP 502' });
    const r = await AuthService.signIn('a@b.co', 'pw');
    expect(authMocks.signInWithPassword).not.toHaveBeenCalled();
    expect(r).toMatchObject({ via: 'edge', lock: null, unavailable: true });
    expect(r.error?.message).toContain('temporariamente indisponível');
  });

  it('403 da politica de rede: mensagem clara de rede, sem lock e sem setSession', async () => {
    serverLoginMock.mockResolvedValue({ ok: false, unavailable: false, networkBlocked: true, retryable: false, error: 'Access denied' });
    const r = await AuthService.signIn('a@b.co', 'pw');
    expect(r.networkBlocked).toBe(true);
    expect(r.lock).toBeNull();
    expect(r.unavailable).toBe(false);
    expect(r.error?.message).toBe(NETWORK_BLOCKED_MESSAGE);
    expect(authMocks.setSession).not.toHaveBeenCalled();
    expect(authMocks.signInWithPassword).not.toHaveBeenCalled();
  });

  /**
   * Decisao do dono (15/10): a mensagem de bloqueio NAO pode revelar SE o barrado
   * foi o IP ou o pais — o texto anterior nomeava a categoria. Neutra e legivel:
   * nem detalhe tecnico, nem a mensagem de indisponibilidade reutilizada aqui.
   */
  it('403 da politica de rede: mensagem neutra, sem revelar se foi IP ou pais', async () => {
    serverLoginMock.mockResolvedValue({ ok: false, unavailable: false, networkBlocked: true, retryable: false, error: 'Access denied' });
    const r = await AuthService.signIn('a@b.co', 'pw');
    expect(r.error?.message).toBe('Não foi possível entrar a partir desta rede. Fale com o administrador.');
    expect(r.error?.message).not.toMatch(/IP|pa[íi]s|endere[çc]o|regra|whitelist|blacklist/i);
    expect(r.error?.message).not.toBe(NETWORK_UNAVAILABLE_MESSAGE);
  });

  it('503 da politica de rede: mensagem de rede temporaria (retentavel)', async () => {
    serverLoginMock.mockResolvedValue({ ok: false, unavailable: false, networkBlocked: true, retryable: true, error: 'Service unavailable' });
    const r = await AuthService.signIn('a@b.co', 'pw');
    expect(r.networkBlocked).toBe(true);
    expect(r.unavailable).toBe(false);
    expect(r.error?.message).toBe(NETWORK_UNAVAILABLE_MESSAGE);
  });

  it('423 continua com a contagem de bloqueio, sem virar mensagem de rede', async () => {
    const lock = { isLocked: true, lockedUntil: new Date(0), attempts: 5, remainingTime: 120 };
    serverLoginMock.mockResolvedValue({ ok: false, unavailable: false, error: 'Account locked', lock });
    const r = await AuthService.signIn('a@b.co', 'pw');
    expect(r.lock).toBe(lock);
    expect(r.networkBlocked).toBeFalsy();
    expect(r.error?.message).toBe('Account locked');
  });

  it('429 continua no indisponivel generico, sem virar mensagem de rede', async () => {
    serverLoginMock.mockResolvedValue({ ok: false, unavailable: true, error: 'auth-login: HTTP 429' });
    const r = await AuthService.signIn('a@b.co', 'pw');
    expect(r.unavailable).toBe(true);
    expect(r.networkBlocked).toBeFalsy();
    expect(r.error?.message).toContain('temporariamente indisponível');
  });

  it('401 continua devolvendo "Invalid login credentials" para a tela traduzir', async () => {
    const lock = { isLocked: false, lockedUntil: null, attempts: 3, remainingTime: 0 };
    serverLoginMock.mockResolvedValue({ ok: false, unavailable: false, error: 'Invalid login credentials', lock });
    const r = await AuthService.signIn('a@b.co', 'pw');
    expect(r.error?.message).toBe('Invalid login credentials');
    expect(r.networkBlocked).toBeFalsy();
  });
});
