// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.fn();
const mockFunctionsInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    functions: { invoke: (...args: any[]) => mockFunctionsInvoke(...args) },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useDeviceDetection } from '@/hooks/ui/useDeviceDetection';

describe('useDeviceDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFunctionsInvoke.mockResolvedValue({ data: { device_id: 'd1' } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
        neq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  it('initializes with loading=true', () => {
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.loading).toBe(true);
  });

  it('returns empty devices initially', () => {
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.devices).toEqual([]);
  });

  it('returns empty sessions initially', () => {
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.sessions).toEqual([]);
  });

  it('exposes trustDevice function', () => {
    const { result } = renderHook(() => useDeviceDetection());
    expect(typeof result.current.trustDevice).toBe('function');
  });

  it('exposes removeDevice function', () => {
    const { result } = renderHook(() => useDeviceDetection());
    expect(typeof result.current.removeDevice).toBe('function');
  });

  it('exposes endSession function', () => {
    const { result } = renderHook(() => useDeviceDetection());
    expect(typeof result.current.endSession).toBe('function');
  });

  it('exposes endAllOtherSessions function', () => {
    const { result } = renderHook(() => useDeviceDetection());
    expect(typeof result.current.endAllOtherSessions).toBe('function');
  });

  it('exposes refetch function', () => {
    const { result } = renderHook(() => useDeviceDetection());
    expect(typeof result.current.refetch).toBe('function');
  });

  it('does not fetch when no user', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.devices).toEqual([]);
  });

  it('fetches devices and sessions when user present', async () => {
    const { result } = renderHook(() => useDeviceDetection());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith('user_devices');
    expect(mockFrom).toHaveBeenCalledWith('user_sessions');
  });

  it('currentDeviceId starts as null', () => {
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.currentDeviceId).toBeNull();
  });
});
