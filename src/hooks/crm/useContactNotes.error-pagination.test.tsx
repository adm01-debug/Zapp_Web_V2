import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * #259 (R2-AUTH-034) — dois defeitos na mesma área:
 *
 * 1. `ContactService.addNote/deleteNote/updateNote` devolvem `{ data, error }` e NÃO
 *    rejeitam a promise. `useContactNotes` repassava esse retorno direto para a mutation,
 *    então um erro do PostgREST (ex.: RLS) caía em `onSuccess`: o cache era invalidado e
 *    a tela anunciava "Nota adicionada" com a nota não salva.
 * 2. A leitura (`ContactService.fetchNotes`) não tinha `.range()`: o PostgREST devolve só
 *    a primeira página (teto do projeto: 1000 linhas) e as notas seguintes desapareciam
 *    em silêncio. O mock abaixo reproduz esse teto — sem `.range()` volta 1000 de 1500.
 */
const h = vi.hoisted(() => {
  const PAGE_CAP = 1000;
  const TOTAL = 1500;

  // Já na ordem que a consulta pede (created_at desc, id desc): índice 0 = mais nova.
  const notes = Array.from({ length: TOTAL }, (_, i) => {
    const created = new Date(Date.UTC(2026, 0, 1) + (TOTAL - i) * 60_000).toISOString();
    return {
      id: `n${String(TOTAL - 1 - i).padStart(5, '0')}`,
      contact_id: 'c1',
      author_id: 'user-1',
      content: `nota ${i}`,
      category: 'note',
      is_done: false,
      due_date: null,
      created_at: created,
      updated_at: created,
    };
  });

  const state = {
    notesMode: 'ok' as 'ok' | 'empty' | 'error',
    mutationData: null as unknown,
    mutationError: null as null | { message: string },
    rangeCalls: 0,
  };

  function builder(table: string) {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let from: number | null = null;
    let to: number | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q,
      eq: () => q,
      in: () => q,
      order: () => q,
      single: () => q,
      insert: () => { op = 'insert'; return q; },
      update: () => { op = 'update'; return q; },
      delete: () => { op = 'delete'; return q; },
      range: (f: number, t: number) => { state.rangeCalls += 1; from = f; to = t; return q; },
      then: (resolve: (value: unknown) => unknown) => {
        if (table === 'profiles') return Promise.resolve(resolve({ data: [], error: null }));

        if (op !== 'select') {
          return Promise.resolve(resolve({ data: state.mutationData, error: state.mutationError }));
        }

        if (state.notesMode === 'error') {
          return Promise.resolve(resolve({ data: null, error: { message: 'sem permissão de leitura' } }));
        }
        if (state.notesMode === 'empty') {
          return Promise.resolve(resolve({ data: null, error: null }));
        }

        // Sem `.range()` o PostgREST corta na primeira página; com `.range()` devolve a fatia.
        const data = from === null
          ? notes.slice(0, PAGE_CAP)
          : notes.slice(from, (to ?? 0) + 1);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return q;
  }

  return { builder, state, notes, TOTAL, PAGE_CAP, toast: vi.fn() };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => h.builder(table) },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: h.toast }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: { id: 'user-1' } }),
}));

import { useContactNotes, type ContactNote } from './useContactNotes';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

let invalidateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  invertState();
  invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
});

afterEach(() => {
  invalidateSpy.mockRestore();
});

function invertState() {
  h.state.notesMode = 'ok';
  h.state.mutationData = { id: 'n-nova', content: 'texto' };
  h.state.mutationError = null;
  h.state.rangeCalls = 0;
}

describe('useContactNotes — erro do serviço vira rejeição (#259)', () => {
  it('addNote rejeita, mostra erro e NÃO anuncia "Nota adicionada" nem invalida o cache', async () => {
    h.state.mutationError = { message: 'new row violates row-level security policy' };
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });

    let erro: unknown = null;
    await act(async () => {
      erro = await result.current.addNote('texto', 'note').catch((e: unknown) => e);
    });

    expect(String((erro as { message?: string } | null)?.message)).toMatch(/row-level security/);

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })),
    );
    expect(h.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Nota adicionada' }));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('deleteNote rejeita, mostra erro e NÃO anuncia "Nota removida"', async () => {
    h.state.mutationError = { message: 'permission denied for table contact_notes' };
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });

    let erro: unknown = null;
    await act(async () => {
      erro = await result.current.deleteNote('n00001').catch((e: unknown) => e);
    });

    expect(String((erro as { message?: string } | null)?.message)).toMatch(/permission denied/);
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })),
    );
    expect(h.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Nota removida' }));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('toggleNoteDone rejeita quando o UPDATE falha e não invalida o cache', async () => {
    h.state.mutationError = { message: 'update afetou 0 linhas' };
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });

    let erro: unknown = null;
    await act(async () => {
      erro = await result.current
        .toggleNoteDone({ id: 'n00001', is_done: false } as unknown as ContactNote)
        .catch((e: unknown) => e);
    });

    expect(String((erro as { message?: string } | null)?.message)).toMatch(/0 linhas/);
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })),
    );
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('caminho feliz continua igual: addNote resolve, invalida o cache e anuncia sucesso', async () => {
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });

    await act(async () => {
      await result.current.addNote('texto', 'note');
    });

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nota adicionada' })),
    );
    expect(h.toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useContactNotes — leitura (#259)', () => {
  it('retorno vazio devolve lista vazia sem lançar', async () => {
    h.state.notesMode = 'empty';
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.allNotes).toEqual([]);
    expect(result.current.notes).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('erro na leitura continua subindo como erro da query', async () => {
    h.state.notesMode = 'error';
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.notes).toEqual([]);
  });

  it('lê a página seguinte: 1500 notas, sem repetir e sem perder a primeira página', async () => {
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });

    await waitFor(() => expect(result.current.allNotes.length).toBe(h.TOTAL));

    const ids = result.current.allNotes.map((n) => n.id);
    // Ordem estável e conteúdo completo: nada repetido e nada faltando.
    expect(ids).toEqual(h.notes.map((n) => n.id));
    expect(new Set(ids).size).toBe(h.TOTAL);
    expect(ids).toContain(h.notes[0].id);              // primeira página
    expect(ids).toContain(h.notes[h.TOTAL - 1].id);    // só existe além do teto de 1000
    expect(h.state.rangeCalls).toBeGreaterThanOrEqual(2);
  });
});
