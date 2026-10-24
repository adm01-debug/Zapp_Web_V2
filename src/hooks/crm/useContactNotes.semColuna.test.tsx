import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * Compatibilidade de deploy (C098): antes do `db-migrate`, `contact_notes` não tem
 * `is_pinned`. As linhas chegam sem a chave (`select('*')`), criar nota não pode enviar a
 * chave, e fixar fica indisponível (`pinSupported=false`) sem tocar no banco nem no cache.
 */
const h = vi.hoisted(() => {
  const state = {
    notes: [] as Array<Record<string, unknown>>,
    insertPayload: null as Record<string, unknown> | null,
    updatePayload: null as Record<string, unknown> | null,
    updateRow: null as unknown,
  };
  function builder(table: string) {
    let op: 'select' | 'insert' | 'update' = 'select';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q, eq: () => q, in: () => q, order: () => q, single: () => q, range: () => q,
      insert: (p: Record<string, unknown>) => { op = 'insert'; state.insertPayload = p; return q; },
      update: (p: Record<string, unknown>) => { op = 'update'; state.updatePayload = p; return q; },
      then: (resolve: (v: unknown) => unknown) => {
        if (table === 'profiles') return Promise.resolve(resolve({ data: [], error: null }));
        if (op !== 'select') return Promise.resolve(resolve({ data: state.updateRow, error: null }));
        return Promise.resolve(resolve({ data: state.notes, error: null }));
      },
    };
    return q;
  }
  return { builder, state };
});

const toastMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => h.builder(t) } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: toastMock }));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: { id: 'user-1' } }),
}));

import { useContactNotes } from './useContactNotes';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function linha(id: string, created_at: string, extra: Record<string, unknown> = {}) {
  return {
    id, contact_id: 'c1', author_id: 'user-1', content: id, category: 'note',
    is_done: false, due_date: null, created_at, updated_at: created_at, ...extra,
  };
}

beforeEach(() => {
  h.state.notes = [];
  h.state.insertPayload = null;
  h.state.updatePayload = null;
  h.state.updateRow = { id: 'n1' };
  toastMock.mockClear();
});

describe('useContactNotes — coluna is_pinned AUSENTE (antes da migration)', () => {
  it('lista funciona, pinSupported=false e a ordem segue created_at desc', async () => {
    h.state.notes = [linha('n1', '2026-01-01T00:00:00Z'), linha('n2', '2026-01-02T00:00:00Z')];
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });
    await waitFor(() => expect(result.current.allNotes.length).toBe(2));

    expect(result.current.pinSupported).toBe(false);
    expect(result.current.allNotes.map((n) => n.id)).toEqual(['n2', 'n1']);
  });

  it('addNote não envia is_pinned', async () => {
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });
    await act(async () => { await result.current.addNote('texto', 'note'); });
    expect(h.state.insertPayload).not.toHaveProperty('is_pinned');
  });

  it('editNote (texto) funciona sem a coluna e não cria a chave is_pinned no cache', async () => {
    h.state.notes = [linha('n1', '2026-01-01T00:00:00Z')];
    h.state.updateRow = linha('n1', '2026-01-01T00:00:00Z', { content: 'novo' });
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });
    await waitFor(() => expect(result.current.allNotes.length).toBe(1));

    await act(async () => { await result.current.editNote('n1', 'novo'); });

    expect(h.state.updatePayload).toEqual({ content: 'novo' });
    expect(result.current.allNotes[0]).not.toHaveProperty('is_pinned');
    expect(result.current.pinSupported).toBe(false);
  });

  it('togglePin sem a coluna falha com erro tratado (toast), sem escrever no banco', async () => {
    h.state.notes = [linha('n1', '2026-01-01T00:00:00Z')];
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });
    await waitFor(() => expect(result.current.allNotes.length).toBe(1));

    let erro: unknown = null;
    await act(async () => {
      erro = await Promise.resolve().then(() => result.current.togglePin('n1')).catch((e: unknown) => e);
    });

    expect(String((erro as { message?: string } | null)?.message)).toMatch(/is_pinned ausente/);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Fixar notas indisponível', variant: 'destructive' }));
    expect(h.state.updatePayload).toBeNull();
    expect(result.current.allNotes.map((n) => n.id)).toEqual(['n1']);
  });
});

describe('useContactNotes — coluna is_pinned PRESENTE (depois da migration)', () => {
  it('pinSupported=true quando as linhas trazem is_pinned booleano (mesmo false)', async () => {
    h.state.notes = [linha('n1', '2026-01-01T00:00:00Z', { is_pinned: false })];
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });
    await waitFor(() => expect(result.current.allNotes.length).toBe(1));
    expect(result.current.pinSupported).toBe(true);
  });

  it('togglePin grava e o cache passa a refletir a marca devolvida pelo banco', async () => {
    h.state.notes = [linha('n1', '2026-01-01T00:00:00Z', { is_pinned: false })];
    h.state.updateRow = linha('n1', '2026-01-01T00:00:00Z', { is_pinned: true });
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });
    await waitFor(() => expect(result.current.allNotes.length).toBe(1));

    await act(async () => { await result.current.togglePin('n1'); });

    expect(h.state.updatePayload).toEqual({ is_pinned: true });
    expect(toastMock).not.toHaveBeenCalled();
  });
});
