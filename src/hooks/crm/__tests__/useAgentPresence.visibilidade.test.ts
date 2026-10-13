/**
 * R2-INB-058 — presença em aba oculta e ao fechar.
 *
 * O heartbeat de 25s não tinha `pagehide`/`visibilitychange`: ao fechar ou
 * recarregar a aba a linha ficava 'online' no banco até expirar (até 75s), e em
 * aba oculta o navegador limita os timers, então o heartbeat chegava tarde ou
 * nunca — o agente "piscava" offline na tela dos outros. Agora: `pagehide`
 * publica 'offline' na hora; aba oculta pausa heartbeat e recálculo; voltar
 * para `visible` republica o status e retoma o heartbeat.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const h = vi.hoisted(() => {
  const state = {
    subscribeCb: undefined as undefined | ((s: string) => void),
    changeCb: undefined as undefined | ((payload: unknown) => void),
    selectResult: { data: [] as unknown[] },
  };
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  const query = { select: vi.fn(), upsert: vi.fn() };
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

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

const ultimoStatus = () => {
  const call = h.query.upsert.mock.calls[h.query.upsert.mock.calls.length - 1];
  return (call?.[0] as { status?: string } | undefined)?.status;
};

describe('useAgentPresence — visibilidade e fechamento', () => {
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
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pagehide publica offline na hora (fechar/recarregar a aba)', async () => {
    const mod = await load();
    renderHook(() => mod.useAgentPresenceJoin('u1'));
    await flush();

    act(() => { window.dispatchEvent(new Event('pagehide')); });

    expect(ultimoStatus()).toBe('offline');
  });

  it('aba oculta pausa o heartbeat (sem upsert atrasado e sem piscar offline)', async () => {
    const mod = await load();
    renderHook(() => mod.useAgentPresenceJoin('u1'));
    await flush();

    setVisibility('hidden');
    const callsAfterHide = h.query.upsert.mock.calls.length;

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    expect(h.query.upsert.mock.calls.length).toBe(callsAfterHide);
  });

  it('voltar para visible republica o status e retoma o heartbeat', async () => {
    const mod = await load();
    renderHook(() => mod.useAgentPresenceJoin('u1'));
    await flush();

    setVisibility('hidden');
    setVisibility('visible');

    expect(ultimoStatus()).toBe('online');
    const callsAfterResume = h.query.upsert.mock.calls.length;

    await act(async () => { await vi.advanceTimersByTimeAsync(25_000); });

    expect(h.query.upsert.mock.calls.length).toBeGreaterThan(callsAfterResume);
  });
});
