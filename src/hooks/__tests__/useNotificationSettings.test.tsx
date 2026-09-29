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

// Cadeia que o hook usa no supabase: from().select().eq().maybeSingle() + upsert. Devolve os spies
// para cada caso conferir o select/upsert sem repetir o mock inteiro.
const montarCadeia = (data: unknown, upsert = vi.fn().mockResolvedValue({ error: null })) => ({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) }),
  }),
  upsert,
});

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

  // ========== VOLUME DOS ALERTAS (sound_volume) ==========
  // O campo existia so no front: sem coluna, sem select, sem gravacao — o slider voltava para 70 a
  // cada reload. Estes testes pinam as quatro pontas (select, leitura, gravacao e reset).
  describe('soundVolume persistido', () => {
    const comLinha = (data: unknown) => {
      const cadeia = montarCadeia(data);
      mockFrom.mockReturnValue(cadeia);
      return cadeia;
    };

    const carregar = async () => {
      const { result } = renderHook(() => useNotificationSettings(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      return result;
    };

    it('le o volume salvo no banco', async () => {
      comLinha({ sound_enabled: true, sound_volume: 45 });
      const result = await carregar();
      expect(result.current.settings.soundVolume).toBe(45);
    });

    it('pede a coluna sound_volume no select', async () => {
      const { select } = comLinha(null);
      await carregar();
      expect(select).toHaveBeenCalledWith(expect.stringContaining('sound_volume'));
    });

    it('usa o default quando a coluna vem nula ou ausente', async () => {
      comLinha({ sound_enabled: true, sound_volume: null });
      const result = await carregar();
      expect(result.current.settings.soundVolume).toBe(70);
    });

    it('clampa valor fora da faixa do controle', async () => {
      comLinha({ sound_enabled: true, sound_volume: 500 });
      const result = await carregar();
      expect(result.current.settings.soundVolume).toBe(100);
    });

    it('grava o volume no banco ao atualizar', async () => {
      const { upsert } = comLinha(null);
      const result = await carregar();
      await result.current.updateSettings({ soundVolume: 35 });
      expect(upsert.mock.calls[0][0]).toMatchObject({ user_id: 'u1', sound_volume: 35 });
    });

    it('clampa o valor gravado para a faixa do controle', async () => {
      const { upsert } = comLinha(null);
      const result = await carregar();
      await result.current.updateSettings({ soundVolume: 5000 });
      expect(upsert.mock.calls[0][0]).toMatchObject({ sound_volume: 100 });
    });

    it('reset volta o volume para o default', async () => {
      const { upsert } = comLinha(null);
      const result = await carregar();
      await result.current.resetSettings();
      expect(upsert.mock.calls[0][0]).toMatchObject({ sound_volume: 70 });
    });
  });
});
