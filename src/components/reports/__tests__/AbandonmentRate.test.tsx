import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

// R2-MOD-020 — a tela lê "abandonadas" como TODO contato com qualquer mensagem de agente no
// período, sem ordem nem sessão: a resposta das 10h "atendia" a demanda das 11h. Este teste
// monta o componente REAL com o cliente Supabase mockado e cobra o contrato corrigido (ordem
// temporal + sessões + prazo de resposta). Ele falha no baseline e passa com a correção.
const h = vi.hoisted(() => {
  interface Linha {
    id: string;
    created_at: string;
    sender: string;
    contact_id: string | null;
  }

  const state = {
    rows: [] as Linha[],
    error: null as { message: string } | null,
    orderCalls: [] as unknown[][],
  };

  function makeQuery() {
    const filters: unknown[][] = [];
    let from: number | null = null;
    let to: number | null = null;

    const aplicarFiltros = () => {
      let rows = state.rows.slice();
      for (const f of filters) {
        if (f[0] === 'gte') rows = rows.filter(r => r.created_at >= String(f[2]));
        if (f[0] === 'lte') rows = rows.filter(r => r.created_at <= String(f[2]));
      }
      return rows;
    };

    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      gte: (...a: unknown[]) => { filters.push(['gte', ...a]); return q; },
      lte: (...a: unknown[]) => { filters.push(['lte', ...a]); return q; },
      order: (...a: unknown[]) => { state.orderCalls.push(a); return q; },
      limit: () => q,
      range: (f: number, t: number) => { from = f; to = t; return q; },
      then: (resolve: (v: unknown) => unknown) => {
        if (state.error) return Promise.resolve(resolve({ data: null, error: state.error }));
        const todas = aplicarFiltros();
        // Teto do PostgREST: sem `range` explícito só a primeira página volta.
        const data = from === null ? todas.slice(0, 1000) : todas.slice(from, (to ?? 0) + 1);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return q;
  }

  return { state, makeQuery };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => h.makeQuery() },
}));

import { AbandonmentRate } from '../AbandonmentRate';

/** Mensagem `minutos` atrás do agora real (margens de horas: o relógio do teste não desloca o caso). */
function atras(minutos: number, sender: 'contact' | 'agent', contact_id = 'c1', id?: string) {
  return {
    id: id ?? `${sender}-${minutos}`,
    created_at: new Date(Date.now() - minutos * 60 * 1000).toISOString(),
    sender,
    contact_id,
  };
}

/** Valor da linha de número correspondente ao rótulo ("Total", "Respondidas", ...). */
function valor(rotulo: RegExp): string {
  const el = screen.getByText(rotulo);
  return (el.parentElement?.textContent ?? '').replace(rotulo, '').replace(/[^\d-]/g, '').trim();
}

describe('AbandonmentRate — contrato de abandono (R2-MOD-020)', () => {
  beforeEach(() => {
    h.state.error = null;
    h.state.rows = [];
    h.state.orderCalls = [];
  });

  it('mensagem do agente ANTERIOR à demanda do cliente não conta como resposta', async () => {
    h.state.rows = [
      atras(6 * 60, 'agent'),    // agente 10h
      atras(5 * 60, 'contact'),  // cliente 11h, sem resposta depois
    ];

    render(<AbandonmentRate />, { wrapper: TestQueryWrapper });

    await waitFor(() => expect(valor(/Total/)).toBe('1'));
    expect(valor(/Respondidas/)).toBe('0');
    expect(valor(/Abandonadas/)).toBe('1');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('sessões repetidas do mesmo contato são avaliadas uma a uma', async () => {
    h.state.rows = [
      atras(10 * 60, 'contact'),  // sessão 1: demanda 09h
      atras(9 * 60 + 50, 'agent'), // respondida 09h10
      atras(5 * 60, 'contact'),   // sessão 2 (silêncio de 4h50): demanda sem resposta
    ];

    render(<AbandonmentRate />, { wrapper: TestQueryWrapper });

    await waitFor(() => expect(valor(/Total/)).toBe('2'));
    expect(valor(/Respondidas/)).toBe('1');
    expect(valor(/Abandonadas/)).toBe('1');
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('demanda ainda dentro do prazo de resposta aparece como aguardando, não como abandono', async () => {
    h.state.rows = [atras(1, 'contact')];

    render(<AbandonmentRate />, { wrapper: TestQueryWrapper });

    await waitFor(() => expect(valor(/Total/)).toBe('1'));
    expect(valor(/Aguardando/)).toBe('1');
    expect(valor(/Abandonadas/)).toBe('0');
    expect(valor(/Respondidas/)).toBe('0');
  });
});
