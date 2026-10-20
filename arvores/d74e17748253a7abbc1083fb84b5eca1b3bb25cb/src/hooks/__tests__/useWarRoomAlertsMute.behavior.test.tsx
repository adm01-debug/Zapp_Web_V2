import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Bug: `WarRoomDashboard` chamava `useWarRoomAlerts(true)` — mudo CRAVADO — e o hook não
 * consultava horário de silêncio. Agora o mudo vem da preferência (`settings.soundEnabled`)
 * quando o chamador não força valor, e o horário de silêncio é respeitado.
 */

const h = vi.hoisted(() => {
  const state: { handler: null | ((p: { new: unknown }) => void) } = { handler: null };
  const channelObj: Record<string, unknown> = {};
  channelObj.on = vi.fn((_e: string, _f: unknown, cb: (p: { new: unknown }) => void) => {
    state.handler = cb;
    return channelObj;
  });
  channelObj.subscribe = vi.fn(() => ({ unsubscribe: vi.fn() }));
  return { state, channelObj };
});

const audios: Array<{ play: ReturnType<typeof vi.fn> }> = [];
vi.stubGlobal(
  'Audio',
  class FakeAudio {
    volume = 1;
    currentTime = 0;
    play = vi.fn().mockResolvedValue(undefined);
    constructor() { audios.push(this as never); }
  },
);

const settingsState = { soundVolume: 40, soundEnabled: true };
let quiet = false;

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ settings: settingsState, isQuietHours: () => quiet }),
}));
vi.mock('@/hooks/system/usePushNotifications', () => ({
  usePushNotifications: () => ({ showNotification: vi.fn(), permission: 'denied' }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
        or: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
    channel: vi.fn(() => h.channelObj),
    removeChannel: vi.fn(),
  },
}));

import { useWarRoomAlerts } from '@/hooks/business/useWarRoomAlerts';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const alertaCritico = {
  new: { id: 'x1', alert_type: 'critical', title: 't', message: 'm', source: null, is_read: false, created_at: new Date().toISOString() },
};

const tocou = () => audios.some((a) => a.play.mock.calls.length > 0);

describe('useWarRoomAlerts — mudo do painel e horário de silêncio', () => {
  beforeEach(() => {
    audios.length = 0;
    settingsState.soundEnabled = true;
    quiet = false;
  });

  it('toca quando habilitado e fora do horário de silêncio', async () => {
    renderHook(() => useWarRoomAlerts(), { wrapper: wrapper() });
    await waitFor(() => expect(h.state.handler).toBeTruthy());

    act(() => { h.state.handler!(alertaCritico); });

    await waitFor(() => expect(tocou()).toBe(true));
  });

  it('sem argumento, usa o mudo da preferência: soundEnabled=false → NÃO toca', async () => {
    settingsState.soundEnabled = false;
    renderHook(() => useWarRoomAlerts(), { wrapper: wrapper() });
    await waitFor(() => expect(h.state.handler).toBeTruthy());

    act(() => { h.state.handler!(alertaCritico); });
    await new Promise((r) => setTimeout(r, 20));

    expect(tocou()).toBe(false);
  });

  it('NÃO toca em horário de silêncio mesmo com som ligado', async () => {
    quiet = true;
    renderHook(() => useWarRoomAlerts(true), { wrapper: wrapper() });
    await waitFor(() => expect(h.state.handler).toBeTruthy());

    act(() => { h.state.handler!(alertaCritico); });
    await new Promise((r) => setTimeout(r, 20));

    expect(tocou()).toBe(false);
  });
});
