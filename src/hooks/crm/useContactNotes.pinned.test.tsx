import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * Notas do contato: editar o texto, fixar/desfixar, ordem das fixadas e autor
 * sempre definido (t_4092de45; par do contrato de banco t_aae31a96).
 *
 * Defeitos cobertos:
 * 1. A lista vinha só na ordem do servidor (`created_at desc, id desc`) e a nota
 *    fixada podia ficar no meio/fim. Agora as fixadas vêm primeiro, com `id` desc
 *    como desempate final quando o `created_at` empata.
 * 2. Não havia como editar o texto nem fixar/desfixar a partir do hook.
 * 3. `author` ficava `undefined` quando o perfil do autor não existia na tabela.
 * 4. Regressão: nota antiga lida ANTES da coluna existir chega SEM `is_pinned` e
 *    não pode quebrar a ordenação (vale como não fixada).
 */
const h = vi.hoisted(() => {
  const state = {
    notes: [] as Array<Record<string, unknown>>,
    insertPayload: null as Record<string, unknown> | null,
    updatePayload: null as Record<string, unknown> | null,
    updateRow: null as unknown,
    mutationError: null as null | { message: string },
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
      insert: (payload: Record<string, unknown>) => { op = 'insert'; state.insertPayload = payload; return q; },
      update: (payload: Record<string, unknown>) => { op = 'update'; state.updatePayload = payload; return q; },
      delete: () => { op = 'delete'; return q; },
      range: (f: number, t: number) => { from = f; to = t; return q; },
      then: (resolve: (value: unknown) => unknown) => {
        // Nenhum perfil na tabela `profiles`: força o caminho do autor ausente.
        if (table === 'profiles') return Promise.resolve(resolve({ data: [], error: null }));

        if (op === 'insert' || op === 'update') {
          return Promise.resolve(resolve({ data: state.updateRow, error: state.mutationError }));
        }

        const data = from === null ? state.notes : state.notes.slice(from, (to ?? 0) + 1);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return q;
  }

  return { builder, state };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => h.builder(table) },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

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

function note(over: Partial<ContactNote> & Pick<ContactNote, 'id' | 'created_at'>): ContactNote {
  return {
    contact_id: 'c1',
    author_id: 'user-1',
    content: over.id,
    category: 'note',
    is_done: false,
    due_date: null,
    updated_at: over.created_at,
    ...over,
  } as ContactNote;
}

beforeEach(() => {
  h.state.notes = [];
  h.state.insertPayload = null;
  h.state.updatePayload = null;
  h.state.updateRow = { id: 'n1' };
  h.state.mutationError = null;
});

describe('useContactNotes — ordenação das fixadas', () => {
  it('fixadas vêm primeiro e o resto segue created_at desc (mesma ordem do servidor)', async () => {
    // Ordem do servidor: created_at desc, id desc.
    h.state.notes = [
      note({ id: 'n4', created_at: '2026-01-04T00:00:00.000Z' }),
      note({ id: 'n3', created_at: '2026-01-03T00:00:00.000Z', is_pinned: true }),
      note({ id: 'n2', created_at: '2026-01-02T00:00:00.000Z' }),
      note({ id: 'n1', created_at: '2026-01-01T00:00:00.000Z' }),
    ];

    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });
    await waitFor(() => expect(result.current.allNotes.length).toBe(4));

    expect(result.current.allNotes.map((n) => n.id)).toEqual(['n3', 'n4', 'n2', 'n1']);
    // A cópia filtrada por categoria herda a mesma ordem.
    expect(result.current.notes.map((n) => n.id)).toEqual(['n3', 'n4', 'n2', 'n1']);
  });

  it('empate no created_at desempata por id desc; fixação vence o empate de instante', async () => {
    h.state.notes = [
      note({ id: 'n2b', created_at: '2026-01-02T00:00:00.000Z' }),
      note({ id: 'n2a', created_at: '2026-01-02T00:00:00.000Z' }),
      note({ id: 'n1', created_at: '2026-01-02T00:00:00.000Z', is_pinned: true }),
    ];

    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });
    await waitFor(() => expect(result.current.allNotes.length).toBe(3));

    expect(result.current.allNotes.map((n) => n.id)).toEqual(['n1', 'n2b', 'n2a']);
  });

  it('nota antiga SEM is_pinned não quebra a ordenação e vale como NÃO fixada', async () => {
    // `n-old` não tem a marca (contrato anterior à coluna); `n-new` está fixada.
    h.state.notes = [
      note({ id: 'n-old', created_at: '2026-02-01T00:00:00.000Z' }),
      note({ id: 'n-new', created_at: '2026-01-01T00:00:00.000Z', is_pinned: true }),
    ];
    delete (h.state.notes[0] as Record<string, unknown>).is_pinned;

    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });
    await waitFor(() => expect(result.current.allNotes.length).toBe(2));

    expect(result.current.allNotes.map((n) => n.id)).toEqual(['n-new', 'n-old']);
  });
});

describe('useContactNotes — editar e fixar', () => {
  it('editNote manda SÓ o conteúdo (não toca is_done nem is_pinned)', async () => {
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });

    await act(async () => {
      await result.current.editNote('n1', 'texto novo');
    });

    expect(h.state.updatePayload).toEqual({ content: 'texto novo' });
  });

  it('togglePin manda is_pinned: true ao fixar e false ao desfixar', async () => {
    h.state.notes = [
      note({ id: 'n1', created_at: '2026-01-01T00:00:00.000Z' }),
      note({ id: 'n2', created_at: '2026-01-02T00:00:00.000Z', is_pinned: true }),
    ];

    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });
    await waitFor(() => expect(result.current.allNotes.length).toBe(2));

    await act(async () => {
      await result.current.togglePin('n1');
    });
    expect(h.state.updatePayload).toEqual({ is_pinned: true });

    await act(async () => {
      await result.current.togglePin('n2');
    });
    expect(h.state.updatePayload).toEqual({ is_pinned: false });
  });

  it('togglePin de nota fora da lista lança erro e NÃO escreve no banco', async () => {
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let erro: unknown = null;
    await act(async () => {
      erro = await Promise.resolve()
        .then(() => result.current.togglePin('n-ausente'))
        .catch((e: unknown) => e);
    });

    expect(String((erro as { message?: string } | null)?.message)).toMatch(/lista carregada/);
    expect(h.state.updatePayload).toBeNull();
  });

  it('updateNote aceita is_pinned explícito', async () => {
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });

    await act(async () => {
      await result.current.updateNote('n1', { is_pinned: true });
    });
    expect(h.state.updatePayload).toEqual({ is_pinned: true });
  });

  it('addNote com isPinned manda is_pinned no insert; sem o parâmetro manda false', async () => {
    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });

    await act(async () => {
      await result.current.addNote('texto', 'note', null, true);
    });
    expect(h.state.insertPayload).toMatchObject({ is_pinned: true });

    await act(async () => {
      await result.current.addNote('texto', 'note');
    });
    expect(h.state.insertPayload).toMatchObject({ is_pinned: false });
  });
});

describe('useContactNotes — autor sempre definido', () => {
  it('perfil do autor ausente vira o placeholder "Usuário removido"', async () => {
    h.state.notes = [note({ id: 'n1', created_at: '2026-01-01T00:00:00.000Z', author_id: 'sumiu' })];

    const { result } = renderHook(() => useContactNotes('c1'), { wrapper });
    await waitFor(() => expect(result.current.allNotes.length).toBe(1));

    expect(result.current.allNotes[0].author).toEqual({
      id: 'sumiu',
      name: 'Usuário removido',
      avatar_url: null,
    });
  });
});
