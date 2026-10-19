/// <reference lib="dom" />
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Recuperacao de realtime: queda nao avisa o hook. Os unicos sinais de "voltei"
// sao o SUBSCRIBED que segue um erro e os eventos de `online`/foco do navegador.
// O callback onReconnect e o gancho que o consumidor usa para revalidar (mensagens
// da conversa ativa, lista de conversas); rajada vira uma unica chamada por 5 s.
const realtimeMocks = vi.hoisted(() => ({
  channel: vi.fn(),
  on: vi.fn(),
  subscribe: vi.fn(),
  removeChannel: vi.fn(),
  statusCallback: undefined as ((status: string, error?: Error) => void) | undefined,
  payloadCallback: undefined as ((payload: unknown) => void) | undefined,
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
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })},
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
}));

import { useSupabaseRealtime } from '@/hooks/realtime/useSupabaseRealtime';

function mount(channelName: string) {
  const onReconnect = vi.fn();
  const view = renderHook(() => useSupabaseRealtime({
    channelName,
    table: 'messages',
    onReconnect,
  }));
  return { onReconnect, view };
}

function status(next: string) {
  act(() => { realtimeMocks.statusCallback?.(next); });
}

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
  realtimeMocks.on.mockImplementation((_event: string, _config: Record<string, unknown>, callback: RealtimePayloadCallback) => {
    realtimeMocks.payloadCallback = callback;
    return realtimeMocks.channelObject;
  });
  realtimeMocks.subscribe.mockImplementation((callback: RealtimeStatusCallback) => {
    realtimeMocks.statusCallback = callback;
    return realtimeMocks.channelObject;
  });
  realtimeMocks.removeChannel.mockResolvedValue('ok');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSupabaseRealtime — revalidacao apos queda', () => {
  it('nao revalida no SUBSCRIBED inicial (nao houve queda)', () => {
    const { onReconnect, view } = mount('rec-initial');

    status('SUBSCRIBED');

    expect(onReconnect).not.toHaveBeenCalled();
    view.unmount();
  });

  it('revalida quando o SUBSCRIBED segue CHANNEL_ERROR, com limite de 5 s', () => {
    const { onReconnect, view } = mount('rec-error');

    status('SUBSCRIBED');   // inicial: nada a revalidar
    status('CHANNEL_ERROR');
    status('SUBSCRIBED');
    expect(onReconnect).toHaveBeenCalledTimes(1);

    // Queda e volta imediatas ainda dentro da janela: nao gera segunda busca.
    status('CHANNEL_ERROR');
    status('SUBSCRIBED');
    expect(onReconnect).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(5_001));
    status('CHANNEL_ERROR');
    status('SUBSCRIBED');
    expect(onReconnect).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('agenda uma revalidacao final quando o canal so volta depois do foco visivel', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { onReconnect, view } = mount('rec-visible-before-socket');

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(onReconnect).toHaveBeenCalledTimes(1);

    // A maquina acordou, mas o socket ainda nao estava pronto. Dois segundos
    // depois o canal reporta queda + SUBSCRIBED; esse sinal nao pode ser perdido
    // pelo limite aberto no visibilitychange.
    act(() => vi.advanceTimersByTime(2_000));
    status('CHANNEL_ERROR');
    status('SUBSCRIBED');
    expect(onReconnect).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(2_999));
    expect(onReconnect).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(onReconnect).toHaveBeenCalledTimes(2);

    act(() => vi.advanceTimersByTime(5_000));
    expect(onReconnect).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('colapsa dois canais com o mesmo callback no mesmo gatilho', () => {
    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
    const onReconnect = vi.fn();
    const view = renderHook(() => {
      useSupabaseRealtime({ channelName: 'rec-shared-messages', table: 'messages', onReconnect });
      useSupabaseRealtime({ channelName: 'rec-shared-contacts', table: 'contacts', onReconnect });
    });

    act(() => { window.dispatchEvent(new Event('online')); });
    expect(onReconnect).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(5_001));
    expect(onReconnect).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('nao dispara timer final pendente depois do unmount', () => {
    vi.setSystemTime(new Date('2026-01-01T00:02:00Z'));
    const { onReconnect, view } = mount('rec-pending-unmount');

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(onReconnect).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(2_000));
    status('CHANNEL_ERROR');
    status('SUBSCRIBED');
    view.unmount();

    act(() => vi.advanceTimersByTime(5_000));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('nao revalida quando a aba volta para o fundo (hidden)', () => {
    const { onReconnect, view } = mount('rec-hidden');

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(onReconnect).not.toHaveBeenCalled();
    view.unmount();
  });

  it('remove os listeners de janela e foco ao desmontar', () => {
    const { onReconnect, view } = mount('rec-unmount');

    view.unmount();
    act(() => {
      window.dispatchEvent(new Event('online'));
      vi.advanceTimersByTime(250);
    });

    expect(onReconnect).not.toHaveBeenCalled();
  });
});
