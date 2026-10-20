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

import { useReauthentication } from '@/hooks/auth/useReauthentication';

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
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'test@example.com' } },
    });
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

  it('reauthenticate fails with incorrect password', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'test@example.com' } },
    });
    mockServerLogin.mockResolvedValue({
      ok: false,
      unavailable: false,
      error: 'Invalid credentials',
      lock: null,
    });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('wrongpass');
    });

    expect(reauthResult).toMatchObject({ success: false, error: 'Senha incorreta' });
  });

  it('reauthenticate preserves an auth-edge outage instead of reporting a wrong password', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'test@example.com' } },
    });
    mockServerLogin.mockResolvedValue({
      ok: false,
      unavailable: true,
      error: 'auth-login: HTTP 503',
    });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('correctpass');
    });

    expect(reauthResult).toMatchObject({
      success: false,
      error: 'Reautenticação temporariamente indisponível. Tente novamente em instantes.',
    });
  });

  it('reauthenticate fails when no user found', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
    });

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

  it('confirmReauth executes callback on success', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'test@example.com' } },
    });
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

    let confirmResult: boolean = false;
    await act(async () => {
      confirmResult = await result.current.confirmReauth('correctpass');
    });

    expect(confirmResult).toBe(true);
    expect(callback).toHaveBeenCalled();
    expect(result.current.showReauthDialog).toBe(false);
    expect(result.current.pendingAction).toBeNull();
  });
});
