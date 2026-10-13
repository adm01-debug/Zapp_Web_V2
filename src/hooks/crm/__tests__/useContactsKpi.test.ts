import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  rpcData: {} as Record<string, unknown>,
  rpcError: null as null | { message: string },
  filters: [] as unknown[],
  selectHead: null as null | { count?: string; head?: boolean },
  rangeCalls: 0,
  count: 0,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(async (fn: string, args: unknown) => {
      h.rpcCalls.push({ fn, args });
      if (h.rpcError) return { data: null, error: h.rpcError };
      return { data: h.rpcData[fn] ?? {}, error: null };
    }),
    from: () => ({
      select: (_cols: string, opts: { count?: string; head?: boolean }) => {
        h.selectHead = opts;
        const chain = {
          is: (...a: unknown[]) => { h.filters.push(['is', ...a]); return chain; },
          eq: (...a: unknown[]) => { h.filters.push(['eq', ...a]); return chain; },
          filter: (...a: unknown[]) => { h.filters.push(['filter', ...a]); return chain; },
          gte: () => chain,
          lt: () => chain,
          order: () => chain,
          range: () => { h.rangeCalls++; return chain; },
          then: (res: (v: unknown) => unknown) => res({ data: null, error: null, count: h.count }),
        };
        return chain;
      },
    }),
  },
}));

import { fetchContactsKpi, kpiFromServer } from '../useContactsKpi';

beforeEach(() => {
  h.rpcCalls = [];
  h.rpcData = {};
  h.rpcError = null;
  h.filters = [];
  h.selectHead = null;
  h.rangeCalls = 0;
  h.count = 0;
});

describe('fetchContactsKpi — indicadores vêm das RPCs agregadas, sem paginar a tabela', () => {
  it('chama contacts_stats e contacts_stats_series uma vez cada', async () => {
    await fetchContactsKpi(false);
    const fns = h.rpcCalls.map(c => c.fn);
    expect(fns).toContain('contacts_stats');
    expect(fns).toContain('contacts_stats_series');
    expect(fns.filter(f => f === 'contacts_stats')).toHaveLength(1);
    expect(fns.filter(f => f === 'contacts_stats_series')).toHaveLength(1);
  });

  it('não faz NENHUMA chamada paginada (0 chamadas de 1.000 linhas)', async () => {
    await fetchContactsKpi(false);
    expect(h.rangeCalls).toBe(0);
  });

  it('conta janelas com count exato e head: true — sem trazer linhas', async () => {
    await fetchContactsKpi(false);
    expect(h.selectHead).toEqual({ count: 'exact', head: true });
  });

  it('repassa p_include_legacy para as RPCs', async () => {
    await fetchContactsKpi(true);
    for (const call of h.rpcCalls) {
      expect(call.args).toEqual({ p_include_legacy: true });
    }
  });

  it('propaga erro da RPC em vez de mostrar KPI zerado', async () => {
    h.rpcError = { message: 'boom' };
    await expect(fetchContactsKpi(false)).rejects.toEqual({ message: 'boom' });
  });

  it('trata lgpd_pending nulo (fila LG1 inexistente) sem quebrar', async () => {
    h.rpcData = { contacts_stats: { total: 10, recent_30d: 4, duplicate_candidates: 2, lgpd_pending: null }, contacts_stats_series: {} };
    const kpi = await fetchContactsKpi(false);
    expect(kpi.lgpdPending).toBeNull();
    expect(kpi.duplicateCandidates).toBe(2);
  });
});

describe('kpiFromServer — mapeia o contrato das RPCs para o KPI da tela', () => {
  const stats = {
    total: 1_000,
    recent_30d: 100,
    base_30d: 900,
    growth_30d_pct: -89,
    duplicate_candidates: 7,
    lgpd_pending: null,
  };
  const series = {
    empresas_distinct: 42,
    series_novos_daily_30: [1, 2, 3, 4, 5, 6, 7],
    series_total_cumulative_12w: Array(12).fill(1_000),
    series_empresas_cumulative_12w: Array(12).fill(42),
    series_fornecedores_weekly_12: Array(12).fill(3),
  };

  it('deltaTotalPct compara o total com a base que existia 30 dias atrás', () => {
    // total 1000, novos30 100 → base 900 → pct(1000, 900) = +11%
    const kpi = kpiFromServer(stats, series, { novosPrev30: 80, fornecedores30: 5, fornecedoresPrev30: 4 });
    expect(kpi.deltaTotalPct).toBe(11);
    expect(kpi.novos30).toBe(100);
  });

  it('deltaNovosPct usa a contagem exata do período anterior', () => {
    const kpi = kpiFromServer(stats, series, { novosPrev30: 80, fornecedores30: 5, fornecedoresPrev30: 4 });
    expect(kpi.deltaNovosPct).toBe(25); // (100-80)/80
  });

  it('deltaFornecedoresPct usa a contagem exata de fornecedores por janela', () => {
    const kpi = kpiFromServer(stats, series, { novosPrev30: 80, fornecedores30: 120, fornecedoresPrev30: 100 });
    expect(kpi.deltaFornecedoresPct).toBe(20);
  });

  it('delta é null quando o período anterior tem menos de 50 registros', () => {
    const kpi = kpiFromServer(stats, series, { novosPrev30: 49, fornecedores30: 5, fornecedoresPrev30: 49 });
    expect(kpi.deltaNovosPct).toBeNull();
    expect(kpi.deltaFornecedoresPct).toBeNull();
  });

  it('expõe as séries e as empresas distintas vindas do servidor', () => {
    const kpi = kpiFromServer(stats, series, { novosPrev30: 80, fornecedores30: 5, fornecedoresPrev30: 4 });
    expect(kpi.empresasDistinct).toBe(42);
    expect(kpi.seriesNovosDaily30).toEqual(series.series_novos_daily_30);
    expect(kpi.seriesTotalCumulative12w).toEqual(series.series_total_cumulative_12w);
    expect(kpi.seriesEmpresasCumulative12w).toEqual(series.series_empresas_cumulative_12w);
    expect(kpi.seriesFornecedoresWeekly12).toEqual(series.series_fornecedores_weekly_12);
  });
});
