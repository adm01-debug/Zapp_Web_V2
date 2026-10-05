/**
 * Regressão do cartão t_56ccfa9c (P1 #88, refazer): a transferência em lote fazia
 * duas escritas separadas (evento + update) — se o update falhava ou o RLS
 * filtrava linhas em silêncio, os eventos ficavam gravados para contatos que não
 * mudaram de dono. Contrato fechado: UMA chamada à RPC `bulk_transfer_contacts`
 * (evento + update na mesma transação no banco); a nota vai em `p_note`; qualquer
 * erro da RPC rejeita e preserva `selectedIds`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/system/useUndoableAction', () => ({
  useUndoableAction: () => ({ execute: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useInboxBulkActions } from '../useInboxBulkActions';

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

let rpcResult: { data: number | null; error: unknown };
const refetch = vi.fn();

function montar() {
  const hook = renderHook(() => useInboxBulkActions({ refetch, filteredConversations: [] }));
  act(() => {
    hook.result.current.toggleSelection('c1');
    hook.result.current.toggleSelection('c2');
  });
  return hook;
}

describe('useInboxBulkActions.bulkTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcResult = { data: 2, error: null };
    rpcMock.mockImplementation(async () => rpcResult);
  });

  it('transfere para agente via RPC atômica, com a nota em p_note', async () => {
    const { result } = montar();

    await act(async () => {
      await result.current.bulkTransfer('agent', 'agent-9', 'cuida disso');
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('bulk_transfer_contacts', {
      p_contact_ids: ['c1', 'c2'],
      p_to_agent_id: 'agent-9',
      p_to_queue_id: null,
      p_note: 'cuida disso',
    });
    expect(toast.success).toHaveBeenCalled();
    expect(result.current.selectedIds.size).toBe(0);
    expect(refetch).toHaveBeenCalled();
  });

  it('transfere para fila via RPC atômica, sem nota quando não informada', async () => {
    const { result } = montar();

    await act(async () => {
      await result.current.bulkTransfer('queue', 'fila-1');
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('bulk_transfer_contacts', {
      p_contact_ids: ['c1', 'c2'],
      p_to_agent_id: null,
      p_to_queue_id: 'fila-1',
      p_note: null,
    });
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('rejeita quando a RPC aborta e preserva a seleção', async () => {
    rpcResult = { data: null, error: new Error('Transferencia em lote abortada: 1 de 2 contatos atualizados.') };
    const { result } = montar();

    await act(async () => {
      await expect(result.current.bulkTransfer('agent', 'agent-9'))
        .rejects.toThrow('Transferencia em lote abortada');
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    expect(result.current.selectedIds.size).toBe(2);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('rejeita quando a chamada à RPC falha e não mexe na seleção', async () => {
    rpcResult = { data: null, error: new Error('sem permissao na funcao') };
    const { result } = montar();

    await act(async () => {
      await expect(result.current.bulkTransfer('queue', 'fila-1')).rejects.toThrow('sem permissao');
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    expect(result.current.selectedIds.size).toBe(2);
    expect(refetch).not.toHaveBeenCalled();
  });
});
