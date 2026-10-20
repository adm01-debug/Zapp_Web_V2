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

import { usePermissions } from '@/hooks/system/usePermissions';

function makeSelectChain(data: any[] = [], error: any = null) {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data, error }),
      eq: vi.fn().mockResolvedValue({ data, error }),
      in: vi.fn().mockResolvedValue({ data, error }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };
}

describe('usePermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty permissions when no user is logged in', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    mockFrom.mockReturnValue(makeSelectChain());

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.userPermissions).toEqual([]);
    expect(result.current.hasPermission('anything')).toBe(false);
  });

  it('fetches permissions list on mount', async () => {
    const mockPerms = [
      { id: 'p1', name: 'manage_users', description: 'Manage users', category: 'admin' },
      { id: 'p2', name: 'view_reports', description: 'View reports', category: 'reports' },
    ];

    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'permissions') return makeSelectChain(mockPerms);
      if (table === 'role_permissions') return makeSelectChain([]);
      if (table === 'user_roles') return makeSelectChain([]);
      return makeSelectChain();
    });

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.permissions).toHaveLength(2);
  });

  it('hasPermission correctly checks user permissions', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'permissions') return makeSelectChain([{ id: 'p1', name: 'manage_users', category: 'admin' }]);
      if (table === 'user_roles') return makeSelectChain([{ role: 'admin' }]);
      if (table === 'role_permissions') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [{ role: 'admin', permission_id: 'p1', permissions: { name: 'manage_users' } }], error: null }),
            eq: vi.fn().mockResolvedValue({ data: [{ role: 'admin', permission_id: 'p1', permissions: { name: 'manage_users' } }], error: null }),
            in: vi.fn().mockResolvedValue({ data: [{ permissions: { name: 'manage_users' } }], error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
        };
      }
      return makeSelectChain();
    });

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasPermission('manage_users')).toBe(true);
    expect(result.current.hasPermission('nonexistent')).toBe(false);
  });

  it('hasAnyPermission works correctly', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_roles') return makeSelectChain([{ role: 'agent' }]);
      if (table === 'role_permissions') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            in: vi.fn().mockResolvedValue({ data: [{ permissions: { name: 'view_dashboard' } }], error: null }),
          }),
        };
      }
      return makeSelectChain();
    });

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasAnyPermission(['view_dashboard', 'manage_users'])).toBe(true);
    expect(result.current.hasAnyPermission(['manage_users', 'delete_all'])).toBe(false);
  });

  it('hasAllPermissions works correctly', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_roles') return makeSelectChain([{ role: 'admin' }]);
      if (table === 'role_permissions') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            in: vi.fn().mockResolvedValue({ data: [
              { permissions: { name: 'view_dashboard' } },
              { permissions: { name: 'manage_users' } },
            ], error: null }),
          }),
        };
      }
      return makeSelectChain();
    });

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasAllPermissions(['view_dashboard', 'manage_users'])).toBe(true);
    expect(result.current.hasAllPermissions(['view_dashboard', 'nonexistent'])).toBe(false);
  });
});
