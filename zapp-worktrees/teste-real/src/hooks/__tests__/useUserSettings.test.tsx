import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const mockFrom = vi.fn();
const mockUpsert = vi.fn();

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
    mockUpsert.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: mockSettings, error: null }),
        }),
      }),
      upsert: mockUpsert,
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

  it('saveSettings não grava as preferências de som (posse do useNotificationSettings)', async () => {
    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({ theme: 'dark', compact_mode: true });
    });

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.saveSettings();
    });

    expect(saved).toBe(true);
    expect(mockUpsert).toHaveBeenCalledTimes(1);

    const payload = mockUpsert.mock.calls[0][0] as Record<string, unknown>;

    // Estes quatro campos pertencem ao hook canônico de notificações:
    // gravar aqui sobrescreve o que ele acabou de salvar.
    expect(payload).not.toHaveProperty('sound_enabled');
    expect(payload).not.toHaveProperty('quiet_hours_enabled');
    expect(payload).not.toHaveProperty('quiet_hours_start');
    expect(payload).not.toHaveProperty('quiet_hours_end');

    // Os campos próprios deste hook continuam indo, com os valores atuais.
    expect(payload).toMatchObject({
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
      browser_notifications_enabled: true,
      theme: 'dark',
      language: 'pt-BR',
      compact_mode: true,
      tts_voice_id: 'EXAVITQu4vr4xnSDxMaL',
      tts_speed: 1.0,
    });
  });
});
