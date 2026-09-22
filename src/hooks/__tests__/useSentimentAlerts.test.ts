import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockFunctionsInvoke = vi.fn();
const mockFrom = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => mockFunctionsInvoke(...args) },
    from: (...args: any[]) => mockFrom(...args),
  },
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: {
      soundEnabled: true,
      slaBreachSound: true,
      browserNotifications: false,
      sentimentAlertThreshold: 30,
      sentimentConsecutiveCount: 2,
      sentimentAlertEnabled: true,
    },
    isQuietHours: () => false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn(), info: vi.fn() },
}));

vi.mock('@/utils/notificationSound', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
  requestNotificationPermission: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useSentimentAlerts } from '@/hooks/inbox/useSentimentAlerts';
import { claimNotificationEvent } from '@/lib/notificationDedupe';

describe('useSentimentAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFunctionsInvoke.mockResolvedValue({ data: { alerted: false }, error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    });
  });

  it('exposes checkAndTriggerAlert function', () => {
    const { result } = renderHook(() => useSentimentAlerts());
    expect(typeof result.current.checkAndTriggerAlert).toBe('function');
  });

  it('exposes getRecentAlerts function', () => {
    const { result } = renderHook(() => useSentimentAlerts());
    expect(typeof result.current.getRecentAlerts).toBe('function');
  });

  it('has default threshold of 30', () => {
    const { result } = renderHook(() => useSentimentAlerts());
    expect(result.current.threshold).toBe(30);
  });

  it('has default consecutiveRequired of 2', () => {
    const { result } = renderHook(() => useSentimentAlerts());
    expect(result.current.consecutiveRequired).toBe(2);
  });

  it('alertsEnabled defaults to true', () => {
    const { result } = renderHook(() => useSentimentAlerts());
    expect(result.current.alertsEnabled).toBe(true);
  });

  it('checkAndTriggerAlert returns not triggered for score above threshold', async () => {
    const { result } = renderHook(() => useSentimentAlerts());
    const outcome = await result.current.checkAndTriggerAlert({
      contactId: 'c1',
      contactName: 'João',
      sentimentScore: 80,
      analysisId: 'a1',
    });
    expect(outcome.triggered).toBe(false);
    expect(outcome.reason).toBe('Sentiment above threshold');
  });

  it('checkAndTriggerAlert calls edge function for low sentiment', async () => {
    const { result } = renderHook(() => useSentimentAlerts());
    await result.current.checkAndTriggerAlert({
      contactId: 'c1',
      contactName: 'João',
      sentimentScore: 10,
      analysisId: 'a-local-alert',
    });
    expect(mockFunctionsInvoke).toHaveBeenCalledWith('sentiment-alert', expect.any(Object));
  });

  it('checkAndTriggerAlert handles edge function error', async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: null, error: new Error('Failed') });
    const { result } = renderHook(() => useSentimentAlerts());
    const outcome = await result.current.checkAndTriggerAlert({
      contactId: 'c1',
      contactName: 'João',
      sentimentScore: 10,
      analysisId: 'a1',
    });
    expect(outcome.triggered).toBe(false);
    expect(outcome.error).toBeTruthy();
  });

  it('checkAndTriggerAlert returns triggered when alerted', async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: { alerted: true, consecutiveLow: 3, emailSent: true }, error: null });
    const { result } = renderHook(() => useSentimentAlerts());
    const outcome = await result.current.checkAndTriggerAlert({
      contactId: 'c1',
      contactName: 'João',
      sentimentScore: 10,
      analysisId: 'a1',
    });
    expect(outcome.triggered).toBe(true);
    expect(outcome.consecutiveLow).toBe(3);
    expect(mockToastError).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate the toast when Realtime already delivered the targeted notification', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: { alerted: true, consecutiveLow: 3, emailSent: true, notificationCreated: true },
      error: null,
    });
    claimNotificationEvent('sentiment:a-delivered');
    const { result } = renderHook(() => useSentimentAlerts());
    const outcome = await result.current.checkAndTriggerAlert({
      contactId: 'c1',
      contactName: 'João',
      sentimentScore: 10,
      analysisId: 'a-delivered',
    });
    expect(outcome.triggered).toBe(true);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('getRecentAlerts returns empty array on error', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error('DB error')),
          }),
        }),
      }),
    });
    const { result } = renderHook(() => useSentimentAlerts());
    const alerts = await result.current.getRecentAlerts();
    expect(alerts).toEqual([]);
  });

  it('getRecentAlerts maps data correctly', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'a1', entity_id: 'c1', created_at: '2024-01-01', action: 'sentiment_alert', details: { score: 10 } }],
              error: null,
            }),
          }),
        }),
      }),
    });
    const { result } = renderHook(() => useSentimentAlerts());
    const alerts = await result.current.getRecentAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].contactId).toBe('c1');
  });
});
