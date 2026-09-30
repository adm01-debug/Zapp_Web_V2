import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * O teste antigo deste hook cobria só a inscrição no canal. Aqui provamos o efeito: quando a
 * transcrição fica pronta, o som sai com o tipo e o volume persistidos do painel.
 */
import {
  callbacks,
  playNotificationSound,
  resetAlertKit,
  settingsCfg,
} from '@/hooks/__tests__/helpers/alertBehaviorTestKit';

vi.mock('@/utils/notificationSounds', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).notificationSoundsMock(),
);

vi.mock('@/integrations/supabase/client', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).supabaseMock(),
);

vi.mock('@/hooks/ui/use-toast', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).toastMock(),
);

vi.mock('@/hooks/system/useNotificationSettings', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).settingsMock(),
);

import { useTranscriptionNotifications } from '@/hooks/communication/useTranscriptionNotifications';

describe('useTranscriptionNotifications — efeito do alerta', () => {
  beforeEach(() => {
    resetAlertKit();
    settingsCfg.transcriptionSoundType = 'soft';
    settingsCfg.soundVolume = 45;
  });

  it('toca com o tipo e o volume persistidos quando a transcrição fica pronta', async () => {
    renderHook(() => useTranscriptionNotifications());

    expect(callbacks.length).toBeGreaterThan(0);
    await callbacks[0]({
      new: { id: 'm1', transcription_status: 'completed', transcription: 'olá, tudo bem?', contact_id: 'c1' },
      old: { transcription_status: 'processing' },
    });

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
