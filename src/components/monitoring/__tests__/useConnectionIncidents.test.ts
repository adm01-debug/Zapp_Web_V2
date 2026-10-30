/**
 * `useConnectionIncidents` — uptime 24 h, incidentes e alertas ativos derivados
 * de `connection_health_logs` (sem tabela nova).
 *
 * Prova: (1) a derivação é correta — uptime por conexão, incidente = trecho
 * contínuo de checks não saudáveis (início/fim/duração), aberto quando não há
 * recuperação, alertas só dos incidentes em aberto; (2) o hook consulta a janela
 * LIMITADA e ORDENADA (não varre a tabela); (3) a resposta atrasada é descartada
 * e `loading` pertence sempre à requisição mais nova.
 */
process.env.TZ = 'UTC';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { HealthLogRow } from '@/components/monitoring/hooks/useConnectionIncidents';

const NOW = new Date('2026-10-13T12:00:00.000Z');
const SINCE_ISO = new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString();

type Chain = Record<string, unknown>;

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

const METHODS = ['select', 'gte', 'lte', 'gt', 'lt', 'eq', 'in', 'is', 'order', 'limit'];

const queries: Chain[] = [];
let resolvers: Array<(value: unknown) => void> = [];

function makeQuery(): Chain {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  resolvers.push(resolve);
  const chain: Chain = {};
  for (const m of METHODS) chain[m] = vi.fn(() => chain);
  // Torna o próprio builder "thenable" (o hook dá `await` no fim da cadeia).
  chain.then = (onFulfilled: (value: unknown) => unknown) => promise.then(onFulfilled);
  queries.push(chain);
  return chain;
}

mockFrom.mockImplementation(() => makeQuery());

import {
  useConnectionIncidents,
  computeUptime24h,
  computeIncidents,
  computeActiveAlerts,
  aggregateConnectionHealth,
} from '@/components/monitoring/hooks/useConnectionIncidents';

const iso = (minAgo: number) => new Date(NOW.getTime() - minAgo * 60_000).toISOString();

function row(
  id: string,
  connectionId: string,
  status: string,
  minAgo: number,
  extra: Partial<HealthLogRow> = {},
): HealthLogRow {
  return {
    id,
    connection_id: connectionId,
    instance_id: `inst-${connectionId}`,
    status,
    response_time_ms: 120,
    error_message: null,
    checked_at: iso(minAgo),
    ...extra,
  };
}

async function flush(times = 3) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  queries.length = 0;
  resolvers = [];
  mockFrom.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('derivação — uptime 24 h por conexão', () => {
  it('calcula o percentual saudável por conexão e ignora check fora da janela', () => {
    const rows = [
      row('a1', 'c1', 'connected', 600),
      row('a2', 'c1', 'error', 500),
      row('a3', 'c1', 'connected', 400),
      row('a4', 'c1', 'connected', 300),
      // Fora da janela de 24 h (2000 min atrás): não pode entrar na conta.
      row('antigo', 'c1', 'error', 2000),
      row('b1', 'c2', 'healthy', 200),
      row('b2', 'c2', 'healthy', 100),
    ];

    const uptime = computeUptime24h(rows, NOW);
    const c1 = uptime.find((u) => u.connectionId === 'c1')!;
    const c2 = uptime.find((u) => u.connectionId === 'c2')!;

    expect(c1.totalChecks).toBe(4);
    expect(c1.healthyChecks).toBe(3);
    expect(c1.percentage).toBe(75);
    expect(c1.lastDowntime).toBe(iso(500));
    expect(c2.percentage).toBe(100);
  });

  it('sem nenhum check na janela, o percentual é null (nunca 100%)', () => {
    const uptime = computeUptime24h([row('antigo', 'c1', 'connected', 3000)], NOW);
    expect(uptime).toHaveLength(0);

    const soFora = computeUptime24h([row('fora', 'c1', 'connected', 3000)], NOW);
    expect(soFora).toEqual([]);
  });
});

describe('derivação — incidentes', () => {
  it('um trecho contínuo não saudável vira UM incidente com início, fim e duração', () => {
    // c1: connected(60) -> error(50) -> disconnected(40) -> connected(30)
    const rows = [
      row('1', 'c1', 'connected', 60),
      row('2', 'c1', 'error', 50, { error_message: 'timeout' }),
      row('3', 'c1', 'disconnected', 40, { error_message: 'socket fechado' }),
      row('4', 'c1', 'connected', 30),
    ];

    const incidents = computeIncidents(rows, NOW);

    expect(incidents).toHaveLength(1);
    const inc = incidents[0];
    expect(inc.startedAt).toBe(iso(50));
    expect(inc.endedAt).toBe(iso(30));
    expect(inc.durationMs).toBe(20 * 60_000);
    expect(inc.ongoing).toBe(false);
    expect(inc.checks).toBe(2);
    // causa = último error_message do trecho, sem telefone/token
    expect(inc.cause).toBe('socket fechado');
  });

  it('trecho sem recuperação fica em aberto com duração até agora', () => {
    const rows = [
      row('1', 'c1', 'connected', 60),
      row('2', 'c1', 'disconnected', 25),
      row('3', 'c1', 'error', 5),
    ];

    const incidents = computeIncidents(rows, NOW);

    expect(incidents).toHaveLength(1);
    expect(incidents[0].ongoing).toBe(true);
    expect(incidents[0].endedAt).toBeNull();
    expect(incidents[0].durationMs).toBe(25 * 60_000);
  });

  it('dois trechos separados por um check saudável viram dois incidentes', () => {
    const rows = [
      row('1', 'c1', 'error', 90),
      row('2', 'c1', 'connected', 80),
      row('3', 'c1', 'error', 70),
      row('4', 'c1', 'connected', 60),
    ];

    const incidents = computeIncidents(rows, NOW);

    expect(incidents).toHaveLength(2);
    expect(incidents.every((i) => i.ongoing === false)).toBe(true);
  });

  it('linhas fora de ordem produzem o mesmo resultado (ordem determinística)', () => {
    const rows = [
      row('4', 'c1', 'connected', 30),
      row('2', 'c1', 'error', 50, { error_message: 'timeout' }),
      row('1', 'c1', 'connected', 60),
      row('3', 'c1', 'disconnected', 40),
    ];

    const incidents = computeIncidents(rows, NOW);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].startedAt).toBe(iso(50));
    expect(incidents[0].endedAt).toBe(iso(30));
  });
});

describe('derivação — alertas ativos', () => {
  it('só incidentes em aberto viram alerta; erro/desconectado = critical', () => {
    const rows = [
      row('1', 'c1', 'error', 30, { error_message: 'timeout' }),
      row('2', 'c2', 'disconnected', 20),
      row('3', 'c3', 'connected', 15),
    ];

    const incidents = computeIncidents(rows, NOW);
    const alerts = computeActiveAlerts(incidents, rows);

    expect(incidents).toHaveLength(2);
    expect(alerts.map((a) => a.connectionId).sort()).toEqual(['c1', 'c2']);
    expect(alerts.every((a) => a.severity === 'critical')).toBe(true);
    expect(alerts[0].since).toBe(incidents[0].startedAt);
  });

  it('incidente já recuperado não gera alerta', () => {
    const rows = [
      row('1', 'c1', 'error', 60),
      row('2', 'c1', 'connected', 50),
    ];

    const aggregate = aggregateConnectionHealth(rows, NOW);
    expect(aggregate.incidents).toHaveLength(1);
    expect(aggregate.activeAlerts).toHaveLength(0);
  });
});

describe('hook — consulta limitada e ordenada', () => {
  it('busca só a janela de 24 h, ordenada por checked_at/id com limit', async () => {
    const { unmount } = renderHook(() => useConnectionIncidents());
    await flush();

    expect(mockFrom).toHaveBeenCalledWith('connection_health_logs');
    const q = queries[0];
    const selectMock = q.select as { mock: { calls: unknown[][] } };
    expect(String(selectMock.mock.calls[0][0])).toContain('checked_at');
    expect(q.gte).toHaveBeenCalledWith('checked_at', SINCE_ISO);
    expect(q.order).toHaveBeenCalledWith('checked_at', { ascending: false });
    expect(q.order).toHaveBeenCalledWith('id', { ascending: false });
    expect(q.limit).toHaveBeenCalledWith(2000);

    unmount();
  });

  it('quando a consulta bate o teto, avisa que a janela não veio inteira', async () => {
    const { result, unmount } = renderHook(() => useConnectionIncidents());
    const cheio = Array.from({ length: 2000 }, (_, i) => row(`r${i}`, 'c1', 'connected', i * 0.5));
    resolvers[0]({ data: cheio, error: null });
    await flush();

    expect(result.current.truncated).toBe(true);
    expect(result.current.uptime[0].totalChecks).toBe(2000);

    unmount();
  });

  it('publica uptime, incidentes e alertas derivados do histórico', async () => {
    const { result, unmount } = renderHook(() => useConnectionIncidents());
    resolvers[0]({
      data: [row('1', 'c1', 'connected', 40), row('2', 'c1', 'error', 20)],
      error: null,
    });
    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.uptime).toHaveLength(1);
    expect(result.current.uptime[0].percentage).toBe(50);
    expect(result.current.incidents).toHaveLength(1);
    expect(result.current.activeAlerts).toHaveLength(1);
    expect(result.current.error).toBeNull();
    expect(result.current.lastUpdated?.getTime()).toBe(NOW.getTime());

    unmount();
  });

  it('erro de consulta é visível e não inventa dados', async () => {
    const { result, unmount } = renderHook(() => useConnectionIncidents());
    resolvers[0]({ data: null, error: { message: 'db down' } });
    await flush();

    expect(result.current.error).toContain('histórico de saúde');
    expect(result.current.uptime).toEqual([]);
    expect(result.current.loading).toBe(false);

    unmount();
  });

  it('resposta atrasada é descartada e o loading pertence à busca mais nova', async () => {
    const { result, unmount } = renderHook(() => useConnectionIncidents());

    // Dispara a segunda busca enquanto a primeira ainda está no ar.
    let second: Promise<void> = Promise.resolve();
    await act(async () => {
      second = result.current.refresh(NOW);
      await Promise.resolve();
    });

    // A busca MAIS NOVA (2) responde primeiro...
    resolvers[1]({ data: [row('novo', 'c1', 'connected', 10)], error: null });
    await flush();

    // ...e a atrasada (1) responde depois, com dado velho: deve ser ignorada.
    resolvers[0]({ data: [row('velho', 'c9', 'error', 10)], error: null });
    await flush();
    await act(async () => {
      await second;
    });

    expect(result.current.uptime).toHaveLength(1);
    expect(result.current.uptime[0].connectionId).toBe('c1');
    expect(result.current.activeAlerts).toHaveLength(0);
    expect(result.current.loading).toBe(false);

    unmount();
  });
});
