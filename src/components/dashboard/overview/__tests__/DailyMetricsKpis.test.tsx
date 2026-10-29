import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// A RPC vem do supabase e o papel de staff de useCRMAdminAccess; os dois mockados
// para o teste renderizar o componente REAL em cima do hook REAL.
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

const { useCRMAdminAccess } = vi.hoisted(() => ({ useCRMAdminAccess: vi.fn() }));
vi.mock('@/hooks/crm/useCRMAdminAccess', () => ({ useCRMAdminAccess }));

import { DailyMetricsKpis } from '../DailyMetricsKpis';
import { lastDayVariationPct } from '../dailyMetricsKpisMath';
import type { DailyMetricRow } from '@/hooks/dashboard/useDailyMetricsKpis';

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <DailyMetricsKpis />
    </QueryClientProvider>,
  );
}

// Shape real de uma linha da RPC dashboard_daily_series (numeric como string).
const row = (over: Record<string, unknown> = {}) => ({
  metric_date: '2026-06-15',
  messages_received: 41,
  messages_sent: 38,
  new_contacts: 3,
  conversations_opened: 5,
  conversations_resolved: 4,
  active_contacts: 12,
  median_response_time_seconds: '105',
  ...over,
});

beforeEach(() => {
  rpc.mockReset();
  useCRMAdminAccess.mockReset();
});

describe('lastDayVariationPct', () => {
  const r = (v: number | null): DailyMetricRow => ({
    metric_date: '2026-06-15',
    messages_received: 0,
    messages_sent: 0,
    new_contacts: 0,
    conversations_opened: 0,
    conversations_resolved: 0,
    active_contacts: 0,
    median_response_time_seconds: v,
  });
  const pick = (row: DailyMetricRow) => row.median_response_time_seconds;

  it('compara o último dia com o anterior', () => {
    expect(lastDayVariationPct([r(100), r(150)], pick)).toBe(50);
  });

  it('sem dia anterior ou com base 0 não inventa percentual', () => {
    expect(lastDayVariationPct([r(150)], pick)).toBeNull();
    expect(lastDayVariationPct([r(0), r(150)], pick)).toBeNull();
    expect(lastDayVariationPct([r(null), r(150)], pick)).toBeNull();
  });
});

describe('DailyMetricsKpis', () => {
  it('skeleton enquanto a série carrega', () => {
    useCRMAdminAccess.mockReturnValue(true);
    rpc.mockReturnValue(new Promise(() => {})); // nunca resolve
    renderPanel();

    expect(screen.getByTestId('daily-kpis-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('daily-metrics-kpis')).not.toBeInTheDocument();
  });

  it('sem staff não renderiza a faixa e nem consulta a RPC', () => {
    useCRMAdminAccess.mockReturnValue(false);
    const { container } = renderPanel();

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('daily-kpis-skeleton')).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('série vazia mostra estado vazio explícito (não zero nem cartões)', async () => {
    useCRMAdminAccess.mockReturnValue(true);
    rpc.mockResolvedValue({ data: [], error: null });
    renderPanel();

    expect(await screen.findByTestId('daily-kpis-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('daily-metrics-kpis')).not.toBeInTheDocument();
  });

  it('erro da RPC mostra estado de erro, não o vazio', async () => {
    useCRMAdminAccess.mockReturnValue(true);
    rpc.mockResolvedValue({ data: null, error: { message: 'dashboard_daily_series_requires_staff' } });
    renderPanel();

    expect(await screen.findByTestId('daily-kpis-error')).toBeInTheDocument();
    expect(screen.queryByTestId('daily-kpis-empty')).not.toBeInTheDocument();
  });

  it('staff com série mostra total do período, variação do último dia e mini-série', async () => {
    useCRMAdminAccess.mockReturnValue(true);
    rpc.mockResolvedValue({
      data: [
        row({ metric_date: '2026-06-14', messages_received: 10, conversations_resolved: 1, median_response_time_seconds: '60' }),
        row({ metric_date: '2026-06-15', messages_received: 15, conversations_resolved: 2, median_response_time_seconds: '120' }),
      ],
      error: null,
    });
    renderPanel();

    const received = await screen.findByTestId('daily-kpi-received');
    // total do período: 10 + 15
    await waitFor(() => expect(within(received).getByText('25')).toBeInTheDocument());
    // variação do último dia (15) contra o anterior (10) = +50%
    expect(within(received).getByText(/\+50%/)).toBeInTheDocument();
    // mini-série: um ponto por dia do período
    expect(within(received).getByTestId('kpi-bars').children).toHaveLength(2);

    // o rótulo da variação deixa claro que é dia contra dia, não contra "hoje"
    expect(within(received).getByText('vs. dia anterior')).toBeInTheDocument();
    // e o rodapé diz que o valor do topo é o total do período
    expect(screen.getByTestId('daily-kpis-caption').textContent).toMatch(/Totais dos últimos 7 dias/);
  });

  it('dia sem amostra de tempo não entra como zero na mini-série', async () => {
    useCRMAdminAccess.mockReturnValue(true);
    rpc.mockResolvedValue({
      data: [
        row({ metric_date: '2026-06-14', median_response_time_seconds: null }),
        row({ metric_date: '2026-06-15', median_response_time_seconds: '120' }),
      ],
      error: null,
    });
    renderPanel();

    const response = await screen.findByTestId('daily-kpi-response');
    // só 1 ponto com amostra → sem mini-série falsa (o null não vira barra 0)
    expect(within(response).getByTestId('kpi-bars-empty')).toBeInTheDocument();
    expect(within(response).queryByTestId('kpi-bars')).not.toBeInTheDocument();
    await waitFor(() => expect(within(response).getByText('2m 0s')).toBeInTheDocument());
  });
});
