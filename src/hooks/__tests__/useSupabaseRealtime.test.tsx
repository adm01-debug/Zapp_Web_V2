import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const realtimeMocks = vi.hoisted(() => ({
  channel: vi.fn(),
  on: vi.fn(),
  subscribe: vi.fn(),
  removeChannel: vi.fn(),
  statusCallback: undefined as ((status: string, error?: Error) => void) | undefined,
  payloadCallback: undefined as ((payload: unknown) => void) | undefined,
  channelObject: {} as Record<string, unknown>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: realtimeMocks.channel,
    removeChannel: realtimeMocks.removeChannel,
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useSupabaseRealtime } from '@/hooks/realtime/useSupabaseRealtime';

describe('useSupabaseRealtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    realtimeMocks.statusCallback = undefined;
    realtimeMocks.payloadCallback = undefined;
    realtimeMocks.channelObject = {
      on: realtimeMocks.on,
      subscribe: realtimeMocks.subscribe,
    };
    realtimeMocks.channel.mockReturnValue(realtimeMocks.channelObject);
    realtimeMocks.on.mockImplementation((_event, _config, callback) => {
      realtimeMocks.payloadCallback = callback;
      return realtimeMocks.channelObject;
    });
    realtimeMocks.subscribe.mockImplementation((callback) => {
      realtimeMocks.statusCallback = callback;
      return realtimeMocks.channelObject;
    });
    realtimeMocks.removeChannel.mockResolvedValue('ok');
  });

  it('delegates channel recovery to the native client without recreating channels', () => {
    const { unmount } = renderHook(() => useSupabaseRealtime({
      channelName: 'queues-changes',
      table: 'queues',
    }));

    act(() => {
      realtimeMocks.statusCallback?.('CHANNEL_ERROR');
      vi.advanceTimersByTime(60_000);
    });

    expect(realtimeMocks.channel).toHaveBeenCalledTimes(1);
    expect(realtimeMocks.removeChannel).not.toHaveBeenCalled();

    unmount();
    act(() => vi.advanceTimersByTime(250));
    expect(realtimeMocks.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('omits an undefined filter from the Realtime binding', () => {
    renderHook(() => useSupabaseRealtime({
      channelName: 'messages-all',
      table: 'messages',
    }));

    const binding = realtimeMocks.on.mock.calls[0][1];
    expect(binding).toEqual({ event: '*', schema: 'public', table: 'messages' });
    expect(binding).not.toHaveProperty('filter');
  });

  it('keeps one subscription while dispatching to the latest callback', () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const { rerender } = renderHook(
      ({ handler }) => useSupabaseRealtime({
        channelName: 'messages-contact-1',
        table: 'messages',
        filter: 'contact_id=eq.contact-1',
        onInsert: handler,
      }),
      { initialProps: { handler: firstHandler } }
    );

    rerender({ handler: secondHandler });
    act(() => {
      realtimeMocks.payloadCallback?.({ eventType: 'INSERT', new: { id: 'message-1' } });
    });

    expect(realtimeMocks.channel).toHaveBeenCalledTimes(1);
    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe while disabled', () => {
    renderHook(() => useSupabaseRealtime({
      channelName: 'disabled-channel',
      table: 'messages',
      enabled: false,
    }));

    expect(realtimeMocks.channel).not.toHaveBeenCalled();
  });

  it('keeps a shared channel alive until the final consumer unmounts', () => {
    const first = vi.fn();
    const second = vi.fn();
    const one = renderHook(() => useSupabaseRealtime({
      channelName: 'queues-shared', table: 'queues', onAll: first,
    }));
    const two = renderHook(() => useSupabaseRealtime({
      channelName: 'queues-shared', table: 'queues', onAll: second,
    }));

    expect(realtimeMocks.channel).toHaveBeenCalledTimes(1);
    act(() => realtimeMocks.payloadCallback?.({ eventType: 'UPDATE', new: { id: 'q1' } }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    one.unmount();
    act(() => vi.advanceTimersByTime(250));
    expect(realtimeMocks.removeChannel).not.toHaveBeenCalled();

    act(() => realtimeMocks.payloadCallback?.({ eventType: 'UPDATE', new: { id: 'q2' } }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    two.unmount();
    act(() => vi.advanceTimersByTime(250));
    expect(realtimeMocks.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('cancels deferred removal when StrictMode-style remount happens', () => {
    const first = renderHook(() => useSupabaseRealtime({
      channelName: 'strict-remount', table: 'messages',
    }));
    first.unmount();

    const second = renderHook(() => useSupabaseRealtime({
      channelName: 'strict-remount', table: 'messages',
    }));
    act(() => vi.advanceTimersByTime(250));

    expect(realtimeMocks.channel).toHaveBeenCalledTimes(1);
    expect(realtimeMocks.removeChannel).not.toHaveBeenCalled();
    second.unmount();
    act(() => vi.advanceTimersByTime(250));
  });
});
