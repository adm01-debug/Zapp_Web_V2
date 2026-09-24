import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const h = vi.hoisted(() => {
  const state = {
    subscribeCb: undefined as undefined | ((s: string) => void),
    syncCb: undefined as undefined | (() => void),
    presenceState: {} as Record<string, unknown[]>,
  };
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
    track: vi.fn(),
    untrack: vi.fn(),
    presenceState: vi.fn(),
  };
  const supabase = { channel: vi.fn(), removeChannel: vi.fn() };
  return { state, channel, supabase };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));

async function load() {
  vi.resetModules();
  return import('../useAgentPresence');
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('useAgentPresence', () => {
  beforeEach(() => {
    localStorage.clear();
    h.state.subscribeCb = undefined;
    h.state.syncCb = undefined;
    h.state.presenceState = {};
    h.channel.on.mockReset().mockImplementation((_t: string, _f: unknown, cb: () => void) => { h.state.syncCb = cb; return h.channel; });
    h.channel.subscribe.mockReset().mockImplementation((cb: (s: string) => void) => { h.state.subscribeCb = cb; return h.channel; });
    h.channel.track.mockReset().mockResolvedValue('ok');
    h.channel.untrack.mockReset().mockResolvedValue('ok');
    h.channel.presenceState.mockReset().mockImplementation(() => h.state.presenceState);
    h.supabase.channel.mockReset().mockReturnValue(h.channel);
    h.supabase.removeChannel.mockReset().mockResolvedValue('ok');
  });

  it('entra no canal com a chave do usuário e publica o status salvo', async () => {
    localStorage.setItem('zapp-presence-status:u1', 'away');
    const mod = await load();
    renderHook(() => mod.useAgentPresenceJoin('u1'));
    await flush();

    expect(h.supabase.channel).toHaveBeenCalledWith('agents-presence', { config: { presence: { key: 'u1' } } });
    act(() => h.state.subscribeCb?.('SUBSCRIBED'));
    expect(h.channel.track).toHaveBeenCalledWith({ status: 'away' });
  });

  it('setMyPresenceStatus salva no navegador, publica e reflete no hook', async () => {
    const mod = await load();
    const { result } = renderHook(() => {
      mod.useAgentPresenceJoin('u1');
      return mod.useMyPresenceStatus();
    });
    await flush();
    act(() => h.state.subscribeCb?.('SUBSCRIBED'));
    expect(result.current).toBe('online');

    act(() => mod.setMyPresenceStatus('offline'));

    expect(result.current).toBe('offline');
    expect(localStorage.getItem('zapp-presence-status:u1')).toBe('offline');
    expect(h.channel.track).toHaveBeenLastCalledWith({ status: 'offline' });
  });

  it('o mapa reflete o sync de presença e ignora status inválido', async () => {
    const mod = await load();
    const { result } = renderHook(() => {
      mod.useAgentPresenceJoin('u1');
      return mod.useAgentPresenceMap();
    });
    await flush();
    h.state.presenceState = { u2: [{ status: 'online' }, { status: 'away' }], u3: [{ status: 'xyz' }] };
    act(() => h.state.syncCb?.());

    expect(result.current).toEqual({ u2: 'away' });
  });

  it('sai do canal ao desmontar', async () => {
    const mod = await load();
    const { unmount } = renderHook(() => mod.useAgentPresenceJoin('u1'));
    await flush();
    unmount();

    expect(h.channel.untrack).toHaveBeenCalled();
    expect(h.supabase.removeChannel).toHaveBeenCalledWith(h.channel);
  });
});
