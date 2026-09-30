import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Caminho do alerta de sentimento disparado pelo analisador (não pelo Realtime): o som só toca
 * quando a função de análise responde que alertou — e com o tipo/volume do painel.
 */
import {
  invoke,
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

vi.mock('@/lib/logger', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).loggerMock(),
);

vi.mock('@/lib/notificationDedupe', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).dedupeMock(),
);

vi.mock('sonner', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).sonnerMock(),
);

vi.mock('@/hooks/system/useNotificationSettings', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).settingsMock(),
);

import { useSentimentAlerts } from '@/hooks/inbox/useSentimentAlerts';

const analise = {
  contactId: 'c1',
  contactName: 'Fulano',
  sentimentScore: 10,
  previousScore: 50,
  analysisId: 'a1',
};

describe('useSentimentAlerts — efeito do alerta', () => {
  beforeEach(() => {
    resetAlertKit();
    settingsCfg.mentionSoundType = 'ping';
    settingsCfg.soundVolume = 55;
  });

  it('toca com o tipo e o volume persistidos quando a análise responde que alertou', async () => {
    invoke.mockResolvedValue({ data: { alerted: true, notifyCaller: true, consecutiveLow: 3 }, error: null });
    const { result } = renderHook(() => useSentimentAlerts());

    await act(async () => {
      await result.current.checkAndTriggerAlert(analise);
    });

    await waitFor(() => {
      expect(playNotificationSound).toHaveBeenCalledWith('mention', 'ping', 55);
    });
  });

  it('não toca quando a análise não disparou alerta', async () => {
    invoke.mockResolvedValue({ data: { alerted: false, reason: 'score acima do limite' }, error: null });
    const { result } = renderHook(() => useSentimentAlerts());

    await act(async () => {
      await result.current.checkAndTriggerAlert(analise);
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('não toca quando a análise pede para outro consumidor notificar (notifyCaller: false)', async () => {
    invoke.mockResolvedValue({ data: { alerted: true, notifyCaller: false }, error: null });
    const { result } = renderHook(() => useSentimentAlerts());

    await act(async () => {
      await result.current.checkAndTriggerAlert(analise);
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('não toca quando a função de análise falha', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useSentimentAlerts());

    await act(async () => {
      await result.current.checkAndTriggerAlert(analise);
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});
