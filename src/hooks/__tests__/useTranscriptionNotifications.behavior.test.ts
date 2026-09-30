import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * O teste antigo deste hook cobria só a inscrição no canal. Aqui provamos o efeito: quando a
 * transcrição fica pronta, o som sai com o tipo e o volume persistidos do painel.
 */
const playNotificationSound = vi.fn();
const callbacks: Array<(payload: unknown) => unknown> = [];

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: (...args: unknown[]) => playNotificationSound(...args),
  showBrowserNotification: vi.fn(),
  requestNotificationPermission: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const canal: Record<string, unknown> = {};
  canal.on = (_evt: string, _cfg: unknown, cb: (payload: unknown) => unknown) => {
    callbacks.push(cb);
    return canal;
  };
  canal.subscribe = () => ({ unsubscribe: vi.fn() });
  return {
    supabase: {
      channel: () => canal,
      removeChannel: vi.fn(),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { name: 'Fulano' }, error: null }),
            single: async () => ({ data: { name: 'Fulano' }, error: null }),
          }),
        }),
      }),
    },
  };
});

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: {
      soundEnabled: true,
      transcriptionNotificationEnabled: true,
      transcriptionSoundType: 'soft',
      soundVolume: 45,
    },
    isQuietHours: () => false,
  }),
}));

import { useTranscriptionNotifications } from '@/hooks/communication/useTranscriptionNotifications';

const transcricaoPronta = {
  new: { id: 'm1', transcription_status: 'completed', transcription: 'olá, tudo bem?', contact_id: 'c1' },
  old: { transcription_status: 'processing' },
};

describe('useTranscriptionNotifications — efeito do alerta', () => {
  beforeEach(() => {
    playNotificationSound.mockClear();
    callbacks.length = 0;
  });

  it('toca com o tipo e o volume persistidos quando a transcrição fica pronta', async () => {
    renderHook(() => useTranscriptionNotifications());

    expect(callbacks.length).toBeGreaterThan(0);
    await callbacks[0](transcricaoPronta);

    await waitFor(() => {
      expect(playNotificationSound).toHaveBeenCalledWith('message', 'soft', 45);
    });
  });

  it('não toca quando só o texto mudou (transcrição já estava pronta)', async () => {
    renderHook(() => useTranscriptionNotifications());

    await callbacks[0]({
      new: { id: 'm1', transcription_status: 'completed', transcription: 'editado', contact_id: 'c1' },
      old: { transcription_status: 'completed' },
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});
