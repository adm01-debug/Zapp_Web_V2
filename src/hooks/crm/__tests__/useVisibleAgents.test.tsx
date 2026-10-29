import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Prova de fronteira do hook `useVisibleAgents`: o alvo é o hook; a fronteira
// mockada é o cliente Supabase (a RPC `get_visible_agent_ids`). O que se prova
// aqui é o CONTRATO do front (papel -> chamada da RPC -> ids devolvidos); o
// enforcement por papel (agent/special_agent/supervisor/admin) sobre
// profiles/contacts/Sala de Crise é provado no SQL
// supabase/tests/special_agent_visibility.sql, no banco local.
const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

import { useVisibleAgents } from '@/hooks/crm/useVisibleAgents';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useVisibleAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('agent comum: chama a RPC com o próprio user id e devolve os ids visíveis', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-agent' } });
    mockRpc.mockResolvedValue({ data: ['p-agent'], error: null });

    const { result } = renderHook(() => useVisibleAgents(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith('get_visible_agent_ids', { _user_id: 'u-agent' });
    expect(result.current.data).toEqual(['p-agent']);
  });

  it('special_agent: devolve exatamente o conjunto concedido (próprio + can_see_agent_id)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-special' } });
    mockRpc.mockResolvedValue({ data: ['p-special', 'p-granted-a', 'p-granted-b'], error: null });

    const { result } = renderHook(() => useVisibleAgents(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith('get_visible_agent_ids', { _user_id: 'u-special' });
    expect(result.current.data).toEqual(['p-special', 'p-granted-a', 'p-granted-b']);
  });

  it('sem sessão: não chama a RPC (enabled=false) e não devolve ids de ninguém', async () => {
    mockUseAuth.mockReturnValue({ user: null });

    const { result } = renderHook(() => useVisibleAgents(), { wrapper: createWrapper() });

    // A query fica desabilitada: nada é buscado e não há vazamento de lista.
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(mockRpc).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('erro da RPC vira estado de erro (não engole a falha)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-agent' } });
    mockRpc.mockResolvedValue({ data: null, error: new Error('rpc indisponível') });

    const { result } = renderHook(() => useVisibleAgents(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
