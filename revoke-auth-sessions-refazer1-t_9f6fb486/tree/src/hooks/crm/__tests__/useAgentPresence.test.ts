import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const h = vi.hoisted(() => {
  const state = {
    subscribeCb: undefined as undefined | ((s: string) => void),
    changeCb: undefined as undefined | ((payload: unknown) => void),
    selectResult: { data: [] as unknown[] },
  };
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  const query = {
    select: vi.fn(),
    upsert: vi.fn(),
  };
  const supabase = { channel: vi.fn(), removeChannel: vi.fn(), from: vi.fn() };
  return { state, channel, query, supabase };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));

async function load() {
  vi.resetModules();
  return import('../useAgentPresence');
}

const flush = () => act(async () => {
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
});

describe('useAgentPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    h.state.subscribeCb = undefined;
    h.state.changeCb = undefined;
    h.state.selectResult = { data: [] };
    h.channel.on.mockReset().mockImplementation((_t: string, _f: unknown, cb: (p: unknown) => void) => { h.state.changeCb = cb; return h.channel; });
    h.channel.subscribe.mockReset().mockImplementation((cb?: (s: string) => void) => { h.state.subscribeCb = cb; return h.channel; });
    h.query.select.mockReset().mockImplementation(() => Promise.resolve(h.state.selectResult));
    h.query.upsert.mockReset().mockResolvedValue({ data: null, error: null });
    h.supabase.from.mockReset().mockReturnValue(h.query);
    h.supabase.channel.mockReset().mockReturnValue(h.channel);
    h.supabase.removeChannel.mockReset().mockResolvedValue('ok');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('entra publicando o status salvo (upsert na própria linha)', async () => {
    localStorage.setItem('zapp-presence-status:u1', 'away');
    const mod = await load();
    renderHook(() => mod.useAgentPresenceJoin('u1'));
    await flush();

    expect(h.supabase.from).toHaveBeenCalledWith('agent_presence');
    expect(h.query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', status: 'away' })
    );
  });

  it('setMyPresenceStatus salva no navegador, faz upsert e reflete no hook', async () => {
    const mod = await load();
    const { result } = renderHook(() => {
      mod.useAgentPresenceJoin('u1');
      return mod.useMyPresenceStatus();
    });
    await flush();
    expect(result.current).toBe('online');

    act(() => mod.setMyPresenceStatus('offline'));

    expect(result.current).toBe('offline');
    expect(localStorage.getItem('zapp-presence-status:u1')).toBe('offline');
    expect(h.query.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ user_id: 'u1', status: 'offline' })
    );
  });

  it('carrega o mapa inicial da tabela e atualiza via postgres_changes', async () => {
    h.state.selectResult = { data: [{ user_id: 'u2', status: 'online', updated_at: new Date().toISOString() }] };
    const mod = await load();
    const { result } = renderHook(() => {
      mod.useAgentPresenceJoin('u1');
      return mod.useAgentPresenceMap();
    });
    await flush();
    expect(result.current).toEqual({ u2: 'online' });

    act(() => {
      h.state.changeCb?.({ eventType: 'UPDATE', new: { user_id: 'u2', status: 'away', updated_at: new Date().toISOString() } });
    });
    expect(result.current).toEqual({ u2: 'away' });
  });

  it('marca como offline quando o heartbeat de outro agente fica velho', async () => {
    const stale = new Date(Date.now() - 5 * 60_000).toISOString();
    h.state.selectResult = { data: [{ user_id: 'u2', status: 'online', updated_at: stale }] };
    const mod = await load();
    const { result } = renderHook(() => {
      mod.useAgentPresenceJoin('u1');
      return mod.useAgentPresenceMap();
    });
    await flush();
    expect(result.current).toEqual({ u2: 'offline' });
  });

  it('manda heartbeat periódico enquanto conectado', async () => {
    const mod = await load();
    renderHook(() => mod.useAgentPresenceJoin('u1'));
    await flush();
    const callsAfterJoin = h.query.upsert.mock.calls.length;

    await act(async () => { await vi.advanceTimersByTimeAsync(25_000); });

    expect(h.query.upsert.mock.calls.length).toBeGreaterThan(callsAfterJoin);
  });

  it('sai da presença ao desmontar (para o heartbeat e remove o canal)', async () => {
    const mod = await load();
    const { unmount } = renderHook(() => mod.useAgentPresenceJoin('u1'));
    await flush();
    unmount();

    expect(h.supabase.removeChannel).toHaveBeenCalledWith(h.channel);

    const callsAfterUnmount = h.query.upsert.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(h.query.upsert.mock.calls.length).toBe(callsAfterUnmount);
  });
});
