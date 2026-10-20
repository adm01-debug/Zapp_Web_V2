import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// [refazer 1] P3 — handleAddConnection valida a contagem de dígitos:
// só o '+55' do pré-preenchimento (ou qualquer número com menos de 10
// dígitos) não passa; exige nome + número válido com DDI+DDD.
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  channel: vi.fn(),
  toast: vi.fn(),
  logError: vi.fn(),
  createConnection: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
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
    createConnection: (...args: unknown[]) => mocks.createConnection(...args),
    connectInstance: vi.fn(),
    getInstanceStatus: vi.fn(),
    disconnectInstance: vi.fn(),
    deleteInstance: vi.fn(),
  }),
}));

import { useConnectionsManager } from '@/hooks/inbox/useConnectionsManager';

const MENSAGEM = 'Preencha o nome e um número válido com DDI+DDD (mínimo 10 dígitos).';

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
  mocks.order.mockResolvedValue({ data: [], error: null });
  mocks.from.mockImplementation(() => ({ select: mocks.select }));
  mocks.channel.mockImplementation(() => ({ on: () => ({ subscribe: () => ({}) }) }));
  mocks.createConnection.mockResolvedValue({ connection: null });
});

describe('useConnectionsManager.handleAddConnection — validação do telefone', () => {
  it('só o +55 do pré-preenchimento não passa (menos de 10 dígitos)', async () => {
    const result = await mount();

    act(() => {
      result.current.setNewConnection({ name: 'Vendas', phone_number: '55' });
    });
    await act(async () => {
      await result.current.handleAddConnection();
    });

    expect(mocks.createConnection).not.toHaveBeenCalled();
    expect(result.current.addConnectionError).toBe(MENSAGEM);
    expect(toasts().find((t) => t.variant === 'destructive')?.description).toBe(MENSAGEM);
  });

  it('número curto (<10 dígitos) não passa', async () => {
    const result = await mount();

    act(() => {
      result.current.setNewConnection({ name: 'Vendas', phone_number: '5511' });
    });
    await act(async () => {
      await result.current.handleAddConnection();
    });

    expect(mocks.createConnection).not.toHaveBeenCalled();
    expect(result.current.addConnectionError).toBe(MENSAGEM);
  });

  it('nome vazio não passa mesmo com número válido', async () => {
    const result = await mount();

    act(() => {
      result.current.setNewConnection({ name: '', phone_number: '5511987654321' });
    });
    await act(async () => {
      await result.current.handleAddConnection();
    });

    expect(mocks.createConnection).not.toHaveBeenCalled();
    expect(result.current.addConnectionError).toBe(MENSAGEM);
  });

  it('BR válido (12 dígitos) cria a conexão levando os dígitos crus', async () => {
    const result = await mount();

    act(() => {
      result.current.setNewConnection({ name: 'Vendas', phone_number: '5511987654321' });
    });
    await act(async () => {
      await result.current.handleAddConnection();
    });

    expect(mocks.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Vendas', phone_number: '5511987654321' }),
    );
    expect(result.current.addConnectionError).toBeNull();
    expect(result.current.isAddDialogOpen).toBe(false);
  });
});
