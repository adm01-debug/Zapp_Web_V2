import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      refreshSession: authMocks.refreshSession,
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: authMocks.from,
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), error: vi.fn() },
}));

import { AuthService } from '@/services/auth.service';

/**
 * `AuthService.fetchProfile` — retry e visibilidade da falha.
 *
 * Antes: 429/5xx repetiam por padrão e qualquer erro virava `null`,
 * indistinguível de "não existe perfil". Agora:
 *   - SÓ falha transitória (rede `TypeError`, timeout `TimeoutError`) repete
 *     com backoff curto; 4xx/5xx do PostgREST sobem na hora, sem repetir
 *     (repetir banco saturado dobraria a carga);
 *   - esgotadas as retentativas, LANÇA — é isso que o AuthProvider usa para
 *     mostrar "perfil não carregou" com "Tentar de novo" (só transitório vira
 *     `profileUnavailable`);
 *   - `{ data: null, error: null }` (perfil inexistente) devolve `null`;
 *   - token expirado mantém o refresh de sessão.
 */
const montarConsulta = (maybeSingle: ReturnType<typeof vi.fn>) => {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  authMocks.from.mockReturnValue(query);
  return query;
};

describe('AuthService.fetchProfile — retry e falha visível', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('repete falha de rede e devolve o perfil quando uma tentativa funciona', async () => {
    const maybeSingle = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ data: { id: 'profile-1' }, error: null });
    montarConsulta(maybeSingle);

    await expect(AuthService.fetchProfile('user-1')).resolves.toMatchObject({ id: 'profile-1' });
    expect(maybeSingle).toHaveBeenCalledTimes(2);
    expect(authMocks.refreshSession).not.toHaveBeenCalled();
  });

  it('timeout é transitório: repete e, esgotado, lança', async () => {
    const timeout = Object.assign(new Error('Supabase request timed out'), {
      name: 'TimeoutError',
    });
    const maybeSingle = vi.fn().mockRejectedValue(timeout);
    montarConsulta(maybeSingle);

    await expect(AuthService.fetchProfile('user-1')).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    expect(maybeSingle).toHaveBeenCalledTimes(3); // 1 + 2 retentativas
    expect(authMocks.refreshSession).not.toHaveBeenCalled();
  });

  it('5xx sobe na hora sem repetir (1 chamada) e lança', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: { status: 503, message: 'Service Unavailable' } });
    montarConsulta(maybeSingle);

    await expect(AuthService.fetchProfile('user-1')).rejects.toMatchObject({ status: 503 });
    expect(maybeSingle).toHaveBeenCalledTimes(1); // sem retry: repetir banco saturado dobraria a carga
  });

  it('erro de negócio (400) sobe na hora sem repetir (1 chamada)', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: { status: 400, message: 'bad request' } });
    montarConsulta(maybeSingle);

    await expect(AuthService.fetchProfile('user-1')).rejects.toMatchObject({ status: 400 });
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('mantém o refresh de sessão no token expirado e não trata como falha de rede', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } })
      .mockResolvedValueOnce({ data: { id: 'profile-1' }, error: null });
    montarConsulta(maybeSingle);
    authMocks.refreshSession.mockResolvedValue({
      data: { session: { access_token: 'fresh' } },
      error: null,
    });

    await expect(AuthService.fetchProfile('user-1')).resolves.toMatchObject({ id: 'profile-1' });
    expect(authMocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });
});
