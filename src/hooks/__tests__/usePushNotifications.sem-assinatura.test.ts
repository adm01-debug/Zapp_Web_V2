/**
 * Defeito (PD-37): o hook criava assinatura push real (`pushManager.subscribe` com
 * uma chave VAPID de exemplo) e registrava a assinatura em log, embora o Zapp Web
 * não tenha servidor de push. Este teste prova que ativar os alertas NÃO cria
 * assinatura push nem registra nada disso em log.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const h = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: h,
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

// Habilita o recurso: sem isso o hook sai cedo e o caminho de ativação nunca roda.
vi.mock('@/config/service_worker', () => ({ PUSH_NOTIFICATIONS_ENABLED: true }));

import { usePushNotifications } from '@/hooks/system/usePushNotifications';

class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
}

describe('usePushNotifications — sem assinatura push (PD-37)', () => {
  const pushSubscribe = vi.fn();
  const pushGetSubscription = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'Notification', { configurable: true, value: FakeNotification });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class PushManager {} });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: { subscribe: pushSubscribe, getSubscription: pushGetSubscription },
        }),
      },
    });
  });

  it('ativa os alertas sem criar nem registrar assinatura push', async () => {
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSupported).toBe(true);

    await act(async () => {
      await expect(result.current.subscribe()).resolves.toBe(true);
    });

    expect(pushSubscribe).not.toHaveBeenCalled();
    expect(pushGetSubscription).not.toHaveBeenCalled();

    const linhasDeLog = h.debug.mock.calls
      .concat(h.info.mock.calls, h.warn.mock.calls, h.error.mock.calls)
      .map((args) => JSON.stringify(args).toLowerCase());
    expect(linhasDeLog.some((linha) => linha.includes('subscription'))).toBe(false);
  });
});
