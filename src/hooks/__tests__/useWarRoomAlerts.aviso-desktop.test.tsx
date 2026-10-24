import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O aviso de desktop do War Room saía por `usePushNotifications.showNotification`, que
 * exige Service Worker de aplicação — `config/service_worker.ts` mantém
 * `SERVICE_WORKER_ENABLED=false`, então a chamada devolvia `false` em silêncio: o
 * operador só ouvia o som. Aqui o aviso é observado na API `Notification` direta
 * (`showBrowserNotification`), com o push desligado (`navigator.serviceWorker` deste
 * teste não tem `ready`), e o alerta crítico não perde o `requireInteraction` do
 * caminho antigo — o painel é quem decide se avisa pelo navegador
 * (`settings.browserNotifications`, o mesmo "switch" que o Chat de Equipe respeita).
 */
const h = vi.hoisted(() => ({
  handler: null as ((payload: { new: unknown }) => void) | null,
  notificacoes: [] as Array<{ title: string; options?: NotificationOptions }>,
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
  useNotificationSettings: () => ({ settings: h.settings, isQuietHours: () => false }),
}));

vi.mock('@/hooks/system/usePushNotifications', () => ({
  usePushNotifications: () => ({ isSupported: false, permission: 'granted', isActive: false, isLoading: false, showNotification: vi.fn(), requestPermission: vi.fn() }),
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

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

class FakeAudio {
  currentTime = 0;
  volume = 1;
  play = vi.fn().mockResolvedValue(undefined);
  src: string;
  constructor(src: string) { this.src = src; }
}

const alerta = (tipo: string) => ({
  new: {
    id: 'x1',
    alert_type: tipo,
    title: 'Fila acima do limite',
    message: '12 conversas aguardando',
    source: null,
    is_read: false,
    created_at: new Date().toISOString(),
  },
});

describe('useWarRoomAlerts — aviso de desktop sem Service Worker', () => {
  beforeEach(() => {
    h.notificacoes = [];
    h.settings = { soundVolume: 40, soundEnabled: true, browserNotifications: true };
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: FakeNotification,
    });
    Object.defineProperty(window, 'Audio', { configurable: true, value: FakeAudio });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('avisa pelo navegador no INSERT, com o push (Service Worker) desligado', async () => {
    renderHook(() => useWarRoomAlerts(), { wrapper: wrapper() });
    await waitFor(() => expect(h.handler).toBeTruthy());

    act(() => { h.handler!(alerta('critical')); });

    await waitFor(() => expect(h.notificacoes).toHaveLength(1));
    expect(h.notificacoes[0].title).toBe('⚠️ Fila acima do limite');
    expect(h.notificacoes[0].options?.tag).toBe('warroom-x1');
    expect(h.notificacoes[0].options?.body).toBe('12 conversas aguardando');
  });

  it('respeita o "Alertas do navegador" desligado no painel', async () => {
    h.settings = { soundVolume: 40, soundEnabled: true, browserNotifications: false };

    renderHook(() => useWarRoomAlerts(), { wrapper: wrapper() });
    await waitFor(() => expect(h.handler).toBeTruthy());

    act(() => { h.handler!(alerta('warning')); });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(h.notificacoes).toHaveLength(0);
  });
});
