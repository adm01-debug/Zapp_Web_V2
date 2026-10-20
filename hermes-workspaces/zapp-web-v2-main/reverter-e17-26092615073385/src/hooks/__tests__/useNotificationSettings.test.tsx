// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

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
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';

const createWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe('useNotificationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              sound_enabled: true,
              browser_notifications_enabled: true,
              quiet_hours_enabled: false,
              quiet_hours_start: '22:00',
              quiet_hours_end: '08:00',
              sentiment_alert_enabled: true,
              sentiment_alert_threshold: 30,
              sentiment_consecutive_count: 2,
              auto_transcription_enabled: true,
              transcription_notification_enabled: true,
              message_sound_type: 'chime',
              mention_sound_type: 'bell',
              sla_sound_type: 'alert',
              goal_sound_type: 'chime',
              transcription_sound_type: 'soft',
            },
            error: null,
          }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it('loads settings on mount', async () => {
    const { result } = renderHook(() => useNotificationSettings(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings).toBeDefined();
    expect(result.current.settings.soundEnabled).toBe(true);
  });

  it('has default settings when no user', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useNotificationSettings(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.soundEnabled).toBe(true);
  });

  it('exposes updateSettings function', async () => {
    const { result } = renderHook(() => useNotificationSettings(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.updateSettings).toBe('function');
  });

  it('settings include all notification types', async () => {
    const { result } = renderHook(() => useNotificationSettings(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const s = result.current.settings;
    expect(s).toHaveProperty('soundEnabled');
    expect(s).toHaveProperty('browserNotifications');
    expect(s).toHaveProperty('quietHoursEnabled');
    expect(s).toHaveProperty('sentimentAlertEnabled');
    expect(s).toHaveProperty('transcriptionNotificationEnabled');
  });

  it('default quiet hours are reasonable', async () => {
    const { result } = renderHook(() => useNotificationSettings(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.quietHoursStart).toMatch(/^\d{2}:\d{2}$/);
    expect(result.current.settings.quietHoursEnd).toMatch(/^\d{2}:\d{2}$/);
  });

  it('sound types are valid options', async () => {
    const validTypes = ['beep', 'chime', 'bell', 'alert', 'soft'];
    const { result } = renderHook(() => useNotificationSettings(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(validTypes).toContain(result.current.settings.messageSoundType);
    expect(validTypes).toContain(result.current.settings.mentionSoundType);
    expect(validTypes).toContain(result.current.settings.slaSoundType);
  });

  it('handles fetch error gracefully', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockRejectedValue(new Error('DB error')),
        }),
      }),
    });

    const { result } = renderHook(() => useNotificationSettings(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});
