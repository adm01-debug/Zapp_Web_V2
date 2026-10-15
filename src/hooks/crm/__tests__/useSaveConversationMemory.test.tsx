import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSaveConversationMemory } from '../useSaveConversationMemory';

/**
 * Prova o contrato de escrita: o upsert vai para `conversation_memory` com o
 * contato e o `onConflict` do índice único (sem isso o 2º salvamento falharia),
 * o resumo em branco vira nulo e a falha volta como recado em pt-BR — o
 * atendente não pode achar que salvou quando o banco recusou.
 */
const h = vi.hoisted(() => {
  const state = { error: null as { message: string } | null };
  const upsert = vi.fn(async (_payload: Record<string, unknown>, _opts?: unknown) => ({ error: state.error }));
  const from = vi.fn((_table: string) => ({ upsert }));
  return { state, upsert, from };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: h.from },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('useSaveConversationMemory — gravou? avisou?', () => {
  beforeEach(() => {
    h.state.error = null;
    h.upsert.mockClear();
  });

  it('grava por upsert no contato, com o onConflict do índice único', async () => {
    const { result } = renderHook(() => useSaveConversationMemory('c1'));

    let ok = false;
    await act(async () => {
      ok = await result.current.save({
        commercialSummary: '  Cliente quer fechar até sexta.  ',
        pendingItems: ['Confirmar CNPJ'],
        promisesMade: ['Enviar amostra'],
      });
    });

    expect(ok).toBe(true);
    expect(h.from).toHaveBeenCalledWith('conversation_memory');
    expect(h.upsert).toHaveBeenCalledWith(
      {
        contact_id: 'c1',
        commercial_summary: 'Cliente quer fechar até sexta.',
        pending_items: ['Confirmar CNPJ'],
        promises_made: ['Enviar amostra'],
      },
      { onConflict: 'contact_id' },
    );
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('resumo em branco grava nulo em vez de string vazia', async () => {
    const { result } = renderHook(() => useSaveConversationMemory('c1'));

    await act(async () => {
      await result.current.save({ commercialSummary: '   ', pendingItems: [], promisesMade: [] });
    });

    expect(h.upsert.mock.calls[0][0]).toEqual({
      contact_id: 'c1',
      commercial_summary: null,
      pending_items: [],
      promises_made: [],
    });
  });

  it('falha do banco devolve falso e um recado em pt-BR (não finge sucesso)', async () => {
    h.state.error = { message: 'new row violates row-level security policy' };
    const { result } = renderHook(() => useSaveConversationMemory('c1'));

    let ok = true;
    await act(async () => {
      ok = await result.current.save({ commercialSummary: 'x', pendingItems: [], promisesMade: [] });
    });

    expect(ok).toBe(false);
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBe('Não foi possível salvar a memória da conversa. Tente de novo.');
  });
});
