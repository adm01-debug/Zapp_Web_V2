import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

// R3-QA — o Heatmap de Volume dos Relatórios lia `messages` com `.limit(1000)`
// sem `order`/paginação: qualquer célula (dia×hora) com mais de 1 000 mensagens
// no período tinha a contagem truncada em silêncio no teto do PostgREST.
const h = vi.hoisted(() => {
  interface Linha { id: string; created_at: string; sender: string }
  const state = { rows: [] as Linha[], orderCalls: [] as unknown[][] };

  function makeQuery() {
    let from: number | null = null;
    let to: number | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      gte: () => q,
      eq: () => q,
      limit: () => q,
      order: (...a: unknown[]) => { state.orderCalls.push(a); return q; },
      range: (f: number, t: number) => { from = f; to = t; return q; },
      then: (resolve: (v: unknown) => unknown) => {
        if (from === null) {
          // Baseline (`.limit(1000)` sem `range`): só a primeira página volta.
          return Promise.resolve(resolve({ data: state.rows.slice(0, 1000), error: null }));
        }
        return Promise.resolve(resolve({ data: state.rows.slice(from, to! + 1), error: null }));
      },
    };
    return q;
  }

  return { state, makeQuery };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => h.makeQuery() },
}));

import { ConversationHeatmap } from '../ConversationHeatmap';

describe('ConversationHeatmap (reports) — leitura paginada de `messages` (R3-QA)', () => {
  beforeEach(() => {
    h.state.rows = [];
    h.state.orderCalls = [];
  });

  it('célula com mais de 1 000 mensagens no período conta todas, não só a 1ª página', async () => {
    // 1 200 mensagens de contato, todas na mesma quinta-feira (getDay()=4) às 10h.
    const fixo = new Date(2026, 0, 1, 10, 0, 0);
    h.state.rows = Array.from({ length: 1200 }, (_, i) => ({
      id: `m${i}`,
      created_at: new Date(fixo.getTime() + i).toISOString(),
      sender: 'contact',
    }));

    render(<ConversationHeatmap />, { wrapper: TestQueryWrapper });

    await waitFor(() => {
      expect(screen.getByTitle('Qui 10h: 1200 mensagens')).toBeInTheDocument();
    });
    expect(h.state.orderCalls).toContainEqual(['id']);
  });
});
