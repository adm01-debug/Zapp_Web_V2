import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: authMocks.from,
  },
}));

vi.mock('@/lib/logger', () => ({ log: { warn: vi.fn(), error: vi.fn() } }));

import { AuthService } from '@/services/auth.service';

/**
 * `AuthService.fetchProfile` (PE-14) — o perfil não some da tela por um blip.
 *
 * Antes da correção um erro de rede virava `null` na primeira tentativa, igual a
 * "usuário sem perfil"; agora a leitura do perfil repete falha transitória
 * (rede, 429, 5xx) com backoff de 300/600 ms e, esgotadas as tentativas, LANÇA —
 * é o lançamento que o AuthProvider usa para marcar o perfil como indisponível.
 * Erro de negócio continua devolvendo `null`, e o token expirado continua indo
 * pelo refresh de sessão.
 *
 * O mock está na fronteira (o cliente do Supabase e o logger), nunca no alvo:
 * `fetchProfile` e a montagem da consulta rodam de verdade.
 */

const montarConsulta = (maybeSingle: ReturnType<typeof vi.fn>) => {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  authMocks.from.mockReturnValue(query);
};

describe('AuthService.fetchProfile — recuperação e falha visível', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('recupera depois de uma falha de rede e devolve o perfil', async () => {
    const maybeSingle = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ data: { id: 'profile-1' }, error: null });
    montarConsulta(maybeSingle);

    const promessa = AuthService.fetchProfile('user-1');
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(promessa).resolves.toMatchObject({ id: 'profile-1' });
    expect(maybeSingle).toHaveBeenCalledTimes(2);
    expect(authMocks.refreshSession).not.toHaveBeenCalled();
  });

  it('recupera depois de um 503 e devolve o perfil', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { status: 503, message: 'Service Unavailable' } })
      .mockResolvedValueOnce({ data: { id: 'profile-1' }, error: null });
    montarConsulta(maybeSingle);

    const promessa = AuthService.fetchProfile('user-1');
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(promessa).resolves.toMatchObject({ id: 'profile-1' });
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it('respeita o backoff de 300 ms e 600 ms entre as tentativas', async () => {
    const maybeSingle = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    montarConsulta(maybeSingle);

    const promessa = AuthService.fetchProfile('user-1');
    const falha = expect(promessa).rejects.toBeInstanceOf(TypeError);

    // 1ª tentativa já aconteceu; ela não pode se repetir antes de 300 ms.
    await vi.advanceTimersByTimeAsync(299);
    expect(maybeSingle).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(maybeSingle).toHaveBeenCalledTimes(2);

    // 2ª retentativa só depois de outros 600 ms.
    await vi.advanceTimersByTimeAsync(599);
    expect(maybeSingle).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(maybeSingle).toHaveBeenCalledTimes(3);

    await falha;
    expect(maybeSingle).toHaveBeenCalledTimes(3); // 1 tentativa + 2 retentativas
  });

  it('esgotadas as retentativas, lança a falha transitória (não devolve null)', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: { status: 503, message: 'Service Unavailable' } });
    montarConsulta(maybeSingle);

    const promessa = AuthService.fetchProfile('user-1');
    const falha = expect(promessa).rejects.toMatchObject({ status: 503 });

    await vi.advanceTimersByTimeAsync(1_000);
    await falha;

    expect(maybeSingle).toHaveBeenCalledTimes(3);
  });

  it('erro de negócio (400) devolve null sem repetir', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: { status: 400, message: 'bad request' } });
    montarConsulta(maybeSingle);

    await expect(AuthService.fetchProfile('user-1')).resolves.toBeNull();
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('perfil realmente inexistente continua devolvendo null', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    montarConsulta(maybeSingle);

    await expect(AuthService.fetchProfile('user-1')).resolves.toBeNull();
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });
});
