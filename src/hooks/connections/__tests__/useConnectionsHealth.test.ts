import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// O cartão pede estado GLOBAL e confiável das conexões do WhatsApp: uma assinatura
// de realtime só (canal de nome fixo), histórico das quedas da sessão e as ações
// de reconectar uma / reconectar todas. Estes testes chamam o hook real (store real)
// com um cliente fake injetado — nada de mock de comportamento interno.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })},
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
}));

import {
  createConnectionsHealthStore,
  CONNECTIONS_HEALTH_CHANNEL,
  useConnectionsHealth,
  type InvokeConnect,
} from '@/hooks/connections/useConnectionsHealth';

interface Row {
  id: string;
  name: string;
  phone_number: string;
  instance_id: string | null;
  status: string;
  is_default?: boolean;
}

type OrderResult = { data: Row[] | null; error: { message: string } | null };

const row = (id: string, status: string, instanceId: string | null = `inst-${id}`): Row => ({
  id,
  name: `Conexão ${id}`,
  phone_number: `55119999999${id}`,
  instance_id: instanceId,
  status,
});

function createHarness() {
  const resolvers: Array<(value: OrderResult) => void> = [];
  const order = vi.fn(
    () => new Promise<OrderResult>((resolve) => { resolvers.push(resolve); }),
  );
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));

  let payloadCallback: ((payload: unknown) => void) | null = null;
  const channelObject: { on?: unknown; subscribe?: unknown } = {};
  const on = vi.fn((_event: string, _config: unknown, cb: (payload: unknown) => void) => {
    payloadCallback = cb;
    return channelObject;
  });
  const subscribe = vi.fn(() => channelObject);
  channelObject.on = on;
  channelObject.subscribe = subscribe;
  const channel = vi.fn((_name: string) => channelObject);
  const removeChannel = vi.fn();
  const invokeConnect = vi.fn<InvokeConnect>(async () => ({ data: { ok: true }, error: null }));

  const store = createConnectionsHealthStore({
    client: { from, channel, removeChannel },
    invokeConnect,
    now: () => 1000,
  });

  return {
    store,
    from,
    channel,
    on,
    subscribe,
    removeChannel,
    invokeConnect,
    order,
    resolveAt: (index: number, rows: Row[]) => resolvers[index]?.({ data: rows, error: null }),
    resolveErrorAt: (index: number, message: string) =>
      resolvers[index]?.({ data: null, error: { message } }),
    emit: (payload: unknown) => payloadCallback?.(payload),
    channelNames: () => channel.mock.calls.map((call) => call[0]),
  };
}

type Harness = ReturnType<typeof createHarness>;

async function mountLoaded(harness: Harness, rows: Row[]) {
  const view = renderHook(() => useConnectionsHealth(harness.store));
  await act(async () => { harness.resolveAt(0, rows); });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useConnectionsHealth — estado global das conexões', () => {
  it('carrega as conexões e deriva total / conectadas / com problema', async () => {
    const harness = createHarness();
    const view = await mountLoaded(harness, [row('A', 'connected'), row('B', 'disconnected')]);

    expect(view.result.current.total).toBe(2);
    expect(view.result.current.connectedCount).toBe(1);
    expect(view.result.current.disconnected.map((c) => c.id)).toEqual(['B']);
    expect(view.result.current.hasIssue).toBe(true);
    // Carga inicial não é "queda": o histórico da sessão começa vazio.
    expect(view.result.current.history).toEqual([]);
    expect(view.result.current.error).toBeNull();

    view.unmount();
  });

  it('abre UMA assinatura de realtime (canal fixo) para vários consumidores e só derruba no último', async () => {
    const harness = createHarness();
    const first = renderHook(() => useConnectionsHealth(harness.store));
    const second = renderHook(() => useConnectionsHealth(harness.store));

    await act(async () => { harness.resolveAt(0, [row('A', 'connected')]); });
    await waitFor(() => expect(first.result.current.loading).toBe(false));

    // Dois consumidores, uma única assinatura — e sem nome aleatório de canal.
    expect(harness.channel).toHaveBeenCalledTimes(1);
    expect(harness.channelNames()).toEqual([CONNECTIONS_HEALTH_CHANNEL]);

    first.unmount();
    expect(harness.removeChannel).not.toHaveBeenCalled();
    second.unmount();
    expect(harness.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('aplica INSERT / UPDATE / DELETE do realtime no estado', async () => {
    const harness = createHarness();
    const view = await mountLoaded(harness, [row('A', 'connected'), row('B', 'connected')]);

    act(() => {
      harness.emit({ eventType: 'UPDATE', new: { id: 'A', status: 'disconnected', instance_id: 'inst-A' } });
    });
    expect(view.result.current.connections.find((c) => c.id === 'A')?.healthy).toBe(false);

    act(() => {
      harness.emit({ eventType: 'INSERT', new: row('C', 'connected') });
    });
    expect(view.result.current.total).toBe(3);

    act(() => {
      harness.emit({ eventType: 'DELETE', old: { id: 'B' } });
    });
    expect(view.result.current.total).toBe(2);
    expect(view.result.current.connections.some((c) => c.id === 'B')).toBe(false);

    view.unmount();
  });

  it('registra no histórico só a queda de conexão que ESTAVA conectada', async () => {
    const harness = createHarness();
    // B já chega desconectada na carga: não é queda desta sessão.
    const view = await mountLoaded(harness, [row('A', 'connected'), row('B', 'disconnected')]);
    expect(view.result.current.history).toEqual([]);

    act(() => {
      harness.emit({ eventType: 'UPDATE', new: { id: 'A', status: 'disconnected', instance_id: 'inst-A' } });
    });

    expect(view.result.current.history).toHaveLength(1);
    expect(view.result.current.history[0]).toMatchObject({
      connectionId: 'A',
      instanceId: 'inst-A',
      name: 'Conexão A',
      at: 1000,
    });
    expect(view.result.current.history.some((e) => e.connectionId === 'B')).toBe(false);

    // clearHistory limpa a memória da sessão.
    act(() => { view.result.current.clearHistory(); });
    expect(view.result.current.history).toEqual([]);

    view.unmount();
  });

  it('reconnect chama a ação connect da evolution-api com o instance_id e limpa o estado de progresso', async () => {
    const harness = createHarness();
    const view = await mountLoaded(harness, [row('B', 'disconnected')]);

    let result: Awaited<ReturnType<typeof view.result.current.reconnect>> | undefined;
    await act(async () => { result = await view.result.current.reconnect('B'); });

    expect(harness.invokeConnect).toHaveBeenCalledWith('inst-B');
    expect(result).toEqual({ ok: true });
    expect(view.result.current.reconnecting).toBeNull();

    view.unmount();
  });

  it('reconnect não chama a API quando a conexão não tem instância', async () => {
    const harness = createHarness();
    const view = await mountLoaded(harness, [row('D', 'disconnected', null)]);

    let result: Awaited<ReturnType<typeof view.result.current.reconnect>> | undefined;
    await act(async () => { result = await view.result.current.reconnect('D'); });

    expect(result?.ok).toBe(false);
    expect(result?.error).toContain('instância');
    expect(harness.invokeConnect).not.toHaveBeenCalled();

    view.unmount();
  });

  it('reconnectAll reconecta só as desconectadas e resume o resultado', async () => {
    const harness = createHarness();
    const view = await mountLoaded(harness, [
      row('A', 'connected'),
      row('B', 'disconnected'),
      row('C', 'disconnected'),
    ]);

    let summary: Awaited<ReturnType<typeof view.result.current.reconnectAll>> | undefined;
    await act(async () => { summary = await view.result.current.reconnectAll(); });

    expect(summary).toEqual({ total: 2, ok: 2, skipped: 0, failed: 0 });
    expect(harness.invokeConnect).toHaveBeenCalledTimes(2);
    expect(harness.invokeConnect).toHaveBeenCalledWith('inst-B');
    expect(harness.invokeConnect).toHaveBeenCalledWith('inst-C');
    expect(view.result.current.reconnectingAll).toBe(false);

    view.unmount();
  });

  it('reconnectAll conta falha da Evolution sem anunciar sucesso', async () => {
    const harness = createHarness();
    harness.invokeConnect.mockResolvedValue({
      data: { error: true, message: 'sem autorização' },
      error: null,
    });
    const view = await mountLoaded(harness, [row('B', 'disconnected')]);

    let summary: Awaited<ReturnType<typeof view.result.current.reconnectAll>> | undefined;
    await act(async () => { summary = await view.result.current.reconnectAll(); });

    expect(summary).toEqual({ total: 1, ok: 0, skipped: 0, failed: 1 });
    expect(view.result.current.reconnectingAll).toBe(false);

    view.unmount();
  });

  it('clique duplo na reconexão da mesma conexão ignora a segunda chamada', async () => {
    const harness = createHarness();
    let release: () => void = () => {};
    harness.invokeConnect.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve({ data: { ok: true }, error: null }); }),
    );
    const view = await mountLoaded(harness, [row('B', 'disconnected')]);

    let first: Awaited<ReturnType<typeof view.result.current.reconnect>> | undefined;
    let second: Awaited<ReturnType<typeof view.result.current.reconnect>> | undefined;
    await act(async () => {
      const firstPromise = view.result.current.reconnect('B');
      const secondPromise = view.result.current.reconnect('B');
      release();
      first = await firstPromise;
      second = await secondPromise;
    });

    expect(harness.invokeConnect).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: false, skipped: true });

    view.unmount();
  });

  it('descarta a resposta atrasada de um refresh antigo (não sobrescreve nem prende o loading)', async () => {
    const harness = createHarness();
    const view = renderHook(() => useConnectionsHealth(harness.store));
    // refresh #1 fica pendente (resolver 0).

    // Um segundo refresh nasce e resolve primeiro: é o estado mais novo.
    act(() => { void view.result.current.refresh(); });
    await act(async () => { harness.resolveAt(1, [row('A', 'connected')]); });
    await waitFor(() => expect(view.result.current.total).toBe(1));

    // A resposta do refresh #1 chega atrasada: precisa ser descartada.
    await act(async () => { harness.resolveAt(0, [row('A', 'connected'), row('B', 'disconnected')]); });

    expect(view.result.current.total).toBe(1);
    expect(view.result.current.loading).toBe(false);
    expect(view.result.current.error).toBeNull();

    view.unmount();
  });

  it('propaga erro de carga sem mentir sobre o estado', async () => {
    const harness = createHarness();
    const view = renderHook(() => useConnectionsHealth(harness.store));
    await act(async () => { harness.resolveErrorAt(0, 'permission denied'); });
    await waitFor(() => expect(view.result.current.loading).toBe(false));

    expect(view.result.current.error).toBe('permission denied');
    expect(view.result.current.connections).toEqual([]);

    view.unmount();
  });
});
