import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

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

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: false, browserNotifications: false },
    isQuietHours: () => false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useGoalNotifications } from '@/hooks/analytics/useGoalNotifications';

describe('useGoalNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        or: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes checkGoalProgress function', () => {
    const { result } = renderHook(() => useGoalNotifications());
    expect(typeof result.current.checkGoalProgress).toBe('function');
  });

  it('does not check when no user', () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderHook(() => useGoalNotifications());
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('checks goals on mount when user present', () => {
    renderHook(() => useGoalNotifications());
    expect(mockFrom).toHaveBeenCalledWith('profiles');
  });

  it('sets up interval for periodic checking', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    renderHook(() => useGoalNotifications());
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 300000);
    setIntervalSpy.mockRestore();
  });

  it('clears interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const { unmount } = renderHook(() => useGoalNotifications());
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('handles missing profile gracefully', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });
    const { result } = renderHook(() => useGoalNotifications());
    await expect(result.current.checkGoalProgress()).resolves.not.toThrow();
  });
});
