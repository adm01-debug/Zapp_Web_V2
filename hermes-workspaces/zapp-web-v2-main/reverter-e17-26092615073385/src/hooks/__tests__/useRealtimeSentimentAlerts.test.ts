import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();
const mockToastError = vi.fn();
let realtimeCallback: ((payload: Record<string, unknown>) => void | Promise<void>) | undefined;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (...args: any[]) => mockChannel(...args),
    removeChannel: mockRemoveChannel,
  },
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: true, browserNotifications: false },
    isQuietHours: () => false,
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() },
}));

vi.mock('@/utils/notificationSound', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
  requestNotificationPermission: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

const { useRealtimeSentimentAlerts } = await import('@/hooks/inbox/useRealtimeSentimentAlerts');

describe('useRealtimeSentimentAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeCallback = undefined;
    mockChannel.mockReturnValue({
      on: vi.fn((_event, _config, callback) => {
        realtimeCallback = callback;
        return mockChannel.mock.results[mockChannel.mock.results.length - 1]?.value;
      }),
      subscribe: vi.fn().mockReturnThis(),
    });
  });

  it('returns null', () => {
    const { result } = renderHook(() => useRealtimeSentimentAlerts());
    expect(result.current).toBeNull();
  });

  it('subscribes to an isolated sentiment notification channel', () => {
    renderHook(() => useRealtimeSentimentAlerts());
    expect(mockChannel).toHaveBeenCalledWith(expect.stringMatching(/^sentiment-alerts:/));
  });

  it('listens for INSERT events on notifications scoped to the authenticated user', () => {
    const onMock = vi.fn().mockReturnThis();
    mockChannel.mockReturnValue({
      on: onMock,
      subscribe: vi.fn().mockReturnThis(),
    });
    renderHook(() => useRealtimeSentimentAlerts());
    expect(onMock).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        table: 'notifications',
        filter: 'user_id=eq.user-1',
      }),
      expect.any(Function)
    );
  });

  it('delivers one toast for a targeted sentiment notification and ignores duplicates', async () => {
    renderHook(() => useRealtimeSentimentAlerts());
    const payload = {
      new: {
        id: 'notification-1',
        user_id: 'user-1',
        type: 'sentiment_alert',
        metadata: {
          contact_id: 'contact-1',
          contact_name: 'Maria',
          sentiment_score: 12,
          consecutive_low: 3,
          analysis_id: 'analysis-1',
        },
        created_at: '2026-09-22T19:00:00.000Z',
      },
    };

    await act(async () => {
      await realtimeCallback?.(payload);
      await realtimeCallback?.(payload);
    });

    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledWith(
      '⚠️ Alerta de Sentimento: Maria',
      expect.objectContaining({ description: expect.stringContaining('12%') }),
    );
  });

  it('ignores unrelated notification types', async () => {
    renderHook(() => useRealtimeSentimentAlerts());
    await act(async () => {
      await realtimeCallback?.({
        new: {
          id: 'notification-2',
          user_id: 'user-1',
          type: 'incoming_call',
          metadata: {},
          created_at: '2026-09-22T19:00:00.000Z',
        },
      });
    });
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('cleans up channel on unmount', () => {
    const { unmount } = renderHook(() => useRealtimeSentimentAlerts());
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it('calls subscribe on channel', () => {
    const subscribeMock = vi.fn().mockReturnThis();
    mockChannel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: subscribeMock,
    });
    renderHook(() => useRealtimeSentimentAlerts());
    expect(subscribeMock).toHaveBeenCalled();
  });
});
