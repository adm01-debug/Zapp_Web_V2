/**
 * R2-INF-028 (item 374): "Gráfico de mensagens perde linhas válidas ao montar
 * buckets de 7 dias e colapsa buckets de 1 hora".
 *
 * O `fetchData` montava os baldes por CHAVE DE HORA CIVIL:
 *  - em 7d, as 7 âncoras mostram sempre a hora de `now`, então toda mensagem
 *    cuja hora fosse diferente era descartada do gráfico (só entrava no total);
 *  - em 1h, os 6 baldes de 10 min viravam a mesma "HH:00" e colapsavam em uma
 *    ou duas entradas.
 *
 * A correção agrupa por índice temporal e formata o rótulo depois: 7d usa dias
 * civis locais, 24h usa horas cheias e 1h mantém baldes de 10 minutos. Estes
 * testes rodam o hook REAL com o cliente Supabase mockado e conferem que cada
 * mensagem elegível entra em exatamente um balde e que a soma dos baldes bate
 * com o total consultado quando os dados estão dentro da janela do gráfico.
 */

// Fuso fixo: os rótulos dos baldes usam a hora local do ambiente.
process.env.TZ = 'UTC';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

interface MsgRow { sender: string; created_at: string }
const messagesData: MsgRow[] = [];
const messageGteCalls: unknown[][] = [];

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  },
}));

// Builder thenable: aceita .select().gte().order().limit() e também o `await` direto.
function query(result: unknown, onGte?: (args: unknown[]) => void) {
  const p = Promise.resolve(result) as Promise<unknown> & Record<string, unknown>;
  for (const m of ['select', 'gte', 'lte', 'gt', 'lt', 'eq', 'in', 'is', 'order', 'limit']) {
    p[m] = vi.fn((...args: unknown[]) => {
      if (m === 'gte') onGte?.(args);
      return p;
    });
  }
  return p;
}

mockFrom.mockImplementation((table: string) => {
  if (table === 'messages') return query({ data: messagesData, error: null }, (args) => messageGteCalls.push(args));
  if (table === 'whatsapp_connections') return query({ data: [], error: null });
  if (table === 'connection_health_logs') return query({ data: [], error: null });
  return query({ data: [], error: null });
});

import { useMonitoringData } from '@/components/monitoring/hooks/useMonitoringData';

const NOW = new Date('2026-10-06T14:30:00.000Z');

async function fetchMonitoring(period: '1h' | '24h' | '7d') {
  const { result } = renderHook(() => useMonitoringData());
  await act(async () => {
    await result.current.fetchData(period);
  });
  return {
    stats: result.current.messageStats,
    sparklines: result.current.sparklines,
  };
}

async function fetchStats(period: '1h' | '24h' | '7d') {
  return (await fetchMonitoring(period)).stats;
}

const plotado = (buckets: { incoming: number; outgoing: number }[]) =>
  buckets.reduce((s, b) => s + b.incoming + b.outgoing, 0);

describe('useMonitoringData — baldes do gráfico de mensagens (R2-INF-028)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    messagesData.length = 0;
    messageGteCalls.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('7d: mensagens caem no dia civil local do próprio timestamp', async () => {
    messagesData.push(
      { sender: 'contact', created_at: '2026-10-06T13:00:00.000Z' }, // hoje, hora != hora da âncora
      { sender: 'agent', created_at: '2026-10-04T10:00:00.000Z' }, // outro dia, outra hora
      { sender: 'contact', created_at: '2026-10-02T23:00:00.000Z' }, // outro dia, outra hora
      { sender: 'agent', created_at: '2026-10-06T00:01:00.000Z' }, // virada do dia
    );

    const stats = await fetchStats('7d');

    expect(stats.total).toBe(4);
    expect(stats.hourlyData).toHaveLength(7);
    // soma dos baldes == total consultado (nenhuma linha válida perdida)
    expect(plotado(stats.hourlyData)).toBe(stats.total);
    // um rótulo por dia, do mais antigo para o mais novo
    expect(stats.hourlyData.map((b) => b.hour)).toEqual([
      '30/09', '01/10', '02/10', '03/10', '04/10', '05/10', '06/10',
    ]);
    expect(messageGteCalls).toContainEqual(['created_at', '2026-09-29T14:30:00.000Z']);
    // cada mensagem no seu balde
    expect(stats.hourlyData[6]).toMatchObject({ hour: '06/10', incoming: 1, outgoing: 1 });
    expect(stats.hourlyData[4]).toMatchObject({ hour: '04/10', incoming: 0, outgoing: 1 });
    expect(stats.hourlyData[2]).toMatchObject({ hour: '02/10', incoming: 1, outgoing: 0 });
  });

  it('7d: rótulos avançam por dias civis locais mesmo com horário de verão', async () => {
    const oldTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    vi.setSystemTime(new Date('2026-11-04T14:30:00.000Z'));
    try {
      messagesData.push(
        { sender: 'contact', created_at: '2026-11-04T14:00:00.000Z' },
      );

      const stats = await fetchStats('7d');

      expect(stats.hourlyData.map((b) => b.hour)).toEqual([
        '29/10', '30/10', '31/10', '01/11', '02/11', '03/11', '04/11',
      ]);
      expect(plotado(stats.hourlyData)).toBe(stats.total);
    } finally {
      process.env.TZ = oldTz;
    }
  });

  it('24h: baldes começam na hora cheia e mensagens ficam sob o rótulo da própria hora', async () => {
    messagesData.push(
      // Está dentro da janela da sparkline de 24h (since = 14:30), mas antes
      // do primeiro balde do gráfico (messageSince = 15:00).
      { sender: 'contact', created_at: '2026-10-05T14:45:00.000Z' },
      { sender: 'contact', created_at: '2026-10-05T15:10:00.000Z' },
      { sender: 'agent', created_at: '2026-10-05T23:59:00.000Z' },
      { sender: 'contact', created_at: '2026-10-06T00:00:00.000Z' },
      { sender: 'agent', created_at: '2026-10-06T14:29:00.000Z' },
    );

    const { stats, sparklines } = await fetchMonitoring('24h');

    expect(stats.total).toBe(4);
    expect(stats.hourlyData).toHaveLength(24);
    expect(stats.hourlyData[0].hour).toBe('05/10 15h');
    expect(stats.hourlyData[23].hour).toBe('06/10 14h');
    expect(messageGteCalls).toContainEqual(['created_at', '2026-10-05T14:30:00.000Z']);
    expect(stats.hourlyData.find((b) => b.hour === '05/10 15h')).toMatchObject({ incoming: 1, outgoing: 0 });
    expect(stats.hourlyData.find((b) => b.hour === '05/10 23h')).toMatchObject({ incoming: 0, outgoing: 1 });
    expect(stats.hourlyData.find((b) => b.hour === '06/10 00h')).toMatchObject({ incoming: 1, outgoing: 0 });
    expect(stats.hourlyData.find((b) => b.hour === '06/10 14h')).toMatchObject({ incoming: 0, outgoing: 1 });
    expect(plotado(stats.hourlyData)).toBe(stats.total);
    expect(sparklines.messages[0]).toBe(2);
  });

  it('1h: os seis baldes de 10 min ficam distintos (antes colapsavam na mesma HH:00)', async () => {
    messagesData.push(
      { sender: 'contact', created_at: '2026-10-06T13:35:00.000Z' },
      { sender: 'agent', created_at: '2026-10-06T13:45:00.000Z' },
      { sender: 'contact', created_at: '2026-10-06T13:55:00.000Z' },
      { sender: 'agent', created_at: '2026-10-06T14:05:00.000Z' },
      { sender: 'contact', created_at: '2026-10-06T14:15:00.000Z' },
      { sender: 'agent', created_at: '2026-10-06T14:25:00.000Z' },
    );

    const stats = await fetchStats('1h');

    expect(stats.total).toBe(6);
    expect(stats.hourlyData).toHaveLength(6);
    expect(stats.hourlyData.map((b) => b.hour)).toEqual([
      '13:30', '13:40', '13:50', '14:00', '14:10', '14:20',
    ]);
    expect(stats.hourlyData.map((b) => b.incoming + b.outgoing)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(plotado(stats.hourlyData)).toBe(stats.total);
  });

  it('limites: primeira mensagem (início da janela) e última (exatamente agora) entram; anterior fica fora', async () => {
    messagesData.push(
      { sender: 'contact', created_at: '2026-10-06T13:30:00.000Z' }, // == since (início da janela)
      { sender: 'agent', created_at: '2026-10-06T14:30:00.000Z' }, // == now
      { sender: 'contact', created_at: '2026-10-06T13:29:59.000Z' }, // 1s antes da janela
    );

    const stats = await fetchStats('1h');

    expect(stats.total).toBe(2);
    expect(stats.hourlyData[0]).toMatchObject({ incoming: 1, outgoing: 0 }); // 13:30
    expect(stats.hourlyData[5]).toMatchObject({ incoming: 0, outgoing: 1 }); // 14:20-14:30
    // a mensagem de 1s antes da janela não entra no total nem no gráfico
    expect(plotado(stats.hourlyData)).toBe(stats.total);
  });
});
