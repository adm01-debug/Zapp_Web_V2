import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

// R3-QA — o heatmap de atividade do Dashboard lia `messages` sem `range`/`order`:
// o PostgREST devolve só a 1ª página (teto de 1 000 linhas) e o "Total" do card
// subcontava em silêncio qualquer período com mais de 1 000 mensagens.
const h = vi.hoisted(() => {
  interface Linha { id: string; created_at: string }
  const state = { rows: [] as Linha[], orderCalls: [] as unknown[][] };

  function makeQuery() {
    let from: number | null = null;
    let to: number | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      gte: () => q,
      order: (...a: unknown[]) => { state.orderCalls.push(a); return q; },
      range: (f: number, t: number) => { from = f; to = t; return q; },
      then: (resolve: (v: unknown) => unknown) => {
        if (from === null) {
          // Baseline sem `range`: só a primeira página do PostgREST volta.
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

import { ActivityHeatmap } from '../ActivityHeatmap';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return {
    ...actual,
    motion: {
      div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
        const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
        return React.createElement('div', { ...rest, ref });
      }),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: vi.fn(() => null),
  };
});

describe('ActivityHeatmap — leitura paginada de `messages` (R3-QA)', () => {
  beforeEach(() => {
    h.state.rows = [];
    h.state.orderCalls = [];
  });

  it('período com mais de 1 000 mensagens conta todas, não só a 1ª página do PostgREST', async () => {
    // 1 200 mensagens no mesmo dia, dentro da janela de 90 dias (período default '3m').
    const hoje = new Date();
    h.state.rows = Array.from({ length: 1200 }, (_, i) => ({
      id: `m${i}`,
      created_at: new Date(hoje.getTime() - i * 1000).toISOString(),
    }));

    render(<ActivityHeatmap />, { wrapper: TestQueryWrapper });

    await waitFor(() => {
      expect(screen.getByText((1200).toLocaleString())).toBeInTheDocument();
    });
    expect(h.state.orderCalls).toContainEqual(['id']);
  });
});
