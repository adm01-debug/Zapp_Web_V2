/**
 * Paridade V3 — o sucesso da reatribuição em lote precisa invalidar o cache.
 *
 * O defeito: `useAgentReassignment` só mostrava o toast; a lista de contatos, as
 * abas de conversa ("Meus") e o War Room continuavam com o atendente antigo até
 * um reload. O teste chama a mutação REAL do hook e cobra cada chave afetada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  CHAVES_AFETADAS_POR_REATRIBUICAO,
  useAgentReassignment,
} from '@/hooks/crm/useAgentReassignment';

let queryClient: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: 2, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAgentReassignment — invalidação no sucesso', () => {
  it('`reassignAbsent` invalida contatos, conversas e War Room', async () => {
    const invalidar = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useAgentReassignment(), { wrapper });
    await result.current.reassignAbsent.mutateAsync(30);

    expect(mockRpc).toHaveBeenCalledWith('reassign_absent_agents', { inactive_minutes: 30 });
    const chaves = invalidar.mock.calls.map((c) => c[0]?.queryKey);
    for (const esperada of CHAVES_AFETADAS_POR_REATRIBUICAO) {
      expect(chaves).toContainEqual([...esperada]);
    }
  });

  it('`reassignOverloaded` invalida as mesmas chaves', async () => {
    const invalidar = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useAgentReassignment(), { wrapper });
    await result.current.reassignOverloaded.mutateAsync();

    expect(mockRpc).toHaveBeenCalledWith('reassign_overloaded_agents');
    const chaves = invalidar.mock.calls.map((c) => c[0]?.queryKey);
    expect(chaves).toEqual(CHAVES_AFETADAS_POR_REATRIBUICAO.map((k) => [...k]));
  });

  it('erro da RPC NÃO invalida (nada mudou no banco)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'sem permissão' } });
    const invalidar = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useAgentReassignment(), { wrapper });
    await expect(result.current.reassignAbsent.mutateAsync(30)).rejects.toBeTruthy();

    expect(invalidar).not.toHaveBeenCalled();
  });
});
