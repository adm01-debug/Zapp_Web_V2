import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * R2-MOD-054 (item 422) — a lista de tarefas, os filtros, os KPIs, o deep link
 * e o badge derivavam de UM `select` sem `range`: o PostgREST devolve so a
 * primeira pagina (teto do projeto: 1000 linhas), entao o que passava disso
 * sumia em silencio — nao achava por busca/contato/prioridade, nao contava nos
 * KPIs nem no badge e um `?task=<id>` fora do lote nao abria o Sheet.
 *
 * O mock reproduz o teto do PostgREST: sem `.range()` devolve 1000 linhas; com
 * `.range()` devolve a fatia pedida. O dataset tem 1205 tarefas e a "agulha"
 * (unico titulo buscavel e unica atrasada) fica no indice 1100 — fora da
 * primeira pagina.
 */
const h = vi.hoisted(() => {
  const PAGE_CAP = 1000;
  const TOTAL = 1205;
  const NEEDLE_INDEX = 1100;
  const NEEDLE_ID = 't-needle';
  const NEEDLE_TITLE = 'Tarefa da ultima pagina';

  const rows = Array.from({ length: TOTAL }, (_, i) => ({
    id: i === NEEDLE_INDEX ? NEEDLE_ID : `t${String(i).padStart(5, '0')}`,
    title: i === NEEDLE_INDEX ? NEEDLE_TITLE : `Tarefa ${i}`,
    description: null,
    status: 'todo',
    priority: 'medium',
    due_date: i === NEEDLE_INDEX ? '2020-01-01T00:00:00.000Z' : null,
    remind_at: null,
    notified_at: null,
    waiting_reason: null,
    position: i,
    started_at: null,
    status_changed_at: '2026-09-29T10:00:00.000Z',
    completed_at: null,
    contact_id: null,
    created_by: 'u1',
    assigned_to: 'u1',
    created_at: '2026-09-29T10:00:00.000Z',
    updated_at: '2026-09-29T10:00:00.000Z',
    contact: null,
  }));

  const rangeCalls: Array<[number, number]> = [];

  function makeQuery() {
    let from: number | null = null;
    let to: number | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      neq: () => q,
      or: () => q,
      not: () => q,
      is: () => q,
      in: () => q,
      order: () => q,
      limit: () => q,
      range: (f: number, t: number) => { from = f; to = t; rangeCalls.push([f, t]); return q; },
      then: (resolve: (v: unknown) => unknown) => {
        const data = from === null
          ? rows.slice(0, PAGE_CAP)          // teto do PostgREST quando nao ha `range`
          : rows.slice(from, (to ?? 0) + 1);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return q;
  }

  return { makeQuery, rangeCalls, TOTAL, NEEDLE_ID, NEEDLE_TITLE, PAGE_CAP };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => h.makeQuery(),
    channel: () => {
      const ch: Record<string, unknown> = {
        on: () => ch,
        subscribe: () => ({ unsubscribe: () => {} }),
      };
      return ch;
    },
    removeChannel: () => {},
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'u1' } }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));

import { useMyWorkItems, useMyWorkItemsBadge } from '@/hooks/tasks/useMyWorkItems';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useMyWorkItems — leitura paginada cobre alem da primeira pagina (R2-MOD-054 / #422)', () => {
  beforeEach(() => { h.rangeCalls.length = 0; });

  it('traz a tarefa da ultima pagina (busca/filtros/deep link derivam desta lista)', async () => {
    const { result } = renderHook(() => useMyWorkItems(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // A lista e o universo inteiro, nao o primeiro lote de 1000.
    expect(result.current.items).toHaveLength(h.TOTAL);
    const agulha = result.current.items.find((i) => i.id === h.NEEDLE_ID);
    expect(agulha?.title).toBe(h.NEEDLE_TITLE);

    // Continuacao observavel: mais de uma pagina foi pedida, a primeira no teto.
    expect(h.rangeCalls.length).toBeGreaterThanOrEqual(2);
    expect(h.rangeCalls[0]).toEqual([0, h.PAGE_CAP - 1]);
  });

  it('badge conta a atrasada que fica fora da primeira pagina', async () => {
    const { result } = renderHook(() => useMyWorkItemsBadge(), { wrapper });

    // Defeito: sem paginacao a contagem sai so da primeira pagina -> 0.
    await waitFor(() => expect(result.current).toBe(1));
  });
});
