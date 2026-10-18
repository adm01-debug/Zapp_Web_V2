/// <reference lib="dom" />
/**
 * Cartão t_b23807e6 — o selo "Reconectando…" precisa ser alimentado pelo hook
 * de canal REAL (`useSupabaseRealtime`), não por um mock que já traz a resposta.
 * Aqui o supabase é dublado, mas o hook e o store são os de produção.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const realtimeMocks = vi.hoisted(() => ({
  channel: vi.fn(),
  on: vi.fn(),
  subscribe: vi.fn(),
  removeChannel: vi.fn(),
  statusCallback: undefined as ((status: string, error?: Error) => void) | undefined,
  channelObject: {} as Record<string, unknown>,
}));

type RealtimePayloadCallback = (payload: unknown) => void;
type RealtimeStatusCallback = (status: string, error?: Error) => void;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: realtimeMocks.channel,
    removeChannel: realtimeMocks.removeChannel,
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { useSupabaseRealtime } from '@/hooks/realtime/useSupabaseRealtime';
import {
  REALTIME_STALE_GRACE_MS,
  getRealtimeNoticeSnapshot,
  getRealtimeStatusSnapshot,
  resetRealtimeStatus,
} from '@/hooks/realtime/realtimeStatusStore';

// Mesmo valor de CHANNEL_RELEASE_GRACE_MS do hook: o canal só sai do agregado
// depois dessa carência.
const RELEASE_GRACE_MS = 250;

function montar(channelName: string) {
  return renderHook(() => useSupabaseRealtime({ channelName, table: 'messages' }));
}

function status(next: string) {
  act(() => {
    realtimeMocks.statusCallback?.(next);
  });
}

function liberar(view: ReturnType<typeof montar>): void {
  view.unmount();
  act(() => {
    vi.advanceTimersByTime(RELEASE_GRACE_MS + 50);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetRealtimeStatus();
  realtimeMocks.statusCallback = undefined;
  realtimeMocks.channelObject = { on: realtimeMocks.on, subscribe: realtimeMocks.subscribe };
  realtimeMocks.channel.mockReturnValue(realtimeMocks.channelObject);
  realtimeMocks.on.mockImplementation(
    (_event: string, _config: Record<string, unknown>, callback: RealtimePayloadCallback) => {
      void callback;
      return realtimeMocks.channelObject;
    },
  );
  realtimeMocks.subscribe.mockImplementation((callback: RealtimeStatusCallback) => {
    realtimeMocks.statusCallback = callback;
    return realtimeMocks.channelObject;
  });
  realtimeMocks.removeChannel.mockResolvedValue('ok');
});

afterEach(() => {
  act(() => {
    vi.advanceTimersByTime(RELEASE_GRACE_MS + 50);
  });
  resetRealtimeStatus();
  vi.useRealTimers();
});

describe('useSupabaseRealtime alimenta o agregado do selo', () => {
  it('canal ainda abrindo fica em connecting (não acusa queda)', () => {
    const view = montar('selo-abrindo');

    expect(getRealtimeStatusSnapshot()).toBe('connecting');
    expect(getRealtimeNoticeSnapshot()).toBe(false);
    liberar(view);
  });

  it('SUBSCRIBED deixa o agregado em connected', () => {
    const view = montar('selo-conectado');

    status('SUBSCRIBED');
    expect(getRealtimeStatusSnapshot()).toBe('connected');
    expect(getRealtimeNoticeSnapshot()).toBe(false);
    liberar(view);
  });

  it('CHANNEL_ERROR acusa queda e o selo aparece depois de 5 s', () => {
    const view = montar('selo-erro');

    status('SUBSCRIBED');
    status('CHANNEL_ERROR');

    expect(getRealtimeStatusSnapshot()).toBe('disconnected');
    expect(getRealtimeNoticeSnapshot()).toBe(false);

    act(() => {
      vi.advanceTimersByTime(REALTIME_STALE_GRACE_MS);
    });
    expect(getRealtimeNoticeSnapshot()).toBe(true);

    liberar(view);
  });

  it('o SUBSCRIBED da reconexão apaga o selo', () => {
    const view = montar('selo-reconexao');

    status('CHANNEL_ERROR');
    act(() => {
      vi.advanceTimersByTime(REALTIME_STALE_GRACE_MS);
    });
    expect(getRealtimeNoticeSnapshot()).toBe(true);

    status('SUBSCRIBED');
    expect(getRealtimeStatusSnapshot()).toBe('connected');
    expect(getRealtimeNoticeSnapshot()).toBe(false);
    liberar(view);
  });

  it('canal fechado de verdade (CLOSED) também acusa queda', () => {
    const view = montar('selo-closed');

    status('SUBSCRIBED');
    status('CLOSED');

    expect(getRealtimeStatusSnapshot()).toBe('disconnected');
    liberar(view);
  });

  it('unmount sai do agregado (sem canal, idle e sem selo)', () => {
    const view = montar('selo-unmount');

    status('CHANNEL_ERROR');
    act(() => {
      vi.advanceTimersByTime(REALTIME_STALE_GRACE_MS);
    });
    expect(getRealtimeNoticeSnapshot()).toBe(true);

    liberar(view);

    expect(getRealtimeStatusSnapshot()).toBe('idle');
    expect(getRealtimeNoticeSnapshot()).toBe(false);
  });
});
