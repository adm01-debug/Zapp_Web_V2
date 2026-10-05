/**
 * Regressão do cartão t_64f9932b (P1 #88): a transferência em lote capturava o
 * erro sem rejeitar (o diálogo fechava como se tivesse dado certo) e ignorava a
 * nota digitada. Contrato fechado: cada contato transferido grava um evento em
 * `conversation_events` com `event_type='transfer'`, destino em `to_agent_id`
 * ou `to_queue_id` e nota opcional em `metadata.note`; qualquer falha rejeita e
 * preserva `selectedIds`. O insert dos eventos acontece ANTES do update em
 * `contacts`: a policy de RLS só aceita o evento enquanto o contato ainda está
 * atribuído ao operador (assigned_to), então mover o contato antes recusaria o
 * insert para quem não é admin/supervisor.
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
  supabase: { from: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useInboxBulkActions } from '../useInboxBulkActions';

const fromMock = supabase.from as unknown as ReturnType<typeof vi.fn>;
const updateFn = vi.fn();
const updateIn = vi.fn();
const insertFn = vi.fn();

let updateResult: { error: unknown };
let insertResult: { error: unknown };
const refetch = vi.fn();
/** ordem real das escritas: prova que o evento vai antes do update de contacts (exigencia da RLS). */
const ordem: string[] = [];

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
    updateResult = { error: null };
    insertResult = { error: null };
    ordem.length = 0;
    updateFn.mockReturnValue({ in: updateIn });
    updateIn.mockImplementation(async () => {
      ordem.push('update');
      return updateResult;
    });
    insertFn.mockImplementation(async () => {
      ordem.push('insert');
      return insertResult;
    });
    fromMock.mockImplementation((table: string) =>
      table === 'conversation_events' ? { insert: insertFn } : { update: updateFn }
    );
  });

  it('transfere para agente e grava evento por contato com a nota em metadata.note', async () => {
    const { result } = montar();

    await act(async () => {
      await result.current.bulkTransfer('agent', 'agent-9', 'cuida disso');
    });

    expect(ordem).toEqual(['insert', 'update']);
    expect(updateFn).toHaveBeenCalledWith({ assigned_to: 'agent-9' });
    expect(updateIn).toHaveBeenCalledWith('id', ['c1', 'c2']);
    expect(insertFn).toHaveBeenCalledWith([
      { contact_id: 'c1', event_type: 'transfer', to_agent_id: 'agent-9', metadata: { note: 'cuida disso' } },
      { contact_id: 'c2', event_type: 'transfer', to_agent_id: 'agent-9', metadata: { note: 'cuida disso' } },
    ]);
    expect(insertFn.mock.invocationCallOrder[0]).toBeLessThan(updateFn.mock.invocationCallOrder[0]);
    expect(toast.success).toHaveBeenCalled();
    expect(result.current.selectedIds.size).toBe(0);
    expect(refetch).toHaveBeenCalled();
  });

  it('transfere para fila e grava evento com to_queue_id, sem nota quando não informada', async () => {
    const { result } = montar();

    await act(async () => {
      await result.current.bulkTransfer('queue', 'fila-1');
    });

    expect(ordem).toEqual(['insert', 'update']);
    expect(updateFn).toHaveBeenCalledWith({ queue_id: 'fila-1' });
    expect(insertFn).toHaveBeenCalledWith([
      { contact_id: 'c1', event_type: 'transfer', to_queue_id: 'fila-1' },
      { contact_id: 'c2', event_type: 'transfer', to_queue_id: 'fila-1' },
    ]);
    expect(insertFn.mock.invocationCallOrder[0]).toBeLessThan(updateFn.mock.invocationCallOrder[0]);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('rejeita quando o update falha (depois do evento) e preserva a seleção', async () => {
    updateResult = { error: new Error('banco fora') };
    const { result } = montar();

    await act(async () => {
      await expect(result.current.bulkTransfer('agent', 'agent-9')).rejects.toThrow('banco fora');
    });

    expect(ordem).toEqual(['insert', 'update']);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    expect(result.current.selectedIds.size).toBe(2);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('rejeita quando a gravação dos eventos falha e não mexe nos contatos nem na seleção', async () => {
    insertResult = { error: new Error('sem policy') };
    const { result } = montar();

    await act(async () => {
      await expect(result.current.bulkTransfer('queue', 'fila-1')).rejects.toThrow('sem policy');
    });

    expect(ordem).toEqual(['insert']);
    expect(updateFn).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    expect(result.current.selectedIds.size).toBe(2);
    expect(refetch).not.toHaveBeenCalled();
  });
});
