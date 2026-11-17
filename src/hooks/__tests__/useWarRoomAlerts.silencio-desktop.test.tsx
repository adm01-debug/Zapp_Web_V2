import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O "horário de silêncio" do painel era respeitado só pelo SOM do alerta do War Room
 * (`playAlertSound`); o pop-up de desktop saía igual de madrugada. O resto do app já
 * casava os dois (`useRealtimeNotifications:132`: `browserNotifications && !isQuietHours()`).
 */
const h = vi.hoisted(() => ({
  handler: null as ((payload: { new: unknown }) => void) | null,
  notificacoes: [] as Array<{ title: string; options?: NotificationOptions }>,
  emSilencio: false,
  settings: { soundVolume: 40, soundEnabled: true, browserNotifications: true },
}));

vi.mock('@/integrations/supabase/client', () => {
  const canal: Record<string, unknown> = {};
  canal.on = (_evt: string, _cfg: unknown, cb: (p: { new: unknown }) => void) => {
    h.handler = cb;
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
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
              range: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        insert: () => Promise.resolve({ error: null }),
      }),
    },
  };
});

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ settings: h.settings, isQuietHours: () => h.emSilencio }),
}));

import { useWarRoomAlerts } from '@/hooks/business/useWarRoomAlerts';

class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
  onclick: (() => void) | null = null;
  close = vi.fn();

  constructor(public title: string, public options?: NotificationOptions) {
    h.notificacoes.push({ title, options });
  }
}

class FakeAudio {
  currentTime = 0;
  volume = 1;
  play = vi.fn().mockResolvedValue(undefined);
  src: string;
  constructor(src: string) { this.src = src; }
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const alerta = (tipo: string) => ({
  new: {
    id: 'x9',
    alert_type: tipo,
    title: 'Fila acima do limite',
    message: '12 conversas aguardando',
    source: null,
    is_read: false,
    created_at: new Date().toISOString(),
  },
});

describe('useWarRoomAlerts — horário de silêncio no aviso de desktop', () => {
  beforeEach(() => {
    h.notificacoes = [];
    h.emSilencio = false;
    h.settings = { soundVolume: 40, soundEnabled: true, browserNotifications: true };
    Object.defineProperty(window, 'Notification', { configurable: true, value: FakeNotification });
    Object.defineProperty(window, 'Audio', { configurable: true, value: FakeAudio });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('não mostra pop-up de desktop durante o horário de silêncio', async () => {
    h.emSilencio = true;

    renderHook(() => useWarRoomAlerts(), { wrapper: wrapper() });
    await waitFor(() => expect(h.handler).toBeTruthy());

    act(() => { h.handler!(alerta('critical')); });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(h.notificacoes).toHaveLength(0);
  });

  it('mostra pop-up de desktop fora do horário de silêncio', async () => {
    renderHook(() => useWarRoomAlerts(), { wrapper: wrapper() });
    await waitFor(() => expect(h.handler).toBeTruthy());

    act(() => { h.handler!(alerta('critical')); });

    await waitFor(() => expect(h.notificacoes).toHaveLength(1));
    expect(h.notificacoes[0].title).toBe('⚠️ Fila acima do limite');
  });
});
