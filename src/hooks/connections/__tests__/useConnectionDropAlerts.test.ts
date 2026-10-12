import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// O cartão pede o aviso GLOBAL de queda de número (toast + notificação do navegador) em
// qualquer tela, só para staff e respeitando a preferência de notificações. Estes testes
// chamam o hook REAL com o store real (cliente fake injetado), como o card do GL1.

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Preferências, papel e os canais de aviso são as BORDAS do hook: entram como dublês para o
// teste controlar staff/preferência e observar o que foi anunciado, sem depender de rede,
// React Query ou da API de Notification do navegador.
const h = vi.hoisted(() => ({
  browserNotifications: true,
  quiet: false,
  isSupervisor: true,
  toast: vi.fn(),
  showBrowserNotification: vi.fn(),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: h.toast, useToast: () => ({ toast: h.toast }) }));
vi.mock('@/utils/notificationSounds', () => ({ showBrowserNotification: h.showBrowserNotification }));
vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { browserNotifications: h.browserNotifications },
    isQuietHours: () => h.quiet,
    updateSettings: vi.fn(),
    resetSettings: vi.fn(),
    isLoading: false,
    isSaving: false,
  }),
}));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isSupervisor: h.isSupervisor, isAdmin: h.isSupervisor, roles: [], loading: false }),
}));

import {
  createConnectionsHealthStore,
  type InvokeConnect,
} from '@/hooks/connections/useConnectionsHealth';
import {
  useConnectionDropAlerts,
  createDropAlertGate,
  DROP_ALERT_DEDUP_MS,
} from '@/hooks/connections/useConnectionDropAlerts';

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

function createHarness(startAt = 1000) {
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

  let clock = startAt;
  const store = createConnectionsHealthStore({
    client: { from, channel, removeChannel },
    invokeConnect,
    now: () => clock,
  });

  return {
    store,
    channel,
    removeChannel,
    resolveAt: (index: number, rows: Row[]) => resolvers[index]?.({ data: rows, error: null }),
    emit: (payload: unknown) => payloadCallback?.(payload),
    setClock: (value: number) => { clock = value; },
  };
}

type Harness = ReturnType<typeof createHarness>;

function drop(harness: Harness, id: string, instanceId = `inst-${id}`) {
  act(() => {
    harness.emit({ eventType: 'UPDATE', new: { id, status: 'disconnected', instance_id: instanceId } });
  });
}

function restore(harness: Harness, id: string, instanceId = `inst-${id}`) {
  act(() => {
    harness.emit({ eventType: 'UPDATE', new: { id, status: 'connected', instance_id: instanceId } });
  });
}

async function mountAlerts(harness: Harness, rows: Row[]) {
  const view = renderHook(() => useConnectionDropAlerts({ store: harness.store }));
  await act(async () => { harness.resolveAt(0, rows); });
  await waitFor(() => expect(harness.store.getSnapshot().loading).toBe(false));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.browserNotifications = true;
  h.quiet = false;
  h.isSupervisor = true;
});

describe('createDropAlertGate — agrupamento por conexão', () => {
  it('libera a primeira queda, agrupa as repetidas em 5 min e libera depois da janela', () => {
    const gate = createDropAlertGate();

    expect(gate.shouldNotify('A', 1_000)).toBe(true);
    expect(gate.shouldNotify('A', 1_000)).toBe(false);
    expect(gate.shouldNotify('A', 1_000 + DROP_ALERT_DEDUP_MS - 1)).toBe(false);
    // Conexão diferente tem a própria janela.
    expect(gate.shouldNotify('B', 1_000 + DROP_ALERT_DEDUP_MS - 1)).toBe(true);
    expect(gate.shouldNotify('A', 1_000 + DROP_ALERT_DEDUP_MS)).toBe(true);
  });
});

describe('useConnectionDropAlerts — aviso global de queda de conexão', () => {
  it('avisa a queda com toast e notificação do navegador', async () => {
    const harness = createHarness();
    await mountAlerts(harness, [row('A', 'connected')]);

    drop(harness, 'A');

    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1));
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('Conexão A') }),
    );
    expect(h.showBrowserNotification).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Conexão A'),
      expect.objectContaining({ tag: 'dc-inst-A' }),
    );
  });

  it('avisa também quando a conexão degrada (sai de "connected" para outro estado)', async () => {
    const harness = createHarness();
    await mountAlerts(harness, [row('A', 'connected')]);

    act(() => {
      harness.emit({ eventType: 'UPDATE', new: { id: 'A', status: 'connecting', instance_id: 'inst-A' } });
    });

    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1));
    expect(h.showBrowserNotification).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Conexão A'),
      expect.objectContaining({ tag: 'dc-inst-A' }),
    );
  });

  it('não avisa na carga inicial de uma conexão que já chega desconectada', async () => {
    const harness = createHarness();
    await mountAlerts(harness, [row('B', 'disconnected')]);

    await act(async () => { await Promise.resolve(); });

    expect(h.toast).not.toHaveBeenCalled();
    expect(h.showBrowserNotification).not.toHaveBeenCalled();
  });

  it('agrupa por conexão: queda repetida em menos de 5 min não repete o aviso, depois repete', async () => {
    const harness = createHarness(1_000);
    await mountAlerts(harness, [row('A', 'connected')]);

    drop(harness, 'A');
    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1));

    restore(harness, 'A');
    harness.setClock(1_000 + 60_000);
    drop(harness, 'A');
    await act(async () => { await Promise.resolve(); });
    expect(h.toast).toHaveBeenCalledTimes(1);

    restore(harness, 'A');
    harness.setClock(1_000 + DROP_ALERT_DEDUP_MS);
    drop(harness, 'A');
    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(2));
  });

  it('cada conexão tem a própria janela — a queda de outra avisa na hora', async () => {
    const harness = createHarness();
    await mountAlerts(harness, [row('A', 'connected'), row('B', 'connected')]);

    drop(harness, 'A');
    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1));
    drop(harness, 'B');
    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(2));
  });

  it('não avisa quando o usuário desligou a notificação no navegador', async () => {
    h.browserNotifications = false;
    const harness = createHarness();
    await mountAlerts(harness, [row('A', 'connected')]);

    drop(harness, 'A');
    await act(async () => { await Promise.resolve(); });

    expect(h.toast).not.toHaveBeenCalled();
    expect(h.showBrowserNotification).not.toHaveBeenCalled();
  });

  it('não avisa durante o horário de silêncio', async () => {
    h.quiet = true;
    const harness = createHarness();
    await mountAlerts(harness, [row('A', 'connected')]);

    drop(harness, 'A');
    await act(async () => { await Promise.resolve(); });

    expect(h.toast).not.toHaveBeenCalled();
    expect(h.showBrowserNotification).not.toHaveBeenCalled();
  });

  it('agente (não staff) não recebe o aviso', async () => {
    h.isSupervisor = false;
    const harness = createHarness();
    await mountAlerts(harness, [row('A', 'connected')]);

    drop(harness, 'A');
    await act(async () => { await Promise.resolve(); });

    expect(h.toast).not.toHaveBeenCalled();
    expect(h.showBrowserNotification).not.toHaveBeenCalled();
  });

  it('avisa a queda que chegou antes do papel carregar, sem repetir quando o papel resolve', async () => {
    h.isSupervisor = false;
    const harness = createHarness();
    const view = await mountAlerts(harness, [row('A', 'connected')]);

    drop(harness, 'A');
    await act(async () => { await Promise.resolve(); });
    expect(h.toast).not.toHaveBeenCalled();

    h.isSupervisor = true;
    view.rerender();

    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1));
    view.rerender();
    await act(async () => { await Promise.resolve(); });
    expect(h.toast).toHaveBeenCalledTimes(1);
  });
});
