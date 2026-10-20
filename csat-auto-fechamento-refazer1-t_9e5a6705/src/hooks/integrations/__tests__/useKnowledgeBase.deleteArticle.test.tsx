import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * R2-API-053 (#226) — `deleteArticle` descartava o resultado do DELETE e anunciava
 * "Artigo removido" mesmo quando o PostgREST devolvia `error`. O teste prova que o
 * sucesso só é anunciado com o DELETE aceito e que a falha vira erro do chamador.
 */

const mocks = vi.hoisted(() => ({
  tableFrom: vi.fn(),
  deleteEq: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mocks.tableFrom,
    storage: { from: vi.fn(() => ({ upload: vi.fn(), getPublicUrl: vi.fn(), remove: vi.fn() })) },
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));

import { useKnowledgeBase } from '../useKnowledgeBase';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tableFrom.mockImplementation(() => ({
    select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    delete: () => ({ eq: (column: string, value: string) => mocks.deleteEq(column, value) }),
  }));
  mocks.deleteEq.mockResolvedValue({ error: null });
});

describe('useKnowledgeBase.deleteArticle — confirma só depois da persistência', () => {
  it('falha do DELETE mostra erro e NÃO anuncia "Artigo removido"', async () => {
    mocks.deleteEq.mockResolvedValue({ error: { message: 'rls denied' } });
    const { result } = renderHook(() => useKnowledgeBase());

    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.deleteArticle('artigo-1');
    });

    expect(mocks.deleteEq).toHaveBeenCalledWith('id', 'artigo-1');
    expect(aceito).toBe(false);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('DELETE aceito anuncia "Artigo removido" e devolve true', async () => {
    const { result } = renderHook(() => useKnowledgeBase());

    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.deleteArticle('artigo-1');
    });

    expect(aceito).toBe(true);
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Artigo removido' }))
    );
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });
});
