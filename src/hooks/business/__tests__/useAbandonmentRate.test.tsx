import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

// R2-MOD-020 — o hook real com o cliente Supabase mockado. Cobre o que o baseline não tinha:
// ordem temporal, sessões do mesmo contato, prazo de resposta explícito, volume acima do teto
// de 1 000 linhas do PostgREST e falha de leitura que NÃO pode virar métrica zero.
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
    failFromRow: null as number | null,
    orderCalls: [] as unknown[][],
    rangeCalls: [] as Array<[number, number]>,
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
        if (from === null) {
          // Baseline / PostgREST sem `range`: só a primeira página volta (teto silencioso).
          return Promise.resolve(resolve({ data: todas.slice(0, 1000), error: null }));
        }
        if (state.failFromRow !== null && from >= state.failFromRow) {
          return Promise.resolve(resolve({ data: null, error: { message: 'timeout na página' } }));
        }
        state.rangeCalls.push([from, to ?? 0]);
        return Promise.resolve(resolve({ data: todas.slice(from, (to ?? 0) + 1), error: null }));
      },
    };
    return q;
  }

  return { state, makeQuery };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => h.makeQuery() },
}));

import { useAbandonmentRate } from '../useAbandonmentRate';

const HORA = 60 * 60 * 1000;
const MINUTO = 60 * 1000;

/** Mensagem `ms` atrás do agora real. */
function mensagem(
  id: string,
  atrasMs: number,
  sender: 'contact' | 'agent',
  contact_id = 'c1',
) {
  return {
    id,
    created_at: new Date(Date.now() - atrasMs).toISOString(),
    sender,
    contact_id,
  };
}

async function lerMetrica(period = '7') {
  const { result } = renderHook(() => useAbandonmentRate(period), { wrapper: TestQueryWrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

describe('useAbandonmentRate — abandono por sessão e ordem (R2-MOD-020)', () => {
  beforeEach(() => {
    h.state.rows = [];
    h.state.error = null;
    h.state.failFromRow = null;
    h.state.orderCalls = [];
    h.state.rangeCalls = [];
  });

  it('mensagem do agente ANTERIOR à demanda não responde a demanda (o defeito do baseline)', async () => {
    h.state.rows = [
      mensagem('m1', 6 * HORA, 'agent'),
      mensagem('m2', 5 * HORA, 'contact'),
    ];

    const result = await lerMetrica();

    expect(result.current.metric).toMatchObject({
      total: 1, responded: 0, abandoned: 1, waiting: 0, rate: 100,
    });
  });

  it('agente que fala depois da última mensagem do cliente responde a sessão', async () => {
    h.state.rows = [
      mensagem('m1', 6 * HORA, 'contact'),
      mensagem('m2', 5 * HORA + 50 * MINUTO, 'agent'),
    ];

    const result = await lerMetrica();

    expect(result.current.metric).toMatchObject({
      total: 1, responded: 1, abandoned: 0, waiting: 0, rate: 0,
    });
  });

  it('agente no MEIO da sessão não responde a demanda que veio depois', async () => {
    h.state.rows = [
      mensagem('m1', 6 * HORA, 'contact'),
      mensagem('m2', 5 * HORA + 45 * MINUTO, 'agent'),
      mensagem('m3', 5 * HORA + 30 * MINUTO, 'contact'),
    ];

    const result = await lerMetrica();

    expect(result.current.metric).toMatchObject({
      total: 1, responded: 0, abandoned: 1, waiting: 0, rate: 100,
    });
  });

  it('sessões repetidas do mesmo contato são avaliadas uma a uma', async () => {
    h.state.rows = [
      mensagem('m1', 10 * HORA, 'contact'),
      mensagem('m2', 9 * HORA + 50 * MINUTO, 'agent'),
      mensagem('m3', 5 * HORA, 'contact'),
    ];

    const result = await lerMetrica();

    expect(result.current.metric).toMatchObject({
      total: 2, responded: 1, abandoned: 1, waiting: 0, rate: 50,
    });
  });

  it('demanda dentro do prazo de resposta fica aguardando, não abandonada', async () => {
    h.state.rows = [mensagem('m1', MINUTO, 'contact')];

    const result = await lerMetrica();

    expect(result.current.metric).toMatchObject({
      total: 1, responded: 0, abandoned: 0, waiting: 1, rate: 0,
    });
  });

  it('sessão só de agente (campanha) não entra no denominador', async () => {
    h.state.rows = [mensagem('m1', 2 * HORA, 'agent')];

    const result = await lerMetrica();

    expect(result.current.metric).toMatchObject({ total: 0, abandoned: 0, rate: 0 });
  });

  it('a janela do período é aplicada e a leitura é ordenada por chave estável', async () => {
    h.state.rows = [
      mensagem('m1', 10 * 24 * HORA, 'contact'), // fora dos 7 dias
      mensagem('m2', 30 * MINUTO, 'contact'),
    ];

    const result = await lerMetrica('7');

    expect(result.current.metric).toMatchObject({ total: 1, waiting: 1, abandoned: 0 });
    expect(h.state.orderCalls).toContainEqual(['id']);
  });

  it('lê todas as páginas: com 1 200 linhas a resposta que estava fora da 1ª página conta', async () => {
    h.state.rows = [
      mensagem('a1', 6 * HORA, 'contact'),
      ...Array.from({ length: 1000 }, (_, i) => mensagem(`b${i}`, 3 * HORA, 'agent', 'c9')),
      mensagem('z1', 5 * HORA + 50 * MINUTO, 'agent'),
    ];

    const result = await lerMetrica();

    expect(result.current.metric).toMatchObject({
      total: 1, responded: 1, abandoned: 0, rate: 0,
    });
    expect(result.current.incomplete).toBe(false);
    expect(h.state.rangeCalls.length).toBeGreaterThan(1);
  });

  it('falha de leitura no meio não vira métrica zero: erro exposto e leitura marcada incompleta', async () => {
    // Primeira página completa (1 000 linhas) e a segunda falha: o que deu para ler NÃO é publicado
    // como taxa confirmada.
    h.state.rows = Array.from({ length: 1000 }, (_, i) =>
      mensagem(`x${i}`, (i + 1) * MINUTO, 'contact'),
    );
    h.state.failFromRow = 1000;

    const result = await lerMetrica();

    expect(result.current.metric).toBeNull();
    expect(result.current.error).toBeTruthy();
    expect(result.current.incomplete).toBe(true);
  });
});
