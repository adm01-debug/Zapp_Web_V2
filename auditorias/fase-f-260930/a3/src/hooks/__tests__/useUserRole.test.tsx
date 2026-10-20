// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

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

// Mock useAuth to return controlled user
const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: any) => children,
}));

import { useUserRole } from '@/hooks/system/useUserRole';

describe('useUserRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty roles when no user is logged in', async () => {
    mockUseAuth.mockReturnValue({ user: null, session: null, profile: null, loading: false });

    const { result } = renderHook(() => useUserRole(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.roles).toEqual([]);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isSupervisor).toBe(false);
  });

  it('fetches and returns user roles correctly', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      session: {},
      profile: null,
      loading: false,
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { id: '1', user_id: 'user-1', role: 'admin' },
            { id: '2', user_id: 'user-1', role: 'supervisor' },
          ],
          error: null,
        }),
      }),
    });

    const { result } = renderHook(() => useUserRole(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.roles).toContain('admin');
    expect(result.current.roles).toContain('supervisor');
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isSupervisor).toBe(true);
  });

  it('hasRole returns correct values', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      session: {},
      profile: null,
      loading: false,
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: '1', user_id: 'user-1', role: 'agent' }],
          error: null,
        }),
      }),
    });

    const { result } = renderHook(() => useUserRole(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasRole('agent')).toBe(true);
    expect(result.current.hasRole('admin')).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isSupervisor).toBe(false);
  });

  it('supervisor role implies isSupervisor=true but not isAdmin', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      session: {},
      profile: null,
      loading: false,
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: '1', user_id: 'user-1', role: 'supervisor' }],
          error: null,
        }),
      }),
    });

    const { result } = renderHook(() => useUserRole(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isSupervisor).toBe(true);
    expect(result.current.isAdmin).toBe(false);
  });
});
