/**
 * R2-INF-028 (item 374): "Gráfico de mensagens perde linhas válidas ao montar
 * buckets de 7 dias e colapsa buckets de 1 hora".
 *
 * O `fetchData` montava os baldes NO NAVEGADOR a partir de mensagens cruas
 * (`from('messages')` sem limit): o PostgREST cortava em 1.000 linhas, então em
 * 24h/7d a curva e o total ficavam MENORES que o real.
 *
 * A correção move a agregação para o banco (RPC
 * `get_monitoring_message_buckets`, cartão t_cb75a447) e o hook passa a mapear
 * uma linha por balde. Estes testes rodam o hook REAL com o cliente Supabase
 * mockado e conferem:
 *  1. a janela e o `interval` exatos pedidos à RPC (7d, 24h e 1h);
 *  2. que o hook NÃO lê mensagem crua (logo o teto de 1.000 linhas não existe);
 *  3. que a soma de uma agregação acima de 1.000 mensagens é o valor real;
 *  4. que cada balde vira um rótulo distinto e o total bate com a soma;
 *  5. que falha da RPC / janela furada fica SINALIZADA (`messageStatsPartial`),
 *     nunca zerada em silêncio.
 */

// Fuso fixo: o servidor ancora os baldes em America/Sao_Paulo e os rótulos usam
// a hora local do ambiente — iguais só no fuso real da operação.
process.env.TZ = 'America/Sao_Paulo';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

interface BucketRow { bucket_start: string; incoming: number; outgoing: number }
type RpcOut = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ name: string; args: Record<string, string> }>,
  rpcImpl: null as null | (() => RpcOut),
  tables: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      h.tables.push(table);
      return query({ data: [], error: null });
    },
    rpc: (name: string, args: Record<string, string>) => {
      h.rpcCalls.push({ name, args });
      return Promise.resolve(h.rpcImpl ? h.rpcImpl() : { data: [], error: null });
    },
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  },
}));

// Builder thenable: aceita .select().gte().order().limit() e também o `await` direto.
function query(result: unknown) {
  const p = Promise.resolve(result) as Promise<unknown> & Record<string, unknown>;
  for (const m of ['select', 'gte', 'lte', 'gt', 'lt', 'eq', 'in', 'is', 'order', 'limit']) {
    p[m] = vi.fn(() => p);
  }
  return p;
}

import { useMonitoringData } from '@/components/monitoring/hooks/useMonitoringData';

// 17:00Z = 14:00 em São Paulo (hora cheia, para os baldes casarem com a grade).
const NOW = new Date('2026-10-06T17:00:00.000Z');

const row = (bucket_start: string, incoming: number, outgoing: number): BucketRow =>
  ({ bucket_start, incoming, outgoing });

/** n baldes no passo de `stepMs` a partir de `startIso`. */
const rowsStep = (startIso: string, n: number, stepMs: number, incoming: number, outgoing: number): BucketRow[] => {
  const start = Date.parse(startIso);
  return Array.from({ length: n }, (_, i) => row(new Date(start + i * stepMs).toISOString(), incoming, outgoing));
};

/** 1ª chamada da RPC = gráfico do período; 2ª = barras das sparklines. */
function setBuckets(graph: BucketRow[] | null, spark: BucketRow[] | null = []) {
  let call = 0;
  h.rpcImpl = () => {
    call += 1;
    const data = call === 1 ? graph : spark;
    return data === null ? { data: null, error: { message: 'falha simulada' } } : { data, error: null };
  };
}

async function fetchData(period: '1h' | '24h' | '7d') {
  const { result } = renderHook(() => useMonitoringData());
  await act(async () => {
    await result.current.fetchData(period);
  });
  return result.current;
}

const plotado = (buckets: { incoming: number; outgoing: number }[]) =>
  buckets.reduce((s, b) => s + b.incoming + b.outgoing, 0);

describe('useMonitoringData — agregação de mensagens por balde no banco (R2-INF-028)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    h.rpcCalls.length = 0;
    h.tables.length = 0;
    h.rpcImpl = null;
    setBuckets([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('7d: pede a janela de dias civis locais e um balde por dia', async () => {
    const graph = [
      row('2026-09-30T03:00:00.000Z', 1, 0),
      row('2026-10-01T03:00:00.000Z', 0, 0),
      row('2026-10-02T03:00:00.000Z', 1, 0),
      row('2026-10-03T03:00:00.000Z', 0, 0),
      row('2026-10-04T03:00:00.000Z', 0, 1),
      row('2026-10-05T03:00:00.000Z', 0, 0),
      row('2026-10-06T03:00:00.000Z', 1, 1),
    ];
    setBuckets(graph);

    const { messageStats } = await fetchData('7d');

    // janela: hoje-6 00:00 SP (30/09 03:00Z) até agora; balde de dia civil.
    expect(h.rpcCalls[0]).toEqual({
      name: 'get_monitoring_message_buckets',
      args: { p_from: '2026-09-30T03:00:00.000Z', p_to: '2026-10-06T17:00:00.000Z', p_bucket: '86400 seconds' },
    });
    expect(messageStats.hourlyData.map((b) => b.hour)).toEqual([
      '30/09', '01/10', '02/10', '03/10', '04/10', '05/10', '06/10',
    ]);
    expect(messageStats).toMatchObject({ incoming: 3, outgoing: 2, total: 5 });
    expect(plotado(messageStats.hourlyData)).toBe(messageStats.total);
  });

  it('24h: 24 baldes de hora cheia e soma real acima do teto de 1.000', async () => {
    // 24 baldes x 200 mensagens = 4.800: o hook nunca vê 4.800 linhas, só 24.
    const graph = rowsStep('2026-10-05T18:00:00.000Z', 24, 3600000, 100, 100);
    const spark = rowsStep('2026-10-05T17:00:00.000Z', 8, 3 * 3600000, 50, 50);
    setBuckets(graph, spark);

    const { messageStats, sparklines } = await fetchData('24h');

    expect(h.rpcCalls[0].args).toEqual({
      p_from: '2026-10-05T18:00:00.000Z', p_to: '2026-10-06T17:00:00.000Z', p_bucket: '3600 seconds',
    });
    // sparklines usam a janela deslizante do período (now-24h), em 8 barras de 3h.
    expect(h.rpcCalls[1].args).toEqual({
      p_from: '2026-10-05T17:00:00.000Z', p_to: '2026-10-06T17:00:00.000Z', p_bucket: '10800 seconds',
    });
    expect(messageStats.hourlyData).toHaveLength(24);
    expect(messageStats.hourlyData[0].hour).toBe('05/10 15h');
    expect(messageStats.hourlyData[23].hour).toBe('06/10 14h');
    expect(messageStats).toMatchObject({ incoming: 2400, outgoing: 2400, total: 4800 });
    expect(plotado(messageStats.hourlyData)).toBe(4800);
    expect(sparklines.messages).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
    // Nenhuma consulta de mensagem crua: o teto de 1.000 linhas do PostgREST não
    // tem por onde cortar a curva nem o total.
    expect(h.tables).not.toContain('messages');
  });

  it('1h: os seis baldes de 10 min continuam distintos um do outro', async () => {
    setBuckets(rowsStep('2026-10-06T16:00:00.000Z', 6, 600000, 1, 0));

    const { messageStats } = await fetchData('1h');

    expect(h.rpcCalls[0].args).toEqual({
      p_from: '2026-10-06T16:00:00.000Z', p_to: '2026-10-06T17:00:00.000Z', p_bucket: '600 seconds',
    });
    expect(messageStats.hourlyData.map((b) => b.hour)).toEqual([
      '13:00', '13:10', '13:20', '13:30', '13:40', '13:50',
    ]);
    expect(plotado(messageStats.hourlyData)).toBe(6);
  });

  it('sem mensagens o servidor devolve os baldes zerados e a curva não desaparece', async () => {
    setBuckets(rowsStep('2026-10-05T18:00:00.000Z', 24, 3600000, 0, 0));

    const { messageStats, messageStatsPartial } = await fetchData('24h');

    expect(messageStats.hourlyData).toHaveLength(24);
    expect(messageStats.total).toBe(0);
    expect(messageStatsPartial).toBe(false);
  });

  it('falha da RPC fica sinalizada e não vira zero silencioso', async () => {
    setBuckets(null);

    const { messageStats, messageStatsPartial, loading } = await fetchData('24h');

    expect(messageStatsPartial).toBe(true);
    expect(messageStats).toEqual({ incoming: 0, outgoing: 0, total: 0, hourlyData: [] });
    expect(loading).toBe(false);
  });

  it('janela furada (primeiro balde depois do início pedido) também é sinalizada', async () => {
    // O hook pede desde 05/10 18:00Z; a agregação só começa 19:00Z.
    setBuckets(rowsStep('2026-10-05T19:00:00.000Z', 23, 3600000, 1, 0));

    const { messageStatsPartial, messageStats } = await fetchData('24h');

    expect(messageStatsPartial).toBe(true);
    expect(messageStats.hourlyData[0].hour).toBe('05/10 16h');
  });
});
