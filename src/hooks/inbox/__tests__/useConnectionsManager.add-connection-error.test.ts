import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * [refazer 1] P1/P2/P3 — erro do diálogo "Adicionar Nova Conexão" no HOOK
 * (sem mock do próprio hook, com `renderHook` no código real):
 *   - nome ou número vazio → erro de validação, sem chamar a Evolution;
 *   - só o DDI ('+55') → erro de validação (não conta como preenchido);
 *   - createConnection rejeita → addConnectionError recebe a mensagem e o
 *     diálogo continua aberto;
 *   - clearAddConnectionError apaga o erro da tentativa anterior;
 *   - sucesso → erro nulo e diálogo fechado (sem regressão).
 */
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  eq: vi.fn(),
  channel: vi.fn(),
  toast: vi.fn(),
  createConnection: vi.fn(),
  logError: vi.fn(),
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
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
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

const VALID_CONNECTION = {
  id: 'c1',
  name: 'Vendas',
  phone_number: '+55 11 98765-4321',
  instance_id: 'vendas_123456',
  status: 'disconnected' as const,
  qr_code: null,
  is_default: false,
  created_at: '2026-10-12T00:00:00.000Z',
};

async function mount() {
  const { result } = renderHook(() => useConnectionsManager());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

describe('useConnectionsManager — erro de nova conexão ([refazer 1] P1/P2/P3)', () => {
  beforeEach(() => {
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ order: mocks.order });
    mocks.order.mockResolvedValue({ data: [], error: null });
    mocks.channel.mockReturnValue({ on: () => ({ subscribe: () => ({}) }) });
    mocks.toast.mockClear();
    mocks.createConnection.mockReset();
    mocks.logError.mockClear();
  });

  it('nome ou número vazio → erro de validação, sem chamar a Evolution, diálogo aberto', async () => {
    const result = await mount();
    act(() => {
      result.current.setIsAddDialogOpen(true);
      result.current.setNewConnection({ name: '', phone_number: '' });
    });

    await act(async () => {
      await result.current.handleAddConnection();
    });

    expect(result.current.addConnectionError).toBe('Preencha o nome e o número do telefone.');
    expect(mocks.createConnection).not.toHaveBeenCalled();
    expect(result.current.isAddDialogOpen).toBe(true);
  });

  it("só o DDI ('+55') → erro de validação (não conta como preenchido)", async () => {
    const result = await mount();
    act(() => {
      result.current.setIsAddDialogOpen(true);
      result.current.setNewConnection({ name: 'Vendas', phone_number: '+55' });
    });

    await act(async () => {
      await result.current.handleAddConnection();
    });

    expect(result.current.addConnectionError).toBe('Preencha o nome e o número do telefone.');
    expect(mocks.createConnection).not.toHaveBeenCalled();
    expect(result.current.isAddDialogOpen).toBe(true);
  });

  it('createConnection rejeita → erro recebe a mensagem e o diálogo continua aberto', async () => {
    mocks.createConnection.mockRejectedValue(new Error('Falha na Evolution'));
    const result = await mount();
    act(() => {
      result.current.setIsAddDialogOpen(true);
      result.current.setNewConnection({ name: 'Vendas', phone_number: '+55 11 98765-4321' });
    });

    await act(async () => {
      await result.current.handleAddConnection();
    });

    expect(result.current.addConnectionError).toBe('Falha na Evolution');
    expect(result.current.isAddDialogOpen).toBe(true);
  });

  it('clearAddConnectionError apaga o erro da tentativa anterior', async () => {
    const result = await mount();
    act(() => {
      result.current.setNewConnection({ name: '', phone_number: '' });
    });
    await act(async () => {
      await result.current.handleAddConnection();
    });
    expect(result.current.addConnectionError).not.toBeNull();

    act(() => {
      result.current.clearAddConnectionError();
    });

    expect(result.current.addConnectionError).toBeNull();
  });

  it('sucesso → erro nulo e diálogo fechado (sem regressão)', async () => {
    mocks.createConnection.mockResolvedValue({ connection: VALID_CONNECTION });
    const result = await mount();
    act(() => {
      result.current.setIsAddDialogOpen(true);
      result.current.setNewConnection({ name: 'Vendas', phone_number: '+55 11 98765-4321' });
    });

    await act(async () => {
      await result.current.handleAddConnection();
    });

    expect(result.current.addConnectionError).toBeNull();
    expect(result.current.isAddDialogOpen).toBe(false);
  });
});
