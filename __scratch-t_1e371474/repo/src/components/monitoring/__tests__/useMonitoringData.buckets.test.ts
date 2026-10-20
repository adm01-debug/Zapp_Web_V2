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

/** 9 linhas como o servidor devolve com p_from alinhado à grade: 8 baldes da
 * janela + o farelo anterior a `since`. Valores distintos por posição provam
 * que cada linha cai na barra certa (sem dobrar a barra 0). */
const sparkRowsDistintos = (startIso: string, stepMs: number): BucketRow[] => {
  const start = Date.parse(startIso);
  return Array.from({ length: 9 }, (_, i) =>
    row(new Date(start + i * stepMs).toISOString(), i, 0));
};

// Relógios FORA da hora cheia: é quando `since` não casa com a grade do
// servidor e o mapa antigo dobrava a barra 0.
const NOW_24H_OFF = new Date('2026-10-06T17:37:00.000Z'); // 14:37 SP
const NOW_7D_OFF = new Date('2026-10-06T09:23:00.000Z'); // 06:23 SP

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

  it('7d fora da hora cheia: p_from alinhado à grade de 21h e cada linha na sua barra', async () => {
    vi.setSystemTime(NOW_7D_OFF);
    // 06:23 SP não casa com a grade de 21h do servidor: o p_from do spark vai
    // alinhado para 06:00 SP (09:00Z de 29/09) e o servidor devolve 9 linhas
    // (8 baldes + o farelo anterior ao since).
    const spark = sparkRowsDistintos('2026-09-29T09:00:00.000Z', 21 * 3600000);
    setBuckets(rowsStep('2026-09-30T03:00:00.000Z', 7, 24 * 3600000, 2, 3), spark);

    const { sparklines } = await fetchData('7d');

    expect(h.rpcCalls[1].args).toEqual({
      p_from: '2026-09-29T09:00:00.000Z', p_to: '2026-10-06T09:23:00.000Z', p_bucket: '75600 seconds',
    });
    // Linha i na barra i; o farelo (linha 8) soma na última barra.
    expect(sparklines.messages).toEqual([0, 1, 2, 3, 4, 5, 6, 15]);
    expect(h.tables).not.toContain('messages');
  });

  it('7d acima de 1.000 mensagens: total e curva somem a janela inteira (2.100)', async () => {
    vi.setSystemTime(NOW_7D_OFF);
    // 7 baldes x 300 mensagens = 2.100: acima do teto de 1.000 linhas do
    // PostgREST — a soma precisa ser o valor real, não o cortado.
    setBuckets(rowsStep('2026-09-30T03:00:00.000Z', 7, 24 * 3600000, 150, 150));

    const { messageStats } = await fetchData('7d');

    expect(messageStats).toMatchObject({ incoming: 1050, outgoing: 1050, total: 2100 });
    expect(plotado(messageStats.hourlyData)).toBe(2100);
    expect(h.tables).not.toContain('messages');
  });

  it('24h fora da hora cheia: p_from alinhado à grade e cada linha na sua barra', async () => {
    vi.setSystemTime(NOW_24H_OFF);
    // 24 baldes x 200 mensagens = 4.800: o hook nunca vê 4.800 linhas, só 24.
    // 14:37 SP não casa com a grade de 3h do servidor (12h/15h/...): o p_from
    // do spark vai alinhado para 12:00 SP (15:00Z) e o servidor devolve 9
    // linhas (8 baldes + o farelo anterior ao since).
    const graph = rowsStep('2026-10-05T18:00:00.000Z', 24, 3600000, 100, 100);
    const spark = sparkRowsDistintos('2026-10-05T15:00:00.000Z', 3 * 3600000);
    setBuckets(graph, spark);

    const { messageStats, sparklines } = await fetchData('24h');

    expect(h.rpcCalls[0].args).toEqual({
      p_from: '2026-10-05T18:00:00.000Z', p_to: '2026-10-06T17:37:00.000Z', p_bucket: '3600 seconds',
    });
    // O p_from do spark desce à grade do servidor em vez de since.
    expect(h.rpcCalls[1].args).toEqual({
      p_from: '2026-10-05T15:00:00.000Z', p_to: '2026-10-06T17:37:00.000Z', p_bucket: '10800 seconds',
    });
    expect(messageStats.hourlyData).toHaveLength(24);
    expect(messageStats.hourlyData[0].hour).toBe('05/10 15h');
    expect(messageStats.hourlyData[23].hour).toBe('06/10 14h');
    expect(messageStats).toMatchObject({ incoming: 2400, outgoing: 2400, total: 4800 });
    expect(plotado(messageStats.hourlyData)).toBe(4800);
    // Mapeamento posicional: linha i na barra i; o farelo (linha 8) soma na
    // última barra em vez de dobrar a primeira. Sem a correção, a barra 0
    // somava as linhas 0+1 e tudo deslocava ([1,2,...,8]).
    expect(sparklines.messages).toEqual([0, 1, 2, 3, 4, 5, 6, 15]);
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
