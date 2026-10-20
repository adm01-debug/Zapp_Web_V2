import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Cartão #174: handleSetDefault fazia duas escritas separadas em
// whatsapp_connections (desmarcar todas + marcar a escolhida) e anunciava
// sucesso mesmo quando a troca falhava no meio. Agora a troca é uma chamada
// só à RPC atômica public.set_default_whatsapp_connection (t_ae0a55a6):
// erro da RPC -> toast destrutivo + revalidação, sem mexer no estado;
// sucesso -> o estado reflete o id devolvido em `data`.
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  updateFn: vi.fn(),
  neq: vi.fn(),
  eqUpdate: vi.fn(),
  channel: vi.fn(),
  rpc: vi.fn(),
  toast: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    channel: (...args: unknown[]) => mocks.channel(...args),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/lib/logger', () => ({
  log: {
    error: (...args: unknown[]) => mocks.logError(...args),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    createConnection: vi.fn(),
    connectInstance: vi.fn(),
    getInstanceStatus: vi.fn(),
    disconnectInstance: vi.fn(),
    deleteInstance: vi.fn(),
  }),
}));

import { useConnectionsManager, type WhatsAppConnection } from '@/hooks/inbox/useConnectionsManager';

const A: WhatsAppConnection = {
  id: 'A',
  name: 'Conexão A',
  phone_number: '5511999999999',
  instance_id: 'inst-A',
  status: 'connected',
  qr_code: null,
  is_default: true,
  created_at: '2026-10-05T00:00:00.000Z',
};

const B: WhatsAppConnection = {
  ...A,
  id: 'B',
  name: 'Conexão B',
  phone_number: '5511888888888',
  instance_id: 'inst-B',
  is_default: false,
};

function toasts() {
  return mocks.toast.mock.calls.map((call) => call[0] as { title?: string; description?: string; variant?: string });
}

async function mount() {
  const { result } = renderHook(() => useConnectionsManager());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({ order: mocks.order });
  mocks.order.mockResolvedValue({ data: [A, B], error: null });
  mocks.updateFn.mockReturnValue({ neq: mocks.neq, eq: mocks.eqUpdate });
  mocks.neq.mockResolvedValue({ error: null });
  mocks.eqUpdate.mockResolvedValue({ error: null });
  mocks.from.mockImplementation(() => ({ select: mocks.select, update: mocks.updateFn }));
  mocks.channel.mockImplementation(() => ({ on: () => ({ subscribe: () => ({}) }) }));
});

describe('useConnectionsManager.handleSetDefault (RPC atômica, #174)', () => {
  it('não marca a conexão como padrão nem anuncia sucesso quando a RPC devolve erro', async () => {
    // Equivale à segunda escrita falhando no fluxo antigo: a troca não aconteceu.
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'not_authorized' } });
    mocks.order.mockResolvedValue({ data: [A, B], error: null });
    const result = await mount();

    await act(async () => {
      await result.current.handleSetDefault('B');
    });

    expect(mocks.rpc).toHaveBeenCalledWith('set_default_whatsapp_connection', { p_connection_id: 'B' });
    expect(toasts().map((t) => t.title)).not.toContain('Conexão padrão atualizada');
    const erro = toasts().find((t) => t.variant === 'destructive');
    expect(erro?.description).toContain('not_authorized');
    // Estado continua refletindo o banco: A segue padrão, B não.
    expect(result.current.connections.find((c) => c.id === 'B')?.is_default).toBe(false);
    expect(result.current.connections.find((c) => c.id === 'A')?.is_default).toBe(true);
    // Revalidação como em handleDelete: o fetch roda de novo após o erro.
    expect(mocks.order.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('marca como padrão o id devolvido pela RPC e anuncia sucesso', async () => {
    mocks.rpc.mockResolvedValue({ data: 'B', error: null });
    const result = await mount();

    await act(async () => {
      await result.current.handleSetDefault('B');
    });

    expect(mocks.rpc).toHaveBeenCalledWith('set_default_whatsapp_connection', { p_connection_id: 'B' });
    expect(result.current.connections.find((c) => c.id === 'B')?.is_default).toBe(true);
    expect(result.current.connections.find((c) => c.id === 'A')?.is_default).toBe(false);
    expect(toasts().map((t) => t.title)).toContain('Conexão padrão atualizada');
    // Não resta escrita direta de is_default no hook: a troca é só pela RPC.
    expect(mocks.updateFn).not.toHaveBeenCalled();
  });

  it('não anuncia sucesso quando a RPC resolve sem erro e sem data', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const result = await mount();

    await act(async () => {
      await result.current.handleSetDefault('B');
    });

    expect(toasts().map((t) => t.title)).not.toContain('Conexão padrão atualizada');
    expect(toasts().some((t) => t.variant === 'destructive')).toBe(true);
    expect(result.current.connections.find((c) => c.id === 'B')?.is_default).toBe(false);
    expect(result.current.connections.find((c) => c.id === 'A')?.is_default).toBe(true);
  });
});
