import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  total: 0,
  ranges: [] as Array<[number, number]>,
  orders: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => {
        const chain = {
          is: () => chain,
          eq: () => chain,
          filter: () => chain,
          order: (column: string) => { mocks.orders.push(column); return chain; },
          range: async (from: number, to: number) => {
            mocks.ranges.push([from, to]);
            const end = Math.min(to + 1, mocks.total);
            const data = Array.from({ length: Math.max(end - from, 0) }, (_, i) => ({
              created_at: '2026-01-01T00:00:00.000Z',
              contact_type: 'cliente',
              company: `Empresa ${from + i}`,
            }));
            return { data, error: null };
          },
        };
        return chain;
      },
    }),
  },
}));

import { fetchKpiRows, KPI_PAGE_SIZE } from '../useContactsKpi';

describe('fetchKpiRows — PostgREST limita cada resposta a max_rows', () => {
  beforeEach(() => {
    mocks.ranges = [];
    mocks.orders = [];
  });

  it('pagina até trazer todos os contatos (2.498 > 1.000)', async () => {
    mocks.total = 2498;
    const rows = await fetchKpiRows(false);
    expect(rows).toHaveLength(2498);
    expect(new Set(rows.map(r => r.company)).size).toBe(2498);
    expect(mocks.ranges).toEqual([
      [0, KPI_PAGE_SIZE - 1],
      [KPI_PAGE_SIZE, 2 * KPI_PAGE_SIZE - 1],
      [2 * KPI_PAGE_SIZE, 3 * KPI_PAGE_SIZE - 1],
    ]);
    expect(mocks.orders.every(c => c === 'id')).toBe(true);
  });

  it('múltiplo exato do tamanho da página faz uma consulta extra vazia e para', async () => {
    mocks.total = 2 * KPI_PAGE_SIZE;
    const rows = await fetchKpiRows(true);
    expect(rows).toHaveLength(2 * KPI_PAGE_SIZE);
    expect(mocks.ranges).toHaveLength(3);
  });
});
