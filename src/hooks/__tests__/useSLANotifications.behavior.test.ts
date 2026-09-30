import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * Este hook não tinha NENHUM teste. Aqui provamos o efeito: violação de SLA dispara o som com o
 * tipo e o volume persistidos do painel — e cala quando o alerta de SLA está desligado.
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

vi.mock('@/hooks/auth/useAuth', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).authMock(),
);

vi.mock('@/lib/logger', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).loggerMock(),
);

vi.mock('@/hooks/ui/use-toast', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).toastMock(),
);

vi.mock('@/hooks/system/useNotificationSettings', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).settingsMock(),
);

import { useSLANotifications } from '@/hooks/sla/useSLANotifications';

function violacao(id: string, jaMarcado: boolean) {
  return {
    new: { id, contact_id: 'c1', first_response_breached: true },
    old: { first_response_breached: jaMarcado },
  };
}

describe('useSLANotifications — efeito do alerta', () => {
  beforeEach(() => {
    resetAlertKit();
    settingsCfg.slaSoundType = 'alert';
    settingsCfg.soundVolume = 60;
  });

  it('toca com o tipo e o volume persistidos quando o SLA de primeira resposta estoura', async () => {
    renderHook(() => useSLANotifications());

    expect(callbacks.length).toBeGreaterThan(0);
    await callbacks[0](violacao('s1', false));

    await waitFor(() => {
      expect(playNotificationSound).toHaveBeenCalledWith('sla_breach', 'alert', 60);
    });
  });

  it('não toca quando o alerta de SLA está desligado no painel', async () => {
    settingsCfg.slaBreachSound = false;
    renderHook(() => useSLANotifications());

    await callbacks[0](violacao('s2', false));

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('não toca quando o estouro já vinha marcado (não é novidade)', async () => {
    renderHook(() => useSLANotifications());

    await callbacks[0](violacao('s3', true));

    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});
