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
 * Antes: qualquer erro virava `null`, indistinguível de "não existe perfil", e
 * um blip de rede apagava o perfil da tela sem explicação. Agora:
 *   - falha transitória (rede, 429, 5xx) repete com backoff curto;
 *   - esgotadas as retentativas, LANÇA — é isso que o AuthProvider usa para
 *     mostrar "perfil não carregou" com "Tentar de novo";
 *   - erro não transitório continua devolvendo `null` (não é falha de rede);
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

  it('esgota as retentativas e lança em 5xx (não devolve null)', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: { status: 503, message: 'Service Unavailable' } });
    montarConsulta(maybeSingle);

    await expect(AuthService.fetchProfile('user-1')).rejects.toMatchObject({ status: 503 });
    expect(maybeSingle).toHaveBeenCalledTimes(3); // 1 + 2 retentativas
  });

  it('não repete erro de negócio (400) e devolve null', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: { status: 400, message: 'bad request' } });
    montarConsulta(maybeSingle);

    await expect(AuthService.fetchProfile('user-1')).resolves.toBeNull();
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
