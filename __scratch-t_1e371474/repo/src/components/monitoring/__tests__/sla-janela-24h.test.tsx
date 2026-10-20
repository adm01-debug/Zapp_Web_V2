import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';

/**
 * R2-INF-027 (item 373) — "SLA de 24h e disponibilidade de 7 dias usam janela
 * selecionada e aprovam ausência de checks".
 *
 * Prova, pela fonte real que a tela usa:
 *  1. a consulta de `connection_health_logs` cobre as janelas PROMETIDAS
 *     (SLA de 24h, heatmap de 7 dias) e não o filtro selecionado (1h);
 *  2. um check falho fora de 1h mas dentro de 24h entra no SLA;
 *  3. ausência de checks vira "dado insuficiente" (null) e a tela mostra
 *     "Sem dados" — nunca 100% nem "SLA atingido".
 */
const h = vi.hoisted(() => ({
  from: vi.fn(),
  gteCalls: [] as Array<{ table: string; column: string; value: string }>,
  logsFixture: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => h.from(...args) },
}));

import { useMonitoringData } from '@/components/monitoring/hooks/useMonitoringData';
import { MonitoringAvailabilityHeatmap } from '@/components/monitoring/MonitoringAvailabilityHeatmap';
import { MonitoringSLAPanel } from '@/components/monitoring/MonitoringSLAPanel';
import { MonitoringStatsCards } from '@/components/monitoring/MonitoringStatsCards';
import { TooltipProvider } from '@/components/ui/tooltip';

/** O painel real vive dentro do TooltipProvider da aplicação. */
function withTooltip(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Query fluente do supabase-js, com `gte` honrando o limite pedido. */
function makeQuery(table: string) {
  let rows = table === 'connection_health_logs' ? h.logsFixture : [];
  const api: Record<string, unknown> = {};
  api.select = () => api;
  api.gte = (column: string, value: string) => {
    h.gteCalls.push({ table, column, value });
    rows = rows.filter(r => String(r[column]) >= value);
    return api;
  };
  api.lte = () => api;
  api.eq = () => api;
  api.order = () => api;
  api.limit = (n: number) => ({
    then: (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows.slice(0, n), error: null }).then(res),
  });
  api.then = (res: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(res);
  return api;
}

const NOW = Date.now();
const healthyRecent = {
  id: 'h1', instance_id: 'inst-1', status: 'connected',
  response_time_ms: 120, error_message: null,
  checked_at: new Date(NOW - 30 * 60 * 1000).toISOString(),
};
const failed8h = {
  id: 'f1', instance_id: 'inst-1', status: 'error',
  response_time_ms: null, error_message: 'timeout',
  checked_at: new Date(NOW - 8 * HOUR).toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  h.gteCalls = [];
  h.logsFixture = [];
  h.from.mockImplementation((table: string) => makeQuery(table));
});

describe('R2-INF-027 — janela do SLA de 24h', () => {
  it('com seleção 1h, o check falho de 8h atrás entra no SLA (50%, não 100%)', async () => {
    // Ordem decrescente por checked_at, como a consulta real pede.
    h.logsFixture = [healthyRecent, failed8h];

    const { result } = renderHook(() => useMonitoringData());
    await act(async () => { await result.current.fetchData('1h'); });

    expect(result.current.uptime.totalChecks).toBe(2);
    expect(result.current.uptime.healthyChecks).toBe(1);
    expect(result.current.uptime.percentage).toBe(50);
  });

  it('a consulta de health logs cobre a janela de 7 dias prometida pelo heatmap', async () => {
    h.logsFixture = [healthyRecent, failed8h];

    const { result } = renderHook(() => useMonitoringData());
    await act(async () => { await result.current.fetchData('1h'); });

    const bound = h.gteCalls
      .filter(c => c.table === 'connection_health_logs' && c.column === 'checked_at')
      .map(c => new Date(c.value).getTime())
      .sort((a, b) => a - b)[0];
    expect(bound).toBeDefined();
    expect(bound).toBeLessThanOrEqual(NOW - 7 * DAY + 60_000);
    expect(result.current.availabilityLogs).toHaveLength(2);
  });

  it('a lista de logs da aba Logs continua restrita ao período selecionado', async () => {
    h.logsFixture = [healthyRecent, failed8h];

    const { result } = renderHook(() => useMonitoringData());
    await act(async () => { await result.current.fetchData('1h'); });

    expect(result.current.healthLogs.map(l => l.id)).toEqual(['h1']);
  });
});

describe('R2-INF-027 — ausência de checks não é aprovação', () => {
  it('sem nenhum check, o uptime é dado insuficiente (null), não 100', async () => {
    h.logsFixture = [];

    const { result } = renderHook(() => useMonitoringData());
    await act(async () => { await result.current.fetchData('1h'); });

    expect(result.current.uptime.totalChecks).toBe(0);
    expect(result.current.uptime.percentage).toBeNull();
  });

  it('o badge do heatmap de 7 dias mostra "Sem dados" quando não há checks', () => {
    withTooltip(<MonitoringAvailabilityHeatmap healthLogs={[]} />);

    expect(screen.getByText('Sem dados')).toBeInTheDocument();
    expect(screen.queryByText(/100% uptime/)).toBeNull();
  });

  it('o heatmap ainda calcula o percentual quando há checks', () => {
    withTooltip(<MonitoringAvailabilityHeatmap healthLogs={[healthyRecent, failed8h]} />);

    expect(screen.getByText('50% uptime')).toBeInTheDocument();
  });

  it('o gauge de SLA não diz "Atingido" quando não há checks', () => {
    withTooltip(
      <MonitoringSLAPanel
        uptime={{ percentage: null, totalChecks: 0, healthyChecks: 0, lastDowntime: null }}
        instanceUptimes={[]}
      />
    );

    expect(screen.getByText('Sem dados')).toBeInTheDocument();
    expect(screen.queryByText(/Atingido/)).toBeNull();
  });

  it('o gauge de SLA continua aprovando quando o valor bate a meta', () => {
    withTooltip(
      <MonitoringSLAPanel
        uptime={{ percentage: 99.6, totalChecks: 10, healthyChecks: 10, lastDowntime: null }}
        instanceUptimes={[]}
      />
    );

    expect(screen.getByText(/Atingido/)).toBeInTheDocument();
  });

  it('o card "Uptime 24h" mostra "—" quando não há checks, nunca "null%"', () => {
    render(
      <MonitoringStatsCards
        connections={[]}
        messageStats={{ incoming: 0, outgoing: 0, total: 0, hourlyData: [] }}
        uptime={{ percentage: null, totalChecks: 0, healthyChecks: 0, lastDowntime: null }}
        sparklines={{ messages: [], latency: [], uptime: [] }}
      />
    );

    expect(screen.getByText('Uptime 24h')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('null%')).toBeNull();
  });
});
