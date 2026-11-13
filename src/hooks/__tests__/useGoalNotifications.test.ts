import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children?: import("react").ReactNode }) => children,
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
  getLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
}));

import { useGoalNotifications } from '@/hooks/analytics/useGoalNotifications';

describe('useGoalNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    const baseResolver = (table: string): { data: unknown; count?: number; error: unknown } => {
      if (table === 'profiles') return { data: { id: 'p1' }, error: null };
      return { data: [], error: null };
    };
    const fazerBuilder = (table: string) => {
      const fake: Record<string, unknown> = {};
      for (const metodo of ['select', 'eq', 'or', 'gte', 'lte', 'neq']) {
        fake[metodo] = vi.fn<(...args: unknown[]) => typeof fake>(() => fake);
      }
      fake.maybeSingle = vi.fn().mockResolvedValue(baseResolver(table));
      fake.insert = vi.fn().mockResolvedValue({ error: null });
      return fake;
    };
    mockFrom.mockImplementation((table: string) => fazerBuilder(table));
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
      const fazerBuilder = (table: string) => {
        const fake: Record<string, unknown> = {};
        for (const metodo of ['select', 'eq', 'or', 'gte', 'lte', 'neq']) {
          fake[metodo] = vi.fn<(...args: unknown[]) => typeof fake>(() => fake);
        }
        fake.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        fake.insert = vi.fn().mockResolvedValue({ error: null });
        return fake;
      };
      mockFrom.mockImplementation((table: string) => fazerBuilder(table));
    const { result } = renderHook(() => useGoalNotifications());
    await expect(result.current.checkGoalProgress()).resolves.not.toThrow();
  });
});
