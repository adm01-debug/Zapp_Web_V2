import '@/hooks/__tests__/helpers/alertMocks';
import '@/hooks/__tests__/helpers/slaAlertPreferencesMock';
import { describe, it, expect, beforeEach } from 'vitest';
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

import { useSLANotifications } from '@/hooks/sla/useSLANotifications';
import { DEFAULT_SLA_ALERT_PREFERENCES } from '@/hooks/sla/slaAlertPreferences';
import {
  resetSlaAlertPreferences,
  slaAlertPreferencesCfg,
} from '@/hooks/__tests__/helpers/slaAlertPreferencesMock';

const SLA_1 = '11111111-1111-4111-8111-111111111111';
const SLA_2 = '33333333-3333-4333-8333-333333333333';
const SLA_3 = '44444444-4444-4444-8444-444444444444';
const SLA_4 = '55555555-5555-4555-8555-555555555555';
const CONTATO_ID = '22222222-2222-4222-8222-222222222222';

/** Deixa as promessas do handler assentarem (o canal entrega `void`). */
const assentar = () => new Promise((resolve) => setTimeout(resolve, 0));

function violacao(id: string, jaMarcado: boolean) {
  return {
    new: {
      id,
      contact_id: CONTATO_ID,
      first_message_at: '2026-10-12T12:00:00.000Z',
      first_response_at: null,
      first_response_breached: true,
      sla_configuration_id: null,
    },
    old: { first_response_breached: jaMarcado },
  };
}

describe('useSLANotifications — efeito do alerta', () => {
  beforeEach(() => {
    resetAlertKit();
    resetSlaAlertPreferences();
    settingsCfg.slaSoundType = 'alert';
    settingsCfg.soundVolume = 60;
  });

  it('toca com o tipo e o volume persistidos quando o SLA de primeira resposta estoura', async () => {
    renderHook(() => useSLANotifications());

    expect(callbacks.length).toBeGreaterThan(0);
    await callbacks[0](violacao(SLA_1, false));

    await waitFor(() => {
      expect(playNotificationSound).toHaveBeenCalledWith('sla_breach', 'alert', 60);
    });
  });

  it('não toca quando o alerta de SLA está desligado no painel', async () => {
    settingsCfg.slaBreachSound = false;
    renderHook(() => useSLANotifications());

    await callbacks[0](violacao(SLA_2, false));
    await assentar();

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('não toca quando o estouro já vinha marcado (não é novidade)', async () => {
    renderHook(() => useSLANotifications());

    await callbacks[0](violacao(SLA_3, true));
    await assentar();

    expect(playNotificationSound).not.toHaveBeenCalled();
  });
  it('não toca quando a preferência da conta desliga os avisos de SLA', async () => {
    slaAlertPreferencesCfg.preferences = { ...DEFAULT_SLA_ALERT_PREFERENCES, enabled: false };
    renderHook(() => useSLANotifications());

    expect(callbacks.length).toBeGreaterThan(0);
    await callbacks[0](violacao(SLA_4, false));
    await assentar();

    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});
