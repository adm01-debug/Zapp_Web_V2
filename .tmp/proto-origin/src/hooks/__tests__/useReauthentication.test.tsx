import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockGetUser, mockSetSession, mockServerLogin, mockGetAal, mockListFactors, mockChallenge, mockVerify } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSetSession: vi.fn(),
  mockServerLogin: vi.fn(),
  mockGetAal: vi.fn(),
  mockListFactors: vi.fn(),
  mockChallenge: vi.fn(),
  mockVerify: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      setSession: (...args: unknown[]) => mockSetSession(...args),
      mfa: {
        getAuthenticatorAssuranceLevel: (...args: unknown[]) => mockGetAal(...args),
        listFactors: (...args: unknown[]) => mockListFactors(...args),
        challenge: (...args: unknown[]) => mockChallenge(...args),
        verify: (...args: unknown[]) => mockVerify(...args),
      },
    },
  },
}));

vi.mock('@/lib/serverLogin', () => ({
  serverLogin: (...args: unknown[]) => mockServerLogin(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from 'sonner';
import { useReauthentication } from '@/hooks/auth/useReauthentication';

const userOk = () => mockGetUser.mockResolvedValue({ data: { user: { email: 'test@example.com' } } });

/** Sessão sem segundo fator: nada a pedir além da senha. */
const semMfa = () => {
  mockGetAal.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
    error: null,
  });
  mockListFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });
};

/** Sessão com TOTP verificado e ainda em AAL1: a senha sozinha não basta. */
const totpPendente = () => {
  mockGetAal.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] },
    error: null,
  });
  mockListFactors.mockResolvedValue({
    data: { totp: [{ id: 'fator-1', status: 'verified' }], all: [{ id: 'fator-1', status: 'verified' }] },
    error: null,
  });
};

/** Sessão já em AAL2 (o caso que a reautenticação antiga rebaixava). */
const jaEmAal2 = () => {
  mockGetAal.mockResolvedValue({
    data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [{ method: 'totp' }] },
    error: null,
  });
  mockListFactors.mockResolvedValue({
    data: { totp: [{ id: 'fator-1', status: 'verified' }], all: [{ id: 'fator-1', status: 'verified' }] },
    error: null,
  });
};

describe('useReauthentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetSession.mockResolvedValue({ data: {}, error: null });
    mockChallenge.mockResolvedValue({ data: { id: 'desafio-1' }, error: null });
    mockVerify.mockResolvedValue({ data: { access_token: 'novo' }, error: null });
    semMfa();
  });

  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useReauthentication());

    expect(result.current.isReauthenticating).toBe(false);
    expect(result.current.showReauthDialog).toBe(false);
    expect(result.current.pendingAction).toBeNull();
  });

  it('reauthenticate succeeds with correct password', async () => {
    userOk();
    mockServerLogin.mockResolvedValue({ ok: true, mode: 'verify' });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('correctpass');
    });

    expect(reauthResult).toMatchObject({ success: true });
    // A senha é conferida na Edge em modo verify...
    expect(mockServerLogin).toHaveBeenCalledWith('test@example.com', 'correctpass', 'verify');
    // ...e a sessão CORRENTE não é trocada por outra (era isso que rebaixava AAL2).
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(result.current.isReauthenticating).toBe(false);
  });

  it('reauthenticate keeps AAL2 untouched when the session is already elevated', async () => {
    userOk();
    jaEmAal2();
    mockServerLogin.mockResolvedValue({ ok: true, mode: 'verify' });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('correctpass');
    });

    expect(reauthResult).toMatchObject({ success: true });
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockChallenge).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('reauthenticate asks for the authenticator code when TOTP is pending', async () => {
    userOk();
    totpPendente();
    mockServerLogin.mockResolvedValue({ ok: true, mode: 'verify' });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; error?: string; motivo?: string; precisaCodigo?: boolean } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('correctpass');
    });

    expect(reauthResult).toMatchObject({
      success: false,
      motivo: 'codigo_necessario',
      precisaCodigo: true,
    });
    // Sem código não há desafio: nada de gastar tentativa do TOTP à toa.
    expect(mockChallenge).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('reauthenticate never leaves the loading stuck (code request and failure paths)', async () => {
    userOk();
    totpPendente();
    let liberar!: (value: { ok: true; mode: 'verify' }) => void;
    mockServerLogin.mockReturnValue(new Promise((resolve) => { liberar = resolve; }));

    const { result } = renderHook(() => useReauthentication());

    let emCurso: Promise<{ success: boolean }> | undefined;
    act(() => {
      emCurso = result.current.reauthenticate('correctpass');
    });
    expect(result.current.isReauthenticating).toBe(true);

    await act(async () => {
      liberar({ ok: true, mode: 'verify' });
      await emCurso;
    });
    expect(result.current.isReauthenticating).toBe(false);
  });

  it('reauthenticate elevates the current session with the right code', async () => {
    userOk();
    totpPendente();
    mockServerLogin.mockResolvedValue({ ok: true, mode: 'verify' });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; error?: string; motivo?: string } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('correctpass', '123456');
    });

    expect(reauthResult).toMatchObject({ success: true });
    expect(mockChallenge).toHaveBeenCalledWith({ factorId: 'fator-1' });
    expect(mockVerify).toHaveBeenCalledWith({
      factorId: 'fator-1',
      challengeId: 'desafio-1',
      code: '123456',
    });
    // Elevar usa a sessão corrente — de novo, nada de setSession.
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('reauthenticate reports a wrong code apart from a wrong password', async () => {
    userOk();
    totpPendente();
    mockServerLogin.mockResolvedValue({ ok: true, mode: 'verify' });
    mockVerify.mockResolvedValue({ data: null, error: { message: 'invalid code' } });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; error?: string; motivo?: string; precisaCodigo?: boolean } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('correctpass', '000000');
    });

    expect(reauthResult).toMatchObject({
      success: false,
      motivo: 'codigo_incorreto',
      precisaCodigo: true,
    });
  });

  it('reauthenticate never sends a malformed code to the network', async () => {
    userOk();
    totpPendente();
    mockServerLogin.mockResolvedValue({ ok: true, mode: 'verify' });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; motivo?: string } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('correctpass', '12');
    });

    expect(reauthResult).toMatchObject({ success: false, motivo: 'codigo_necessario' });
    expect(mockChallenge).not.toHaveBeenCalled();
  });

  it('reauthenticate fails closed when the MFA level cannot be read', async () => {
    userOk();
    mockServerLogin.mockResolvedValue({ ok: true, mode: 'verify' });
    mockGetAal.mockResolvedValue({ data: null, error: { message: 'offline' } });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; motivo?: string } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('correctpass');
    });

    expect(reauthResult).toMatchObject({ success: false, motivo: 'indisponivel' });
    expect(mockChallenge).not.toHaveBeenCalled();
  });

  it('reauthenticate fails closed when AAL2 is due but no verified factor is found', async () => {
    userOk();
    mockServerLogin.mockResolvedValue({ ok: true, mode: 'verify' });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] },
      error: null,
    });
    mockListFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; motivo?: string } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('correctpass', '123456');
    });

    expect(reauthResult).toMatchObject({ success: false, motivo: 'indisponivel' });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('reauthenticate fails with incorrect password and classifies the reason', async () => {
    userOk();
    mockServerLogin.mockResolvedValue({
      ok: false,
      unavailable: false,
      error: 'Invalid credentials',
      lock: null,
    });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; error?: string; motivo?: string } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('wrongpass');
    });

    expect(reauthResult).toMatchObject({
      success: false,
      error: 'Senha incorreta',
      motivo: 'senha_incorreta',
    });
  });

  it('reauthenticate preserves an auth-edge outage instead of reporting a wrong password', async () => {
    userOk();
    mockServerLogin.mockResolvedValue({
      ok: false,
      unavailable: true,
      error: 'auth-login: HTTP 503',
    });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; error?: string; motivo?: string } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('correctpass');
    });

    expect(reauthResult).toMatchObject({
      success: false,
      error: 'Reautenticação temporariamente indisponível. Tente novamente em instantes.',
      motivo: 'indisponivel',
    });
  });

  it('reauthenticate classifies a locked account apart from a wrong password', async () => {
    userOk();
    mockServerLogin.mockResolvedValue({
      ok: false,
      unavailable: false,
      error: 'Account locked',
      lock: { isLocked: true, lockedUntil: null, attempts: 5, remainingTime: 60 },
    });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; error?: string; motivo?: string } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('correctpass');
    });

    expect(reauthResult).toMatchObject({
      success: false,
      error: 'Conta temporariamente bloqueada. Tente novamente mais tarde.',
      motivo: 'conta_bloqueada',
    });
  });

  it('reauthenticate falls back to a network reason when getUser throws', async () => {
    mockGetUser.mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; error?: string; motivo?: string } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('anypass');
    });

    expect(reauthResult).toMatchObject({
      success: false,
      error: 'Não foi possível verificar agora. Confira sua conexão e tente novamente.',
      motivo: 'rede',
    });
    expect(result.current.isReauthenticating).toBe(false);
  });

  it('reauthenticate fails when no user found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('anypass');
    });

    expect(reauthResult).toMatchObject({ success: false, error: 'Usuário não encontrado' });
  });

  it('requireReauth sets pending action and shows dialog', () => {
    const { result } = renderHook(() => useReauthentication());

    act(() => {
      result.current.requireReauth('change_password', async () => {});
    });

    expect(result.current.showReauthDialog).toBe(true);
    expect(result.current.pendingAction).toBe('change_password');
  });

  it('cancelReauth resets state', () => {
    const { result } = renderHook(() => useReauthentication());

    act(() => {
      result.current.requireReauth('delete_account', async () => {});
    });

    expect(result.current.showReauthDialog).toBe(true);

    act(() => {
      result.current.cancelReauth();
    });

    expect(result.current.showReauthDialog).toBe(false);
    expect(result.current.pendingAction).toBeNull();
  });

  it('getActionLabel returns correct labels', () => {
    const { result } = renderHook(() => useReauthentication());

    expect(result.current.getActionLabel('change_password')).toBe('Alterar Senha');
    expect(result.current.getActionLabel('change_email')).toBe('Alterar Email');
    expect(result.current.getActionLabel('configure_mfa')).toBe('Configurar MFA');
    expect(result.current.getActionLabel('admin_action')).toBe('Ação Administrativa');
    expect(result.current.getActionLabel('delete_account')).toBe('Excluir Conta');
  });

  it('confirmReauth executes callback and returns ok on success', async () => {
    userOk();
    mockServerLogin.mockResolvedValue({ ok: true, mode: 'verify' });

    const callback = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useReauthentication());

    act(() => {
      result.current.requireReauth('change_password', callback);
    });

    let outcome: { ok: boolean; motivo?: string; mensagem?: string } | undefined;
    await act(async () => {
      outcome = await result.current.confirmReauth('correctpass');
    });

    expect(outcome).toEqual({ ok: true });
    expect(callback).toHaveBeenCalled();
    expect(result.current.showReauthDialog).toBe(false);
    expect(result.current.pendingAction).toBeNull();
  });

  it('confirmReauth returns the code request so the dialog can ask for it', async () => {
    userOk();
    totpPendente();
    mockServerLogin.mockResolvedValue({ ok: true, mode: 'verify' });

    const callback = vi.fn();
    const { result } = renderHook(() => useReauthentication());

    act(() => {
      result.current.requireReauth('change_password', callback);
    });

    let outcome: { ok: boolean; motivo?: string; mensagem?: string; precisaCodigo?: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.confirmReauth('correctpass');
    });

    expect(outcome).toMatchObject({ ok: false, motivo: 'codigo_necessario', precisaCodigo: true });
    // O diálogo continua aberto para o usuário digitar o código.
    expect(result.current.showReauthDialog).toBe(true);
    expect(callback).not.toHaveBeenCalled();
  });

  it('confirmReauth completes the action once the code is right', async () => {
    userOk();
    totpPendente();
    mockServerLogin.mockResolvedValue({ ok: true, mode: 'verify' });

    const callback = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useReauthentication());

    act(() => {
      result.current.requireReauth('change_password', callback);
    });

    let outcome: { ok: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.confirmReauth('correctpass', '123456');
    });

    expect(outcome).toEqual({ ok: true });
    expect(callback).toHaveBeenCalled();
    expect(result.current.showReauthDialog).toBe(false);
  });

  it('confirmReauth returns the blocked reason instead of a wrong password', async () => {
    userOk();
    mockServerLogin.mockResolvedValue({
      ok: false,
      unavailable: false,
      error: 'Account locked',
      lock: { isLocked: true, lockedUntil: null, attempts: 5, remainingTime: 60 },
    });

    const callback = vi.fn();
    const { result } = renderHook(() => useReauthentication());

    act(() => {
      result.current.requireReauth('change_password', callback);
    });

    let outcome: { ok: boolean; motivo?: string; mensagem?: string } | undefined;
    await act(async () => {
      outcome = await result.current.confirmReauth('correctpass');
    });

    expect(outcome).toEqual({
      ok: false,
      motivo: 'conta_bloqueada',
      mensagem: 'Conta temporariamente bloqueada. Tente novamente mais tarde.',
    });
    expect(callback).not.toHaveBeenCalled();
    expect(result.current.showReauthDialog).toBe(true);
  });

  it('confirmReauth returns the unavailable reason when the edge is down', async () => {
    userOk();
    mockServerLogin.mockResolvedValue({ ok: false, unavailable: true, error: 'auth-login: HTTP 503' });

    const { result } = renderHook(() => useReauthentication());

    let outcome: { ok: boolean; motivo?: string; mensagem?: string } | undefined;
    await act(async () => {
      outcome = await result.current.confirmReauth('correctpass');
    });

    expect(outcome).toEqual({
      ok: false,
      motivo: 'indisponivel',
      mensagem: 'Reautenticação temporariamente indisponível. Tente novamente em instantes.',
    });
  });

  it('confirmReauth keeps the action failure out of the password field', async () => {
    userOk();
    mockServerLogin.mockResolvedValue({ ok: true, mode: 'verify' });

    const callback = vi.fn().mockRejectedValue(new Error('Falha ao salvar'));
    const { result } = renderHook(() => useReauthentication());

    act(() => {
      result.current.requireReauth('change_password', callback);
    });

    let outcome: { ok: boolean; motivo?: string; mensagem?: string } | undefined;
    await act(async () => {
      outcome = await result.current.confirmReauth('correctpass');
    });

    // Reautenticou: a falha é da AÇÃO. O diálogo fecha com ok e o erro vira um
    // toast único — nunca 'Senha incorreta' no campo.
    expect(outcome).toEqual({ ok: true });
    expect(result.current.showReauthDialog).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Falha ao salvar');
  });
});
