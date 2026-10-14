import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchTalkXAbStats, type TalkXAbStatsClient } from '@/hooks/integrations/useTalkX';

type Query = {
  table: string;
  columns?: string;
  options?: { count?: 'exact'; head?: boolean };
  filters: Array<{ method: string; column: string; value?: unknown; operator?: string }>;
};

type Response = { data: unknown; count?: number | null; error: { message: string } | null };

type FakeServer = {
  campaign?: { template_id: string | null } | null;
  variants?: Array<{ id: string; label: string }>;
  scan?: Array<{ variant_id: string | null }>;
  counts?: Record<string, number>;
  countError?: { message: string } | null;
};

const { state } = vi.hoisted(() => ({ state: { queries: [] as Query[] } }));

beforeEach(() => { state.queries = []; });

function metric(filters: Query['filters']) {
  return filters.find((f) => f.method === 'not')?.column ?? 'total';
}

function variant(filters: Query['filters']) {
  return String(filters.find((f) => f.method === 'eq' && f.column === 'variant_id')?.value ?? '');
}

function chain(q: Query, reply: () => Response) {
  const node = {
    select: (columns?: string, options?: { count?: 'exact'; head?: boolean }) => {
      q.columns = columns;
      q.options = options;
      return node;
    },
    eq: (column: string, value?: unknown) => {
      q.filters.push({ method: 'eq', column, value });
      return node;
    },
    not: (column: string, operator: string, value?: unknown) => {
      q.filters.push({ method: 'not', column, operator, value });
      return node;
    },
    order: (column: string) => {
      q.filters.push({ method: 'order', column, value: 'asc' });
      return node;
    },
    limit: (value: number) => {
      q.filters.push({ method: 'limit', column: '', value });
      return node;
    },
    maybeSingle: () => Promise.resolve(reply()),
    then: (resolve: (value: Response) => unknown) => Promise.resolve(reply()).then(resolve),
  };
  return node;
}

function client(server: FakeServer): TalkXAbStatsClient {
  return {
    from(table: string) {
      const q: Query = { table, filters: [] };
      state.queries.push(q);
      if (table === 'talkx_campaigns') {
        return chain(q, () => ({ data: server.campaign === undefined ? { template_id: 'template-1' } : server.campaign, error: null }));
      }
      if (table === 'talkx_template_variants') {
        return chain(q, () => ({ data: server.variants ?? [], error: null }));
      }
      return chain(q, () => {
        if (q.options?.head) {
          if (server.countError) return { data: null, count: null, error: server.countError };
          return { data: null, count: server.counts?.[`${variant(q.filters)}|${metric(q.filters)}`] ?? 0, error: null };
        }
        return { data: server.scan ?? [], error: null };
      });
    },
  } as unknown as TalkXAbStatsClient;
}

describe('fetchTalkXAbStats', () => {
  it('conta no servidor por variante e métrica, sem baixar lista truncada', async () => {
    const result = await fetchTalkXAbStats(client({
      variants: [{ id: 'v-a', label: 'Nova oferta' }, { id: 'v-b', label: 'Controle' }],
      counts: {
        'v-a|total': 1500,
        'v-a|replied_at': 300,
        'v-a|clicked_at': 150,
        'v-a|delivered_at': 1400,
        'v-b|total': 1000,
        'v-b|replied_at': 100,
        'v-b|clicked_at': 40,
        'v-b|delivered_at': 950,
      },
    }), 'campaign-1');

    expect(result.variants).toContainEqual({
      variant_id: 'v-a', label: 'Nova oferta', total: 1500, replies: 300, clicks: 150, deliveries: 1400,
    });
    expect(result.variants.find((v) => v.variant_id === 'v-b')?.total).toBe(1000);

    const countQueries = state.queries.filter((q) => q.table === 'talkx_recipients' && q.options?.head === true);
    expect(countQueries).toHaveLength(8);
    for (const q of countQueries) {
      expect(q.columns).toBe('id');
      expect(q.options).toEqual({ count: 'exact', head: true });
      expect(q.filters).toContainEqual({ method: 'eq', column: 'campaign_id', value: 'campaign-1' });
      expect(q.filters.some((f) => f.method === 'eq' && f.column === 'variant_id')).toBe(true);
    }
    expect(countQueryCount('replied_at')).toBe(2);
    expect(countQueryCount('clicked_at')).toBe(2);
    expect(countQueryCount('delivered_at')).toBe(2);
    expect(state.queries.filter((q) => q.table === 'talkx_recipients' && q.options?.head !== true)).toHaveLength(0);
  });

  it('sem template, descobre ids por varredura leve e ainda conta no servidor', async () => {
    const result = await fetchTalkXAbStats(client({
      campaign: { template_id: null },
      scan: [{ variant_id: 'v2' }, { variant_id: 'v1' }, { variant_id: null }, { variant_id: 'v1' }],
      counts: { 'v1|total': 60, 'v2|total': 55 },
    }), 'campaign-2');

    expect(result.variants.map((v) => v.variant_id)).toEqual(['v1', 'v2']);
    expect(result.variants.every((v) => v.label === null)).toBe(true);
    const scans = state.queries.filter((q) => q.table === 'talkx_recipients' && q.options?.head !== true);
    expect(scans).toHaveLength(1);
    expect(scans[0]?.columns).toBe('variant_id');
  });

  it('propaga erro da contagem para a tela não exibir zero silencioso', async () => {
    await expect(fetchTalkXAbStats(client({
      variants: [{ id: 'v-a', label: 'A' }],
      countError: { message: 'sem permissão de leitura' },
    }), 'campaign-1')).rejects.toMatchObject({ message: 'sem permissão de leitura' });
  });

});

function countQueryCount(column: string) {
  return state.queries.filter((q) => q.options?.head === true && q.filters.some((f) => f.method === 'not' && f.column === column)).length;
}
