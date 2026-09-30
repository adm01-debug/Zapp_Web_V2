import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Este hook não tinha prova de EFEITO (o teste antigo cobria só a inscrição no canal): o alerta de
 * sentimento precisa chegar ao som com o tipo e o volume persistidos do painel.
 *
 * O callback do Realtime entrega o envelope (`payload.new` = a linha de `notifications`).
 */
import {
  callbacks,
  dedupeResult,
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

vi.mock('@/hooks/auth/useAuth', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).authMock(),
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

import { useRealtimeSentimentAlerts } from '@/hooks/inbox/useRealtimeSentimentAlerts';

function linhaDeSentimento(over: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    type: 'sentiment_alert',
    metadata: {
      contact_name: 'Fulano',
      sentiment_score: 12,
      consecutive_low: 3,
      analysis_id: 'a1',
    },
    ...over,
  };
}

function entregar(over: Record<string, unknown> = {}) {
  return callbacks[0]({ new: linhaDeSentimento(over) });
}

describe('useRealtimeSentimentAlerts — efeito do alerta', () => {
  beforeEach(() => {
    resetAlertKit();
    settingsCfg.mentionSoundType = 'ping';
    settingsCfg.soundVolume = 55;
    settingsCfg.sentimentAlertEnabled = true;
  });

  it('toca com o tipo e o volume persistidos quando chega alerta de sentimento', async () => {
    renderHook(() => useRealtimeSentimentAlerts());

    expect(callbacks.length).toBeGreaterThan(0);
    await act(async () => {
      await entregar();
    });

    await waitFor(() => {
      expect(playNotificationSound).toHaveBeenCalledWith('mention', 'ping', 55);
    });
  });

  it('não toca quando o alerta de sentimento está desligado no painel', async () => {
    settingsCfg.sentimentAlertEnabled = false;
    renderHook(() => useRealtimeSentimentAlerts());

    await act(async () => {
      await entregar({ id: 'n2' });
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('não toca notificação que não é de sentimento', async () => {
    renderHook(() => useRealtimeSentimentAlerts());

    await act(async () => {
      await entregar({ id: 'n3', type: 'outra_coisa' });
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('não toca o mesmo alerta duas vezes (dedupe)', async () => {
    dedupeResult.valor = false;
    renderHook(() => useRealtimeSentimentAlerts());

    await act(async () => {
      await entregar({ id: 'n4' });
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});
