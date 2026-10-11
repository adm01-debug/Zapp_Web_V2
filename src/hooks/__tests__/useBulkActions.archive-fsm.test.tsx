/**
 * SL-071 (ADR-005) — "Arquivar Selecionados" na tabela `contacts` arquiva pela RPC
 * `set_conversation_status` (p_next 'archived'), que valida papel e transição. Antes o
 * update era `{ status: 'archived' }` e `contacts` não tem coluna `status` (o estado de
 * conversa vive em `conversation_status`) — o PostgREST recusa coluna inexistente, então
 * arquivar conversa em massa não tinha como funcionar. As demais tabelas, que têm
 * `status`, seguem como antes (update direto).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  escritas: [] as Array<{ tabela: string; payload: Record<string, unknown> }>,
  rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }>,
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: (tabela: string) => ({
    delete: () => ({ in: async () => ({ error: null }) }),
    update: (payload: Record<string, unknown>) => {
      h.escritas.push({ tabela, payload });
      return { in: async () => ({ error: null }) };
    },
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      h.rpcs.push({ fn, args });
      return Promise.resolve({ error: null });
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useBulkActions } from '@/hooks/inbox/useBulkActions';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const itens = [{ id: 'c1' }, { id: 'c2' }];

const arquivar = async (tableName: string) => {
  const { result } = renderHook(() => useBulkActions(itens, { tableName }), { wrapper });

  act(() => {
    result.current.selectAll();
  });
  await act(async () => {
    await result.current.executeAction('archive');
  });

  return h.escritas[h.escritas.length - 1];
};

describe('useBulkActions — arquivar grava o campo real (SL-071)', () => {
  beforeEach(() => {
    h.escritas.length = 0;
    h.rpcs.length = 0;
  });

  it('contacts arquiva cada contato pela RPC set_conversation_status (sem update direto)', async () => {
    const escrita = await arquivar('contacts');

    // Nenhuma escrita direta na tabela: o caminho é a RPC.
    expect(escrita).toBeUndefined();
    expect(h.escritas).toEqual([]);
    expect(h.rpcs).toEqual([
      { fn: 'set_conversation_status', args: { p_contact_id: 'c1', p_next: 'archived', p_reason: 'arquivada_em_massa' } },
      { fn: 'set_conversation_status', args: { p_contact_id: 'c2', p_next: 'archived', p_reason: 'arquivada_em_massa' } },
    ]);
  });

  it('as demais tabelas seguem com o campo status (update direto)', async () => {
    const escrita = await arquivar('campanhas');

    expect(escrita.payload.status).toBe('archived');
    expect(h.rpcs).toEqual([]);
  });
});
