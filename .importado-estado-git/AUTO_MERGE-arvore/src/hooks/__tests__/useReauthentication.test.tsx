import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockGetUser, mockSetSession, mockServerLogin } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSetSession: vi.fn(),
  mockServerLogin: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      setSession: (...args: unknown[]) => mockSetSession(...args),
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

describe('useReauthentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetSession.mockResolvedValue({ data: {}, error: null });
  });

  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useReauthentication());

    expect(result.current.isReauthenticating).toBe(false);
    expect(result.current.showReauthDialog).toBe(false);
    expect(result.current.pendingAction).toBeNull();
  });

  it('reauthenticate succeeds with correct password', async () => {
    userOk();
    mockServerLogin.mockResolvedValue({
      ok: true,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('correctpass');
    });

    expect(reauthResult).toMatchObject({ success: true });
    expect(mockServerLogin).toHaveBeenCalledWith('test@example.com', 'correctpass');
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
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
    mockServerLogin.mockResolvedValue({
      ok: true,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

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
    mockServerLogin.mockResolvedValue({
      ok: true,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

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
