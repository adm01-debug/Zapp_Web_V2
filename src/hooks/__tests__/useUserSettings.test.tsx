import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

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

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useUserSettings } from '@/hooks/system/useUserSettings';

const mockSettings = {
  id: 's1',
  user_id: 'u1',
  business_hours_enabled: true,
  business_hours_start: '09:00',
  business_hours_end: '18:00',
  work_days: [1, 2, 3, 4, 5],
  welcome_message: 'Olá!',
  away_message: 'Fora do horário',
  closing_message: 'Obrigado!',
  auto_assignment_enabled: true,
  auto_assignment_method: 'roundrobin',
  inactivity_timeout: 30,
  auto_transcription_enabled: true,
  sound_enabled: true,
  browser_notifications_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  theme: 'dark',
  language: 'pt-BR',
  compact_mode: false,
  tts_voice_id: 'EXAVITQu4vr4xnSDxMaL',
  tts_speed: 1.0,
};

describe('useUserSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: mockSettings, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it('loads settings from database', async () => {
    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.business_hours_enabled).toBe(true);
    expect(result.current.settings.theme).toBe('dark');
  });

  it('uses default settings when no user', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.language).toBe('pt-BR');
  });

  it('uses default settings on DB error', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockRejectedValue(new Error('fail')),
        }),
      }),
    });

    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.auto_assignment_enabled).toBe(true);
  });

  it('exposes updateSettings function', async () => {
    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.updateSettings).toBe('function');
  });

  it('default work_days is Monday-Friday', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.work_days).toEqual([1, 2, 3, 4, 5]);
  });

  it('default quiet_hours are 22:00-07:00', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.quiet_hours_start).toBe('22:00');
    expect(result.current.settings.quiet_hours_end).toBe('07:00');
  });

  it('default TTS speed is 1.0', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.tts_speed).toBe(1.0);
  });

  it('default assignment method is roundrobin', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.auto_assignment_method).toBe('roundrobin');
  });

  it('não grava os campos operacionais das abas Horário/Mensagens/Automação e mantém os campos do hook', async () => {
    // Os 11 campos operacionais cuja posse saiu do user_settings (cartão #273):
    // Horário/Mensagens passam a ser POR CONEXÃO (business_hours/away_messages) e
    // auto_transcription_enabled passa a ser GLOBAL (global_settings / auto_close_config).
    const operationalKeys = [
      'business_hours_enabled',
      'business_hours_start',
      'business_hours_end',
      'work_days',
      'welcome_message',
      'away_message',
      'closing_message',
      'auto_assignment_enabled',
      'auto_assignment_method',
      'inactivity_timeout',
      'auto_transcription_enabled',
    ];

    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { ...mockSettings, theme: 'light' },
            error: null,
          }),
        }),
      }),
      upsert: mockUpsert,
    }));

    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({ theme: 'dark' });
    });

    await act(async () => {
      await result.current.saveSettings();
    });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const [payload] = mockUpsert.mock.calls[0] as [Record<string, unknown>];

    // Nenhum campo operacional vai no upsert de user_settings.
    for (const key of operationalKeys) {
      expect(payload).not.toHaveProperty(key);
    }

    // Os campos remanescentes do hook continuam indo, com o valor atualizado.
    expect(payload.user_id).toBe('u1');
    expect(payload.theme).toBe('dark');
    expect(payload.language).toBe('pt-BR');
    expect(payload.compact_mode).toBe(false);
    expect(payload.tts_voice_id).toBe('EXAVITQu4vr4xnSDxMaL');
    expect(payload.tts_speed).toBe(1.0);
    expect(payload.browser_notifications_enabled).toBe(true);
  });
});
