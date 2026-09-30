import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * Este hook não tinha NENHUM teste. Aqui provamos o efeito: violação de SLA dispara o som com o
 * tipo e o volume persistidos do painel — e não dispara quando o usuário desligou o alerta de SLA.
 */
const playNotificationSound = vi.fn();
const callbacks: Array<(payload: unknown) => unknown> = [];

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: (...args: unknown[]) => playNotificationSound(...args),
  showBrowserNotification: vi.fn(),
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
            maybeSingle: async () => ({ data: { name: 'Fulano', phone: '1199' }, error: null }),
            single: async () => ({ data: { name: 'Fulano', phone: '1199' }, error: null }),
          }),
        }),
      }),
    },
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

let slaBreachSound = true;

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: {
      soundEnabled: true,
      slaBreachSound,
      slaSoundType: 'alert',
      soundVolume: 60,
    },
    isQuietHours: () => false,
  }),
}));

import { useSLANotifications } from '@/hooks/sla/useSLANotifications';

const violacao = {
  new: { id: 's1', contact_id: 'c1', first_response_breached: true },
  old: { first_response_breached: false },
};

describe('useSLANotifications — efeito do alerta', () => {
  beforeEach(() => {
    playNotificationSound.mockClear();
    callbacks.length = 0;
    slaBreachSound = true;
  });

  it('toca com o tipo e o volume persistidos quando o SLA de primeira resposta estoura', async () => {
    renderHook(() => useSLANotifications());

    expect(callbacks.length).toBeGreaterThan(0);
    await callbacks[0](violacao);

    await waitFor(() => {
      expect(playNotificationSound).toHaveBeenCalledWith('sla_breach', 'alert', 60);
    });
  });

  it('não toca quando o alerta de SLA está desligado no painel', async () => {
    slaBreachSound = false;
    renderHook(() => useSLANotifications());

    await callbacks[0](violacao);

    await waitFor(() => {
      expect(callbacks.length).toBeGreaterThan(0);
    });
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('não toca quando o estouro já vinha marcado (não é novidade)', async () => {
    renderHook(() => useSLANotifications());

    await callbacks[0]({
      new: { id: 's2', contact_id: 'c1', first_response_breached: true },
      old: { first_response_breached: true },
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});
