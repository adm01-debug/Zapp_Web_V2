import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

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

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// O hook avisa quando a gravação falha; aqui só interessa SE avisou.
const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/ui/use-toast', () => ({ toast: toastMock }));

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

    it('o valor OTIMISTA também é clampado (não mostra 500 enquanto o banco guarda 100)', async () => {
      comLinha(null);
      const result = await carregar();

      await result.current.updateSettings({ soundVolume: 5000 });

      // antes do fix, a tela ficava com 5000 (o upsert clampava só no banco)
      await waitFor(() => expect(result.current.settings.soundVolume).toBe(100));
    });

    it('avisa o usuário quando a gravação falha (em vez de o controle voltar calado)', async () => {
      const upsert = vi.fn().mockResolvedValue({ error: new Error('falha de rede') });
      mockFrom.mockReturnValue(montarCadeia(null, upsert));
      const result = await carregar();

      await result.current.updateSettings({ soundVolume: 35 });

      expect(upsert).toHaveBeenCalled();
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
  });

  // ========== VOCABULÁRIO DE SOM VINDO DO BANCO ==========
  // O banco tem CHECK para ('beep'|'chime'|'bell'|'alert'|'soft'), mas o app não deve confiar
  // nisso: um valor fora do conjunto virava `SOUND_CONFIGS[x]` undefined → throw engolido pelo
  // catch → alerta MUDO, sem sintoma nenhum além de um warn no log.
  describe('vocabulário de som', () => {
    const comLinha = (data: unknown) => mockFrom.mockReturnValue(montarCadeia(data));

    const carregar = async () => {
      const { result } = renderHook(() => useNotificationSettings(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      return result;
    };

    it('tipo fora do vocabulário cai no default em vez de emudecer o alerta', async () => {
      comLinha({ sound_enabled: true, message_sound_type: 'quiet', mention_sound_type: 'pop' });
      const result = await carregar();

      expect(result.current.settings.messageSoundType).toBe('chime');
      expect(result.current.settings.mentionSoundType).toBe('bell');
    });

    it('tipo válido continua sendo respeitado', async () => {
      comLinha({ sound_enabled: true, message_sound_type: 'soft' });
      const result = await carregar();

      expect(result.current.settings.messageSoundType).toBe('soft');
    });

    it('avisa UMA vez por rajada de falhas, e volta a avisar numa rajada nova', async () => {
      const upsert = vi.fn().mockResolvedValue({ error: new Error('falha de rede') });
      mockFrom.mockReturnValue(montarCadeia(null, upsert));
      const result = await carregar();

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 1, 9, 0, 0));
      await result.current.updateSettings({ soundVolume: 35 });
      await result.current.updateSettings({ soundVolume: 40 });
      await result.current.updateSettings({ soundVolume: 45 });
      vi.setSystemTime(new Date(2026, 9, 1, 9, 0, 10));
      await result.current.updateSettings({ soundVolume: 50 });
      vi.useRealTimers();

      expect(upsert).toHaveBeenCalledTimes(4);
      expect(toastMock).toHaveBeenCalledTimes(2);
    });
  });

  // ========== HORÁRIO DE SILÊNCIO (isQuietHours) ==========
  // A lógica tem uma virada de dia (22:00 -> 08:00) e duas bordas ASSIMÉTRICAS
  // (início inclusivo, fim exclusivo). Nada disso estava coberto: um `>` trocado
  // por `>=` (ou a janela invertida) silenciava alerta em pleno expediente sem
  // nenhum teste reclamar.
  describe('isQuietHours', () => {
    const comJanela = (start: string, end: string, enabled = true) => {
      mockFrom.mockReturnValue(
        montarCadeia({
          sound_enabled: true,
          quiet_hours_enabled: enabled,
          quiet_hours_start: start,
          quiet_hours_end: end,
        }),
      );
    };

    /** Fixa o relógio em HH:mm (só o Date é falsificado — `waitFor` segue real). */
    const as = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      vi.setSystemTime(new Date(2026, 8, 30, h, m, 0));
    };

    const carregar = async () => {
      const { result } = renderHook(() => useNotificationSettings(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      return result;
    };

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('desligado, nunca é horário de silêncio — nem às 23h', async () => {
      comJanela('22:00', '08:00', false);
      as('23:00');
      const result = await carregar();

      expect(result.current.isQuietHours()).toBe(false);
    });

    it('janela noturna (22:00→08:00): silencia 22:00, 23:00 e 07:59; libera 08:00, 21:59 e 12:00', async () => {
      comJanela('22:00', '08:00');
      const result = await carregar();

      as('22:00');
      expect(result.current.isQuietHours()).toBe(true);
      as('23:00');
      expect(result.current.isQuietHours()).toBe(true);
      as('07:59');
      expect(result.current.isQuietHours()).toBe(true);
      // bordas: o fim é EXCLUSIVO, o início é INCLUSIVO
      as('08:00');
      expect(result.current.isQuietHours()).toBe(false);
      as('21:59');
      expect(result.current.isQuietHours()).toBe(false);
      as('12:00');
      expect(result.current.isQuietHours()).toBe(false);
    });

    it('janela no mesmo dia (09:00→17:00): início inclusivo, fim exclusivo', async () => {
      comJanela('09:00', '17:00');
      const result = await carregar();

      as('08:59');
      expect(result.current.isQuietHours()).toBe(false);
      as('09:00');
      expect(result.current.isQuietHours()).toBe(true);
      as('16:59');
      expect(result.current.isQuietHours()).toBe(true);
      as('17:00');
      expect(result.current.isQuietHours()).toBe(false);
    });

    it('janela degenerada (início igual ao fim) não silencia nada', async () => {
      comJanela('10:00', '10:00');
      as('10:00');
      const result = await carregar();

      expect(result.current.isQuietHours()).toBe(false);
    });

    it('acompanha a janela do painel, não uma faixa cravada', async () => {
      comJanela('00:00', '23:59');
      as('03:00');
      const result = await carregar();

      expect(result.current.isQuietHours()).toBe(true);
    });
  });
});
