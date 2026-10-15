import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    createConnection: vi.fn(async () => ({})),
    connectInstance: vi.fn(async () => ({})),
    getInstanceStatus: vi.fn(async () => ({})),
    disconnectInstance: vi.fn(async () => ({})),
    deleteInstance: vi.fn(async () => ({})),
  }),
}));

const { from, canal } = vi.hoisted(() => {
  const cadeia = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn(() => Promise.resolve({ data: [], error: null })),
    eq: vi.fn().mockReturnThis(),
  };
  const from = vi.fn((_tabela: string) => cadeia);
  const canal = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  return { from, canal };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...(args as [string])),
    channel: vi.fn(() => canal),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));

import { useConnectionsManager } from '@/hooks/inbox/useConnectionsManager';

describe('useConnectionsManager — reconexão', () => {
  beforeEach(() => {
    from.mockClear();
    canal.on.mockClear();
    canal.subscribe.mockClear();
  });

  it('recarrega as conexões quando a rede volta, sem depender de um evento novo', async () => {
    renderHook(() => useConnectionsManager());

    // Carga inicial: fetchConnections.
    await waitFor(() => expect(from).toHaveBeenCalledTimes(1));

    act(() => { window.dispatchEvent(new Event('online')); });

    // useRealtimeReconnect(fetchConnections): a lista é recarregada sem
    // nenhum INSERT/UPDATE/DELETE no canal.
    await waitFor(() => expect(from).toHaveBeenCalledTimes(2));
  });
});
