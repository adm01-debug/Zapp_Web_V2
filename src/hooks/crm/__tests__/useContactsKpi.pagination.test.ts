import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regressão (CT-E/PB-30): a tela de Contatos calculava os 4 KPIs paginando a tabela
 * `contacts` inteira no navegador (1000 linhas por resposta). O contrato agora é
 * "0 chamadas de 1.000 linhas": os agregados vêm de RPC e as janelas do período
 * anterior por `count: 'exact', head: true`.
 */
const h = vi.hoisted(() => ({
  rangeCalls: 0,
  rows: 0,
  rpcFns: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (fn: string) => {
      h.rpcFns.push(fn);
      return { data: {}, error: null };
    },
    from: () => ({
      select: () => {
        const chain = {
          is: () => chain,
          eq: () => chain,
          filter: () => chain,
          gte: () => chain,
          lt: () => chain,
          order: () => chain,
          range: () => { h.rangeCalls++; return chain; },
          then: (res: (v: unknown) => unknown) => res({ data: null, error: null, count: h.rows }),
        };
        return chain;
      },
    }),
  },
}));

import { fetchContactsKpi } from '../useContactsKpi';

beforeEach(() => {
  h.rangeCalls = 0;
  h.rows = 0;
  h.rpcFns = [];
});

describe('fetchContactsKpi — base grande não é varrida linha a linha', () => {
  it('com 2.498 contatos, nenhuma chamada paginada é feita', async () => {
    h.rows = 2498;
    await fetchContactsKpi(false);
    expect(h.rangeCalls).toBe(0);
    expect(h.rpcFns).toEqual(['contacts_stats', 'contacts_stats_series']);
  });

  it('base vazia também não pagina e não quebra', async () => {
    h.rows = 0;
    await fetchContactsKpi(true);
    expect(h.rangeCalls).toBe(0);
  });
});
