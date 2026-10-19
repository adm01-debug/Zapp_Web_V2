import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockFunctionsInvoke = vi.fn();
const mockFrom = vi.fn();
const mockToastError = vi.fn();
const mockSettings = {
  soundEnabled: true,
  slaBreachSound: true,
  mentionSound: true,
  mentionSoundType: 'bell',
  soundVolume: 70,
  browserNotifications: false,
  sentimentAlertThreshold: 30,
  sentimentConsecutiveCount: 2,
  sentimentAlertEnabled: true,
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockFunctionsInvoke(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: mockSettings,
    isQuietHours: () => false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn(), info: vi.fn() },
}));

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
  requestNotificationPermission: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })},
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })}),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
}));

import { useSentimentAlerts } from '@/hooks/inbox/useSentimentAlerts';
import { claimNotificationEvent } from '@/lib/notificationDedupe';
import { playNotificationSound } from '@/utils/notificationSounds';

const mockPlaySound = vi.mocked(playNotificationSound);

describe('useSentimentAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockSettings, {
      soundEnabled: true,
      slaBreachSound: true,
      mentionSound: true,
      sentimentAlertThreshold: 30,
      sentimentConsecutiveCount: 2,
      sentimentAlertEnabled: true,
    });
    mockFunctionsInvoke.mockResolvedValue({ data: { alerted: false }, error: null });
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      })),
    });
  });

  it('monta sem lançar erros', () => {
    expect(() => renderHook(() => useSentimentAlerts())).not.toThrow();
  });

  it('não invoca função quando sentimentAlertEnabled é false', () => {
    Object.assign(mockSettings, { sentimentAlertEnabled: false });
    renderHook(() => useSentimentAlerts());
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });
});
