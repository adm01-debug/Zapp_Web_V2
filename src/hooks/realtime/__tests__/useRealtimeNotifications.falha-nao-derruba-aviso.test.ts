import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * Critério de pronto 1: o construtor do `Notification` estoura (Chrome em
 * Android lança 'Illegal constructor') e o aviso EM TELA continua saindo.
 *
 * Diferença para `notificationSounds.aviso-sistema.test.ts`: aquele prova que
 * `showBrowserNotification` não lança. Este prova no nível do HOOK que
 * `notifyAboutIncomingMessage` não propaga nada e ainda produz o estado de
 * aviso em tela (`newMessageNotification`) — o caminho REAL de
 * `showBrowserNotification` roda aqui (sem mock), com o construtor do
 * navegador estourando.
 */

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
vi.mock('@/hooks/ui/use-toast', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).toastMock(),
);
vi.mock('@/hooks/system/useNotificationSettings', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).settingsMock(),
);

import { settingsCfg } from '@/hooks/__tests__/helpers/alertBehaviorTestKit';
import { useRealtimeNotifications } from '@/hooks/realtime/useRealtimeNotifications';

class NotificationQueEstoura {
  static permission: NotificationPermission = 'granted';
  static requestPermission = vi.fn(async (): Promise<NotificationPermission> => 'granted');
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor() {
    throw new TypeError('Illegal constructor');
  }
}

const contato = { id: 'c9', name: 'Maria', phone: '1199' } as never;
const mensagem = { id: 'm9', contact_id: 'c9', sender: 'contact', is_read: false, content: 'oi' } as never;

describe('useRealtimeNotifications — falha do aviso do sistema não derruba o aviso em tela', () => {
  beforeEach(() => {
    settingsCfg.soundEnabled = true;
    settingsCfg.browserNotifications = true;
    settingsCfg.newMessageSound = true;
    settingsCfg.quietHours = false;
    vi.stubGlobal('Notification', NotificationQueEstoura);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('construtor que lança não impede o aviso em tela e nada propaga', () => {
    const { result } = renderHook(() => useRealtimeNotifications());

    expect(() =>
      act(() => {
        result.current.notifyAboutIncomingMessage(contato, mensagem);
      }),
    ).not.toThrow();

    expect(result.current.newMessageNotification).toMatchObject({
      id: 'm9',
      contactId: 'c9',
      contactName: 'Maria',
      message: 'oi',
    });
  });
});
