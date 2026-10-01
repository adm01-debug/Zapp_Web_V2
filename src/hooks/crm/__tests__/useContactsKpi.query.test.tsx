import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * CRÍTICO (soft-delete): `useContactsKpi` lia `contacts` sem filtrar
 * `deleted_at IS NULL`, então o KPI contava contatos soft-deletados — o card
 * "Total" mostrava 3104 (RPC `contacts_count_by_type`, já filtrada) mas o delta
 * e as séries saíam do hook com 3106 (2 excluídos a mais). Este teste trava o
 * contrato do query builder: a consulta TEM de aplicar `.is('deleted_at', null)`.
 */

const h = vi.hoisted(() => ({
  is: vi.fn(),
  eq: vi.fn(),
  rows: [] as unknown[],
}));

// Fluent mock: `from().select()` devolve um builder thenable que registra .is/.eq.
vi.mock('@/integrations/supabase/client', () => {
  const makeQuery = () => {
    const q: {
      is: (...args: unknown[]) => typeof q;
      eq: (...args: unknown[]) => typeof q;
      then: (resolve: (v: unknown) => void) => void;
    } = {
      is: (...args) => {
        h.is(...args);
        return q;
      },
      eq: (...args) => {
        h.eq(...args);
        return q;
      },
      then: (resolve) => resolve({ data: h.rows, error: null }),
    };
    return q;
  };
  return {
    supabase: {
      from: vi.fn(() => ({ select: vi.fn(() => makeQuery()) })),
    },
  };
});

import { useContactsKpi } from '../useContactsKpi';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  h.is.mockClear();
  h.eq.mockClear();
  h.rows = [];
});

describe('useContactsKpi — filtro de soft-delete', () => {
  it('aplica .is("deleted_at", null) na consulta (exclui soft-deletados do KPI)', async () => {
    renderHook(() => useContactsKpi(false), { wrapper });
    await waitFor(() => expect(h.is).toHaveBeenCalledWith('deleted_at', null));
  });

  it('mantém o filtro de lid_legacy junto com o de deleted_at quando filterLidLegacy=true', async () => {
    renderHook(() => useContactsKpi(true), { wrapper });
    await waitFor(() => expect(h.is).toHaveBeenCalledWith('deleted_at', null));
    await waitFor(() => expect(h.eq).toHaveBeenCalledWith('is_lid_legacy', false));
  });
});
