import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F85/F88 — "Digitando…" do Team Chat.
 *
 * A lacuna: `useTeamTyping` mandava um `typing:true` a CADA tecla (sem
 * throttle) e o timer que envia o "parou de digitar" sobrevivia ao unmount,
 * escrevendo no canal já removido. Aqui o canal é um mock e os relógios são
 * controlados, para provar o throttle de 2 s, a parada em 3 s e a limpeza.
 */
const f = vi.hoisted(() => {
  type Handler = (msg: { payload: unknown }) => void;
  const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const handlers: Handler[] = [];
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, cb: Handler) => {
      handlers.push(cb);
      return channel;
    }),
    subscribe: vi.fn(() => channel),
    send: vi.fn((msg: { event: string; payload: Record<string, unknown> }) => {
      sent.push(msg);
      return Promise.resolve('ok');
    }),
  };
  return {
    sent,
    handlers,
    channel,
    channelFactory: vi.fn((_name: string) => channel),
    removeChannel: vi.fn((_channel: unknown) => Promise.resolve('ok')),
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (name: string) => f.channelFactory(name),
    removeChannel: (channel: unknown) => f.removeChannel(channel),
  },
}));

import { useTeamTyping } from '@/hooks/team-chat/useTeamTyping';

// Números do requisito (F85), fixados aqui de propósito: o teste afirma a
// REGRA (2 s de throttle, 3 s para parar), não o valor que o código escolher.
const THROTTLE_MS = 2000;
const STOP_MS = 3000;
const HIDE_MS = 4000;

const lastSend = () => f.sent[f.sent.length - 1];

describe('useTeamTyping — throttle, parada e limpeza', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 });
    f.sent.length = 0;
    f.handlers.length = 0;
    f.channelFactory.mockClear();
    f.channel.on.mockClear();
    f.channel.subscribe.mockClear();
    f.channel.send.mockClear();
    f.removeChannel.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('assina um canal por conversa', () => {
    renderHook(() => useTeamTyping('conv-1', 'me', 'Eu'));

    expect(f.channelFactory).toHaveBeenCalledWith('team-typing-conv-1');
    expect(f.handlers).toHaveLength(1);
  });

  it('throttle: teclas seguidas (dentro de 2 s) geram UM aviso só', () => {
    const { result } = renderHook(() => useTeamTyping('conv-1', 'me', 'Eu'));

    act(() => { result.current.sendTyping(true); });
    expect(f.channel.send).toHaveBeenCalledTimes(1);
    expect(lastSend()).toMatchObject({ event: 'typing', payload: { userId: 'me', typing: true } });

    // digitou de novo logo em seguida: nada novo no canal
    act(() => { result.current.sendTyping(true); });
    act(() => { result.current.sendTyping(true); });
    expect(f.channel.send).toHaveBeenCalledTimes(1);

    // depois da janela de throttle, o próximo aviso sai
    act(() => { vi.advanceTimersByTime(THROTTLE_MS); });
    act(() => { result.current.sendTyping(true); });
    expect(f.channel.send).toHaveBeenCalledTimes(2);
  });

  it('parada: 3 s sem teclar envia typing:false', () => {
    const { result } = renderHook(() => useTeamTyping('conv-1', 'me', 'Eu'));

    act(() => { result.current.sendTyping(true); });
    act(() => { vi.advanceTimersByTime(STOP_MS); });

    expect(lastSend()).toMatchObject({ event: 'typing', payload: { userId: 'me', typing: false } });
  });

  it('parada explícita não é duplicada pelo timer pendente', () => {
    const { result } = renderHook(() => useTeamTyping('conv-1', 'me', 'Eu'));

    act(() => { result.current.sendTyping(true); });
    act(() => { result.current.sendTyping(false); });
    const enviados = f.channel.send.mock.calls.length;

    act(() => { vi.advanceTimersByTime(STOP_MS * 2); });

    expect(f.channel.send.mock.calls.length).toBe(enviados);
  });

  it('aviso recebido mostra o nome e some sozinho', () => {
    const { result } = renderHook(() => useTeamTyping('conv-1', 'me', 'Eu'));

    act(() => {
      f.handlers.forEach(h => h({ payload: { userId: 'outro', name: 'B', typing: true } }));
    });
    expect(result.current.typingLabel).toBe('B está digitando...');

    act(() => { vi.advanceTimersByTime(HIDE_MS); });
    expect(result.current.typingLabel).toBeNull();
  });

  it('ignora o eco do próprio aviso', () => {
    const { result } = renderHook(() => useTeamTyping('conv-1', 'me', 'Eu'));

    act(() => {
      f.handlers.forEach(h => h({ payload: { userId: 'me', name: 'Eu', typing: true } }));
    });

    expect(result.current.typingUsers).toEqual([]);
    expect(result.current.typingLabel).toBeNull();
  });

  it('desmontar remove o canal e não sobra timer escrevendo nele', () => {
    const { result, unmount } = renderHook(() => useTeamTyping('conv-1', 'me', 'Eu'));

    act(() => { result.current.sendTyping(true); });
    const enviadosComAviso = f.channel.send.mock.calls.length;
    expect(enviadosComAviso).toBe(1);

    unmount();
    expect(f.removeChannel).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(STOP_MS * 3); });
    expect(f.channel.send.mock.calls.length).toBe(enviadosComAviso);
  });
});
