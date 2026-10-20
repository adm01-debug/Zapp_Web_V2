import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockFrom = vi.fn();
const mockInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    functions: { invoke: (...args: any[]) => mockInvoke(...args) },
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: any) => children,
}));

import { useWebAuthn } from '@/hooks/auth/useWebAuthn';

describe('useWebAuthn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null });
  });

  it('initializes with empty passkeys', () => {
    const { result } = renderHook(() => useWebAuthn());
    expect(result.current.passkeys).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('isSupported checks for PublicKeyCredential', () => {
    const { result } = renderHook(() => useWebAuthn());
    // In jsdom, PublicKeyCredential is not defined
    expect(result.current.isSupported()).toBe(false);
  });

  it('registerPasskey requires user to be logged in', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useWebAuthn());

    let res: any;
    await act(async () => {
      res = await result.current.registerPasskey('My Key');
    });

    expect(res.success).toBe(false);
  });

  it('registerPasskey fails when WebAuthn not supported', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', email: 'test@test.com' } });
    const { result } = renderHook(() => useWebAuthn());

    let res: any;
    await act(async () => {
      res = await result.current.registerPasskey('My Key');
    });

    expect(res.success).toBe(false);
  });

  it('authenticateWithPasskey fails when WebAuthn not supported', async () => {
    const { result } = renderHook(() => useWebAuthn());

    let res: any;
    await act(async () => {
      res = await result.current.authenticateWithPasskey('test@test.com');
    });

    expect(res.success).toBe(false);
  });

  it('deletePasskey requires user to be logged in', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useWebAuthn());

    let res: any;
    await act(async () => {
      res = await result.current.deletePasskey('passkey-1');
    });

    expect(res.success).toBe(false);
  });

  it('deletePasskey calls supabase with correct params', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useWebAuthn());

    let res: any;
    await act(async () => {
      res = await result.current.deletePasskey('passkey-1');
    });

    expect(res.success).toBe(true);
  });

  it('renamePasskey requires user', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useWebAuthn());

    let res: any;
    await act(async () => {
      res = await result.current.renamePasskey('pk-1', 'New Name');
    });

    expect(res.success).toBe(false);
  });

  it('renamePasskey updates name correctly', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useWebAuthn());

    let res: any;
    await act(async () => {
      res = await result.current.renamePasskey('pk-1', 'Updated Key');
    });

    expect(res.success).toBe(true);
  });

  it('fetchPasskeys does nothing when no user', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useWebAuthn());

    await act(async () => {
      await result.current.fetchPasskeys();
    });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result.current.passkeys).toEqual([]);
  });

  it('fetchPasskeys returns passkeys for logged-in user', async () => {
    const mockPasskeys = [
      { id: 'pk-1', credential_id: 'cred-1', friendly_name: 'iPhone', device_type: 'platform', created_at: '2024-01-01', last_used_at: null },
    ];

    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockPasskeys, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useWebAuthn());

    await act(async () => {
      await result.current.fetchPasskeys();
    });

    expect(result.current.passkeys).toEqual(mockPasskeys);
  });
});
