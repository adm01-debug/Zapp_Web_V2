import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// R3-QA — a Previsão de Demanda lia `messages` com `.limit(1000)` sem
// `order`/paginação: um horário de pico com mais de 1 000 mensagens de contato
// nos 28 dias tinha a média diária calculada sobre a amostra truncada, não
// sobre o total do período.
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

import { DemandForecast } from '../DemandForecast';

describe('DemandForecast — leitura paginada de `messages` (R3-QA)', () => {
  beforeEach(() => {
    h.state.rows = [];
    h.state.orderCalls = [];
  });

  it('horário de pico com mais de 1 000 mensagens usa o total do período, não a 1ª página', async () => {
    // 1 200 mensagens de contato, todas às 14h, dentro dos 28 dias da previsão.
    const fixo = new Date(2026, 0, 1, 14, 0, 0);
    h.state.rows = Array.from({ length: 1200 }, (_, i) => ({
      id: `m${i}`,
      created_at: new Date(fixo.getTime() + i).toISOString(),
      sender: 'contact',
    }));

    render(<DemandForecast />);

    // round(1200/28) = 43; round(1000/28) [teto antigo] = 36.
    await waitFor(() => {
      expect(screen.getByText('14h — ~43 msg/dia')).toBeInTheDocument();
    });
    expect(screen.queryByText('14h — ~36 msg/dia')).not.toBeInTheDocument();
    expect(h.state.orderCalls).toContainEqual(['id']);
  });
});
