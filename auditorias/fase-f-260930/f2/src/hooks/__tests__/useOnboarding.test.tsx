// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useOnboarding } from '@/hooks/ui/useOnboarding';

describe('useOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('returns loading=false when no user', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('checks localStorage first for completed onboarding', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    localStorage.setItem('onboarding_completed_u1', 'true');

    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(true);
  });

  it('checks database when localStorage is empty', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 's1' }, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(true);
  });

  it('returns false when user has no settings', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  it('defaults to completed on database error', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockRejectedValue(new Error('DB error')),
        }),
      }),
    });

    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(true);
  });

  it('exposes completeOnboarding function', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.completeOnboarding).toBe('function');
  });
});
